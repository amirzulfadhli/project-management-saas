import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createProjectSchema,
  CreateProjectDto,
  listProjectsQuerySchema,
  ListProjectsQueryDto,
  updateProjectSchema,
  UpdateProjectDto,
} from './dto/project.dto';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';

@UseGuards(AuthGuard)
@Controller('api/projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createProjectSchema)) dto: CreateProjectDto,
  ) {
    return this.projectsService.create(user.id, dto);
  }

  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.duplicate(user.id, id);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listProjectsQuerySchema))
    query: ListProjectsQueryDto,
  ) {
    return this.projectsService.findAll(
      user.id,
      query.organizationId,
      query.archived ?? false,
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.findOne(user.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) dto: UpdateProjectDto,
  ) {
    const project = await this.projectsService.update(user.id, id, dto);
    await this.realtime.publish({
      projectId: id,
      type: RealtimeEventType.PROJECT_UPDATED,
      entity: 'project',
      entityId: id,
      actorId: user.id,
    });
    return project;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.projectsService.archive(user.id, id);
    await this.realtime.publish({
      projectId: id,
      type: RealtimeEventType.PROJECT_ARCHIVED,
      entity: 'project',
      entityId: id,
      actorId: user.id,
    });
  }
}
