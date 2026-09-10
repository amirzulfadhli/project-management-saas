import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  listNotificationsQuerySchema,
  type ListNotificationsQueryDto,
  notificationIdSchema,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@UseGuards(AuthGuard)
@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listNotificationsQuerySchema))
    query: ListNotificationsQueryDto,
  ) {
    return this.notifications.findAll(user.id, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user.id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':notificationId/read')
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('notificationId', new ZodValidationPipe(notificationIdSchema))
    notificationId: string,
  ) {
    return this.notifications.markRead(user.id, notificationId);
  }
}
