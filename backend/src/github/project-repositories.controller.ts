import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  connectGithubRepositorySchema,
  ConnectGithubRepositoryDto,
  githubProjectIdSchema,
} from './dto/github.dto';
import { GithubService } from './github.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';

@UseGuards(AuthGuard)
@Controller('api/projects/:projectId/repository')
export class ProjectRepositoriesController {
  constructor(
    private readonly github: GithubService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(githubProjectIdSchema))
    projectId: string,
  ) {
    return this.github.findRepository(user.id, projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async connect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(githubProjectIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(connectGithubRepositorySchema))
    dto: ConnectGithubRepositoryDto,
  ) {
    const repository = await this.github.connectRepository(
      user.id,
      projectId,
      dto,
    );
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.REPOSITORY_CONNECTED,
      entity: 'repository',
      entityId: repository.id,
      actorId: user.id,
    });
    return repository;
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(githubProjectIdSchema))
    projectId: string,
  ) {
    await this.github.disconnectRepository(user.id, projectId);
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.REPOSITORY_DISCONNECTED,
      entity: 'repository',
      entityId: projectId,
      actorId: user.id,
    });
  }
}
