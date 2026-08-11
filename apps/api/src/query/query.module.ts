import { Module } from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryController } from './query.controller';
import { QueryAnalyzerService } from './query-analyzer.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { RelationshipsModule } from '../relationships/relationships.module';

@Module({
  imports: [EmbeddingsModule, RelationshipsModule],
  controllers: [QueryController],
  providers: [QueryService, QueryAnalyzerService],
})
export class QueryModule {}
