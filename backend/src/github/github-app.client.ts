import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createPrivateKey, sign } from 'node:crypto';
import { z } from 'zod';
import type { GithubAppEnvironment } from '../config/environment';
import {
  GITHUB_API_URL,
  GITHUB_API_VERSION,
  GITHUB_APP_CONFIG,
  GITHUB_FETCH,
  GITHUB_OAUTH_URL,
} from './github.constants';

type FetchImplementation = typeof fetch;

const installationSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  app_id: z.union([
    z.number().int().positive(),
    z.string().regex(/^[1-9]\d*$/),
  ]),
  account: z.object({
    id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
    login: z.string().min(1).max(255),
    type: z.string().min(1).max(50),
  }),
});

const repositorySchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  name: z.string().min(1).max(100),
  full_name: z.string().min(3).max(201),
  default_branch: z.string().min(1).max(255),
  html_url: z.string().url().startsWith('https://github.com/'),
  private: z.boolean(),
  archived: z.boolean(),
  owner: z.object({ login: z.string().min(1).max(255) }),
});

const repositoryPageSchema = z.object({
  total_count: z.number().int().nonnegative(),
  repositories: z.array(repositorySchema),
});

const installationTokenSchema = z.object({
  token: z.string().min(1),
  expires_at: z.string().datetime(),
});

const userTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
});

export interface GithubInstallationIdentity {
  externalInstallationId: string;
  accountId: string;
  accountLogin: string;
  accountType: string;
}

export interface GithubRepositoryIdentity {
  externalRepositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  private: boolean;
  archived: boolean;
}

@Injectable()
export class GithubAppClient {
  constructor(
    @Inject(GITHUB_APP_CONFIG)
    private readonly config: GithubAppEnvironment | undefined,
    @Inject(GITHUB_FETCH) private readonly fetchImpl: FetchImplementation,
  ) {}

  createAppJwt(now = new Date()): string {
    const config = this.requireConfig();
    const timestamp = Math.floor(now.getTime() / 1000);
    const header = this.encode({ alg: 'RS256', typ: 'JWT' });
    const payload = this.encode({
      iat: timestamp - 60,
      exp: timestamp + 540,
      iss: config.appId,
    });
    const unsigned = `${header}.${payload}`;
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(unsigned),
      createPrivateKey(config.privateKey),
    ).toString('base64url');
    return `${unsigned}.${signature}`;
  }

  getInstallUrl(state: string): string {
    const config = this.requireConfig();
    const url = new URL(
      `https://github.com/apps/${config.slug}/installations/new`,
    );
    url.searchParams.set('state', state);
    return url.toString();
  }

  getUserAuthorizationUrl(
    state: string,
    codeChallenge: string,
    callbackUrl: string,
  ): string {
    const config = this.requireConfig();
    const url = new URL(`${GITHUB_OAUTH_URL}/authorize`);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeUserCode(
    code: string,
    codeVerifier: string,
    callbackUrl: string,
  ): Promise<string> {
    const config = this.requireConfig();
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: callbackUrl,
      code_verifier: codeVerifier,
    });
    const value = await this.requestJson(`${GITHUB_OAUTH_URL}/access_token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    return this.parse(userTokenSchema, value, 'GitHub user token response')
      .access_token;
  }

  async verifyUserInstallation(
    userToken: string,
    installationId: string,
  ): Promise<void> {
    const value = await this.requestJson(
      `${GITHUB_API_URL}/user/installations/${installationId}/repositories?per_page=1&page=1`,
      { headers: this.githubHeaders(userToken) },
    );
    this.parse(
      repositoryPageSchema,
      value,
      'GitHub user installation response',
    );
  }

  async getInstallation(
    installationId: string,
  ): Promise<GithubInstallationIdentity> {
    const config = this.requireConfig();
    const value = await this.requestJson(
      `${GITHUB_API_URL}/app/installations/${installationId}`,
      { headers: this.githubHeaders(this.createAppJwt()) },
    );
    const installation = this.parse(
      installationSchema,
      value,
      'GitHub installation response',
    );
    if (
      String(installation.id) !== installationId ||
      String(installation.app_id) !== config.appId
    ) {
      throw new BadGatewayException(
        'GitHub returned an unexpected installation',
      );
    }
    return {
      externalInstallationId: String(installation.id),
      accountId: String(installation.account.id),
      accountLogin: installation.account.login,
      accountType: installation.account.type,
    };
  }

  async listRepositories(
    installationId: string,
    page: number,
    perPage: number,
  ) {
    const token = await this.createInstallationToken(installationId);
    const value = await this.requestJson(
      `${GITHUB_API_URL}/installation/repositories?page=${page}&per_page=${perPage}`,
      { headers: this.githubHeaders(token) },
    );
    const result = this.parse(
      repositoryPageSchema,
      value,
      'GitHub repository response',
    );
    return {
      items: result.repositories.map((repository) =>
        this.normalizeRepository(repository),
      ),
      page,
      perPage,
      totalCount: result.total_count,
      nextPage: page * perPage < result.total_count ? page + 1 : null,
    };
  }

  async getRepository(
    installationId: string,
    repositoryId: string,
  ): Promise<GithubRepositoryIdentity> {
    const token = await this.createInstallationToken(installationId);
    const value = await this.requestJson(
      `${GITHUB_API_URL}/repositories/${repositoryId}`,
      { headers: this.githubHeaders(token) },
    );
    const repository = this.parse(
      repositorySchema,
      value,
      'GitHub repository response',
    );
    if (String(repository.id) !== repositoryId) {
      throw new BadGatewayException('GitHub returned an unexpected repository');
    }
    return this.normalizeRepository(repository);
  }

  private async createInstallationToken(installationId: string) {
    const value = await this.requestJson(
      `${GITHUB_API_URL}/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: this.githubHeaders(this.createAppJwt()),
      },
    );
    const token = this.parse(
      installationTokenSchema,
      value,
      'GitHub installation token response',
    );
    if (Date.parse(token.expires_at) <= Date.now() + 30_000) {
      throw new BadGatewayException(
        'GitHub returned an expired installation token',
      );
    }
    return token.token;
  }

  private async requestJson(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new GatewayTimeoutException('GitHub API request timed out');
      }
      throw new BadGatewayException('GitHub API is unavailable');
    }

    if (!response.ok) {
      if (
        response.status === 403 &&
        response.headers.get('x-ratelimit-remaining') === '0'
      ) {
        throw new HttpException(
          'GitHub API rate limit exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (response.status === 404) {
        throw new NotFoundException('GitHub resource not found');
      }
      if (response.status === 401) {
        throw new BadGatewayException(
          'GitHub rejected the integration credentials',
        );
      }
      if (response.status === 403) {
        throw new BadGatewayException('GitHub denied the integration request');
      }
      throw new BadGatewayException('GitHub API request failed');
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new BadGatewayException('GitHub returned an invalid JSON response');
    }
  }

  private githubHeaders(token: string): HeadersInit {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'FlowPlan',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    };
  }

  private normalizeRepository(
    repository: z.infer<typeof repositorySchema>,
  ): GithubRepositoryIdentity {
    return {
      externalRepositoryId: String(repository.id),
      owner: repository.owner.login,
      name: repository.name,
      fullName: repository.full_name,
      defaultBranch: repository.default_branch,
      htmlUrl: repository.html_url,
      private: repository.private,
      archived: repository.archived,
    };
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new BadGatewayException(`${label} is malformed`);
    }
    return result.data;
  }

  private encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private requireConfig(): GithubAppEnvironment {
    if (!this.config) {
      throw new ServiceUnavailableException('GitHub App is not configured');
    }
    return this.config;
  }
}
