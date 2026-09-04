import 'dotenv/config';

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
  };
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
