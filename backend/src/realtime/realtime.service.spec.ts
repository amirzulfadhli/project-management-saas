import { RealtimeService } from './realtime.service';
import type { RealtimeEventEnvelope } from './realtime.types';

jest.mock('../auth/auth', () => ({
  auth: { api: { getSession: jest.fn() } },
}));

describe('RealtimeService', () => {
  const prisma = { task: { findUnique: jest.fn() } };
  const gateway = { publish: jest.fn(), reauthorizeProject: jest.fn() };
  const projectId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => jest.clearAllMocks());

  it('adds a unique envelope and delegates publication', async () => {
    const service = new RealtimeService(prisma as never, gateway as never);
    await service.publish({
      projectId,
      type: 'TASK_CREATED',
      entity: 'task',
      entityId: 'task-1',
      actorId: 'user-1',
    });
    const calls = gateway.publish.mock.calls as unknown as Array<
      [RealtimeEventEnvelope]
    >;
    const published = calls[0]?.[0];
    expect(published).toMatchObject({
      projectId,
      type: 'TASK_CREATED',
      entityId: 'task-1',
    });
    expect(typeof published?.id).toBe('string');
    expect(typeof published?.occurredAt).toBe('string');
  });

  it('resolves Task Project scope without exposing publication failures', async () => {
    const service = new RealtimeService(prisma as never, gateway as never);
    prisma.task.findUnique.mockResolvedValueOnce({ projectId });
    gateway.publish.mockRejectedValueOnce(new Error('socket unavailable'));
    await expect(
      service.publishForTask({
        taskId: 'task-1',
        type: 'COMMENT_CREATED',
        entity: 'comment',
        entityId: 'comment-1',
        actorId: 'user-1',
      }),
    ).resolves.toBeUndefined();
  });
});
