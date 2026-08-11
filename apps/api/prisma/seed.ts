/**
 * Seed script.
 *
 * Structured sample data (people/clients/projects/decisions/topics.json)
 * already contains explicit relationships (project.client_id, project.team,
 * decision.made_by, decision.participants, decision.related_topics) — these
 * are inserted directly as graph edges. No LLM extraction needed for these;
 * the JSON IS the structure.
 *
 * Unstructured sources (markdown docs, Slack export) go through the real
 * ingestion pipeline (IngestionService), since their relationships (e.g.
 * "FinEdge's lesson influenced Lexora") only exist in prose. This is also
 * where Google Docs content will flow through identically.
 *
 * Run with: npm run prisma:seed -w apps/api
 * Set SAMPLE_DATA_DIR in .env if sample-data isn't at the default path below.
 */
import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { RelationshipsService } from '../src/relationships/relationships.service';

const SAMPLE_DATA_DIR = process.env.SAMPLE_DATA_DIR ?? path.join(__dirname, '../../../sample-data');

function readJson(fileName: string): any[] {
  const filePath = path.join(SAMPLE_DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`  ! ${fileName} not found at ${filePath}, skipping`);
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// sample-data uses short ids (p001, c001, proj001, d001, t001) — map those to
// the real UUIDs Prisma generates, so structured relationships can be wired
// up correctly without guessing/fuzzy-matching.
type IdMap = Map<string, string>;

async function seedTopics(prisma: PrismaService): Promise<IdMap> {
  const map: IdMap = new Map();
  const topics = readJson('topics.json');
  for (const t of topics) {
    const row = await prisma.topic.upsert({
      where: { name: t.name },
      update: { description: t.description },
      create: { name: t.name, description: t.description },
    });
    map.set(t.id, row.id);
    map.set(t.name, row.id); // also index by name, for topics referenced only by name later (key_topics/related_topics)
  }
  console.log(`  topics: ${topics.length}`);
  return map;
}

// project.key_topics / decision.related_topics sometimes name topics not in
// topics.json (e.g. "Guideline Linking", "Finance Research"). Create them on
// the fly so no relationship silently gets dropped.
async function resolveOrCreateTopicByName(prisma: PrismaService, topicMap: IdMap, name: string): Promise<string> {
  if (topicMap.has(name)) return topicMap.get(name)!;
  const row = await prisma.topic.upsert({
    where: { name },
    update: {},
    create: { name },
  });
  topicMap.set(name, row.id);
  return row.id;
}

async function seedPeople(prisma: PrismaService): Promise<IdMap> {
  const map: IdMap = new Map();
  const people = readJson('people.json');
  for (const p of people) {
    const firstName = p.name.split(' ')[0];
    const row = await prisma.person.upsert({
      where: { email: p.email },
      update: {},
      create: {
        name: p.name,
        email: p.email,
        role: p.role,
        bio: [p.skills?.length ? `Skills: ${p.skills.join(', ')}` : null, p.joined ? `Joined ${p.joined}` : null]
          .filter(Boolean)
          .join(' — '),
        // First-name alias so Slack/doc mentions like "Rahul" resolve to
        // "Rahul Mehta" instead of creating a duplicate person node.
        aliases: [firstName],
      },
    });
    map.set(p.id, row.id);
  }
  console.log(`  people: ${people.length}`);
  return map;
}

async function seedClients(prisma: PrismaService): Promise<IdMap> {
  const map: IdMap = new Map();
  const clients = readJson('clients.json');
  for (const c of clients) {
    const existing = await prisma.client.findFirst({ where: { name: c.name } });
    const row =
      existing ??
      (await prisma.client.create({
        data: { name: c.name, description: [c.industry, c.notes].filter(Boolean).join(' — ') },
      }));
    map.set(c.id, row.id);
  }
  console.log(`  clients: ${clients.length}`);
  return map;
}

async function seedProjects(
  prisma: PrismaService,
  relationships: RelationshipsService,
  peopleMap: IdMap,
  clientMap: IdMap,
  topicMap: IdMap,
): Promise<IdMap> {
  const map: IdMap = new Map();
  const statusMap: Record<string, string> = {
    'In Progress': 'ACTIVE',
    Discovery: 'ACTIVE',
    Completed: 'COMPLETED',
  };
  const projects = readJson('projects.json');
  for (const p of projects) {
    const existing = await prisma.project.findFirst({ where: { name: p.name } });
    const row =
      existing ??
      (await prisma.project.create({
        data: {
          name: p.name,
          description: p.description,
          status: statusMap[p.status] ?? 'ACTIVE',
          clientId: p.client_id ? clientMap.get(p.client_id) : undefined,
          startDate: p.start_date ? new Date(p.start_date) : undefined,
          endDate: p.end_date ? new Date(p.end_date) : undefined,
        },
      }));
    map.set(p.id, row.id);

    // team[] -> WORKED_ON edges (lead included in team in the sample data, but
    // guard in case a lead isn't listed in team)
    const teamIds: string[] = Array.from(new Set([...(p.team ?? []), p.lead].filter(Boolean)));
    for (const personSampleId of teamIds) {
      const personId = peopleMap.get(personSampleId);
      if (!personId) continue;
      await relationships.create({
        sourceType: 'person',
        sourceId: personId,
        relationshipType: personSampleId === p.lead ? 'LEADS' : 'WORKED_ON',
        targetType: 'project',
        targetId: row.id,
        metadata: { source: 'structured-seed' },
      });
    }

    // key_topics -> ABOUT edges
    for (const topicName of p.key_topics ?? []) {
      const topicId = await resolveOrCreateTopicByName(prisma, topicMap, topicName);
      await relationships.create({
        sourceType: 'project',
        sourceId: row.id,
        relationshipType: 'ABOUT',
        targetType: 'topic',
        targetId: topicId,
        metadata: { source: 'structured-seed' },
      });
    }
  }
  console.log(`  projects: ${projects.length}`);
  return map;
}

async function seedDecisions(
  prisma: PrismaService,
  relationships: RelationshipsService,
  peopleMap: IdMap,
  projectMap: IdMap,
  topicMap: IdMap,
) {
  const decisions = readJson('decisions.json');
  for (const d of decisions) {
    const existing = await prisma.decision.findFirst({ where: { title: d.title } });
    const row =
      existing ??
      (await prisma.decision.create({
        data: {
          title: d.title,
          description: d.summary,
          decisionDate: d.date ? new Date(d.date) : undefined,
          status: 'ACTIVE',
        },
      }));

    // project -> HAS_DECISION -> decision
    if (d.project_id && projectMap.has(d.project_id)) {
      await relationships.create({
        sourceType: 'project',
        sourceId: projectMap.get(d.project_id)!,
        relationshipType: 'HAS_DECISION',
        targetType: 'decision',
        targetId: row.id,
        metadata: { source: 'structured-seed' },
      });
    }

    // decision -> MADE_BY -> person
    if (d.made_by && peopleMap.has(d.made_by)) {
      await relationships.create({
        sourceType: 'decision',
        sourceId: row.id,
        relationshipType: 'MADE_BY',
        targetType: 'person',
        targetId: peopleMap.get(d.made_by)!,
        metadata: { source: 'structured-seed' },
      });
    }

    // decision -> PARTICIPANT -> person (for each participant besides the decision-maker)
    for (const participantId of d.participants ?? []) {
      const personId = peopleMap.get(participantId);
      if (!personId) continue;
      await relationships.create({
        sourceType: 'decision',
        sourceId: row.id,
        relationshipType: 'PARTICIPANT',
        targetType: 'person',
        targetId: personId,
        metadata: { source: 'structured-seed' },
      });
    }

    // decision -> ABOUT -> topic
    for (const topicName of d.related_topics ?? []) {
      const topicId = await resolveOrCreateTopicByName(prisma, topicMap, topicName);
      await relationships.create({
        sourceType: 'decision',
        sourceId: row.id,
        relationshipType: 'ABOUT',
        targetType: 'topic',
        targetId: topicId,
        metadata: { source: 'structured-seed' },
      });
    }
  }
  console.log(`  decisions: ${decisions.length}`);
}

async function seedUnstructuredDocuments(ingestion: IngestionService) {
  const docsDir = path.join(SAMPLE_DATA_DIR, 'documents');
  if (fs.existsSync(docsDir)) {
    const files = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(docsDir, file), 'utf-8');
      const result = await ingestion.ingestDocument({ title: file.replace('.md', ''), content, sourceType: 'LOCAL' });
      console.log(`  ingested ${file}:`, result);
    }
  }

  const slackDir = path.join(SAMPLE_DATA_DIR, 'slack-exports');
  if (fs.existsSync(slackDir)) {
    const files = fs.readdirSync(slackDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const raw = JSON.parse(fs.readFileSync(path.join(slackDir, file), 'utf-8'));
      // Confirmed shape: array of { ts, user, text }
      const content = raw.map((m: any) => `[${m.ts}] ${m.user}: ${m.text}`).join('\n');
      const result = await ingestion.ingestDocument({ title: file.replace('.json', ''), content, sourceType: 'SLACK' });
      console.log(`  ingested ${file}:`, result);
    }
  }
}

async function main() {
  console.log(`Seeding from: ${SAMPLE_DATA_DIR}`);
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const ingestion = app.get(IngestionService);
  const relationships = app.get(RelationshipsService);

  console.log('Structured entities + relationships:');
  const topicMap = await seedTopics(prisma);
  const peopleMap = await seedPeople(prisma);
  const clientMap = await seedClients(prisma);
  const projectMap = await seedProjects(prisma, relationships, peopleMap, clientMap, topicMap);
  await seedDecisions(prisma, relationships, peopleMap, projectMap, topicMap);

  console.log('Unstructured documents (via ingestion pipeline — LLM extraction):');
  await seedUnstructuredDocuments(ingestion);

  await app.close();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});