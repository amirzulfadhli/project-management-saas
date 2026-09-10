import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';

@Module({
  imports: [ActivitiesModule],
  controllers: [WikiController],
  providers: [WikiService],
  exports: [WikiService],
})
export class WikiModule {}
