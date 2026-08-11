import { Module } from '@nestjs/common';
import { DecisionsService } from './decisions.service';
import { DecisionsController } from './decisions.controller';
import { DecisionsRepository } from './decisions.repository';

@Module({
  controllers: [DecisionsController],
  providers: [DecisionsService, DecisionsRepository],
  exports: [DecisionsService],
})
export class DecisionsModule {}
