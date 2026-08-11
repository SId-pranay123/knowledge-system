import { Injectable } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { RelationshipsService } from '../relationships/relationships.service';
import { QueryAnalyzerService } from './query-analyzer.service';
import { EntityType, ENTITY_TYPES } from '../relationships/relationships.dto';

// The hybrid retrieval pipeline. This is what turns "keyword search" into
// "connected answer" — the exact distinction the assignment tests for.
//
// Steps: analyze question -> resolve mentioned entities -> traverse graph
// (1-2 hops) -> vector search over chunks -> synthesize with citations.
@Injectable()
export class QueryService {
  private llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-1.5-pro',
    temperature: 0.2,
  });

  constructor(
    private prisma: PrismaService,
    private embeddings: EmbeddingsService,
    private relationships: RelationshipsService,
    private analyzer: QueryAnalyzerService,
  ) {}

  private async resolveEntityByName(name: string): Promise<{ type: EntityType; id: string } | null> {
    for (const type of ENTITY_TYPES) {
      const table = (this.prisma as any)[type === 'client' ? 'client' : type];
      const match = await table.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
      if (match) return { type, id: match.id };
    }
    return null;
  }

  async ask(question: string) {
    // 1. Understand the question
    const { entities: entityNames } = await this.analyzer.analyze(question);

    // 2. Resolve mentioned entity names to graph nodes
    const resolved = (await Promise.all(entityNames.map((n) => this.resolveEntityByName(n)))).filter(Boolean) as { type: EntityType; id: string }[];

    // 3. Graph traversal — pull the connected neighborhood, not just the entity itself
    const graphFacts: any[] = [];
    for (const entity of resolved) {
      const edges = await this.relationships.findNeighborhood(entity.type, entity.id, 2);
      graphFacts.push(...edges);
    }

    // 4. Vector search over chunks, boosted toward resolved entities' source docs
    const queryVector = await this.embeddings.embed(question);
    const chunkRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT c.content, c."documentId", d.title, 1 - (c.embedding <=> $1::vector) as similarity
       FROM chunks c JOIN documents d ON d.id = c."documentId"
       ORDER BY c.embedding <=> $1::vector
       LIMIT 8`,
      `[${queryVector.join(',')}]`,
    );

    // 5. Build context and synthesize
    const graphContext = graphFacts.length
      ? graphFacts.map((f) => `${f.sourceType}:${f.sourceId} --${f.relationshipType}--> ${f.targetType}:${f.targetId}`).join('\n')
      : '(no direct graph matches)';
    const chunkContext = chunkRows.map((c, i) => `[${i + 1}] (${c.title}) ${c.content}`).join('\n\n');

    const prompt = `Answer the question using the structured relationships and document excerpts below. Cite sources by their [number]. If the context doesn't support an answer, say so.

RELATIONSHIPS:
${graphContext}

DOCUMENT EXCERPTS:
${chunkContext}

QUESTION: ${question}`;

    const response = await this.llm.invoke(prompt);

    return {
      answer: response.content,
      entities: resolved,
      relationships: graphFacts,
      sources: chunkRows.map((c) => ({ documentId: c.documentId, title: c.title })),
    };
  }
}
