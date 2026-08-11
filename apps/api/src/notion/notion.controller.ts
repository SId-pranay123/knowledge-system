import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotionService } from './notion.service';
import { IngestNotionPageDto } from './notion.dto';

@Controller('api/ingest/notion')
export class NotionController {
  constructor(private service: NotionService) {}

  @UseGuards(JwtAuthGuard)
  @Post('page')
  ingestPage(@Body() dto: IngestNotionPageDto) {
    return this.service.ingestPage(dto.pageId);
  }
}