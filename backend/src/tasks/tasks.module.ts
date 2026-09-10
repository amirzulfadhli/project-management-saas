import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ActivitiesModule, NotificationsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
