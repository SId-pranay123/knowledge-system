import { Module } from '@nestjs/common';
import { RelationshipsService } from './relationships.service';
import { RelationshipsController } from './relationships.controller';
import { RelationshipsRepository } from './relationships.repository';

@Module({
  controllers: [RelationshipsController],
  providers: [RelationshipsService, RelationshipsRepository],
  exports: [RelationshipsService],
})
export class RelationshipsModule {}
