import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import {
  AddOrganizationMemberDto,
  CreateOrganizationDto,
  UpdateOrganizationMemberRoleDto,
} from './dto/organization.dto';
import { OrganizationRole, Prisma } from '../../generated/prisma/client';

const organizationMemberSelect = {
  id: true,
  organizationId: true,
  userId: true,
  role: true,
  user: {
    select: { id: true, name: true, email: true, image: true },
  },
} satisfies Prisma.OrganizationMemberSelect;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private slugify(name: string): string {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'org';
  }

  async create(userId: string, dto: CreateOrganizationDto) {
    const base = dto.slug ?? this.slugify(dto.name);

    if (dto.slug) {
      const existing = await this.prisma.organization.findUnique({
        where: { slug: base },
      });
      if (existing) {
        throw new ConflictException('Slug is already in use');
      }
    }

    let slug = base;
    let suffix = 1;
    // Auto-generated slugs must be unique; append a numeric suffix on collision.
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    try {
      return await this.prisma.organization.create({
        data: {
          name: dto.name,
          slug,
          ownerId: userId,
          members: { create: { userId, role: OrganizationRole.OWNER } },
        },
        include: { members: true },
      });
    } catch (error: unknown) {
      // The database constraint remains authoritative if two requests race
      // after the availability checks above.
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('Slug is already in use');
      }
      throw error;
    }
  }

  async findByUser(userId: string) {
    return this.prisma.organization.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
        _count: { select: { projects: true, members: true, teams: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    await this.access.assertOrganizationMember(userId, id);

    return this.prisma.organization.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true, image: true } },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    });
  }

  async findMembers(userId: string, organizationId: string) {
    await this.access.assertOrganizationMember(userId, organizationId);
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      select: organizationMemberSelect,
      orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }, { id: 'asc' }],
    });
  }

  async addMember(
    userId: string,
    organizationId: string,
    dto: AddOrganizationMemberDto,
  ) {
    return this.withLockedOrganization(organizationId, async (tx) => {
      await this.access.assertOrganizationOwner(userId, organizationId, tx);
      const target = await tx.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('User not found');

      try {
        return await tx.organizationMember.create({
          data: {
            organizationId,
            userId: target.id,
            role: OrganizationRole.MEMBER,
          },
          select: organizationMemberSelect,
        });
      } catch (error: unknown) {
        if (this.isUniqueConstraintViolation(error)) {
          throw new ConflictException('User is already an Organization member');
        }
        throw error;
      }
    });
  }

  async updateMemberRole(
    userId: string,
    organizationId: string,
    memberId: string,
    dto: UpdateOrganizationMemberRoleDto,
  ) {
    return this.withLockedOrganization(organizationId, async (tx) => {
      await this.access.assertOrganizationOwner(userId, organizationId, tx);
      const member = await this.findMember(tx, organizationId, memberId);
      if (member.role === dto.role) {
        return tx.organizationMember.findUniqueOrThrow({
          where: { id: memberId },
          select: organizationMemberSelect,
        });
      }

      if (member.role === OrganizationRole.OWNER) {
        const replacement = await this.findReplacementOwner(
          tx,
          organizationId,
          member.userId,
        );
        await this.reassignPrimaryOwnerIfNeeded(
          tx,
          organizationId,
          member.userId,
          replacement.userId,
        );
      }

      return tx.organizationMember.update({
        where: { id: memberId },
        data: { role: dto.role },
        select: organizationMemberSelect,
      });
    });
  }

  async removeMember(
    userId: string,
    organizationId: string,
    memberId: string,
  ): Promise<string[]> {
    return this.withLockedOrganization(organizationId, async (tx) => {
      await this.access.assertOrganizationOwner(userId, organizationId, tx);
      const member = await this.findMember(tx, organizationId, memberId);

      if (member.role === OrganizationRole.OWNER) {
        const replacement = await this.findReplacementOwner(
          tx,
          organizationId,
          member.userId,
        );
        await this.reassignPrimaryOwnerIfNeeded(
          tx,
          organizationId,
          member.userId,
          replacement.userId,
        );
      }

      const projects = await tx.project.findMany({
        where: { organizationId },
        select: { id: true },
      });
      await tx.organizationMember.delete({ where: { id: memberId } });
      return projects.map((project) => project.id);
    });
  }

  private async withLockedOrganization<T>(
    organizationId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`,
      );
      if (rows.length === 0) {
        throw new NotFoundException('Organization not found');
      }
      return operation(tx);
    });
  }

  private async findMember(
    tx: Prisma.TransactionClient,
    organizationId: string,
    memberId: string,
  ) {
    const member = await tx.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      select: { id: true, userId: true, role: true },
    });
    if (!member) throw new NotFoundException('Organization member not found');
    return member;
  }

  private async findReplacementOwner(
    tx: Prisma.TransactionClient,
    organizationId: string,
    excludedUserId: string,
  ): Promise<{ userId: string }> {
    const replacement = await tx.organizationMember.findFirst({
      where: {
        organizationId,
        role: OrganizationRole.OWNER,
        userId: { not: excludedUserId },
      },
      select: { userId: true },
      orderBy: { id: 'asc' },
    });
    if (!replacement) {
      throw new ConflictException(
        'The final Organization OWNER cannot be removed or demoted',
      );
    }
    return replacement;
  }

  private async reassignPrimaryOwnerIfNeeded(
    tx: Prisma.TransactionClient,
    organizationId: string,
    currentUserId: string,
    replacementUserId: string,
  ): Promise<void> {
    await tx.organization.updateMany({
      where: { id: organizationId, ownerId: currentUserId },
      data: { ownerId: replacementUserId },
    });
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
