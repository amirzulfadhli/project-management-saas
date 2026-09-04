import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { disconnectAuthDatabase } from './auth';

@Injectable()
export class AuthDatabaseLifecycleService implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await disconnectAuthDatabase();
  }
}
