import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotionService } from './notion.service';
import { IngestNotionPageDto } from './notion.dto';

@Controller('api/ingest/notion')
export class NotionController {
  constructor(private service: NotionService) {}

  // Lists every page shared with the integration, with ingestion status.
  // Guarded — this exposes what's in the connected Notion workspace, which
  // is internal-team information, same sensitivity level as write endpoints.
  @UseGuards(JwtAuthGuard)
  @Get('pages')
  listPages() {
    return this.service.listAccessiblePagesWithStatus();
  }

  @UseGuards(JwtAuthGuard)
  @Post('page')
  ingestPage(@Body() dto: IngestNotionPageDto) {
    return this.service.ingestPage(dto.pageId);
  }
}