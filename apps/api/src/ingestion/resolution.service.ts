import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { EntityType } from '../relationships/relationships.dto';

// Solves the "same entity, different mention" problem: "Lexora" vs "the Lexora
// project" vs "Lexora engagement" must resolve to one row, not three.
// Strategy: exact/alias match first (cheap), then embedding similarity (fuzzy).
@Injectable()
export class ResolutionService {
  private readonly SIMILARITY_THRESHOLD = 0.88;

  constructor(private prisma: PrismaService, private embeddings: EmbeddingsService) {}

  private tableFor(type: EntityType) {
    const map: Record<EntityType, any> = {
      person: this.prisma.person,
      client: this.prisma.client,
      project: this.prisma.project,
      document: this.prisma.document,
      decision: this.prisma.decision,
      topic: this.prisma.topic,
    };
    return map[type];
  }

  // Returns the resolved entity id — either an existing match or a newly created row.
  async resolveOrCreate(type: EntityType, name: string, attributes: Record<string, any> = {}): Promise<string> {
    const table = this.tableFor(type);

    // 1. Exact name / alias match (cheap, catches most repeats)
    const nameField = type === 'topic' ? 'name' : 'name';
    const exact = await table.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (exact) return exact.id;

    // 2. Embedding similarity against existing rows of this type
    const candidates = await table.findMany({ take: 200 }); // fine at this scale (hundreds, not millions)
    if (candidates.length > 0) {
      const targetVec = await this.embeddings.embed(name);
      let best: { id: string; score: number } | null = null;
      for (const c of candidates) {
        const vec = await this.embeddings.embed(c.name);
        const score = this.embeddings.cosineSimilarity(targetVec, vec);
        if (!best || score > best.score) best = { id: c.id, score };
      }
      if (best && best.score >= this.SIMILARITY_THRESHOLD) return best.id;
    }

    // 3. No match — create a new node.
    // NOTE: for production, precompute & cache candidate embeddings instead of
    // re-embedding on every call. Fine to skip for this assignment's scale.
    const created = await table.create({ data: { name, ...attributes } });
    return created.id;
  }
}
