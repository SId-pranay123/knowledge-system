import { Module } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { TopicsController } from './topics.controller';
import { TopicsRepository } from './topics.repository';

@Module({
  controllers: [TopicsController],
  providers: [TopicsService, TopicsRepository],
  exports: [TopicsService],
})
export class TopicsModule {}
