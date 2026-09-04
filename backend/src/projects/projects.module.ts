import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMembersController } from './project-members.controller';
import { ProjectMembersService } from './project-members.service';
import { ProjectColumnsController } from './project-columns.controller';
import { ProjectColumnsService } from './project-columns.service';
import { ActivitiesModule } from '../activities/activities.module';

@Module({
  imports: [ActivitiesModule],
  controllers: [
    ProjectsController,
    ProjectMembersController,
    ProjectColumnsController,
  ],
  providers: [ProjectsService, ProjectMembersService, ProjectColumnsService],
})
export class ProjectsModule {}
