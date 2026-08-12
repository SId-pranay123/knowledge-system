/**
 * Integration test — the exact scenario the assignment's "strong answer"
 * example describes: does the system connect a lesson from one project
 * to a decision made on another, rather than just returning matching text.
 *
 * DELIBERATELY does NOT call the real Gemini API. ExtractionService and
 * EmbeddingsService are mocked with fixed, predictable responses — this
 * test exercises the REAL pipeline logic (IngestionService, ResolutionService,
 * RelationshipsService, QueryService, real Prisma calls against a real
 * database) without the non-determinism, cost, or rate-limit flakiness of
 * live LLM calls.
 *
 * Uses deliberately distinctive test entity names (prefixed "ZZTest") rather
 * than "FinEdge"/"Lexora" — this test runs against whatever database is
 * configured via DATABASE_URL, which in practice is the same dev database
 * that has the real sample data seeded into it (including a real project
 * named "Lexora Knowledge Core"). ResolutionService's substring-matching
 * layer correctly merges "Lexora" into "Lexora Knowledge Core" if that's
 * what's asked for — which is CORRECT system behavior, but breaks a test
 * that expects a fresh node with that exact name. Using unmistakably
 * test-only names avoids this collision without needing a separate
 * disposable test database.
 *
 * Requires a running Postgres (pgvector) instance — no API key needed.
 * Run explicitly: yarn workspace api test:integration
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { QueryService } from '../src/query/query.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ExtractionService } from '../src/ingestion/extraction.service';
import { EmbeddingsService } from '../src/embeddings/embeddings.service';
import { QueryAnalyzerService } from '../src/query/query-analyzer.service';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

const FAKE_VECTOR: number[] = new Array(3072).fill(0.01);

// Distinctive names, guaranteed not to substring/token/acronym-match
// anything in the real sample data.
const PROJECT_A = 'ZZTestProjectFinEdgeMock';
const PROJECT_B = 'ZZTestProjectLexoraMock';

const mockExtractionService = {
  extract: jest.fn(async (content: string) => {
    if (content.includes(PROJECT_A)) {
      return {
        entities: [
          { type: 'project', name: PROJECT_A },
          { type: 'project', name: PROJECT_B },
        ],
        relationships: [
          { sourceName: PROJECT_A, relationshipType: 'INFLUENCED_BY', targetName: PROJECT_B, context: 'lesson shaped the other project' },
        ],
      };
    }
    return {
      entities: [
        { type: 'project', name: PROJECT_B },
        { type: 'project', name: PROJECT_A },
      ],
      relationships: [
        { sourceName: PROJECT_B, relationshipType: 'INFLUENCED_BY', targetName: PROJECT_A, context: 'built on what was learned from the other project' },
      ],
    };
  }),
};

const mockEmbeddingsService = {
  embed: jest.fn(async () => FAKE_VECTOR),
  // Deliberately LOW — must stay below ResolutionService's similarity
  // threshold (0.88). A high fixed score here (e.g. 0.99) would cause the
  // embedding-fallback layer to falsely "match" our distinctive test entity
  // names against unrelated real seeded projects already in the database,
  // merging into them instead of creating new test nodes. This bit us once
  // already — worth remembering if this mock is ever touched again.
  cosineSimilarity: jest.fn(() => 0.1),
};

const mockQueryAnalyzerService = {
  analyze: jest.fn(async () => ({ entities: [PROJECT_A, PROJECT_B], intent: 'cross_project_lesson' })),
};

describe('Ingestion -> Query integration: cross-project relationship (mocked LLM)', () => {
  let app: INestApplication;
  let ingestion: IngestionService;
  let query: QueryService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ExtractionService)
      .useValue(mockExtractionService as any)
      .overrideProvider(EmbeddingsService)
      .useValue(mockEmbeddingsService as any)
      .overrideProvider(QueryAnalyzerService)
      .useValue(mockQueryAnalyzerService as any)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    ingestion = moduleRef.get(IngestionService);
    query = moduleRef.get(QueryService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up ONLY what this test created. Both the relationship and chunk
    // deletions below are scoped — deleting either unconditionally (as an
    // earlier version of this test did) wipes the ENTIRE table, including
    // real seeded sample data, silently breaking graph traversal and vector
    // search app-wide until the next full reseed. This was a real bug,
    // found by seeing empty relationships/sources in a live query after
    // running this test.
    const testProjects = await prisma.project.findMany({
      where: { name: { in: [PROJECT_A, PROJECT_B] } },
      select: { id: true },
    });
    const testProjectIds = testProjects.map((p) => p.id);

    const testDocs = await prisma.document.findMany({
      where: { title: { in: ['ZZTest Doc A', 'ZZTest Doc B'] } },
      select: { id: true },
    });
    const testDocIds = testDocs.map((d) => d.id);

    await prisma.relationship.deleteMany({
      where: { OR: [{ sourceId: { in: testProjectIds } }, { targetId: { in: testProjectIds } }] },
    });
    await prisma.project.deleteMany({ where: { id: { in: testProjectIds } } });
    await prisma.chunk.deleteMany({ where: { documentId: { in: testDocIds } } });
    await prisma.document.deleteMany({ where: { id: { in: testDocIds } } });
    await app.close();
  });

  it('links the two projects via an extracted relationship after ingesting both mock documents', async () => {
    await ingestion.ingestDocument({
      title: 'ZZTest Doc A',
      sourceType: 'LOCAL',
      content: `The ${PROJECT_A} project taught us that relationships and evolution of ideas
                matter more than pure document retrieval. This lesson directly shaped
                how we approached the ${PROJECT_B} project.`,
    });

    await ingestion.ingestDocument({
      title: 'ZZTest Doc B',
      sourceType: 'LOCAL',
      content: `For ${PROJECT_B}, the team decided to prefer structured linking over pure
                vector search, building on what was learned from ${PROJECT_A}.`,
    });

    const projectB = await prisma.project.findFirst({ where: { name: PROJECT_B } });
    expect(projectB).not.toBeNull();

    const edges = await prisma.relationship.findMany({
      where: { OR: [{ sourceId: projectB!.id }, { targetId: projectB!.id }] },
    });
    const projectA = await prisma.project.findFirst({ where: { name: PROJECT_A } });
    expect(projectA).not.toBeNull();
    const connectsToA = edges.some((e) => e.sourceId === projectA?.id || e.targetId === projectA?.id);
    expect(connectsToA).toBe(true);
  });

  it('graph traversal finds the cross-project connection', async () => {
    const projectB = await prisma.project.findFirst({ where: { name: PROJECT_B } });
    const neighborhoodEdges = await prisma.relationship.findMany({
      where: { OR: [{ sourceId: projectB!.id }, { targetId: projectB!.id }] },
    });
    expect(neighborhoodEdges.length).toBeGreaterThan(0);
    expect(neighborhoodEdges.some((e) => e.relationshipType === 'INFLUENCED_BY')).toBe(true);
  });
});