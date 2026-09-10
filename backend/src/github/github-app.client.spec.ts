import {
  BadGatewayException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { generateKeyPairSync, verify } from 'node:crypto';
import type { GithubAppEnvironment } from '../config/environment';
import { GithubAppClient } from './github-app.client';

describe('GithubAppClient', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config: GithubAppEnvironment = {
    appId: '12345',
    slug: 'flowplan-test',
    clientId: 'Iv1.flowplan-test',
    clientSecret: 'client-secret-must-never-be-logged',
    privateKey: keys.privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
  };
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let client: GithubAppClient;

  beforeEach(() => {
    fetchMock = jest.fn();
    client = new GithubAppClient(config, fetchMock);
  });

  it('creates a short-lived RS256 app JWT with the configured app issuer', () => {
    const now = new Date('2026-09-06T02:00:00Z');
    const jwt = client.createAppJwt(now);
    const [header, payload, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iat: Math.floor(now.getTime() / 1000) - 60,
      exp: Math.floor(now.getTime() / 1000) + 540,
      iss: config.appId,
    });
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        keys.publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('exchanges an OAuth code with PKCE without exposing the user token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'ghu_transient', expires_in: 28_800 }),
    );

    await expect(
      client.exchangeUserCode(
        'oauth-code',
        'pkce-verifier',
        'https://api.example.com/api/github/app/callback',
      ),
    ).resolves.toBe('ghu_transient');
    const request = fetchMock.mock.calls[0][1];
    expect(request?.body).toBeInstanceOf(URLSearchParams);
    if (!(request?.body instanceof URLSearchParams)) {
      throw new Error('Expected an OAuth form body');
    }
    expect(request.body.get('code_verifier')).toBe('pkce-verifier');
    expect(JSON.stringify(request)).not.toContain(config.privateKey);
  });

  it('verifies an installation and its current user association', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ total_count: 0, repositories: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 987,
          app_id: 12345,
          account: { id: 456, login: 'flowplan', type: 'Organization' },
        }),
      );

    await client.verifyUserInstallation('ghu_transient', '987');
    await expect(client.getInstallation('987')).resolves.toEqual({
      externalInstallationId: '987',
      accountId: '456',
      accountLogin: 'flowplan',
      accountType: 'Organization',
    });
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer ghu_transient');
  });

  it('uses fresh installation tokens and paginates normalized repositories', async () => {
    const token = () =>
      jsonResponse({
        token: 'ghs_transient',
        expires_at: '2099-01-01T00:00:00Z',
      });
    const page = () =>
      jsonResponse({
        total_count: 3,
        repositories: [githubRepository(101, 'alpha')],
      });
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(page());

    await expect(client.listRepositories('987', 1, 1)).resolves.toMatchObject({
      page: 1,
      perPage: 1,
      totalCount: 3,
      nextPage: 2,
      items: [{ externalRepositoryId: '101', fullName: 'flowplan/alpha' }],
    });
    await client.listRepositories('987', 2, 1);
    expect(
      fetchMock.mock.calls.filter(([url]) => {
        const requestUrl =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        return requestUrl.endsWith('/app/installations/987/access_tokens');
      }),
    ).toHaveLength(2);
  });

  it('verifies repository identity through an installation-scoped token', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          token: 'ghs_transient',
          expires_at: '2099-01-01T00:00:00Z',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(githubRepository(101, 'alpha')));

    await expect(client.getRepository('987', '101')).resolves.toMatchObject({
      externalRepositoryId: '101',
      owner: 'flowplan',
      name: 'alpha',
      defaultBranch: 'main',
      private: true,
      archived: false,
    });
  });

  it.each([
    [401, {}, BadGatewayException, undefined],
    [403, {}, BadGatewayException, undefined],
    [404, {}, NotFoundException, undefined],
    [403, { 'x-ratelimit-remaining': '0' }, HttpException, 429],
  ])(
    'normalizes GitHub API status %s without leaking its response',
    async (status, headers, ErrorType, expectedStatus) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ message: 'sensitive upstream detail' }), {
          status,
          headers,
        }),
      );
      const promise = client.verifyUserInstallation('ghu_transient', '987');
      await expect(promise).rejects.toBeInstanceOf(ErrorType);
      if (expectedStatus) {
        await expect(promise).rejects.toMatchObject({ status: expectedStatus });
      }
    },
  );

  it('rejects malformed responses and already-expired installation tokens', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));
    await expect(client.getInstallation('987')).rejects.toBeInstanceOf(
      BadGatewayException,
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ token: 'expired', expires_at: '2020-01-01T00:00:00Z' }),
    );
    await expect(client.listRepositories('987', 1, 30)).rejects.toThrow(
      'expired installation token',
    );
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function githubRepository(id: number, name: string) {
  return {
    id,
    name,
    full_name: `flowplan/${name}`,
    default_branch: 'main',
    html_url: `https://github.com/flowplan/${name}`,
    private: true,
    archived: false,
    owner: { login: 'flowplan' },
  };
}
