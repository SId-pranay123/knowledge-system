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
                                        (entities, relationships, chunks, embeddings,
                                         conversations, messages)
                            │
                            └──> Gemini (via LangChain JS)
                                  extraction / query analysis / answer synthesis / embeddings
```

Sources: sample JSON/markdown/Slack-export files (static, as provided) + one real integration (Notion — see §9 for why Notion over Google Docs).

### Why not Neo4j
A graph-native database earns its cost at high traversal depth or edge volume. At 8–15 people and a few hundred to a few thousand documents, a `relationships` table with indexed `(source_type, source_id)` / `(target_type, target_id)` columns gives 1–2 hop traversal via plain SQL joins/recursive CTEs, fast enough at this scale. Running Neo4j alongside Postgres adds a second database to operate, migrate, and explain, for a graph-depth benefit this dataset doesn't need. One database is easier to reason about, easier to break/debug in review, and matches the stated scale.

### Why not full-corpus GraphRAG (Leiden clustering)
Microsoft's GraphRAG builds community summaries via Leiden clustering over the whole corpus. Adding one new document can shift community structure, forcing a full-graph recompute — the opposite of "keep the knowledge useful when new information is added." This design has no clustering step: new documents are hashed, and only new/changed content is extracted and upserted into the existing graph. No rebuild, ever.

## 3. Data model

Core entities: `Person`, `Client`, `Project`, `Document`, `Decision`, `Topic`. Chat history entities: `Conversation`, `Message`.

Note: `Person`/`Client`/`Project`/`Topic` use a `name` field; `Decision` and `Document` use `title` instead. This inconsistency caused two separate runtime bugs during development (code that assumed every entity type had `.name`) before being made explicit and handled via a `labelFieldFor(type)` lookup wherever entity labels are resolved, in both `ResolutionService` and `QueryService`.

The graph lives in one polymorphic table:

```
Relationship
------------
sourceType, sourceId   (which entity)
relationshipType       (WORKED_ON, HAS_DECISION, MADE_BY, INFLUENCED_BY, ABOUT, DISCUSSED_IN, SUPERSEDES, LEADS, PARTICIPANT, ...)
targetType, targetId
metadata                (confidence, sourceChunkId, extractedAt, mentionCount, source: 'structured-seed' | undefined)
```

Every fact the system states is traceable to a source document via `metadata.sourceChunkId`, or marked `metadata.source: 'structured-seed'` when it came directly from the provided structured JSON rather than LLM extraction.

`Decision` carries `status` (ACTIVE / SUPERSEDED / REJECTED / PROPOSED) and `supersedesDecisionId`; setting the latter on update automatically flips the prior decision's status to `SUPERSEDED`.

`Document` carries a unique `contentHash` for delta detection. Extraction runs *before* the document row is created, so an interrupted/failed extraction doesn't leave a "ghost" document that gets incorrectly treated as already-processed on retry.

`Chunk` holds raw text + a pgvector embedding column (`vector(3072)`, matching `gemini-embedding-001`'s output dimension).

`Conversation`/`Message` support chat history: each `Conversation` is one session (like a Claude/ChatGPT thread); each `Message` is one persisted question+answer pair, including the resolved entities/relationships/sources from that query run. Revisiting a past conversation is a plain DB read — nothing is recomputed, no LLM calls are re-run.

## 4. Ingestion pipeline

```
Document arrives (sample file, Slack export, or Notion page via the Sources UI)
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

Structured sample data (`people.json`, `clients.json`, `projects.json`, `decisions.json`, `topics.json`) already contains explicit relationships (`client_id`, `team`, `lead`, `made_by`, `participants`, `related_topics`) — these are inserted directly as graph edges during seeding, bypassing LLM extraction entirely. LLM extraction is reserved for unstructured sources where relationships only exist in prose.

### Entity resolution — six-step matching

The same real-world entity gets mentioned inconsistently across documents and via LLM paraphrasing ("Lexora" / "the Lexora project" / "Internal KB" for "Internal Knowledge Base (v1)"). Grounding the extraction prompt with known entity names reduces this but does not eliminate it — LLMs do not reliably follow "use this exact name" instructions even at temperature 0. Resolution layers multiple deterministic checks, cheapest/most-certain first:

1. **Exact match** — case-insensitive string equality on the entity's label field
2. **Alias match** — a stored `aliases` array (currently populated for `Person`, e.g. first-name aliases so "Rahul" resolves to "Rahul Mehta")
3. **Substring containment** — catches partial mentions like "Lexora" contained within "Lexora Knowledge Core"
4. **Acronym match** — catches abbreviations like "Internal KB" vs "Internal Knowledge Base": if the mention and a candidate share a literal first word, and the mention's remaining word is a short all-caps token, it's checked against the initials of the candidate's remaining words
5. **Token-overlap (Dice coefficient)** — catches shared-word-prefix variants with different suffixes, e.g. "Internal Knowledge Base – Vision" vs "Internal Knowledge Base (v1)"
6. **Embedding similarity** — last-resort semantic match for phrasings with no literal/structural overlap at all

This matching logic (`ResolutionService.findBestMatch`) is shared between two entry points: `resolveOrCreate` (used during ingestion — creates a new node if nothing matches) and `findMatch` (used during query answering — returns null if nothing matches, since a user's question should never create a graph node). Both **must** share this logic; an earlier version had the query pipeline doing its own weaker exact-match-only lookup, which caused a real bug (see §5).

LLM-extracted "attributes" (free-form key-value pairs) are filtered against a per-type allowlist before being written to the database, since the model's attribute keys don't reliably match actual column names.

**Verification:** after a full seed reset with this matching logic in place, a duplicate check across `people`, `projects`, `decisions`, and `topics` returned zero duplicate rows. Separately, ingesting a freshly-written Notion page (not part of the original sample data) that mentioned existing entities ("Ananya Sharma," "Arjun Reddy," "Lexora Knowledge Core," "FinEdge Research Assistant") by name correctly resolved all of them to their existing rows rather than creating duplicates — confirming the fix holds on genuinely new content, not just the original test case.

## 5. Query pipeline

```
Question
  → LLM extracts entities mentioned + intent (excludes 'document' type)
  → resolve entity names against existing graph nodes via
    ResolutionService.findMatch — the SAME matching logic ingestion uses
  → traverse relationships table 1–2 hops from each resolved entity
  → vector search over chunks (pgvector cosine distance)
  → resolve human-readable labels for every graph fact (not raw UUIDs)
  → combine graph facts + retrieved chunks into context
  → LLM synthesizes answer (explicitly instructed to be exhaustive — list
    every relevant person/decision, not just the first one), citing sources
```

**Bug found and fixed during development:** the query pipeline originally had its own, weaker, exact-match-only entity resolution instead of reusing `ResolutionService`. A question saying "Lexora" never matched the actual entity "Lexora Knowledge Core," so graph traversal silently returned nothing, and the system fell back to whatever a single vector-searched chunk happened to say — producing an incomplete answer (named one team member instead of three, omitted the decision-maker and date) despite the underlying graph data being fully correct. Fixed by extracting `findBestMatch` as shared logic and having `QueryService` call `ResolutionService.findMatch` instead of a separate implementation. A second, compounding issue — the graph context sent to the synthesis LLM used raw UUIDs instead of resolved names — was fixed at the same time.

**Verification:** after both fixes, the assignment's own Example 1 question ("Who worked on the Lexora project and what key decisions were made about its approach?") returns all three team members (lead + two contributors), the decision content, who made it, and when — matching their "strong answer" definition. A second test, ingesting a new Notion page describing a hypothetical GreenGrid project that explicitly reuses lessons from Lexora and FinEdge, produced a correctly connected multi-hop answer citing the decision chain across all three projects with proposer, participants, and reasoning — this is essentially their Example 2 scenario, one hop further out, on content that didn't exist in the original sample data.

## 6. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite), plain CSS/inline styles with consistent shared classes, `react-markdown` for rendering LLM answers |
| Backend | NestJS, service/repository separation per module (see §7 for known gaps) |
| Database | PostgreSQL + pgvector extension |
| ORM | Prisma |
| LLM | Gemini (`gemini-3.6-flash` for extraction/synthesis, `gemini-3.5-flash-lite` for query classification, `gemini-embedding-001` for embeddings) via LangChain JS |
| Auth | JWT (NestJS + Passport), single shared credential pair from env — no user table |
| Real integration | Notion API (internal integration token) |

## 7. What's incomplete / known issues

- **Global graph view density** — the whole-graph view can get visually cluttered at higher entity counts (25+ topics); a type-filter/pan-zoom pass is in progress
- **Google Docs integration was built but is not the shipped real integration** (see §9) — the code exists (`src/google-docs/`) and is architecturally complete, but auth could not be reliably established within this assignment's time budget; Notion was substituted as the working, tested real source instead
- **No caching layer for repeated embedding calls** during entity resolution — every resolution call re-embeds candidate labels; fine at this scale, would need caching at a larger scale
- **Repository-pattern inconsistency** — `people`, `clients`, `projects`, `decisions`, `topics`, `relationships`, and `conversations` all separate Prisma access into a `*.repository.ts` file from business logic in `*.service.ts`. `ingestion` and `google-docs` do not — their services call Prisma directly. Left as a known, documented gap rather than silently inconsistent.
- **No answer caching/dedup** for repeated identical questions — each question re-runs the full pipeline (LLM calls included) even if asked before in a different conversation; chat history persists past answers for browsing, but doesn't short-circuit a fresh identical question.
- **LLM provider is hardcoded to the direct Gemini API** — a second option (Vertex AI, via a separately-provided shared key with its own quota) is planned but not yet implemented. The intended design is a provider abstraction behind a shared interface (`ChatModelProvider`, `EmbeddingsModelProvider`) so `ExtractionService`, `QueryService`, etc. depend on the abstraction, not a concrete SDK class, and the concrete implementation (direct API key vs Vertex service account) is selected once at startup based on which credentials are present.

## 8. Trade-offs

| Decision | Trade-off |
|---|---|
| Postgres+pgvector over Neo4j | Traversal capped at a few hops before SQL joins get unwieldy — acceptable at this scale |
| LLM-based extraction | Imperfect recall/precision — mitigated by a six-layer resolution pipeline (§4) shared across ingestion and query, not by trying to make extraction itself perfect |
| Notion over Google Docs as the real integration | See §9 |
| Re-embedding candidates on every resolution call | Simple to implement, fine at hundreds of entities |
| No auth beyond basic JWT, and only on write endpoints | Reads (browsing, asking questions) are intentionally public; only mutations are gated — matches a small internal team's shared-knowledge-base use case rather than a stricter per-user access model |
| No repository layer for ingestion/google-docs | Inconsistent with other modules' structure; acceptable trade given time constraints, noted as a known gap rather than hidden |

## 9. Why Notion instead of Google Docs

The original plan was Google Docs, since it's the assignment's own example of an acceptable single integration. Two independent Google Cloud auth obstacles made this impractical within the assignment's time budget on a personal/free-tier Google Cloud project:

1. **Service account key creation is blocked by an organization policy** (`iam.disableServiceAccountKeyCreation`, and its newer `.managed` counterpart) that requires Organization Policy Administrator rights to override — not available on this project.
2. **The fallback (OAuth via Application Default Credentials with a custom client ID) hit a separate wall**: Google's "unverified app" and "restricted test user" protections, plus unreliable redirect/callback handling in the CLI tooling itself.

Notion's integration model is a static API token (create an integration, share a page with it) — no OAuth, no service accounts, no organization policies. This is architecturally equivalent for this assignment's purposes (fetch external content, flatten to plain text, feed into the same `ingestDocument()` pipeline used for every other source) and was tested end-to-end successfully, including a one-click "Sources" page (`GET /api/ingest/notion/pages` lists every page shared with the integration, cross-referenced against what's already ingested) rather than requiring a manually copy-pasted page ID.

The Google Docs implementation (`src/google-docs/`) is left in the repository as evidence of the intended design — it was the auth layer specifically, not the integration logic, that could not be resolved within scope.

## 10. How to run and test

See `README.md` for setup steps (`docker compose up`, `npm run db:migrate`, `npm run db:seed`, `npm run dev:api`, `npm run dev:web`).

Testing approach: unit tests on `RelationshipsService` (upsert dedup logic, neighborhood traversal) and `ResolutionService` (exact/alias/substring matching, similarity threshold behavior) are the highest-value tests, since these are the two places correctness bugs would silently produce duplicate or missing graph edges. Integration test: ingest the FinEdge and Lexora sample documents, then assert the query pipeline surfaces the cross-project relationship between them.

Beyond automated tests, this system was manually verified twice against realistic scenarios: once using the original sample data (FinEdge → Lexora), and once using freshly-authored content ingested live via the Notion integration (a hypothetical GreenGrid project explicitly reusing lessons from both Lexora and FinEdge) — the second test is stronger evidence of correctness, since that content and its entity mentions didn't exist anywhere in the original seed data, and the system still resolved entities correctly and traced the full multi-project decision chain with proposer, participants, and reasoning.