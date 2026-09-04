import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthDatabaseLifecycleService } from './auth-database-lifecycle.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthGuard, AuthDatabaseLifecycleService],
  exports: [AuthGuard],
})
export class AuthModule {}
