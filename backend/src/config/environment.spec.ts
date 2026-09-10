import { parseEnvironment } from './environment';
import { generateKeyPairSync } from 'node:crypto';

const githubPrivateKey = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();

const productionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://flowplan:secret@postgres:5432/flowplan',
  BETTER_AUTH_URL: 'https://api.example.com',
  BETTER_AUTH_SECRET: 'a-secure-secret-that-is-at-least-32-characters',
  FRONTEND_URL: 'https://app.example.com',
  FLOWPLAN_STORAGE_PATH: '/data/uploads',
  PORT: '3001',
};

describe('parseEnvironment', () => {
  it('accepts complete production configuration', () => {
    expect(parseEnvironment(productionEnvironment)).toMatchObject({
      nodeEnv: 'production',
      isProduction: true,
      port: 3001,
      backendUrl: 'https://api.example.com',
      frontendUrl: 'https://app.example.com',
    });
  });

  it('retains localhost defaults outside production', () => {
    expect(
      parseEnvironment({ DATABASE_URL: productionEnvironment.DATABASE_URL }),
    ).toMatchObject({
      nodeEnv: 'development',
      backendUrl: 'http://localhost:3001',
      frontendUrl: 'http://localhost:3000',
      port: 3001,
    });
  });

  it('allows local HTTP origins only with the explicit local-production override', () => {
    expect(
      parseEnvironment({
        ...productionEnvironment,
        DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/flowplan',
        BETTER_AUTH_URL: 'http://localhost:3001',
        FRONTEND_URL: 'http://127.0.0.1:3000',
        FLOWPLAN_ALLOW_INSECURE_LOCALHOST: 'true',
      }),
    ).toMatchObject({
      backendUrl: 'http://localhost:3001',
      frontendUrl: 'http://127.0.0.1:3000',
    });
  });

  it('still rejects non-local HTTP origins when the local override is enabled', () => {
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        BETTER_AUTH_URL: 'http://api.example.com',
        FLOWPLAN_ALLOW_INSECURE_LOCALHOST: 'true',
      }),
    ).toThrow('BETTER_AUTH_URL must use HTTPS');
  });

  it('requires an absolute local storage root in production', () => {
    expect(() =>
      parseEnvironment({ ...productionEnvironment, FLOWPLAN_STORAGE_PATH: '' }),
    ).toThrow('FLOWPLAN_STORAGE_PATH is required in production');
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        FLOWPLAN_STORAGE_PATH: 'relative/uploads',
      }),
    ).toThrow('FLOWPLAN_STORAGE_PATH must be absolute in production');
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        FLOWPLAN_STORAGE_DRIVER: 's3',
      }),
    ).toThrow('FLOWPLAN_STORAGE_DRIVER must be local');
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        FLOWPLAN_STORAGE_PATH: process.cwd(),
      }),
    ).toThrow('outside the application directory');
  });

  it('accepts an optional strong webhook secret and rejects a weak one', () => {
    expect(
      parseEnvironment({
        ...productionEnvironment,
        GITHUB_WEBHOOK_SECRET:
          'a-separate-github-webhook-secret-at-least-32-characters',
      }).githubWebhookSecret,
    ).toBe('a-separate-github-webhook-secret-at-least-32-characters');

    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        GITHUB_WEBHOOK_SECRET: 'too-short',
      }),
    ).toThrow('GITHUB_WEBHOOK_SECRET must be at least 32 characters');
  });

  it('normalizes a complete GitHub App configuration and rejects partial configuration', () => {
    const parsed = parseEnvironment({
      ...productionEnvironment,
      GITHUB_WEBHOOK_SECRET:
        'a-separate-github-webhook-secret-at-least-32-characters',
      GITHUB_APP_ID: '12345',
      GITHUB_APP_SLUG: 'flowplan-test',
      GITHUB_APP_CLIENT_ID: 'Iv1.test-client',
      GITHUB_APP_CLIENT_SECRET: 'test-client-secret',
      GITHUB_APP_PRIVATE_KEY: githubPrivateKey.replace(/\n/g, '\\n'),
    });

    expect(parsed.githubApp).toMatchObject({
      appId: '12345',
      slug: 'flowplan-test',
      clientId: 'Iv1.test-client',
    });
    expect(parsed.githubApp?.privateKey).toBe(githubPrivateKey);
    expect(parsed.githubApp).not.toHaveProperty('webhookSecret');

    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        GITHUB_APP_ID: '12345',
      }),
    ).toThrow('GitHub App configuration requires');
  });

  it('rejects an invalid GitHub App private key', () => {
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        GITHUB_WEBHOOK_SECRET:
          'a-separate-github-webhook-secret-at-least-32-characters',
        GITHUB_APP_ID: '12345',
        GITHUB_APP_SLUG: 'flowplan-test',
        GITHUB_APP_CLIENT_ID: 'Iv1.test-client',
        GITHUB_APP_CLIENT_SECRET: 'test-client-secret',
        GITHUB_APP_PRIVATE_KEY: 'not-a-private-key',
      }),
    ).toThrow('GITHUB_APP_PRIVATE_KEY must be a valid RSA private key');
  });

  it.each([
    ['missing auth URL', { ...productionEnvironment, BETTER_AUTH_URL: '' }],
    [
      'local frontend URL',
      { ...productionEnvironment, FRONTEND_URL: 'http://localhost:3000' },
    ],
    [
      'placeholder secret',
      {
        ...productionEnvironment,
        BETTER_AUTH_SECRET: 'replace-with-at-least-32-random-characters',
      },
    ],
    [
      'local database',
      {
        ...productionEnvironment,
        DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/flowplan',
      },
    ],
  ])('rejects unsafe production configuration: %s', (_label, source) => {
    expect(() => parseEnvironment(source)).toThrow();
  });
});
