import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AccessService } from '../access/access.service';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWikiPageDto,
  MoveWikiPageDto,
  UpdateWikiPageDto,
  WIKI_MAX_DEPTH,
} from './dto/wiki.dto';

const wikiPageSelect = {
  id: true,
  projectId: true,
  parentId: true,
  title: true,
  content: true,
  position: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { id: true, name: true, email: true, image: true } },
} satisfies Prisma.WikiPageSelect;

const wikiPageListSelect = {
  id: true,
  projectId: true,
  parentId: true,
  title: true,
  position: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: { id: true, name: true, email: true, image: true } },
} satisfies Prisma.WikiPageSelect;

type WikiTransaction = Prisma.TransactionClient;

@Injectable()
export class WikiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
  ) {}

  async list(userId: string, projectId: string) {
    await this.access.assertProjectAccess(userId, projectId);
    return this.prisma.wikiPage.findMany({
      where: { projectId },
      select: wikiPageListSelect,
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(userId: string, projectId: string, pageId: string) {
    await this.access.assertProjectAccess(userId, projectId);
    const page = await this.prisma.wikiPage.findFirst({
      where: { id: pageId, projectId },
      select: wikiPageSelect,
    });
    if (!page) throw new NotFoundException('Wiki page not found');
    return page;
  }

  create(userId: string, projectId: string, dto: CreateWikiPageDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(userId, projectId, tx);
      await this.assertValidParent(tx, projectId, dto.parentId);
      const maximum = await tx.wikiPage.aggregate({
        where: { projectId, parentId: dto.parentId },
        _max: { position: true },
      });
      const page = await tx.wikiPage.create({
        data: {
          projectId,
          parentId: dto.parentId,
          title: dto.title,
          content: dto.content,
          position: (maximum._max.position ?? -1) + 1,
          createdById: userId,
        },
        select: wikiPageSelect,
      });
      await this.activities.record(tx, {
        type: ActivityEvent.WIKI_PAGE_CREATED,
        description: `Created documentation page "${page.title}"`,
        projectId,
        userId,
        metadata: {
          pageId: page.id,
          title: page.title,
          parentId: page.parentId,
        },
      });
      return page;
    });
  }

  update(
    userId: string,
    projectId: string,
    pageId: string,
    dto: UpdateWikiPageDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(userId, projectId, tx);
      const current = await this.lockPage(tx, projectId, pageId);
      const changedFields: string[] = [];
      if (dto.title !== undefined && dto.title !== current.title)
        changedFields.push('title');
      if (dto.content !== undefined && dto.content !== current.content)
        changedFields.push('content');
      if (changedFields.length === 0) {
        const page = await tx.wikiPage.findUniqueOrThrow({
          where: { id: pageId },
          select: wikiPageSelect,
        });
        return { page, changed: false };
      }
      const page = await tx.wikiPage.update({
        where: { id: pageId },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.content !== undefined && { content: dto.content }),
        },
        select: wikiPageSelect,
      });
      await this.activities.record(tx, {
        type: ActivityEvent.WIKI_PAGE_UPDATED,
        description: `Updated documentation page "${page.title}"`,
        projectId,
        userId,
        metadata: { pageId: page.id, title: page.title, changedFields },
      });
      return { page, changed: true };
    });
  }

  move(
    userId: string,
    projectId: string,
    pageId: string,
    dto: MoveWikiPageDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(userId, projectId, tx);
      const current = await this.lockPage(tx, projectId, pageId);
      if (dto.parentId === pageId) {
        throw new BadRequestException('A Wiki page cannot parent itself');
      }
      await this.assertMoveHierarchy(tx, projectId, pageId, dto.parentId);

      const targetCount = await tx.wikiPage.count({
        where: {
          projectId,
          parentId: dto.parentId,
          id: { not: pageId },
        },
      });
      if (dto.targetIndex > targetCount) {
        throw new BadRequestException(
          'Target index is outside the sibling list',
        );
      }

      const sameParent = current.parentId === dto.parentId;
      if (sameParent && current.position === dto.targetIndex) {
        const page = await tx.wikiPage.findUniqueOrThrow({
          where: { id: pageId },
          select: wikiPageSelect,
        });
        return { page, changed: false };
      }

      await tx.wikiPage.updateMany({
        where: {
          projectId,
          parentId: current.parentId,
          position: { gt: current.position },
        },
        data: { position: { decrement: 1 } },
      });
      await tx.wikiPage.updateMany({
        where: {
          projectId,
          parentId: dto.parentId,
          id: { not: pageId },
          position: { gte: dto.targetIndex },
        },
        data: { position: { increment: 1 } },
      });
      const page = await tx.wikiPage.update({
        where: { id: pageId },
        data: { parentId: dto.parentId, position: dto.targetIndex },
        select: wikiPageSelect,
      });
      await this.activities.record(tx, {
        type: ActivityEvent.WIKI_PAGE_UPDATED,
        description: `Moved documentation page "${page.title}"`,
        projectId,
        userId,
        metadata: {
          pageId: page.id,
          title: page.title,
          changedFields: ['parentId', 'position'],
        },
      });
      return { page, changed: true };
    });
  }

  remove(userId: string, projectId: string, pageId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(userId, projectId, tx);
      const current = await this.lockPage(tx, projectId, pageId);
      const childCount = await tx.wikiPage.count({
        where: { parentId: pageId },
      });
      if (childCount > 0) {
        throw new ConflictException('Move or delete child pages first');
      }
      if (current.createdById !== userId) {
        await this.access.assertProjectOwnerAuthority(userId, projectId, tx);
      }
      await tx.wikiPage.delete({ where: { id: pageId } });
      await tx.wikiPage.updateMany({
        where: {
          projectId,
          parentId: current.parentId,
          position: { gt: current.position },
        },
        data: { position: { decrement: 1 } },
      });
      await this.activities.record(tx, {
        type: ActivityEvent.WIKI_PAGE_DELETED,
        description: `Deleted documentation page "${current.title}"`,
        projectId,
        userId,
        metadata: { pageId, title: current.title, parentId: current.parentId },
      });
      return current;
    });
  }

  private async lockProject(
    userId: string,
    projectId: string,
    tx: WikiTransaction,
  ): Promise<void> {
    await this.access.assertProjectAccess(userId, projectId, tx);
    const projects = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`,
    );
    if (projects.length === 0) throw new NotFoundException('Project not found');
  }

  private async lockPage(
    tx: WikiTransaction,
    projectId: string,
    pageId: string,
  ): Promise<{
    id: string;
    title: string;
    content: string;
    parentId: string | null;
    position: number;
    createdById: string;
  }> {
    const pages = await tx.$queryRaw<
      Array<{
        id: string;
        title: string;
        content: string;
        parentId: string | null;
        position: number;
        createdById: string;
      }>
    >(Prisma.sql`
      SELECT "id", "title", "content", "parentId", "position", "createdById"
      FROM "Wiki"
      WHERE "id" = ${pageId} AND "projectId" = ${projectId}
      FOR UPDATE
    `);
    const page = pages[0];
    if (!page) throw new NotFoundException('Wiki page not found');
    return page;
  }

  private async assertValidParent(
    tx: WikiTransaction,
    projectId: string,
    parentId: string | null,
  ): Promise<void> {
    let cursor = parentId;
    let depth = 1;
    while (cursor) {
      const parent = await tx.wikiPage.findFirst({
        where: { id: cursor, projectId },
        select: { parentId: true },
      });
      if (!parent) throw new NotFoundException('Parent Wiki page not found');
      depth += 1;
      if (depth > WIKI_MAX_DEPTH) {
        throw new BadRequestException(
          `Wiki hierarchy is limited to ${WIKI_MAX_DEPTH} levels`,
        );
      }
      cursor = parent.parentId;
    }
  }

  private async assertMoveHierarchy(
    tx: WikiTransaction,
    projectId: string,
    pageId: string,
    parentId: string | null,
  ): Promise<void> {
    let cursor = parentId;
    let newDepth = 1;
    while (cursor) {
      if (cursor === pageId) {
        throw new BadRequestException('Wiki hierarchy cycles are not allowed');
      }
      const parent = await tx.wikiPage.findFirst({
        where: { id: cursor, projectId },
        select: { parentId: true },
      });
      if (!parent) throw new NotFoundException('Parent Wiki page not found');
      newDepth += 1;
      cursor = parent.parentId;
    }

    const pages = await tx.wikiPage.findMany({
      where: { projectId },
      select: { id: true, parentId: true },
    });
    const children = new Map<string, string[]>();
    for (const page of pages) {
      if (!page.parentId) continue;
      children.set(page.parentId, [
        ...(children.get(page.parentId) ?? []),
        page.id,
      ]);
    }
    let subtreeHeight = 1;
    let level = [pageId];
    while (level.length > 0) {
      const next = level.flatMap((id) => children.get(id) ?? []);
      if (next.length === 0) break;
      subtreeHeight += 1;
      level = next;
    }
    if (newDepth + subtreeHeight - 1 > WIKI_MAX_DEPTH) {
      throw new BadRequestException(
        `Wiki hierarchy is limited to ${WIKI_MAX_DEPTH} levels`,
      );
    }
  }
}
