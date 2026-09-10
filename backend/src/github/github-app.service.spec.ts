import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { GithubAppClient } from './github-app.client';
import { GithubAppService } from './github-app.service';

describe('GithubAppService', () => {
  interface CreatedState {
    userId: string;
    stateHash: string;
    codeVerifier: string;
    expiresAt: Date;
  }

  const userId = 'user-1';
  const installationId = '10000000-0000-4000-8000-000000000001';
  const storedInstallation = {
    id: installationId,
    externalInstallationId: '987',
    accountLogin: 'flowplan',
    accountId: '456',
    accountType: 'Organization',
    connectedById: userId,
    createdAt: new Date('2026-09-06T00:00:00Z'),
    updatedAt: new Date('2026-09-06T00:00:00Z'),
  };
  let transaction: {
    $queryRaw: jest.Mock;
    githubAppState: {
      deleteMany: jest.Mock;
      create: jest.MockedFunction<
        (args: { data: CreatedState }) => Promise<void>
      >;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    githubInstallation: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let prisma: {
    $transaction: jest.Mock;
    githubAppState: {
      findUnique: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    githubInstallation: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let client: {
    getInstallUrl: jest.Mock;
    getUserAuthorizationUrl: jest.Mock;
    exchangeUserCode: jest.Mock;
    verifyUserInstallation: jest.Mock;
    getInstallation: jest.Mock;
    listRepositories: jest.Mock;
    getRepository: jest.Mock;
  };
  let service: GithubAppService;
  let createdState: CreatedState | undefined;

  beforeEach(() => {
    createdState = undefined;
    transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'state-row' }]),
      githubAppState: {
        deleteMany: jest.fn(),
        create: jest.fn((args: { data: CreatedState }) => {
          createdState = args.data;
          return Promise.resolve();
        }),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      githubInstallation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(storedInstallation),
        update: jest.fn(),
      },
    };
    prisma = {
      $transaction: jest.fn(
        async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          operation(transaction as unknown as Prisma.TransactionClient),
      ),
      githubAppState: {
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      githubInstallation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    client = {
      getInstallUrl: jest.fn((state: string) => `https://github.test/${state}`),
      getUserAuthorizationUrl: jest.fn().mockReturnValue('https://oauth.test'),
      exchangeUserCode: jest.fn().mockResolvedValue('ghu_transient'),
      verifyUserInstallation: jest.fn(),
      getInstallation: jest.fn().mockResolvedValue({
        externalInstallationId: '987',
        accountLogin: 'flowplan',
        accountId: '456',
        accountType: 'Organization',
      }),
      listRepositories: jest.fn().mockResolvedValue({ items: [] }),
      getRepository: jest.fn().mockResolvedValue({
        externalRepositoryId: '101',
      }),
    };
    service = new GithubAppService(
      prisma as unknown as PrismaService,
      client as unknown as GithubAppClient,
      'https://api.example.com/api/github/app/callback',
    );
  });

  it('creates one-time hashed state and a PKCE verifier', async () => {
    const result = await service.createInstallUrl(userId);
    if (!createdState) throw new Error('Expected GitHub state to be created');
    expect(result.url).toMatch(/^https:\/\/github\.test\//);
    expect(createdState.userId).toBe(userId);
    expect(createdState.stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createdState.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.url).not.toContain(createdState.stateHash);
  });

  it('rejects installation setup state owned by another user', async () => {
    transaction.githubAppState.findUniqueOrThrow.mockResolvedValue({
      id: 'state-row',
      userId: 'another-user',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      pendingInstallationId: null,
      codeVerifier: 'verifier',
    });

    await expect(
      service.beginSetup(userId, {
        installation_id: '987',
        setup_action: 'install',
        state: 'a'.repeat(43),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies the user installation with a transient token before persisting metadata', async () => {
    transaction.githubAppState.findUniqueOrThrow.mockResolvedValue({
      id: 'state-row',
      userId,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      pendingInstallationId: '987',
      codeVerifier: 'pkce-verifier',
    });

    await expect(
      service.completeCallback(userId, {
        code: 'oauth-code',
        state: 'a'.repeat(43),
      }),
    ).resolves.toEqual(storedInstallation);
    expect(client.exchangeUserCode).toHaveBeenCalledWith(
      'oauth-code',
      'pkce-verifier',
      'https://api.example.com/api/github/app/callback',
    );
    expect(client.verifyUserInstallation).toHaveBeenCalledWith(
      'ghu_transient',
      '987',
    );
    const persisted = JSON.stringify(
      transaction.githubInstallation.create.mock.calls,
    );
    expect(persisted).not.toContain('ghu_transient');
    expect(persisted).not.toContain('pkce-verifier');
    expect(prisma.githubAppState.deleteMany).toHaveBeenCalledWith({
      where: { id: 'state-row' },
    });
  });

  it('does not expose an installation owned by another user', async () => {
    prisma.githubInstallation.findUnique.mockResolvedValue({
      ...storedInstallation,
      connectedById: 'another-user',
    });

    await expect(
      service.listRepositories(userId, installationId, {
        page: 1,
        perPage: 30,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(client.listRepositories).not.toHaveBeenCalled();
  });

  it('scopes discovery and verification to the user-owned installation', async () => {
    prisma.githubInstallation.findUnique.mockResolvedValue(storedInstallation);

    await service.listRepositories(userId, installationId, {
      page: 2,
      perPage: 50,
    });
    await service.getVerifiedRepository(userId, installationId, '101');
    expect(client.listRepositories).toHaveBeenCalledWith('987', 2, 50);
    expect(client.getRepository).toHaveBeenCalledWith('987', '101');
  });
});
