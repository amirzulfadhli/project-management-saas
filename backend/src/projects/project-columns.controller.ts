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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createProjectColumnSchema,
  CreateProjectColumnDto,
  projectColumnIdSchema,
  updateProjectColumnSchema,
  UpdateProjectColumnDto,
} from './dto/project-column.dto';
import { ProjectColumnsService } from './project-columns.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';

@UseGuards(AuthGuard)
@Controller('api/projects/:projectId/columns')
export class ProjectColumnsController {
  constructor(
    private readonly projectColumnsService: ProjectColumnsService,
    private readonly realtime: RealtimeService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectColumnIdSchema))
    projectId: string,
  ) {
    return this.projectColumnsService.findAll(user.id, projectId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectColumnIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(createProjectColumnSchema))
    dto: CreateProjectColumnDto,
  ) {
    const column = await this.projectColumnsService.create(
      user.id,
      projectId,
      dto,
    );
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.COLUMN_CREATED,
      entity: 'column',
      entityId: column.id,
      actorId: user.id,
    });
    return column;
  }

  @Patch(':columnId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectColumnIdSchema))
    projectId: string,
    @Param('columnId', new ZodValidationPipe(projectColumnIdSchema))
    columnId: string,
    @Body(new ZodValidationPipe(updateProjectColumnSchema))
    dto: UpdateProjectColumnDto,
  ) {
    const column = await this.projectColumnsService.update(
      user.id,
      projectId,
      columnId,
      dto,
    );
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.COLUMN_RENAMED,
      entity: 'column',
      entityId: columnId,
      actorId: user.id,
    });
    return column;
  }

  @Delete(':columnId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectColumnIdSchema))
    projectId: string,
    @Param('columnId', new ZodValidationPipe(projectColumnIdSchema))
    columnId: string,
  ) {
    await this.projectColumnsService.remove(user.id, projectId, columnId);
    await this.realtime.publish({
      projectId,
      type: RealtimeEventType.COLUMN_DELETED,
      entity: 'column',
      entityId: columnId,
      actorId: user.id,
    });
  }
}
