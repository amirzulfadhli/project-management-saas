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

@UseGuards(AuthGuard)
@Controller('api/projects/:projectId/columns')
export class ProjectColumnsController {
  constructor(private readonly projectColumnsService: ProjectColumnsService) {}

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
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectColumnIdSchema))
    projectId: string,
    @Body(new ZodValidationPipe(createProjectColumnSchema))
    dto: CreateProjectColumnDto,
  ) {
    return this.projectColumnsService.create(user.id, projectId, dto);
  }

  @Patch(':columnId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(projectColumnIdSchema))
    projectId: string,
    @Param('columnId', new ZodValidationPipe(projectColumnIdSchema))
    columnId: string,
    @Body(new ZodValidationPipe(updateProjectColumnSchema))
    dto: UpdateProjectColumnDto,
  ) {
    return this.projectColumnsService.update(user.id, projectId, columnId, dto);
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
  }
}
