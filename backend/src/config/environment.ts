import 'dotenv/config';
import { createPrivateKey } from 'node:crypto';
import { isAbsolute, parse, relative, resolve } from 'node:path';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface AppEnvironment {
  nodeEnv: NodeEnvironment;
  isProduction: boolean;
  databaseUrl: string;
  backendUrl: string;
  frontendUrl: string;
  betterAuthSecret: string | undefined;
  port: number;
  githubClientId: string | undefined;
  githubClientSecret: string | undefined;
  githubWebhookSecret: string | undefined;
  githubApp: GithubAppEnvironment | undefined;
  storageDriver: 'local';
  storagePath: string;
}

export interface GithubAppEnvironment {
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function parseEnvironment(source: NodeJS.ProcessEnv): AppEnvironment {
  const nodeEnvValue = source.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnvValue)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const nodeEnv = nodeEnvValue as NodeEnvironment;
  const isProduction = nodeEnv === 'production';
  const allowInsecureLocalhost =
    source.FLOWPLAN_ALLOW_INSECURE_LOCALHOST === 'true';

  const databaseUrl = required(source.DATABASE_URL, 'DATABASE_URL');
  validateDatabaseUrl(databaseUrl, isProduction, allowInsecureLocalhost);

  const backendUrl = resolvePublicUrl(
    source.BETTER_AUTH_URL,
    'BETTER_AUTH_URL',
    'http://localhost:3001',
    isProduction,
    allowInsecureLocalhost,
  );
  const frontendUrl = resolvePublicUrl(
    source.FRONTEND_URL,
    'FRONTEND_URL',
    'http://localhost:3000',
    isProduction,
    allowInsecureLocalhost,
  );

  const betterAuthSecret = source.BETTER_AUTH_SECRET?.trim() || undefined;
  if (
    isProduction &&
    (!betterAuthSecret ||
      betterAuthSecret.length < 32 ||
      betterAuthSecret.includes('replace-with'))
  ) {
    throw new Error(
      'BETTER_AUTH_SECRET must be a non-placeholder value of at least 32 characters in production',
    );
  }

  const portValue = source.PORT?.trim() || '3001';
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const githubClientId = source.GITHUB_CLIENT_ID?.trim() || undefined;
  const githubClientSecret = source.GITHUB_CLIENT_SECRET?.trim() || undefined;
  if (Boolean(githubClientId) !== Boolean(githubClientSecret)) {
    throw new Error(
      'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be configured together',
    );
  }

  const githubWebhookSecret = source.GITHUB_WEBHOOK_SECRET?.trim() || undefined;
  if (
    githubWebhookSecret &&
    (githubWebhookSecret.length < 32 ||
      githubWebhookSecret.includes('replace-with'))
  ) {
    throw new Error(
      'GITHUB_WEBHOOK_SECRET must be at least 32 characters when configured',
    );
  }

  const githubApp = parseGithubAppEnvironment(source, githubWebhookSecret);
  const storageDriver = source.FLOWPLAN_STORAGE_DRIVER?.trim() || 'local';
  if (storageDriver !== 'local') {
    throw new Error('FLOWPLAN_STORAGE_DRIVER must be local');
  }
  const configuredStoragePath = source.FLOWPLAN_STORAGE_PATH?.trim();
  if (isProduction && !configuredStoragePath) {
    throw new Error('FLOWPLAN_STORAGE_PATH is required in production');
  }
  const storagePath = configuredStoragePath
    ? resolve(configuredStoragePath)
    : resolve(process.cwd(), '..', '.flowplan-storage');
  if (isProduction && !isAbsolute(configuredStoragePath!)) {
    throw new Error('FLOWPLAN_STORAGE_PATH must be absolute in production');
  }
  if (parse(storagePath).root === storagePath) {
    throw new Error('FLOWPLAN_STORAGE_PATH must not be a filesystem root');
  }
  const relativeToApplication = relative(resolve(process.cwd()), storagePath);
  if (
    isProduction &&
    !relativeToApplication.startsWith('..') &&
    !isAbsolute(relativeToApplication)
  ) {
    throw new Error(
      'FLOWPLAN_STORAGE_PATH must be outside the application directory in production',
    );
  }

  return {
    nodeEnv,
    isProduction,
    databaseUrl,
    backendUrl,
    frontendUrl,
    betterAuthSecret,
    port,
    githubClientId,
    githubClientSecret,
    githubWebhookSecret,
    githubApp,
    storageDriver,
    storagePath,
  };
}

function parseGithubAppEnvironment(
  source: NodeJS.ProcessEnv,
  webhookSecret: string | undefined,
): GithubAppEnvironment | undefined {
  const values = {
    appId: source.GITHUB_APP_ID?.trim(),
    slug: source.GITHUB_APP_SLUG?.trim(),
    clientId: source.GITHUB_APP_CLIENT_ID?.trim(),
    clientSecret: source.GITHUB_APP_CLIENT_SECRET?.trim(),
    privateKey: source.GITHUB_APP_PRIVATE_KEY?.trim(),
  };
  const enabled = Object.values(values).some(Boolean);
  if (!enabled) return undefined;

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0 || !webhookSecret) {
    throw new Error(
      'GitHub App configuration requires GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, GITHUB_APP_PRIVATE_KEY, and GITHUB_WEBHOOK_SECRET',
    );
  }
  if (!/^[1-9]\d*$/.test(values.appId!)) {
    throw new Error('GITHUB_APP_ID must be a positive integer');
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(values.slug!)) {
    throw new Error('GITHUB_APP_SLUG is invalid');
  }
  if (values.clientSecret!.includes('replace-with')) {
    throw new Error('GITHUB_APP_CLIENT_SECRET must not be a placeholder');
  }

  const privateKey = normalizeGithubPrivateKey(values.privateKey!);
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not RSA');
  } catch {
    throw new Error('GITHUB_APP_PRIVATE_KEY must be a valid RSA private key');
  }

  return {
    appId: values.appId!,
    slug: values.slug!,
    clientId: values.clientId!,
    clientSecret: values.clientSecret!,
    privateKey,
  };
}

export function normalizeGithubPrivateKey(value: string): string {
  return `${value.replace(/\\n/g, '\n').trim()}\n`;
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function resolvePublicUrl(
  value: string | undefined,
  name: string,
  developmentDefault: string,
  production: boolean,
  allowInsecureLocalhost: boolean,
): string {
  const normalized =
    value?.trim() || (production ? undefined : developmentDefault);
  if (!normalized) throw new Error(`${name} is required in production`);

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must contain only an origin`);
  }
  const isSecurePublicOrigin =
    url.protocol === 'https:' && !LOCAL_HOSTS.has(url.hostname);
  const isExplicitlyAllowedLocalOrigin =
    allowInsecureLocalhost &&
    url.protocol === 'http:' &&
    LOCAL_HOSTS.has(url.hostname);
  if (production && !isSecurePublicOrigin && !isExplicitlyAllowedLocalOrigin) {
    throw new Error(
      `${name} must use HTTPS and a non-local host in production`,
    );
  }
  return url.origin;
}

function validateDatabaseUrl(
  value: string,
  production: boolean,
  allowInsecureLocalhost: boolean,
): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol');
  }
  if (production && LOCAL_HOSTS.has(url.hostname) && !allowInsecureLocalhost) {
    throw new Error('DATABASE_URL must not use localhost in production');
  }
}

export const environment = parseEnvironment(process.env);
