import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RealtimeService } from '../realtime/realtime.service';
import { RealtimeEventType } from '../realtime/realtime.types';
import {
  CreateManualTimeEntryDto,
  createManualTimeEntrySchema,
  StartTimerDto,
  startTimerSchema,
  stopTimerSchema,
  TimeEntryListQuery,
  timeEntryListQuerySchema,
  timeProjectIdSchema,
  timeTaskIdSchema,
} from './dto/time-tracking.dto';
import { TimeTrackingService } from './time-tracking.service';

@UseGuards(AuthGuard)
@Controller('api')
export class TimeTrackingController {
  constructor(
    private readonly timeTracking: TimeTrackingService,
    private readonly realtime: RealtimeService,
  ) {}

  @Post('tasks/:taskId/time/start')
  @HttpCode(HttpStatus.CREATED)
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(timeTaskIdSchema)) taskId: string,
    @Body(new ZodValidationPipe(startTimerSchema)) dto: StartTimerDto,
  ) {
    const entry = await this.timeTracking.start(user.id, taskId, dto);
    await this.realtime.publish({
      projectId: entry.projectId,
      type: RealtimeEventType.TIMER_STARTED,
      entity: 'time-entry',
      entityId: entry.id,
      taskId: entry.taskId,
      actorId: user.id,
    });
    return entry;
  }

  @Post('tasks/:taskId/time/stop')
  async stop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(timeTaskIdSchema)) taskId: string,
    @Body(new ZodValidationPipe(stopTimerSchema)) body: Record<string, never>,
  ) {
    void body;
    const entry = await this.timeTracking.stop(user.id, taskId);
    await this.realtime.publish({
      projectId: entry.projectId,
      type: RealtimeEventType.TIMER_STOPPED,
      entity: 'time-entry',
      entityId: entry.id,
      taskId: entry.taskId,
      actorId: user.id,
    });
    return entry;
  }

  @Post('tasks/:taskId/time')
  @HttpCode(HttpStatus.CREATED)
  async createManual(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(timeTaskIdSchema)) taskId: string,
    @Body(new ZodValidationPipe(createManualTimeEntrySchema))
    dto: CreateManualTimeEntryDto,
  ) {
    const entry = await this.timeTracking.createManual(user.id, taskId, dto);
    await this.realtime.publish({
      projectId: entry.projectId,
      type: RealtimeEventType.TIME_ENTRY_CREATED,
      entity: 'time-entry',
      entityId: entry.id,
      taskId: entry.taskId,
      actorId: user.id,
    });
    return entry;
  }

  @Get('tasks/:taskId/time')
  listTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId', new ZodValidationPipe(timeTaskIdSchema)) taskId: string,
    @Query(new ZodValidationPipe(timeEntryListQuerySchema))
    query: TimeEntryListQuery,
  ) {
    return this.timeTracking.listTask(user.id, taskId, query);
  }

  @Get('projects/:projectId/time')
  projectSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(timeProjectIdSchema))
    projectId: string,
  ) {
    return this.timeTracking.projectSummary(user.id, projectId);
  }

  @Get('time/active')
  active(@CurrentUser() user: AuthenticatedUser) {
    return this.timeTracking.active(user.id);
  }
}
