import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  githubCallbackQuerySchema,
  githubInstallationRecordIdSchema,
  GithubCallbackQueryDto,
  githubRepositoryQuerySchema,
  GithubRepositoryQueryDto,
  githubSetupQuerySchema,
  GithubSetupQueryDto,
} from './dto/github.dto';
import { GithubAppService } from './github-app.service';

@UseGuards(AuthGuard)
@Controller('api/github/app')
export class GithubAppController {
  constructor(private readonly githubApp: GithubAppService) {}

  @Post('install-url')
  createInstallUrl(@CurrentUser() user: AuthenticatedUser) {
    return this.githubApp.createInstallUrl(user.id);
  }

  @Get('setup')
  async setup(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(githubSetupQuerySchema))
    query: GithubSetupQueryDto,
    @Res() response: Response,
  ) {
    const url = await this.githubApp.beginSetup(user.id, query);
    response.redirect(url);
  }

  @Get('callback')
  callback(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(githubCallbackQuerySchema))
    query: GithubCallbackQueryDto,
  ) {
    return this.githubApp.completeCallback(user.id, query);
  }

  @Get('installations')
  listInstallations(@CurrentUser() user: AuthenticatedUser) {
    return this.githubApp.listInstallations(user.id);
  }

  @Get('installations/:installationId/repositories')
  listRepositories(
    @CurrentUser() user: AuthenticatedUser,
    @Param(
      'installationId',
      new ZodValidationPipe(githubInstallationRecordIdSchema),
    )
    installationId: string,
    @Query(new ZodValidationPipe(githubRepositoryQuerySchema))
    query: GithubRepositoryQueryDto,
  ) {
    return this.githubApp.listRepositories(user.id, installationId, query);
  }
}
