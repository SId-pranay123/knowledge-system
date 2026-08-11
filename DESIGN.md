# Design Document — Connected Knowledge Base

## 1. Problem understanding

A small consulting team (8–15 people) has knowledge scattered across Notion, Slack, Google Docs, emails, and people's heads. The system needs to:

- Store people, projects, clients, documents, decisions, and topics
- Store and traverse relationships between them
- Answer questions using those relationships, not just keyword/document matching
- Show how knowledge connects
- Stay useful as new information is added, without reprocessing everything already ingested

The evaluation explicitly distinguishes a "weak answer" (returns a matching document) from a "strong answer" (returns the connected facts: who worked on it, what was decided, by whom, when, and how it relates to other projects). That distinction — relationship-aware retrieval vs document retrieval — is the core engineering problem, not infrastructure scale.

## 2. Architecture

Single-database design: PostgreSQL with the pgvector extension.

```
React (Vite) ──REST──> NestJS API ──> PostgreSQL + pgvector
                                        (entities, relationships, chunks, embeddings)
                            │
                            └──> Gemini (via LangChain JS)
                                  extraction / query analysis / answer synthesis
```

Sources: sample JSON/markdown/Slack-export files (static, as provided) + one real integration (Google Docs).

### Why not Neo4j
A graph-native database earns its cost at high traversal depth or edge volume. At 8–15 people and a few hundred to a few thousand documents, a `relationships` table with indexed `(source_type, source_id)` / `(target_type, target_id)` columns gives 1–2 hop traversal via plain SQL joins/recursive CTEs, fast enough at this scale. Running Neo4j alongside Postgres adds a second database to operate, migrate, and explain, for a graph-depth benefit this dataset doesn't need. One database is easier to reason about, easier to break/debug in review, and matches the stated scale.

### Why not full-corpus GraphRAG (Leiden clustering)
Microsoft's GraphRAG builds community summaries via Leiden clustering over the whole corpus. Adding one new document can shift community structure, forcing a full-graph recompute — the opposite of "keep the knowledge useful when new information is added." This design has no clustering step: new documents are hashed, and only new/changed content is extracted and upserted into the existing graph. No rebuild, ever.

## 3. Data model

Six core entities: `Person`, `Client`, `Project`, `Document`, `Decision`, `Topic`.

The graph lives in one polymorphic table:

```
Relationship
------------
sourceType, sourceId   (which entity)
relationshipType       (WORKED_ON, HAS_DECISION, MADE_BY, INFLUENCED_BY, ABOUT, DISCUSSED_IN, SUPERSEDES, ...)
targetType, targetId
metadata                (confidence, sourceChunkId, extractedAt, mentionCount)
```

This table is the knowledge graph. Every fact the system states is traceable to a source document via `metadata.sourceChunkId`.

`Decision` additionally carries `status` (ACTIVE / SUPERSEDED / REJECTED / PROPOSED) and `supersedesDecisionId`, so decision evolution is modeled explicitly — directly answering the assignment's decision-lineage style examples.

`Document` carries a unique `contentHash` — this is the delta-detection key. Re-ingesting unchanged content is a no-op.

`Chunk` holds raw text + a pgvector embedding column, for the vector-search half of retrieval.

## 4. Ingestion pipeline

```
Document arrives (sample file or Google Docs)
  → hash content
  → hash already seen? → skip (delta detection, no reprocessing)
  → otherwise:
      → LLM extraction (Gemini, structured JSON output): entities + relationships
      → entity resolution: exact/alias match → embedding similarity match → else create new node
      → relationship upsert: same edge mentioned again? bump mentionCount, don't duplicate
      → chunk document → embed each chunk → store in pgvector
```

Entity resolution exists because the same real-world entity gets mentioned inconsistently across documents ("Lexora" / "the Lexora project" / "Lexora engagement"). Exact match is cheap and catches most repeats; embedding similarity above a threshold catches the rest without creating duplicate nodes.

## 5. Query pipeline

```
Question
  → LLM extracts entities mentioned + intent
  → resolve entity names against existing graph nodes
  → traverse relationships table 1–2 hops from each resolved entity
  → vector search over chunks (pgvector cosine distance)
  → combine graph facts + retrieved chunks into context
  → LLM synthesizes answer, citing sources
```

This is what turns document-similarity search into a connected answer: the graph traversal supplies the structured facts (who, what decision, made by whom), and the vector search supplies supporting narrative/reasoning text the graph doesn't capture. Neither alone satisfies the assignment's "strong answer" bar — the combination does.

## 6. Trade-offs

| Decision | Trade-off |
|---|---|
| Postgres+pgvector over Neo4j | Traversal capped at a few hops before SQL joins get unwieldy — acceptable at this scale, would need revisiting at 100x the data |
| LLM-based extraction | Imperfect recall/precision on entity extraction — mitigated by resolution step and human-editable CRUD, not by trying to make extraction perfect |
| One real integration (Google Docs) | Slack/Notion/email stay static sample files per the assignment's explicit scope-limiting instruction |
| Re-embedding candidates on every resolution call | Simple to implement, fine at hundreds of entities; would need embedding caching at larger scale |
| No auth beyond basic JWT | Matches "basic authentication is enough," not production RBAC |

## 7. What's incomplete

- CRUD modules for `clients`, `projects`, `documents`, `decisions`, `topics` follow the `people` module pattern but need to be replicated
- Frontend has only the Ask AI page wired end-to-end; Dashboard, Explorer, Entity Detail, and Graph/Connections views are stubbed
- Google Docs integration not yet implemented (planned: OAuth + Docs API pull → feeds into the same `ingestDocument()` pipeline)
- No caching layer for repeated embedding calls during entity resolution

## 8. How to run and test

See `README.md` for setup steps (`docker compose up`, `npm run db:migrate`, `npm run dev:api`, `npm run dev:web`).

Testing approach: unit tests on `RelationshipsService` (upsert dedup logic, neighborhood traversal) and `ResolutionService` (exact match, similarity threshold behavior) are the highest-value tests, since these are the two places correctness bugs would silently produce duplicate or missing graph edges. Integration test: ingest the two sample documents referencing FinEdge and Lexora, then assert the query pipeline returns the INFLUENCED_BY edge between them.