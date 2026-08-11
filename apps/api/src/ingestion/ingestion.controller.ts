import { Body, Controller, Post } from '@nestjs/common';
import { IngestionService } from './ingestion.service';

@Controller('api/ingest')
export class IngestionController {
  constructor(private service: IngestionService) {}

  @Post('document')
  ingest(@Body() body: { title: string; content: string; sourceType: string; sourceUrl?: string }) {
    return this.service.ingestDocument(body);
  }
}
