import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from './realtime.gateway';
import type {
  RealtimeEventEnvelope,
  RealtimeEventInput,
  NotificationRealtimeInput,
} from './realtime.types';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
  ) {}

  async publish(input: RealtimeEventInput): Promise<void> {
    const event: RealtimeEventEnvelope = {
      ...input,
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
    };
    try {
      await this.gateway.publish(event);
    } catch (error: unknown) {
      this.logger.warn(
        `Realtime publication failed for ${input.type} in Project ${input.projectId}`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async publishForTask(
    input: Omit<RealtimeEventInput, 'projectId'> & { taskId: string },
  ): Promise<void> {
    try {
      const task = await this.prisma.task.findUnique({
        where: { id: input.taskId },
        select: { projectId: true },
      });
      if (!task) return;
      await this.publish({ ...input, projectId: task.projectId });
    } catch (error: unknown) {
      this.logger.warn(
        `Realtime Task scope resolution failed for ${input.type}`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async reauthorizeProject(projectId: string): Promise<void> {
    try {
      await this.gateway.reauthorizeProject(projectId);
    } catch (error: unknown) {
      this.logger.warn(
        `Realtime Project reauthorization failed for ${projectId}`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async publishNotification(
    userId: string,
    input: NotificationRealtimeInput,
  ): Promise<void> {
    try {
      await this.gateway.publishNotification(userId, {
        ...input,
        id: randomUUID(),
        type: 'NOTIFICATION_CREATED',
        occurredAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Realtime notification publication failed for user ${userId}`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}
