import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoogleDocsService } from './google-docs.service';
import { IngestGoogleDocDto, IngestGoogleDocsFolderDto } from './google-docs.dto';

@Controller('api/ingest/google-docs')
export class GoogleDocsController {
  constructor(private service: GoogleDocsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('document')
  ingestDocument(@Body() dto: IngestGoogleDocDto) {
    return this.service.ingestDocument(dto.documentId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('folder')
  ingestFolder(@Body() dto: IngestGoogleDocsFolderDto) {
    return this.service.ingestFolder(dto.folderId);
  }
}