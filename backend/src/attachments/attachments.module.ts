import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { environment } from '../config/environment';
import { AttachmentsService } from './attachments.service';
import {
  ProjectAttachmentsController,
  TaskAttachmentsController,
} from './attachments.controller';
import { FILE_STORAGE } from './file-storage';
import { LocalFileStorage } from './local-file-storage';

@Module({
  imports: [ActivitiesModule],
  controllers: [ProjectAttachmentsController, TaskAttachmentsController],
  providers: [
    AttachmentsService,
    {
      provide: FILE_STORAGE,
      useFactory: () => new LocalFileStorage(environment.storagePath),
    },
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
