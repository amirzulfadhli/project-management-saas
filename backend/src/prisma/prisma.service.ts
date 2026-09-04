import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { environment } from '../config/environment';

/**
 * Shared Prisma client for the application, backed by the `pg` driver adapter.
 *
 * Connections are established lazily by Prisma; we intentionally avoid an
 * eager `$connect()` at boot so the API can start (and report healthy) even
 * when the database is temporarily unavailable.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
