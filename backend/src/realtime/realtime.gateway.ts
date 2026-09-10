import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { IncomingHttpHeaders } from 'node:http';
import type { Namespace, Socket } from 'socket.io';
import { AccessService } from '../access/access.service';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { auth } from '../auth/auth';
import { environment } from '../config/environment';
import {
  projectSubscriptionSchema,
  type ProjectSubscriptionDto,
} from './realtime.dto';
import type {
  ProjectSubscriptionResponse,
  RealtimeEventEnvelope,
  NotificationRealtimeEnvelope,
} from './realtime.types';

interface RealtimeSocketData {
  user?: AuthenticatedUser;
}

type AuthenticatedSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  RealtimeSocketData
>;

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: environment.frontendUrl, credentials: true },
})
export class RealtimeGateway implements OnGatewayInit {
  @WebSocketServer()
  private server!: Namespace;

  constructor(private readonly access: AccessService) {}

  afterInit(server: Namespace): void {
    server.use((socket: AuthenticatedSocket, next) => {
      void this.authenticate(socket, next);
    });
  }

  @SubscribeMessage('project:subscribe')
  async subscribe(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: ProjectSubscriptionDto,
  ): Promise<ProjectSubscriptionResponse> {
    const parsed = projectSubscriptionSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: 'INVALID_PROJECT' };
    if (!socket.data.user) return { ok: false, error: 'UNAUTHENTICATED' };
    const room = this.projectRoom(parsed.data.projectId);
    if (!socket.rooms.has(room) && socket.rooms.size >= 21) {
      return { ok: false, error: 'SUBSCRIPTION_LIMIT' };
    }

    try {
      await this.access.assertProjectAccess(
        socket.data.user.id,
        parsed.data.projectId,
      );
    } catch {
      return { ok: false, error: 'FORBIDDEN' };
    }

    await socket.join(room);
    return { ok: true, projectId: parsed.data.projectId };
  }

  @SubscribeMessage('project:unsubscribe')
  async unsubscribe(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: ProjectSubscriptionDto,
  ): Promise<ProjectSubscriptionResponse> {
    const parsed = projectSubscriptionSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: 'INVALID_PROJECT' };
    await socket.leave(this.projectRoom(parsed.data.projectId));
    return { ok: true, projectId: parsed.data.projectId };
  }

  async publish(event: RealtimeEventEnvelope): Promise<void> {
    const sockets = await this.server
      .in(this.projectRoom(event.projectId))
      .fetchSockets();

    await Promise.all(
      sockets.map(async (socket) => {
        const user = this.readUser(socket.data);
        if (
          !user ||
          !(await this.hasActiveSession(socket.handshake.headers, user.id))
        ) {
          socket.leave(this.projectRoom(event.projectId));
          return;
        }
        try {
          await this.access.assertProjectAccess(user.id, event.projectId);
          socket.emit('project:event', event);
        } catch {
          socket.leave(this.projectRoom(event.projectId));
        }
      }),
    );
  }

  async reauthorizeProject(projectId: string): Promise<void> {
    const sockets = await this.server
      .in(this.projectRoom(projectId))
      .fetchSockets();
    await Promise.all(
      sockets.map(async (socket) => {
        const user = this.readUser(socket.data);
        if (
          !user ||
          !(await this.hasActiveSession(socket.handshake.headers, user.id))
        ) {
          socket.leave(this.projectRoom(projectId));
          return;
        }
        try {
          await this.access.assertProjectAccess(user.id, projectId);
        } catch {
          socket.leave(this.projectRoom(projectId));
          socket.emit('project:access-revoked', { projectId });
        }
      }),
    );
  }

  private projectRoom(projectId: string): string {
    return `project:${projectId}`;
  }

  private async authenticate(
    socket: AuthenticatedSocket,
    next: (error?: Error) => void,
  ): Promise<void> {
    if (socket.handshake.headers.origin !== environment.frontendUrl) {
      next(new Error('Origin is not allowed'));
      return;
    }

    try {
      const session = await auth.api.getSession({
        headers: this.toHeaders(socket.handshake.headers),
      });
      if (!session?.user) {
        next(new Error('Authentication required'));
        return;
      }
      socket.data.user = session.user;
      await socket.join(this.userRoom(session.user.id));
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  }

  async publishNotification(
    userId: string,
    event: NotificationRealtimeEnvelope,
  ): Promise<void> {
    const sockets = await this.server.in(this.userRoom(userId)).fetchSockets();
    await Promise.all(
      sockets.map(async (socket) => {
        const user = this.readUser(socket.data);
        if (
          user?.id !== userId ||
          !(await this.hasActiveSession(socket.handshake.headers, userId))
        ) {
          socket.leave(this.userRoom(userId));
          return;
        }
        socket.emit('notification:event', event);
      }),
    );
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private readUser(data: unknown): AuthenticatedUser | undefined {
    if (!data || typeof data !== 'object' || !('user' in data)) return;
    const candidate: unknown = data.user;
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !('id' in candidate) ||
      typeof candidate.id !== 'string' ||
      !('email' in candidate) ||
      typeof candidate.email !== 'string' ||
      !('name' in candidate) ||
      typeof candidate.name !== 'string'
    ) {
      return;
    }
    return candidate as AuthenticatedUser;
  }

  private async hasActiveSession(
    headers: IncomingHttpHeaders,
    expectedUserId: string,
  ): Promise<boolean> {
    try {
      const session = await auth.api.getSession({
        headers: this.toHeaders(headers),
      });
      return session?.user.id === expectedUserId;
    } catch {
      return false;
    }
  }

  private toHeaders(headers: IncomingHttpHeaders): Headers {
    const result = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined) continue;
      result.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
    return result;
  }
}
