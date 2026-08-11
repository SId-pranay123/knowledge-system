import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateDocumentDto } from './documents.dto';
import { DocumentsRepository } from './documents.repository';

// Note: document *creation* goes through IngestionService.ingestDocument()
// (delta detection + extraction + chunking), not through this service.
// This service covers read/update-metadata/delete for already-ingested docs.
@Injectable()
export class DocumentsService {
  constructor(private documentsRepository: DocumentsRepository) {}

  findAll() {
    return this.documentsRepository.findAll();
  }

  async findOne(id: string) {
    const doc = await this.documentsRepository.findOne(id);
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return doc;
  }

  async update(id: string, dto: UpdateDocumentDto) {
    await this.findOne(id);
    return this.documentsRepository.update(id, dto);
  }

  async remove(id: string) {
    await this.findOne(id);
    // Cascades to chunks (onDelete: Cascade in schema). Does not remove
    // relationships derived from this document — those stay, since other
    // documents may have reinforced the same edges (see mentionCount).
    return this.documentsRepository.remove(id);
  }
}
