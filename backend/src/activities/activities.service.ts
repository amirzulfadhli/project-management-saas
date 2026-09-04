import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListActivitiesQueryDto } from './dto/activity.dto';
import { RecordActivityInput } from './activity.types';

export type ActivityDatabaseClient = PrismaService | Prisma.TransactionClient;

const activitySelect = {
  id: true,
  type: true,
  description: true,
  metadata: true,
  taskId: true,
  projectId: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, image: true } },
  task: { select: { id: true, title: true } },
} satisfies Prisma.ActivitySelect;

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  record(database: ActivityDatabaseClient, input: RecordActivityInput) {
    return database.activity.create({
      data: {
        type: input.type,
        description: input.description,
        projectId: input.projectId,
        userId: input.userId,
        taskId: input.taskId ?? null,
        ...(input.metadata !== undefined && { metadata: input.metadata }),
      },
    });
  }

  async findAll(
    userId: string,
    projectId: string,
    query: ListActivitiesQueryDto,
  ) {
    await this.access.assertProjectAccess(userId, projectId);

    if (query.cursor) {
      const cursor = await this.prisma.activity.findFirst({
        where: { id: query.cursor, projectId },
        select: { id: true },
      });
      if (!cursor) throw new NotFoundException('Activity cursor not found');
    }

    const rows = await this.prisma.activity.findMany({
      where: { projectId },
      select: activitySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: page.map(({ user, ...activity }) => ({
        ...activity,
        actor: user,
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
