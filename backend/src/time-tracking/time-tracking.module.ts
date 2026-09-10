import { Module } from '@nestjs/common';
import { TimeTrackingController } from './time-tracking.controller';
import { TimeTrackingService } from './time-tracking.service';

@Module({
  controllers: [TimeTrackingController],
  providers: [TimeTrackingService],
  exports: [TimeTrackingService],
})
export class TimeTrackingModule {}
