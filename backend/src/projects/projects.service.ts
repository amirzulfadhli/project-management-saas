import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { Prisma, ProjectRole } from '../../generated/prisma/client';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';

/** Default kanban columns created with every new project's board. */
export const DEFAULT_COLUMNS = [
  'Backlog',
  'To Do',
  'In Progress',
  'Review',
  'Testing',
  'Done',
];

const accessibleProjectWhere = (userId: string) => ({
  OR: [
    { organization: { members: { some: { userId } } } },
    { projectMembers: { some: { userId } } },
  ],
});

const projectDetailInclude = (projectId: string) =>
  ({
    organization: true,
    team: true,
    board: {
      include: {
        columns: {
          where: { projectId },
          orderBy: { position: 'asc' },
          include: { _count: { select: { tasks: true } } },
        },
      },
    },
    projectMembers: {
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    },
  }) satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
  ) {}

  async create(userId: string, dto: CreateProjectDto) {
    await this.access.assertOrganizationMember(userId, dto.organizationId);

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          organizationId: dto.organizationId,
          projectMembers: {
            create: { userId, role: ProjectRole.OWNER },
          },
          board: { create: { name: 'Main Board' } },
        },
        include: { board: true },
      });

      await tx.column.createMany({
        data: DEFAULT_COLUMNS.map((name, position) => ({
          name,
          position,
          projectId: project.id,
          boardId: project.board!.id,
        })),
      });

      await this.activities.record(tx, {
        type: ActivityEvent.PROJECT_CREATED,
        description: `Created Project "${project.name}"`,
        projectId: project.id,
        userId,
        metadata: {
          name: project.name,
          organizationId: dto.organizationId,
        },
      });

      return tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: projectDetailInclude(project.id),
      });
    });
  }

  async findAll(userId: string, organizationId?: string, archived = false) {
    const where: Prisma.ProjectWhereInput = {
      ...accessibleProjectWhere(userId),
      ...(organizationId ? { organizationId } : {}),
      archivedAt: archived ? { not: null } : null,
    };

    return this.prisma.project.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        team: { select: { id: true, name: true } },
        _count: { select: { tasks: true, projectMembers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    await this.access.assertProjectAccess(userId, id);

    return this.prisma.project.findUnique({
      where: { id },
      include: projectDetailInclude(id),
    });
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, id);
      await this.access.assertProjectAccess(userId, id, tx);
      const before = await tx.project.findUniqueOrThrow({ where: { id } });
      const updated = await tx.project.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
        },
        include: projectDetailInclude(id),
      });

      const changes: Record<
        string,
        { before: string | number | null; after: string | number | null }
      > = {};
      if (dto.name !== undefined && before.name !== updated.name) {
        changes.name = { before: before.name, after: updated.name };
      }
      if (
        dto.description !== undefined &&
        before.description !== updated.description
      ) {
        changes.description = {
          before: before.description?.length ?? null,
          after: updated.description?.length ?? null,
        };
      }
      if (Object.keys(changes).length > 0) {
        await this.activities.record(tx, {
          type: ActivityEvent.PROJECT_UPDATED,
          description: `Updated Project "${updated.name}"`,
          projectId: id,
          userId,
          metadata: { changes },
        });
      }
      return updated;
    });
  }

  async archive(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, id);
      await this.access.assertProjectAccess(userId, id, tx);
      const before = await tx.project.findUniqueOrThrow({ where: { id } });
      if (before.archivedAt) return before;

      const updated = await tx.project.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await this.activities.record(tx, {
        type: ActivityEvent.PROJECT_ARCHIVED,
        description: `Archived Project "${updated.name}"`,
        projectId: id,
        userId,
        metadata: { archivedAt: updated.archivedAt!.toISOString() },
      });
      return updated;
    });
  }

  async duplicate(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, id);
      await this.access.assertProjectAccess(userId, id, tx);
      const source = await tx.project.findUnique({
        where: { id },
        include: {
          board: {
            include: {
              columns: {
                where: { projectId: id },
                orderBy: { position: 'asc' },
              },
            },
          },
        },
      });

      if (!source) throw new NotFoundException('Project not found');

      const columns = source.board?.columns ?? [];
      const columnData =
        columns.length > 0
          ? columns.map((column, index) => ({
              name: column.name,
              position: index,
            }))
          : DEFAULT_COLUMNS.map((name, index) => ({ name, position: index }));

      const copy = await tx.project.create({
        data: {
          name: `${source.name} (Copy)`,
          description: source.description,
          organizationId: source.organizationId,
          teamId: source.teamId,
          projectMembers: {
            create: { userId, role: ProjectRole.OWNER },
          },
          board: { create: { name: source.board?.name ?? 'Main Board' } },
        },
        include: { board: true },
      });

      await tx.column.createMany({
        data: columnData.map((column) => ({
          ...column,
          projectId: copy.id,
          boardId: copy.board!.id,
        })),
      });

      await this.activities.record(tx, {
        type: ActivityEvent.PROJECT_DUPLICATED,
        description: `Duplicated Project "${source.name}" as "${copy.name}"`,
        projectId: copy.id,
        userId,
        metadata: {
          sourceProjectId: source.id,
          sourceName: source.name,
          name: copy.name,
        },
      });

      return tx.project.findUniqueOrThrow({
        where: { id: copy.id },
        include: projectDetailInclude(copy.id),
      });
    });
  }

  private async lockProject(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('Project not found');
  }
}
