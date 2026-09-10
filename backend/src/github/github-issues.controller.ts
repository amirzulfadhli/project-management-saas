import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { taskIdSchema } from '../tasks/dto/task.dto';
import {
  createTaskFromGithubIssueSchema,
  type CreateTaskFromGithubIssueDto,
  githubIssueNumberSchema,
  githubIssueQuerySchema,
  type GithubIssueQueryDto,
  githubProjectIdSchema,
  linkGithubIssueSchema,
  type LinkGithubIssueDto,
} from './dto/github.dto';
import { GithubIssuesService } from './github-issues.service';

@UseGuards(AuthGuard)
@Controller('api/projects/:projectId/github/issues')
export class ProjectGithubIssuesController {
  constructor(private readonly githubIssues: GithubIssuesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(githubProjectIdSchema))
    projectId: string,
    @Query(new ZodValidationPipe(githubIssueQuerySchema))
    query: GithubIssueQueryDto,
  ) {
    return this.githubIssues.listProjectIssues(user.id, projectId, query);
  }

  @Post(':issueNumber/create-task')
  @HttpCode(HttpStatus.CREATED)
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(githubProjectIdSchema))
    projectId: string,
    @Param('issueNumber', new ZodValidationPipe(githubIssueNumberSchema))
    issueNumber: number,
    @Body(new ZodValidationPipe(createTaskFromGithubIssueSchema))
    dto: CreateTaskFromGithubIssueDto,
  ) {
    return this.githubIssues.createTaskFromIssue(
      user.id,
      projectId,
      issueNumber,
      dto,
    );
  }
}

@UseGuards(AuthGuard)
@Controller('api/tasks/:taskId/github')
export class TaskGithubIssueController {
  constructor(private readonly githubIssues: GithubIssuesService) {}

  @Get()
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
  ) {
    return this.githubIssues.findTaskIssue(user.id, taskId);
  }

  @Post('link')
  @HttpCode(HttpStatus.CREATED)
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
    @Body(new ZodValidationPipe(linkGithubIssueSchema))
    dto: LinkGithubIssueDto,
  ) {
    return this.githubIssues.linkTask(user.id, taskId, dto);
  }

  @Delete('link')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(taskIdSchema)) taskId: string,
  ) {
    return this.githubIssues.unlinkTask(user.id, taskId);
  }
}
