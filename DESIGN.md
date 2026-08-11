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

Sources: sample JSON/markdown/Slack-export files (static, as provided) + one real integration (Notion — see §9 for why Notion over Google Docs).

### Why not Neo4j
A graph-native database earns its cost at high traversal depth or edge volume. At 8–15 people and a few hundred to a few thousand documents, a `relationships` table with indexed `(source_type, source_id)` / `(target_type, target_id)` columns gives 1–2 hop traversal via plain SQL joins/recursive CTEs, fast enough at this scale. Running Neo4j alongside Postgres adds a second database to operate, migrate, and explain, for a graph-depth benefit this dataset doesn't need. One database is easier to reason about, easier to break/debug in review, and matches the stated scale.

### Why not full-corpus GraphRAG (Leiden clustering)
Microsoft's GraphRAG builds community summaries via Leiden clustering over the whole corpus. Adding one new document can shift community structure, forcing a full-graph recompute — the opposite of "keep the knowledge useful when new information is added." This design has no clustering step: new documents are hashed, and only new/changed content is extracted and upserted into the existing graph. No rebuild, ever.

## 3. Data model

Six core entities: `Person`, `Client`, `Project`, `Document`, `Decision`, `Topic`.

Note: `Person`/`Client`/`Project`/`Topic` use a `name` field; `Decision` and `Document` use `title` instead. This inconsistency is a real thing to know about the schema — it caused two runtime bugs during development (code that assumed every entity type had `.name`) before being made explicit and handled via a `labelFieldFor(type)` lookup wherever entity labels are resolved.

The graph lives in one polymorphic table:

```
Relationship
------------
sourceType, sourceId   (which entity)
relationshipType       (WORKED_ON, HAS_DECISION, MADE_BY, INFLUENCED_BY, ABOUT, DISCUSSED_IN, SUPERSEDES, LEADS, PARTICIPANT, ...)
targetType, targetId
metadata                (confidence, sourceChunkId, extractedAt, mentionCount, source: 'structured-seed' | undefined)
```

This table is the knowledge graph. Every fact the system states is traceable to a source document via `metadata.sourceChunkId`, or marked `metadata.source: 'structured-seed'` when it came directly from the provided structured JSON (`projects.json`'s `team`/`lead`/`key_topics`, `decisions.json`'s `made_by`/`participants`/`related_topics`) rather than LLM extraction.

`Decision` additionally carries `status` (ACTIVE / SUPERSEDED / REJECTED / PROPOSED) and `supersedesDecisionId`, so decision evolution is modeled explicitly — directly answering the assignment's decision-lineage style examples. Setting `supersedesDecisionId` on update automatically flips the prior decision's status to `SUPERSEDED`.

`Document` carries a unique `contentHash` — this is the delta-detection key. Re-ingesting unchanged content is a no-op. Content is hashed and extraction is run *before* the document row is created, so an interrupted/failed extraction (bad API key, rate limit, network error) doesn't leave a "ghost" document that gets incorrectly treated as already-processed on retry.

`Chunk` holds raw text + a pgvector embedding column (`vector(3072)`, matching `gemini-embedding-001`'s output dimension), for the vector-search half of retrieval.

## 4. Ingestion pipeline

```
Document arrives (sample file, Slack export, or Notion page)
  → hash content
  → hash already seen? → skip (delta detection, no reprocessing)
  → otherwise:
      → fetch list of already-known entity names (grounding context)
      → LLM extraction (Gemini, structured JSON output): entities + relationships,
        grounded against known entity names to reduce duplicate/abbreviated entities
      → entity resolution (see below)
      → relationship upsert: same edge mentioned again? bump mentionCount, don't duplicate
      → chunk document → embed each chunk → store in pgvector
```

Structured sample data (`people.json`, `clients.json`, `projects.json`, `decisions.json`, `topics.json`) already contains explicit relationships (`client_id`, `team`, `lead`, `made_by`, `participants`, `related_topics`) — these are inserted directly as graph edges during seeding, bypassing LLM extraction entirely, since the structure is already known and unambiguous. LLM extraction is reserved for genuinely unstructured sources (markdown docs, Slack messages, Notion pages) where relationships only exist in prose.

### Entity resolution — six-step matching

The same real-world entity gets mentioned inconsistently across documents and via LLM paraphrasing ("Lexora" / "the Lexora project" / "Internal KB" for "Internal Knowledge Base (v1)"). Grounding the extraction prompt with known entity names reduces this but does not eliminate it — LLMs do not reliably follow "use this exact name" instructions even at temperature 0, since the model's most natural phrasing of what the text says can still diverge from the instruction. Resolution therefore layers multiple deterministic checks, cheapest/most-certain first:

1. **Exact match** — case-insensitive string equality on the entity's label field
2. **Alias match** — a stored `aliases` array (currently populated for `Person`, e.g. first-name aliases so "Rahul" resolves to "Rahul Mehta")
3. **Substring containment** — catches partial mentions like "Lexora" contained within "Lexora Knowledge Core"
4. **Acronym match** — catches abbreviations like "Internal KB" vs "Internal Knowledge Base": if the mention and a candidate share a literal first word, and the mention's remaining word is a short all-caps token, it's checked against the initials of the candidate's remaining words
5. **Token-overlap (Dice coefficient)** — catches shared-word-prefix variants with different suffixes, e.g. "Internal Knowledge Base – Vision" vs "Internal Knowledge Base (v1)" (high overlap on "internal"/"knowledge"/"base" despite different endings)
6. **Embedding similarity** — last-resort semantic match for phrasings with no literal/structural overlap at all

Only if none of these match is a new entity created. This layered approach exists because no single technique (prompting, exact match, or embeddings alone) reliably prevented duplicate entity creation during testing — each layer catches a distinct failure mode the others miss.

LLM-extracted "attributes" (free-form key-value pairs the model returns per entity, e.g. a `date` field for a decision) are filtered against a per-type allowlist before being written to the database, since the model's attribute keys don't reliably match actual column names and would otherwise cause a runtime error on entity creation.

## 5. Query pipeline

```
Question
  → LLM extracts entities mentioned + intent (excludes 'document' type — a
    document row is not a named entity a user would reference by title)
  → resolve entity names against existing graph nodes (same label-field-aware
    lookup as ingestion: title for Decision, name for everything else)
  → traverse relationships table 1–2 hops from each resolved entity
  → vector search over chunks (pgvector cosine distance)
  → combine graph facts + retrieved chunks into context
  → LLM synthesizes answer, citing sources
```

This is what turns document-similarity search into a connected answer: the graph traversal supplies the structured facts (who, what decision, made by whom), and the vector search supplies supporting narrative/reasoning text the graph doesn't capture. Neither alone satisfies the assignment's "strong answer" bar — the combination does.

**Known gap (see §7):** manual testing against the assignment's own example question ("Who worked on the Lexora project and what key decisions were made about its approach?") returned a partially complete answer — it named only one of three actual team members and omitted who made the decision and when, despite that data existing in the graph. This needs further investigation into whether the gap is in retrieval (traversal not returning all edges) or synthesis (the prompt not instructing the LLM to surface every result exhaustively).

## 6. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite), plain fetch + inline styles, no CSS framework |
| Backend | NestJS, service/repository separation per module |
| Database | PostgreSQL + pgvector extension |
| ORM | Prisma |
| LLM | Gemini (gemini-3.6-flash for extraction/synthesis, gemini-3.5-flash-lite for query classification, gemini-embedding-001 for embeddings) via LangChain JS |
| Auth | JWT (NestJS + Passport), single shared credential pair from env — no user table |
| Real integration | Notion API (internal integration token) |

## 7. What's incomplete / known issues

- **Query-answer completeness gap** (see §5) — needs investigation before this can confidently be called a "strong answer" system by the assignment's own rubric
- **Global graph view** — the current Graph/Connections page only shows a 1-hop neighborhood centered on one entity; a whole-graph overview (all entities + edges at once) does not yet exist
- **Google Docs integration was built but is not the shipped real integration** (see §9) — the code exists (src/google-docs/) and is architecturally complete, but auth could not be reliably established within this assignment's time budget; Notion was substituted as the working, tested real source instead
- **UI is functional but not visually polished** — plain styling, no design system; deprioritized in favor of correctness and completeness of the data/query pipeline, which is what the assignment's grading criteria actually emphasize
- **No caching layer for repeated embedding calls** during entity resolution — every resolution call re-embeds candidate labels; fine at this scale (hundreds of entities), would need caching at a larger scale
- **Ingestion pipeline's direct Prisma calls are not extracted into a repository layer**, unlike the CRUD modules (people, clients, etc.), which went through a service/repository refactor — left inconsistent due to time constraints

## 8. Trade-offs

| Decision | Trade-off |
|---|---|
| Postgres+pgvector over Neo4j | Traversal capped at a few hops before SQL joins get unwieldy — acceptable at this scale |
| LLM-based extraction | Imperfect recall/precision — mitigated by a six-layer resolution pipeline (§4) and human-editable CRUD, not by trying to make extraction itself perfect |
| Notion over Google Docs as the real integration | See §9 |
| Re-embedding candidates on every resolution call | Simple to implement, fine at hundreds of entities |
| No auth beyond basic JWT | Matches "basic authentication is enough," not production RBAC |
| No repository layer for ingestion | Inconsistent with other modules' structure; acceptable trade given time constraints, noted as a known gap rather than hidden |

## 9. Why Notion instead of Google Docs

The original plan was Google Docs, since it's the assignment's own example of an acceptable single integration. Two independent Google Cloud auth obstacles made this impractical within the assignment's time budget on a personal/free-tier Google Cloud project:

1. **Service account key creation is blocked by an organization policy** (iam.disableServiceAccountKeyCreation, and its newer .managed counterpart) that requires Organization Policy Administrator rights to override — not available on this project, and not something that should require elevating account privileges just to run a take-home demo.
2. **The fallback (OAuth via Application Default Credentials with a custom client ID) hit a separate wall**: Google's "unverified app" and "restricted test user" protections, which require either publishing the OAuth app (a real verification process, not appropriate for a throwaway assignment) or manually allow-listing test users, and even then the flow's redirect/callback handling proved unreliable in practice within the CLI tooling.

Rather than continuing to spend disproportionate time on Google Cloud's auth infrastructure for a component the assignment explicitly marks as optional ("only if time permits"), the pragmatic choice was to substitute Notion, which the assignment also lists as a plausible team knowledge source. Notion's integration model is a static API token (create an integration, share a page with it, done) — no OAuth, no service accounts, no organization policies. This is architecturally equivalent for the purposes of this assignment (fetch external content, flatten to plain text, feed into the same ingestDocument() pipeline used for every other source) and was successfully tested end-to-end.

The Google Docs implementation (src/google-docs/) is left in the repository as evidence of the intended design and is functionally complete code — it was the auth layer specifically, not the integration logic, that could not be resolved within scope.

## 10. How to run and test

See README.md for setup steps (docker compose up, npm run db:migrate, npm run db:seed, npm run dev:api, npm run dev:web).

Testing approach: unit tests on RelationshipsService (upsert dedup logic, neighborhood traversal) and ResolutionService (exact/alias/substring matching, similarity threshold behavior) are the highest-value tests, since these are the two places correctness bugs would silently produce duplicate or missing graph edges. Integration test: ingest the FinEdge and Lexora sample documents, then assert the query pipeline surfaces the cross-project INFLUENCED_BY-style relationship between them — this was manually verified working end-to-end during development, confirming the core "strong answer" scenario the assignment describes is achievable with this architecture.