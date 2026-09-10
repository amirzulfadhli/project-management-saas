import { auth } from '../auth/auth';
import { RealtimeGateway } from './realtime.gateway';
import type { RealtimeEventEnvelope } from './realtime.types';

jest.mock('../auth/auth', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

const projectId = '11111111-1111-4111-8111-111111111111';
const user = { id: 'user-1', name: 'User', email: 'user@example.test' };

describe('RealtimeGateway', () => {
  const access = { assertProjectAccess: jest.fn() };
  let gateway: RealtimeGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new RealtimeGateway(access as never);
  });

  it('authenticates a handshake through Better Auth and rejects no session', async () => {
    type Middleware = (
      socket: Record<string, unknown>,
      next: (error?: Error) => void,
    ) => void;
    let middleware: Middleware | undefined;
    gateway.afterInit({
      use: (value: Middleware) => {
        middleware = value;
      },
    } as never);

    const socket = {
      handshake: {
        headers: {
          origin: 'http://localhost:3000',
          cookie: 'better-auth.session_token=opaque',
        },
      },
      data: {},
      join: jest.fn(),
    };
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValueOnce({
      user,
    });
    const accepted = await runMiddleware(middleware!, socket);
    expect(accepted).toBeUndefined();
    expect(socket.data).toEqual({ user });
    expect(socket.join).toHaveBeenCalledWith(`user:${user.id}`);

    (auth.api.getSession as unknown as jest.Mock).mockResolvedValueOnce(null);
    const rejected = await runMiddleware(middleware!, { ...socket, data: {} });
    expect(rejected).toBeInstanceOf(Error);
  });

  it('rejects an untrusted browser origin before session validation', async () => {
    type Middleware = (socket: unknown, next: (error?: Error) => void) => void;
    let middleware: Middleware = () => undefined;
    gateway.afterInit({
      use: (value: typeof middleware) => (middleware = value),
    } as never);
    const rejection = await new Promise<Error | undefined>((resolve) =>
      middleware(
        {
          handshake: { headers: { origin: 'https://evil.example' } },
          data: {},
        },
        resolve,
      ),
    );
    expect(rejection).toBeInstanceOf(Error);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it('joins only an authorized, UUID-scoped Project room', async () => {
    const socket = {
      data: { user },
      rooms: new Set(['socket-1']),
      join: jest.fn(),
    };
    access.assertProjectAccess.mockResolvedValueOnce(undefined);
    await expect(
      gateway.subscribe(socket as never, { projectId }),
    ).resolves.toEqual({ ok: true, projectId });
    expect(socket.join).toHaveBeenCalledWith(`project:${projectId}`);

    access.assertProjectAccess.mockRejectedValueOnce(new Error('forbidden'));
    await expect(
      gateway.subscribe(socket as never, { projectId }),
    ).resolves.toEqual({ ok: false, error: 'FORBIDDEN' });
    expect(socket.join).toHaveBeenCalledTimes(1);

    await expect(
      gateway.subscribe(socket as never, { projectId: 'not-a-uuid' }),
    ).resolves.toEqual({ ok: false, error: 'INVALID_PROJECT' });
  });

  it('rechecks access before delivery and evicts unauthorized sockets', async () => {
    const allowed = {
      data: { user },
      handshake: { headers: {} },
      emit: jest.fn(),
      leave: jest.fn(),
    };
    const denied = {
      data: { user: { ...user, id: 'user-2' } },
      handshake: { headers: {} },
      emit: jest.fn(),
      leave: jest.fn(),
    };
    (gateway as unknown as { server: unknown }).server = {
      in: () => ({ fetchSockets: () => Promise.resolve([allowed, denied]) }),
    };
    access.assertProjectAccess
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('forbidden'));
    (auth.api.getSession as unknown as jest.Mock)
      .mockResolvedValueOnce({ user })
      .mockResolvedValueOnce({ user: { ...user, id: 'user-2' } });
    const event: RealtimeEventEnvelope = {
      id: 'event-1',
      projectId,
      type: 'TASK_UPDATED',
      entity: 'task',
      entityId: 'task-1',
      actorId: user.id,
      occurredAt: new Date().toISOString(),
    };

    await gateway.publish(event);
    expect(allowed.emit).toHaveBeenCalledWith('project:event', event);
    expect(denied.emit).not.toHaveBeenCalled();
    expect(denied.leave).toHaveBeenCalledWith(`project:${projectId}`);
  });

  it('evicts and informs sockets whose current access is revoked', async () => {
    const socket = {
      data: { user },
      handshake: { headers: {} },
      emit: jest.fn(),
      leave: jest.fn(),
    };
    (gateway as unknown as { server: unknown }).server = {
      in: () => ({ fetchSockets: () => Promise.resolve([socket]) }),
    };
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValueOnce({
      user,
    });
    access.assertProjectAccess.mockRejectedValueOnce(new Error('forbidden'));
    await gateway.reauthorizeProject(projectId);
    expect(socket.leave).toHaveBeenCalledWith(`project:${projectId}`);
    expect(socket.emit).toHaveBeenCalledWith('project:access-revoked', {
      projectId,
    });
  });

  it('delivers private notification invalidations only to the target user room', async () => {
    const target = {
      data: { user },
      handshake: { headers: {} },
      emit: jest.fn(),
      leave: jest.fn(),
    };
    const wrongUser = {
      data: { user: { ...user, id: 'user-2' } },
      handshake: { headers: {} },
      emit: jest.fn(),
      leave: jest.fn(),
    };
    const room = jest.fn(() => ({
      fetchSockets: () => Promise.resolve([target, wrongUser]),
    }));
    (gateway as unknown as { server: unknown }).server = { in: room };
    (auth.api.getSession as unknown as jest.Mock).mockResolvedValueOnce({
      user,
    });
    const event = {
      id: 'event-1',
      type: 'NOTIFICATION_CREATED' as const,
      notificationId: 'notification-1',
      occurredAt: new Date().toISOString(),
    };

    await gateway.publishNotification(user.id, event);
    expect(room).toHaveBeenCalledWith(`user:${user.id}`);
    expect(target.emit).toHaveBeenCalledWith('notification:event', event);
    expect(wrongUser.emit).not.toHaveBeenCalled();
    expect(wrongUser.leave).toHaveBeenCalledWith(`user:${user.id}`);
  });

  function runMiddleware(
    middleware: (
      socket: Record<string, unknown>,
      next: (error?: Error) => void,
    ) => void,
    socket: Record<string, unknown>,
  ): Promise<Error | undefined> {
    return new Promise((resolve) => middleware(socket, resolve));
  }
});
