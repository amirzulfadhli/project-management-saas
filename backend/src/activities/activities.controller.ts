import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ActivitiesService } from './activities.service';
import {
  activityProjectIdSchema,
  ListActivitiesQueryDto,
  listActivitiesQuerySchema,
} from './dto/activity.dto';

@UseGuards(AuthGuard)
@Controller('api/projects/:projectId/activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ZodValidationPipe(activityProjectIdSchema))
    projectId: string,
    @Query(new ZodValidationPipe(listActivitiesQuerySchema))
    query: ListActivitiesQueryDto,
  ) {
    return this.activitiesService.findAll(user.id, projectId, query);
  }
}
