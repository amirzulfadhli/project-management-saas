import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { environment } from '../config/environment';

const adapter = new PrismaPg({
  connectionString: environment.databaseUrl,
});
const prisma = new PrismaClient({ adapter });

export async function disconnectAuthDatabase(): Promise<void> {
  await prisma.$disconnect();
}

export const auth = betterAuth({
  baseURL: environment.backendUrl,
  secret: environment.betterAuthSecret,
  trustedOrigins: [environment.frontendUrl],
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  socialProviders:
    environment.githubClientId && environment.githubClientSecret
      ? {
          github: {
            clientId: environment.githubClientId,
            clientSecret: environment.githubClientSecret,
          },
        }
      : {},
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: true,
        defaultValue: 'member',
      },
    },
  },
});

export type Auth = typeof auth;
