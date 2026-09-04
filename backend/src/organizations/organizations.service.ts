import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { CreateOrganizationDto } from './dto/organization.dto';
import { OrganizationRole } from '../../generated/prisma/client';

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
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
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

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
