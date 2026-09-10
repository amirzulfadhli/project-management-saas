import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AccessModule } from './access/access.module';
import { PrismaModule } from './prisma/prisma.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { ActivitiesModule } from './activities/activities.module';
import { CommentsModule } from './comments/comments.module';
import { GithubModule } from './github/github.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { WikiModule } from './wiki/wiki.module';
import { TimeTrackingModule } from './time-tracking/time-tracking.module';

@Module({
  imports: [
    AuthModule,
    AccessModule,
    PrismaModule,
    OrganizationsModule,
    ProjectsModule,
    TasksModule,
    ActivitiesModule,
    CommentsModule,
    GithubModule,
    RealtimeModule,
    NotificationsModule,
    AttachmentsModule,
    WikiModule,
    TimeTrackingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
