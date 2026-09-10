export const GITHUB_WEBHOOK_SECRET = Symbol('GITHUB_WEBHOOK_SECRET');
export const GITHUB_APP_CONFIG = Symbol('GITHUB_APP_CONFIG');
export const GITHUB_FETCH = Symbol('GITHUB_FETCH');
export const GITHUB_APP_CALLBACK_URL = Symbol('GITHUB_APP_CALLBACK_URL');

export const GITHUB_API_URL = 'https://api.github.com';
export const GITHUB_OAUTH_URL = 'https://github.com/login/oauth';
export const GITHUB_API_VERSION = '2026-03-10';

export const GithubDeliveryStatus = {
  PROCESSED: 'PROCESSED',
} as const;
