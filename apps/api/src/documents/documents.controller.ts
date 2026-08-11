import { Body, Controller, Delete, Get, Param, Patch } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { UpdateDocumentDto } from './documents.dto';

@Controller('api/documents')
export class DocumentsController {
  constructor(private service: DocumentsService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}