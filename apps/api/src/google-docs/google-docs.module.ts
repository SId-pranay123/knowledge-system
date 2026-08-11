import { Module } from '@nestjs/common';
import { GoogleDocsService } from './google-docs.service';
import { GoogleDocsController } from './google-docs.controller';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [IngestionModule],
  controllers: [GoogleDocsController],
  providers: [GoogleDocsService],
})
export class GoogleDocsModule {}