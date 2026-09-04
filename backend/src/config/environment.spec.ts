import { parseEnvironment } from './environment';

const productionEnvironment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://flowplan:secret@postgres:5432/flowplan',
  BETTER_AUTH_URL: 'https://api.example.com',
  BETTER_AUTH_SECRET: 'a-secure-secret-that-is-at-least-32-characters',
  FRONTEND_URL: 'https://app.example.com',
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
