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
                            └──> Gemini (direct API or Vertex AI, via LangChain JS)
                                  extraction / query analysis / answer synthesis / embeddings
```

Sources: sample JSON/markdown/Slack-export files (static, as provided) + one real integration (Notion — see §9 for why Notion over Google Docs).

### Why not Neo4j
A graph-native database earns its cost at high traversal depth or edge volume. At 8–15 people and a few hundred to a few thousand documents, a `relationships` table with indexed `(source_type, source_id)` / `(target_type, target_id)` columns gives 1–2 hop traversal via plain SQL joins/recursive CTEs, fast enough at this scale. Running Neo4j alongside Postgres adds a second database to operate, migrate, and explain, for a graph-depth benefit this dataset doesn't need.

### Why not full-corpus GraphRAG (Leiden clustering)
Microsoft's GraphRAG builds community summaries via Leiden clustering over the whole corpus. Adding one new document can shift community structure, forcing a full-graph recompute — the opposite of "keep the knowledge useful when new information is added." This design has no clustering step: new documents are hashed, and only new/changed content is extracted and upserted into the existing graph. No rebuild, ever.

## 3. Data model

Core entities: `Person`, `Client`, `Project`, `Document`, `Decision`, `Topic`. Chat history entities: `Conversation`, `Message`.

Note: `Person`/`Client`/`Project`/`Topic` use a `name` field; `Decision` and `Document` use `title` instead. This inconsistency caused two runtime bugs before being made explicit and handled via a `labelFieldFor(type)` lookup wherever entity labels are resolved, in both `ResolutionService` and `QueryService`.

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

`Document` carries a unique `contentHash` for delta detection. Extraction runs *before* the document row is created, so an interrupted/failed extraction doesn't leave a "ghost" document incorrectly treated as already-processed on retry.

`Chunk` holds raw text + a pgvector embedding column (`vector(3072)`). Confirmed via Google's own documentation that `gemini-embedding-001` outputs 3072 dimensions on **both** the direct Gemini API and Vertex AI, so this column stays correct regardless of which provider is active.

`Conversation`/`Message` support chat history: each `Conversation` is one session (like a Claude/ChatGPT thread); each `Message` is one persisted question+answer pair, including the resolved entities/relationships/sources. Revisiting a past conversation is a plain DB read — nothing is recomputed.

## 4. Ingestion pipeline

```
Document arrives (sample file, Slack export, or Notion page via the Sources UI)
  → hash content
  → hash already seen? → skip (delta detection, no reprocessing)
  → otherwise:
      → fetch list of already-known entity names (grounding context)
      → LLM extraction (structured JSON output): entities + relationships,
        grounded against known entity names to reduce duplicate/abbreviated entities
      → entity resolution (see below)
      → relationship upsert: same edge mentioned again? bump mentionCount, don't duplicate
      → chunk document → embed each chunk → store in pgvector
```

Structured sample data (`people.json`, `clients.json`, `projects.json`, `decisions.json`, `topics.json`) already contains explicit relationships — inserted directly as graph edges during seeding, bypassing LLM extraction entirely. LLM extraction is reserved for unstructured sources where relationships only exist in prose.

### Entity resolution — six-step matching

The same real-world entity gets mentioned inconsistently across documents and via LLM paraphrasing. Grounding the extraction prompt with known entity names reduces this but does not eliminate it — LLMs do not reliably follow "use this exact name" instructions even at temperature 0. Resolution layers multiple deterministic checks, cheapest/most-certain first:

1. **Exact match** — case-insensitive string equality on the entity's label field
2. **Alias match** — a stored `aliases` array (currently populated for `Person`, e.g. first-name aliases so "Rahul" resolves to "Rahul Mehta")
3. **Substring containment** — catches partial mentions like "Lexora" contained within "Lexora Knowledge Core"
4. **Acronym match** — catches abbreviations like "Internal KB" vs "Internal Knowledge Base"
5. **Token-overlap (Dice coefficient)** — catches shared-word-prefix variants with different suffixes
6. **Embedding similarity** — last-resort semantic match

This logic (`ResolutionService.findBestMatch`) is shared between `resolveOrCreate` (ingestion — creates a new node if nothing matches) and `findMatch` (query answering — returns null if nothing matches, since a user's question should never create a graph node). An earlier version had the query pipeline doing its own weaker exact-match-only lookup, which caused a real bug (see §5).

LLM-extracted "attributes" are filtered against a per-type allowlist before being written to the database.

**Verification:** after a full seed reset, a duplicate check across `people`, `projects`, `decisions`, and `topics` returned zero duplicate rows. Separately, ingesting a freshly-written Notion page mentioning existing entities by name correctly resolved all of them to their existing rows rather than creating duplicates.

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
  → LLM synthesizes answer (explicitly instructed to be exhaustive), citing sources
```

**Bug found and fixed:** the query pipeline originally had its own, weaker, exact-match-only entity resolution instead of reusing `ResolutionService`. A question saying "Lexora" never matched "Lexora Knowledge Core," so graph traversal silently returned nothing, and the system fell back to an incomplete answer despite the underlying graph data being fully correct. Fixed by extracting shared matching logic and having `QueryService` call `ResolutionService.findMatch`. A second issue — raw UUIDs in the synthesis context instead of resolved names — was fixed at the same time.

**Second bug found and fixed (test cleanup, not app logic):** the integration test's cleanup step originally deleted `relationships` and `chunks` with no filter — wiping the *entire* tables on every test run, including real seeded sample data. This silently destroyed the live app's graph traversal and vector search until the next full reseed, and was only caught because a live query in the running app returned empty `relationships`/`sources` right after running the integration test. This is why the integration test was subsequently rewritten to use a fully in-memory fake database (see §11) rather than a real one at all — scoping deletions correctly is a fragile fix; making the test structurally incapable of touching real data is the actual fix.

**Verification:** after both pipeline fixes, the assignment's Example 1 question returns all three team members, the decision content, who made it, and when. A second test — ingesting a new Notion page describing a hypothetical project reusing lessons from two existing projects — produced a correctly connected multi-hop answer citing the full decision chain with proposer, participants, and reasoning.

## 6. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite), `react-markdown` for rendering LLM answers |
| Backend | NestJS, service/repository separation per module (see §7 for known gaps) |
| Database | PostgreSQL + pgvector extension |
| ORM | Prisma |
| LLM | Gemini — direct API or Vertex AI (see §10), via LangChain JS |
| Auth | JWT (NestJS + Passport), single shared credential pair from env — no user table |
| Real integration | Notion API (internal integration token) |

## 7. What's incomplete / known issues

- **Vertex AI chat models are blocked by a confirmed upstream LangChain JS bug** (see §10) — the provider-switching architecture itself is implemented and correct; the specific chat models are not currently usable due to a third-party defect outside this project's control
- **Global graph view density** — can get visually cluttered at higher entity counts
- **Google Docs integration was built but is not the shipped real integration** (see §9) — the code exists (`src/google-docs/`) and is architecturally complete; auth could not be established within this assignment's time budget
- **No caching layer for repeated embedding calls** during entity resolution
- **Repository-pattern inconsistency** — `ingestion` and `google-docs` don't follow the same service/repository separation as the other modules
- **No answer caching/dedup** for repeated identical questions

## 8. Trade-offs

| Decision | Trade-off |
|---|---|
| Postgres+pgvector over Neo4j | Traversal capped at a few hops before SQL joins get unwieldy — acceptable at this scale |
| LLM-based extraction | Imperfect recall/precision — mitigated by a six-layer resolution pipeline (§4), not by trying to make extraction itself perfect |
| Notion over Google Docs as the real integration | See §9 |
| Direct API as the working LLM provider, Vertex AI implemented but blocked | See §10 |
| No auth beyond basic JWT, and only on write endpoints | Reads are intentionally public; only mutations are gated |
| No repository layer for ingestion/google-docs | Inconsistent with other modules' structure; acceptable trade given time constraints |
| Integration test uses a fully in-memory fake database, not a real one | Trades some realism (no real SQL execution, no real Postgres-specific behavior tested) for absolute safety — the test cannot touch real data under any circumstance, which a real-database approach could not guarantee even when carefully scoped, as demonstrated by two separate real incidents during development |

## 9. Why Notion instead of Google Docs

The original plan was Google Docs. Two independent Google Cloud auth obstacles made this impractical within the assignment's time budget on a personal/free-tier project:

1. **Service account key creation is blocked by an organization policy** requiring Organization Policy Administrator rights not available on this project.
2. **The OAuth fallback hit a separate wall**: "unverified app" and "restricted test user" protections, plus unreliable redirect/callback handling in the CLI tooling.

Notion's integration model is a static API token — no OAuth, no service accounts. Architecturally equivalent for this assignment's purposes (fetch external content, flatten to plain text, feed into the same `ingestDocument()` pipeline) and tested end-to-end successfully, including a one-click "Sources" page listing every page shared with the integration.

The Google Docs implementation (`src/google-docs/`) is left in the repository as evidence of the intended design.

## 10. LLM provider abstraction: implemented correctly, blocked by an upstream bug

After the assignment cohort was given a shared Vertex AI service account key, the LLM provider was refactored to support both the direct Gemini API and Vertex AI interchangeably, switched entirely via environment variables.

**Design (SOLID):** every service that needs a chat model or embeddings (`ExtractionService`, `QueryService`, `QueryAnalyzerService`, `EmbeddingsService`) depends on LangChain's abstract `BaseChatModel`/`Embeddings` types, injected via NestJS DI tokens (`CHAT_MODEL_MAIN`, `CHAT_MODEL_LITE`, `EMBEDDINGS_MODEL`), never a concrete provider class. `LlmModule` is the single factory that decides which concrete class to construct — `ChatVertexAI`/`VertexAIEmbeddings` if `GOOGLE_APPLICATION_CREDENTIALS` is set, otherwise `ChatGoogleGenerativeAI`/`GoogleGenerativeAIEmbeddings`. Adding a third provider means changing only this one file. This also fixed a pre-existing testability gap: `QueryService` previously constructed its chat model inline, un-mockable in tests; it's now injected like everything else.

**Bugs found and fixed during implementation** (documented as debugging process, not hidden):
- `ChatVertexAI`'s constructor does not accept a `project` field the way some other Google SDKs do — project ID is read automatically from the service account credentials file. Passing it explicitly caused a TypeScript compile error; fixed by removing it and verifying against LangChain's actual published `ChatVertexAIInput` interface rather than assuming a Python-SDK-style parameter shape.
- Passing `{ timeout }` as a second argument to `.invoke()` worked for `ChatGoogleGenerativeAI`, and was suspected (incorrectly, as it turned out) to be the cause of a crash under `ChatVertexAI`. Replaced with a provider-agnostic `Promise.race()` timeout wrapper regardless, since that approach doesn't depend on any provider's specific `.invoke()` option support — a strictly better design independent of the actual root cause below.

**Confirmed blocking issue — not fixable from this codebase:** calling `ChatVertexAI` with `gemini-2.5-flash` or `gemini-2.5-pro` throws `TypeError: Cannot read properties of undefined (reading 'message')` from deep inside `@langchain/core`'s own shared invoke-wrapping code, independent of any options passed (confirmed by removing the timeout option entirely and reproducing the identical crash, at the identical location). This is a confirmed, currently-open bug in LangChain JS itself:

**Source:** [github.com/langchain-ai/langchainjs/issues/8617](https://github.com/langchain-ai/langchainjs/issues/8617) — another developer independently reports the identical error and identical stack trace calling the identical models (`gemini-2.5-flash`/`gemini-2.5-pro` via `ChatVertexAI`), and explicitly confirms that upgrading `@langchain/google-vertexai` to its latest published version does not resolve it.

**Resolution:** rather than continue attempting to work around an unresolved third-party library defect, the direct Gemini API remains the primary, working, fully-tested provider. The Vertex AI code path is complete, correctly wired, and would work as soon as this upstream bug is fixed — switching providers requires zero code changes once that happens, only the `GOOGLE_APPLICATION_CREDENTIALS` environment variable.

## 11. How to run and test

See `README.md` for setup steps.

**Unit tests** (`RelationshipsService`, `ResolutionService`) are the highest-value automated tests, since these are the two places correctness bugs would silently produce duplicate or missing graph edges. Fully mocked, no external dependencies.

**Integration test** — deliberately rewritten to use a fully in-memory fake database (a plain JavaScript object standing in for Prisma) rather than a real one, after a real incident during development where a real-database integration test's cleanup step had a filtering bug and deleted live seeded data from the shared dev database — twice, with two different unfiltered `deleteMany()` calls, even after the first was "fixed" by adding a scope filter. The lesson taken from that: scoping deletions carefully is a fragile mitigation, not a real fix, when the underlying risk is "this test can touch real data at all." The rewritten version starts with an empty in-memory store every run and cannot touch anything real, structurally, regardless of any bug that might exist in the test itself. It still exercises the real pipeline wiring (`IngestionService` → `ResolutionService` → `RelationshipsService` → `QueryService` calling each other correctly) with fixed, deterministic mock responses standing in for the LLM/embedding calls.

Beyond automated tests, this system was manually verified against realistic scenarios using both the original sample data and freshly-authored content ingested live via the Notion integration, confirming the full cross-project decision-chain scenario the assignment's own examples describe.