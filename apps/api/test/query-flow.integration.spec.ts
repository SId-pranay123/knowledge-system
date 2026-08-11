/**
 * Integration test — the exact scenario the assignment's "strong answer"
 * example describes: does the system connect a lesson from one project
 * to a decision made on another, rather than just returning matching text.
 *
 * Requires a running Postgres (pgvector) instance and a real/mocked Gemini
 * key — run against a disposable test DB, e.g.:
 *   DATABASE_URL=postgresql://kg_user:kg_pass@localhost:5432/kg_test_db
 *
 * This is intentionally an integration test, not a unit test: it exercises
 * IngestionService -> ResolutionService -> RelationshipsService -> QueryService
 * end-to-end against real Prisma calls, because that's the seam most likely
 * to break silently (e.g. entity resolution creating duplicate nodes across
 * two ingested documents that should merge into one).
 */
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { QueryService } from '../src/query/query.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { beforeAll, describe, expect, it, afterAll } from '@jest/globals';


describe('Ingestion -> Query integration: FinEdge influences Lexora', () => {
  let app: INestApplication;
  let ingestion: IngestionService;
  let query: QueryService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ingestion = moduleRef.get(IngestionService);
    query = moduleRef.get(QueryService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    // Clean up everything this test created so re-runs stay idempotent.
    await prisma.relationship.deleteMany({});
    await prisma.decision.deleteMany({});
    await prisma.project.deleteMany({ where: { name: { in: ['FinEdge', 'Lexora'] } } });
    await prisma.chunk.deleteMany({});
    await prisma.document.deleteMany({});
    await app.close();
  });

  it('links FinEdge and Lexora via an extracted relationship after ingesting both handover docs', async () => {
    await ingestion.ingestDocument({
      title: 'FinEdge Handover',
      sourceType: 'LOCAL',
      content: `The FinEdge project taught us that relationships and evolution of ideas
                matter more than pure document retrieval. This lesson directly shaped
                how we approached the Lexora project.`,
    });

    await ingestion.ingestDocument({
      title: 'Lexora Kickoff Notes',
      sourceType: 'LOCAL',
      content: `For Lexora, the team decided to prefer structured linking over pure
                vector search, building on what was learned from FinEdge.`,
    });

    const lexora = await prisma.project.findFirst({ where: { name: { contains: 'Lexora', mode: 'insensitive' } } });
    expect(lexora).not.toBeNull();

    // Not asserting on a specific relationshipType label since extraction wording
    // may vary — asserting that SOME edge connects FinEdge and Lexora, which is
    // the actual thing being tested (connection exists, not exact taxonomy).
    const edges = await prisma.relationship.findMany({
      where: { OR: [{ sourceId: lexora!.id }, { targetId: lexora!.id }] },
    });
    const finEdgeProject = await prisma.project.findFirst({ where: { name: { contains: 'FinEdge', mode: 'insensitive' } } });
    const connectsToFinEdge = edges.some(
      (e) => e.sourceId === finEdgeProject?.id || e.targetId === finEdgeProject?.id,
    );
    expect(connectsToFinEdge).toBe(true);
  }, 30000);

  it('answers a cross-project question by citing the graph connection, not just matching text', async () => {
    const result = await query.ask('What did we learn from FinEdge that is useful for Lexora?');

    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.relationships.length).toBeGreaterThan(0); // graph traversal found something, not just vector hits
    expect(result.answer.toLowerCase()).toContain('lexora');
  }, 30000);
});