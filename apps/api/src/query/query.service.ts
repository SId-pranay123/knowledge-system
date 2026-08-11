import { Injectable } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { RelationshipsService } from '../relationships/relationships.service';
import { QueryAnalyzerService } from './query-analyzer.service';
import { EntityType, ENTITY_TYPES } from '../relationships/relationships.dto';

@Injectable()
export class QueryService {
  private llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-3.6-flash',
    temperature: 0.2,
  });

  constructor(
    private prisma: PrismaService,
    private embeddings: EmbeddingsService,
    private relationships: RelationshipsService,
    private analyzer: QueryAnalyzerService,
  ) {}

  private readonly RESOLVABLE_TYPES: EntityType[] = ENTITY_TYPES.filter((t) => t !== 'document');

  private async resolveEntityByName(name: string): Promise<{ type: EntityType; id: string } | null> {
    for (const type of this.RESOLVABLE_TYPES) {
      const table = (this.prisma as any)[type === 'client' ? 'client' : type];
      const labelField = type === 'decision' ? 'title' : 'name';
      const match = await table.findFirst({ where: { [labelField]: { equals: name, mode: 'insensitive' } } });
      if (match) return { type, id: match.id };
    }
    return null;
  }

  async ask(question: string) {
    const { entities: entityNames } = await this.analyzer.analyze(question);

    const resolved = (await Promise.all(entityNames.map((n) => this.resolveEntityByName(n)))).filter(Boolean) as { type: EntityType; id: string }[];

    const graphFacts: any[] = [];
    for (const entity of resolved) {
      const edges = await this.relationships.findNeighborhood(entity.type, entity.id, 2);
      graphFacts.push(...edges);
    }

    const queryVector = await this.embeddings.embed(question);
    const chunkRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT c.content, c."documentId", d.title, 1 - (c.embedding <=> $1::vector) as similarity
       FROM chunks c JOIN documents d ON d.id = c."documentId"
       ORDER BY c.embedding <=> $1::vector
       LIMIT 8`,
      `[${queryVector.join(',')}]`,
    );

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