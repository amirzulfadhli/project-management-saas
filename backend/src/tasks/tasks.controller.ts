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
import { TasksService } from './tasks.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createTaskSchema,
  CreateTaskDto,
  listTasksQuerySchema,
  ListTasksQueryDto,
  moveTaskSchema,
  MoveTaskDto,
  taskIdSchema,
  updateTaskSchema,
  UpdateTaskDto,
} from './dto/task.dto';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';

@UseGuards(AuthGuard)
@Controller('api/tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly realtime: RealtimeService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTaskSchema)) dto: CreateTaskDto,
  ) {
    const task = await this.tasksService.create(user.id, dto);
    await this.realtime.publish({
      projectId: task.projectId,
      type: RealtimeEventType.TASK_CREATED,
      entity: 'task',
      entityId: task.id,
      taskId: task.id,
      actorId: user.id,
    });
    return task;
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listTasksQuerySchema))
    query: ListTasksQueryDto,
  ) {
    return this.tasksService.findAll(user.id, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(taskIdSchema)) id: string,
  ) {
    return this.tasksService.findOne(user.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(taskIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) dto: UpdateTaskDto,
  ) {
    const task = await this.tasksService.update(user.id, id, dto);
    await this.realtime.publish({
      projectId: task.projectId,
      type: RealtimeEventType.TASK_UPDATED,
      entity: 'task',
      entityId: task.id,
      taskId: task.id,
      actorId: user.id,
    });
    return task;
  }

  @Patch(':id/move')
  async move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(taskIdSchema)) id: string,
    @Body(new ZodValidationPipe(moveTaskSchema)) dto: MoveTaskDto,
  ) {
    const task = await this.tasksService.move(user.id, id, dto);
    await this.realtime.publish({
      projectId: task.projectId,
      type: RealtimeEventType.TASK_MOVED,
      entity: 'task',
      entityId: task.id,
      taskId: task.id,
      actorId: user.id,
    });
    return task;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(taskIdSchema)) id: string,
  ) {
    const deleted = await this.tasksService.remove(user.id, id);
    await this.realtime.publish({
      projectId: deleted.projectId,
      type: RealtimeEventType.TASK_DELETED,
      entity: 'task',
      entityId: id,
      taskId: id,
      actorId: user.id,
    });
  }
}
