import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IngestionService } from './ingestion.service';

@Controller('api/ingest')
export class IngestionController {
  constructor(private service: IngestionService) {}

  @UseGuards(JwtAuthGuard)
  @Post('document')
  ingest(@Body() body: { title: string; content: string; sourceType: string; sourceUrl?: string }) {
    return this.service.ingestDocument(body);
  }
}