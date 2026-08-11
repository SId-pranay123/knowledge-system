import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ExtractionService } from './extraction.service';
import { ResolutionService } from './resolution.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { RelationshipsService } from '../relationships/relationships.service';
import { EntityType } from '../relationships/relationships.dto';

// The core pipeline: doc in -> delta check -> extract -> resolve -> persist graph + vectors.
// This is what makes "add new info without rebuilding everything" work: only
// new/changed documents ever get processed; the graph is upserted, never rebuilt.
@Injectable()
export class IngestionService {
  constructor(
    private prisma: PrismaService,
    private extraction: ExtractionService,
    private resolution: ResolutionService,
    private chunking: ChunkingService,
    private embeddings: EmbeddingsService,
    private relationships: RelationshipsService,
  ) {}

  private hash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async ingestDocument(params: { title: string; content: string; sourceType: string; sourceUrl?: string }) {
    const contentHash = this.hash(params.content);

    // Delta detection: skip if this exact content was already fully ingested.
    const existing = await this.prisma.document.findUnique({ where: { contentHash } });
    if (existing) {
      return { skipped: true, documentId: existing.id, reason: 'unchanged content' };
    }

    // Run extraction BEFORE creating the document row. If this throws (rate
    // limit, network, bad key), nothing is persisted, so a retry correctly
    // reprocesses this document instead of silently skipping it forever.
    const extraction = await this.extraction.extract(params.content, params.title);

    const document = await this.prisma.document.create({
      data: {
        title: params.title,
        content: params.content,
        sourceType: params.sourceType,
        sourceUrl: params.sourceUrl,
        contentHash,
      },
    });
    const nameToId = new Map<string, { id: string; type: EntityType }>();
    for (const entity of extraction.entities) {
      const id = await this.resolution.resolveOrCreate(entity.type as EntityType, entity.name, entity.attributes);
      nameToId.set(entity.name, { id, type: entity.type as EntityType });
    }

    // 3. Persist relationships (upsert-style — see RelationshipsService.create)
    for (const rel of extraction.relationships) {
      const source = nameToId.get(rel.sourceName);
      const target = nameToId.get(rel.targetName);
      if (!source || !target) continue; // skip edges to entities we couldn't resolve
      await this.relationships.create({
        sourceType: source.type,
        sourceId: source.id,
        relationshipType: rel.relationshipType,
        targetType: target.type,
        targetId: target.id,
        metadata: { sourceChunkId: document.id, context: rel.context, extractedAt: new Date().toISOString() },
      });
    }

    // 4. Chunk + embed the raw document for vector-search fallback
    const textChunks = this.chunking.chunk(params.content);
    for (let i = 0; i < textChunks.length; i++) {
      const vector = await this.embeddings.embed(textChunks[i]);
      // pgvector column set via raw SQL — Prisma's client doesn't yet type vector inserts
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO chunks (id, "documentId", content, "chunkIndex", embedding, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4::vector, now())`,
        document.id, textChunks[i], i, `[${vector.join(',')}]`,
      );
    }

    return { skipped: false, documentId: document.id, entitiesExtracted: extraction.entities.length, relationshipsExtracted: extraction.relationships.length };
  }
}