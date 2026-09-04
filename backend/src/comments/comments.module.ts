import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [ActivitiesModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
