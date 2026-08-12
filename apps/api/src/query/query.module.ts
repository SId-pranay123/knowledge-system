import { Module } from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryController } from './query.controller';
import { QueryAnalyzerService } from './query-analyzer.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { RelationshipsModule } from '../relationships/relationships.module';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [EmbeddingsModule, RelationshipsModule, IngestionModule],
  controllers: [QueryController],
  providers: [QueryService, QueryAnalyzerService],
  exports: [QueryService],
})
export class QueryModule {}