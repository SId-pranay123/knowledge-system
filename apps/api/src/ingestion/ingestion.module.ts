import { Module } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { ExtractionService } from './extraction.service';
import { ResolutionService } from './resolution.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { RelationshipsModule } from '../relationships/relationships.module';

@Module({
  imports: [EmbeddingsModule, RelationshipsModule],
  controllers: [IngestionController],
  providers: [IngestionService, ExtractionService, ResolutionService, ChunkingService],
  exports: [IngestionService],
})
export class IngestionModule {}
