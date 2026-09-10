import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { AccessService } from '../access/access.service';
import { ActivitiesService } from '../activities/activities.service';
import { ActivityEvent } from '../activities/activity.types';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';
import type {
  CreateTaskFromGithubIssueDto,
  GithubIssueQueryDto,
  LinkGithubIssueDto,
} from './dto/github.dto';
import { GithubAppClient, type GithubIssueIdentity } from './github-app.client';
import type { NormalizedGithubWebhook } from './github-webhook';

const repositorySelect = {
  id: true,
  projectId: true,
  externalRepositoryId: true,
  owner: true,
  name: true,
  fullName: true,
  githubInstallation: {
    select: { externalInstallationId: true },
  },
} satisfies Prisma.RepositorySelect;

const issueSelect = {
  id: true,
  projectId: true,
  taskId: true,
  repositoryId: true,
  externalIssueId: true,
  number: true,
  title: true,
  state: true,
  url: true,
  lastSyncedAt: true,
  unavailableAt: true,
  createdAt: true,
  updatedAt: true,
  repository: { select: { fullName: true } },
  task: { select: { id: true, title: true } },
} satisfies Prisma.IssueSelect;

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true, image: true } },
  reporter: { select: { id: true, name: true, email: true, image: true } },
  column: { select: { id: true, name: true, position: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

type RepositoryContext = Prisma.RepositoryGetPayload<{
  select: typeof repositorySelect;
}>;
type IssueRecord = Prisma.IssueGetPayload<{ select: typeof issueSelect }>;

const synchronizedActions = new Set(['opened', 'edited', 'reopened', 'closed']);
const unavailableActions = new Set(['deleted', 'transferred']);

@Injectable()
export class GithubIssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly activities: ActivitiesService,
    private readonly githubClient: GithubAppClient,
    private readonly realtime: RealtimeService,
  ) {}

  async listProjectIssues(
    userId: string,
    projectId: string,
    query: GithubIssueQueryDto,
  ) {
    const repository = await this.connectedRepository(userId, projectId);
    const page = await this.githubClient.listIssues(
      repository.githubInstallation.externalInstallationId,
      repository.owner,
      repository.name,
      query.page,
      query.perPage,
      query.state,
    );
    const externalIds = page.items.map((issue) => issue.externalIssueId);
    const links = await this.prisma.issue.findMany({
      where: {
        repositoryId: repository.id,
        externalIssueId: { in: externalIds },
        taskId: { not: null },
      },
      select: {
        externalIssueId: true,
        task: { select: { id: true, title: true } },
      },
    });
    const byExternalId = new Map(
      links.map((link) => [link.externalIssueId, link.task]),
    );
    return {
      ...page,
      repository: {
        id: repository.id,
        fullName: repository.fullName,
      },
      items: page.items.map((issue) => ({
        externalIssueId: issue.externalIssueId,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        htmlUrl: issue.htmlUrl,
        updatedAt: issue.updatedAt,
        linkedTask: byExternalId.get(issue.externalIssueId) ?? null,
      })),
    };
  }

  async findTaskIssue(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.access.assertProjectAccess(userId, task.projectId);
    const issue = await this.prisma.issue.findUnique({
      where: { taskId },
      select: issueSelect,
    });
    return issue ? this.toIssueResponse(issue) : null;
  }

  async linkTask(userId: string, taskId: string, dto: LinkGithubIssueDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    const repository = await this.connectedRepository(userId, task.projectId);
    const githubIssue = await this.fetchIssue(repository, dto.issueNumber);

    try {
      const issue = await this.prisma.$transaction(async (tx) => {
        await this.lockProject(tx, task.projectId);
        await this.access.assertProjectAccess(userId, task.projectId, tx);
        await this.assertCurrentRepository(tx, task.projectId, repository.id);
        const currentTask = await tx.task.findUnique({
          where: { id: taskId },
          select: { id: true, title: true, projectId: true },
        });
        if (!currentTask || currentTask.projectId !== task.projectId) {
          throw new NotFoundException('Task not found');
        }

        const created = await tx.issue.create({
          data: this.issueCreateData(
            githubIssue,
            task.projectId,
            repository.id,
            taskId,
          ),
          select: issueSelect,
        });
        await this.activities.record(tx, {
          type: ActivityEvent.GITHUB_ISSUE_LINKED,
          description: `Linked Task "${currentTask.title}" to GitHub Issue #${githubIssue.number}`,
          projectId: task.projectId,
          taskId,
          userId,
          metadata: {
            issueId: created.id,
            issueNumber: githubIssue.number,
            repository: repository.fullName,
          },
        });
        return created;
      });
      await this.realtime.publish({
        projectId: task.projectId,
        type: RealtimeEventType.GITHUB_ISSUE_LINKED,
        entity: 'github-issue',
        entityId: issue.id,
        taskId,
        actorId: userId,
      });
      return this.toIssueResponse(issue);
    } catch (error: unknown) {
      this.rethrowLinkConflict(error);
    }
  }

  async createTaskFromIssue(
    userId: string,
    projectId: string,
    issueNumber: number,
    dto: CreateTaskFromGithubIssueDto,
  ) {
    const repository = await this.connectedRepository(userId, projectId);
    await this.access.assertColumnInProject(dto.columnId, projectId);
    const githubIssue = await this.fetchIssue(repository, issueNumber);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await this.lockProject(tx, projectId);
        await this.access.assertProjectAccess(userId, projectId, tx);
        await this.access.assertColumnInProject(dto.columnId, projectId, tx);
        await this.assertCurrentRepository(tx, projectId, repository.id);

        const lastTask = await tx.task.findFirst({
          where: { columnId: dto.columnId },
          orderBy: [{ position: 'desc' }, { id: 'desc' }],
          select: { position: true },
        });
        const task = await tx.task.create({
          data: {
            ...this.taskSyncData(githubIssue),
            projectId,
            columnId: dto.columnId,
            position: (lastTask?.position ?? -1) + 1,
            reporterId: userId,
          },
          omit: { status: true },
          include: taskInclude,
        });
        const issue = await tx.issue.create({
          data: this.issueCreateData(
            githubIssue,
            projectId,
            repository.id,
            task.id,
          ),
          select: issueSelect,
        });
        await this.activities.record(tx, {
          type: ActivityEvent.TASK_CREATED_FROM_GITHUB_ISSUE,
          description: `Created Task "${task.title}" from GitHub Issue #${githubIssue.number}`,
          projectId,
          taskId: task.id,
          userId,
          metadata: {
            issueId: issue.id,
            issueNumber: githubIssue.number,
            repository: repository.fullName,
            column: { id: task.column.id, name: task.column.name },
          },
        });
        return { task, issue };
      });
      await this.realtime.publish({
        projectId,
        type: RealtimeEventType.TASK_CREATED_FROM_GITHUB_ISSUE,
        entity: 'github-issue',
        entityId: result.issue.id,
        taskId: result.task.id,
        actorId: userId,
      });
      return { task: result.task, issue: this.toIssueResponse(result.issue) };
    } catch (error: unknown) {
      this.rethrowLinkConflict(error);
    }
  }

  async unlinkTask(userId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    const removed = await this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, task.projectId);
      await this.access.assertProjectAccess(userId, task.projectId, tx);
      const issue = await tx.issue.findUnique({
        where: { taskId },
        select: issueSelect,
      });
      if (!issue || issue.projectId !== task.projectId) {
        throw new NotFoundException('Linked GitHub Issue not found');
      }
      await this.activities.record(tx, {
        type: ActivityEvent.GITHUB_ISSUE_UNLINKED,
        description: `Unlinked GitHub Issue #${issue.number} from Task "${issue.task?.title ?? 'Task'}"`,
        projectId: task.projectId,
        taskId,
        userId,
        metadata: {
          issueId: issue.id,
          issueNumber: issue.number,
          repository: issue.repository.fullName,
        },
      });
      await tx.issue.delete({ where: { id: issue.id } });
      return issue.id;
    });
    await this.realtime.publish({
      projectId: task.projectId,
      type: RealtimeEventType.GITHUB_ISSUE_UNLINKED,
      entity: 'github-issue',
      entityId: removed,
      taskId,
      actorId: userId,
    });
  }

  async syncWebhookIssue(
    tx: Prisma.TransactionClient,
    projectId: string,
    repositoryId: string,
    webhook: NormalizedGithubWebhook['issue'],
  ): Promise<{ issueId: string; taskId: string; projectId: string } | null> {
    if (!webhook) return null;
    if (
      !synchronizedActions.has(webhook.action) &&
      !unavailableActions.has(webhook.action)
    ) {
      return null;
    }
    const issue = await tx.issue.findUnique({
      where: {
        repositoryId_externalIssueId: {
          repositoryId,
          externalIssueId: webhook.externalIssueId,
        },
      },
      select: { id: true, taskId: true, projectId: true },
    });
    if (!issue?.taskId || issue.projectId !== projectId) return null;

    const unavailable = unavailableActions.has(webhook.action);
    await tx.issue.update({
      where: { id: issue.id },
      data: {
        number: webhook.number,
        title: webhook.title,
        body: this.normalizeBody(webhook.body),
        state: webhook.state,
        url: webhook.htmlUrl,
        lastSyncedAt: new Date(),
        unavailableAt: unavailable ? new Date() : null,
        closedAt: webhook.state === 'closed' ? new Date() : null,
      },
    });
    if (!unavailable) {
      await tx.task.update({
        where: { id: issue.taskId },
        data: this.taskSyncData(webhook),
      });
    }
    return { issueId: issue.id, taskId: issue.taskId, projectId };
  }

  publishWebhookSync(sync: {
    issueId: string;
    taskId: string;
    projectId: string;
  }) {
    return this.realtime.publish({
      projectId: sync.projectId,
      type: RealtimeEventType.GITHUB_ISSUE_SYNCED,
      entity: 'github-issue',
      entityId: sync.issueId,
      taskId: sync.taskId,
      actorId: null,
    });
  }

  removeRepositoryLinks(tx: Prisma.TransactionClient, repositoryId: string) {
    return tx.issue.deleteMany({ where: { repositoryId } });
  }

  private async connectedRepository(userId: string, projectId: string) {
    await this.access.assertProjectAccess(userId, projectId);
    const repository = await this.prisma.repository.findUnique({
      where: { projectId },
      select: repositorySelect,
    });
    if (!repository) {
      throw new NotFoundException('Connected GitHub repository not found');
    }
    this.assertVerifiedRepository(repository);
    return repository;
  }

  private async fetchIssue(repository: RepositoryContext, issueNumber: number) {
    this.assertVerifiedRepository(repository);
    return this.githubClient.getIssue(
      repository.githubInstallation.externalInstallationId,
      repository.owner,
      repository.name,
      issueNumber,
    );
  }

  private assertVerifiedRepository(
    repository: RepositoryContext,
  ): asserts repository is RepositoryContext & {
    owner: string;
    githubInstallation: { externalInstallationId: string };
  } {
    if (!repository.owner || !repository.githubInstallation) {
      throw new ServiceUnavailableException(
        'A verified GitHub App repository connection is required',
      );
    }
  }

  private async assertCurrentRepository(
    tx: Prisma.TransactionClient,
    projectId: string,
    repositoryId: string,
  ): Promise<void> {
    const repository = await tx.repository.findUnique({
      where: { projectId },
      select: { id: true },
    });
    if (!repository || repository.id !== repositoryId) {
      throw new ConflictException('The Project repository connection changed');
    }
  }

  private issueCreateData(
    issue: GithubIssueIdentity,
    projectId: string,
    repositoryId: string,
    taskId: string,
  ): Prisma.IssueUncheckedCreateInput {
    const now = new Date();
    return {
      projectId,
      repositoryId,
      taskId,
      externalIssueId: issue.externalIssueId,
      number: issue.number,
      title: issue.title,
      body: this.normalizeBody(issue.body),
      state: issue.state,
      url: issue.htmlUrl,
      lastSyncedAt: now,
      closedAt: issue.state === 'closed' ? now : null,
    };
  }

  private taskSyncData(issue: Pick<GithubIssueIdentity, 'title' | 'body'>) {
    return {
      title: issue.title.trim().slice(0, 200),
      description: this.normalizeBody(issue.body),
    };
  }

  private normalizeBody(body: string | null): string | null {
    return body === null ? null : body.slice(0, 10_000);
  }

  private toIssueResponse(issue: IssueRecord) {
    return {
      id: issue.id,
      taskId: issue.taskId,
      projectId: issue.projectId,
      externalIssueId: issue.externalIssueId,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      htmlUrl: issue.url,
      repository: issue.repository,
      linkedTask: issue.task,
      lastSyncedAt: issue.lastSyncedAt,
      unavailableAt: issue.unavailableAt,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
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

  private rethrowLinkConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'This Task or GitHub Issue is already linked',
      );
    }
    if (error instanceof Error) throw error;
    throw new BadRequestException('GitHub Issue operation failed');
  }
}
