# Knowledge Graph Assignment

A connected knowledge management system for a small consulting team. Built with NestJS, React, PostgreSQL + pgvector, Gemini, and LangChain JS.

See `DESIGN.md` for the full architecture writeup, trade-offs, and reasoning behind every major decision. This README is about getting the system running and understanding what each part does.

Commands below are shown for both **npm** and **yarn** — use whichever you have installed, don't mix them within the same setup.

## What this system does

- Stores people, projects, clients, documents, decisions, and topics as a connected graph, not isolated records
- Answers questions using relationships between entities, not just keyword/document matching (e.g. "who worked on Project X and what was decided" returns the team, the decision, who made it, and when — not just a matching document)
- Ingests unstructured content (markdown, Slack exports, Notion pages) via LLM extraction, resolving mentions to existing entities instead of creating duplicates
- Supports incremental updates — adding new content never requires reprocessing what's already there
- Provides a chat-style interface with persistent history, like Claude/ChatGPT

## Stack

| Layer | Choice |
|---|---|
| Frontend | React (Vite) |
| Backend | NestJS (TypeScript) |
| Database | PostgreSQL + pgvector extension |
| ORM | Prisma |
| LLM | Gemini — direct API or Vertex AI (see below), via LangChain JS |
| Auth | JWT (NestJS + Passport) |
| Real integration | Notion API |

**Why Node/NestJS instead of Python** (the more common choice for AI/LLM-heavy backends): this is primarily a backend engineering exercise — CRUD, a graph data model, an ingestion pipeline, a REST API — with LLM calls as one component within it, not a data-science or ML-training workload where Python's ecosystem would be a clear advantage. Every LLM interaction here is a REST call to Gemini via LangChain's JS SDK, which has equivalent capabilities to its Python counterpart for this use case. NestJS's module system also maps cleanly onto this domain — each entity type and each pipeline stage (ingestion, resolution, query) becomes its own module with clear boundaries.

## Prerequisites

- Node.js 18+
- npm or yarn
- Docker (for Postgres)
- A Gemini API key — get one free at [aistudio.google.com](https://aistudio.google.com/apikey) (or a Vertex AI service account key — see "LLM provider" below, though see the known limitation there too)

## Setup

### 1. Clone and install
```bash
# npm
npm install

# yarn
yarn install
```
This installs both `apps/api` and `apps/web` via workspaces.

### 2. Environment variables

Create `.env` in **both** the repo root and `apps/api/` (NestJS reads from `apps/api/.env` specifically — a root-level `.env` is not picked up by the API process):

```
DATABASE_URL=postgresql://kg_user:kg_pass@localhost:5432/kg_db
GEMINI_API_KEY=your_gemini_api_key_here
JWT_SECRET=change_me
AUTH_USERNAME=admin
AUTH_PASSWORD=change_me
PORT=3000

# Optional — only needed to test the Notion integration (see below)
NOTION_API_KEY=

# Optional — see "LLM provider" section below (Vertex AI has a known blocking issue)
GOOGLE_APPLICATION_CREDENTIALS=
GOOGLE_CLOUD_LOCATION=

# Optional — only relevant if using the Google service account key setup
# for Docs specifically (see DESIGN.md §9 for why this isn't the primary
# integration)
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=
```

### 3. LLM provider: direct API key vs Vertex AI

This system supports two interchangeable Gemini providers, switched entirely via environment variables — no code changes needed either way.

**Direct API key (default, and currently the only fully working option)** — set `GEMINI_API_KEY`, leave `GOOGLE_APPLICATION_CREDENTIALS` unset. Uses `gemini-3.6-flash` / `gemini-3.5-flash-lite` / `gemini-embedding-001`.

**Vertex AI** — set `GOOGLE_APPLICATION_CREDENTIALS` to the path of a Google Cloud service account JSON key file. When set, it takes priority over `GEMINI_API_KEY` entirely. Uses `gemini-2.5-flash` for both chat roles by default, and `gemini-embedding-001` for embeddings.

```
GOOGLE_APPLICATION_CREDENTIALS=./path-to-your-service-account-key.json
GOOGLE_CLOUD_LOCATION=us-central1        # optional, defaults to us-central1
VERTEX_HEAVY_MODEL=gemini-2.5-flash      # optional override
VERTEX_LITE_MODEL=gemini-2.5-flash       # optional override
VERTEX_EMBEDDINGS_MODEL=gemini-embedding-001  # optional override
```

**Known blocking issue:** Vertex AI's chat models (`gemini-2.5-flash`/`gemini-2.5-pro` via `ChatVertexAI`) currently throw `TypeError: Cannot read properties of undefined (reading 'message')` on every call. This is a confirmed, currently-open bug in LangChain JS itself — see [github.com/langchain-ai/langchainjs/issues/8617](https://github.com/langchain-ai/langchainjs/issues/8617), where another developer reports the identical error and stack trace calling the identical models, and confirms upgrading `@langchain/google-vertexai` to its latest version does not fix it. The provider-switching code here is implemented and correctly wired (see `apps/api/src/llm/llm.module.ts`) — this is a third-party library defect, not a bug in this codebase. Use the direct API key until that upstream issue is resolved.

This is implemented in `apps/api/src/llm/llm.module.ts` — the only file that constructs a concrete provider class. Every service that needs a chat model or embeddings (`ExtractionService`, `QueryService`, `QueryAnalyzerService`, `EmbeddingsService`) depends on LangChain's abstract `BaseChatModel`/`Embeddings` types, injected via NestJS DI tokens, and has no knowledge of which provider is actually active.

### 4. Start Postgres
```bash
# npm
npm run db:up

# yarn
yarn db:up
```
Runs a `pgvector/pgvector:pg16` Docker image with the `vector` extension pre-installed.

### 5. Run migrations
```bash
# npm
npm run db:migrate -w apps/api

# yarn
yarn workspace api run prisma:migrate
```
Creates all tables: `people`, `clients`, `projects`, `documents`, `chunks`, `decisions`, `topics`, `relationships`, `conversations`, `messages`.

### 6. Seed the database
```bash
# npm
npm run prisma:seed -w apps/api

# yarn
yarn workspace api run prisma:seed
```
This does two things:
- Inserts the structured sample data (`people.json`, `clients.json`, `projects.json`, `decisions.json`, `topics.json`) directly, including their explicit relationships (who worked on what, who made which decision)
- Runs the unstructured sample documents (markdown files, Slack export) through the real LLM extraction pipeline — this is where relationships that only exist in prose get discovered (e.g. one project's lessons influencing another)

**This step calls the Gemini API repeatedly** (once per document for extraction, once per chunk for embeddings). On the free tier this can hit daily rate limits — if a run stops partway with a 429 error, it's safe to just re-run the same command later; already-ingested documents are skipped automatically (delta detection via content hash), so it picks up where it left off.

**Sample data location**: the seed script expects a `sample-data/` folder at the repo root, containing the structured JSON files, a `documents/` subfolder of markdown files, and a `slack-exports/` subfolder. Set `SAMPLE_DATA_DIR` in `.env` if it's located elsewhere.

### 7. Start the API and frontend
```bash
# npm — in two separate terminals
npm run dev:api
npm run dev:web

# yarn — in two separate terminals
yarn dev:api
yarn dev:web
```
API runs on `http://localhost:3000`, frontend on whatever port Vite assigns (shown in terminal, typically `http://localhost:5173`).

## Using the app

Open the frontend URL. All read operations (browsing entities, viewing the graph, asking questions) work without logging in. Logging in (top-right of the nav bar, using `AUTH_USERNAME`/`AUTH_PASSWORD` from your `.env`) is only required for write operations — creating/editing/deleting records, or triggering document ingestion.

**Pages:**
- **Dashboard** — entity counts, quick links
- **Explorer** — browse and search all entities by type
- **Entity Detail** — one entity's fields plus its connections (click through to related entities)
- **Full Graph** — the whole knowledge graph visualized at once, force-directed layout, click a node to view its details
- **Ask AI** — chat interface with persistent history (sidebar of past conversations, like Claude/ChatGPT); each question is answered by combining graph traversal with document search
- **Sources** — lists every Notion page shared with the app's integration, with a one-click "Ingest" button (see below)

## Adding your own content

### Option A: Notion (the real external integration for this assignment)

This is a **static API token integration**, not OAuth — no service account, no cloud console setup. Setup takes about 2 minutes:

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → "New integration" → give it a name → select "Access token" as the authentication method → create it
2. Copy the integration's secret token (starts with `secret_` or `ntn_`)
3. Set `NOTION_API_KEY=<that token>` in `apps/api/.env`, restart the API
4. In Notion, open any page you want the system to know about → click the "•••" menu (top right) → "Connections" → add the integration you just created
5. In the app, log in, then go to the **Sources** page — it lists every page shared with the integration, showing whether it's already been ingested
6. Click "Ingest" next to a page — this fetches its content, runs it through the same extraction/resolution/chunking pipeline as the sample data, and adds it to the graph

**Why Notion instead of Google Docs** (the assignment's suggested example): full reasoning is in `DESIGN.md` §9, but in short — Google's service-account and OAuth setup hit organization-policy and app-verification walls that require elevated cloud admin permissions not available on a personal/free-tier project. Notion's token-based model has no equivalent friction. The Google Docs integration code still exists in the repo (`apps/api/src/google-docs/`) as a complete, correct implementation — it's the auth layer specifically that couldn't be resolved within scope, not the integration logic.

### Option B: direct API call
```bash
curl -X POST http://localhost:3000/api/ingest/document \
  -H "Authorization: Bearer <your JWT from /api/auth/login>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Some doc", "content": "...", "sourceType": "MANUAL"}'
```

## What each part of the system does

**LLM provider abstraction** (`apps/api/src/llm/`): decides once, at startup, whether to use the direct Gemini API or Vertex AI, based on which environment variables are set. Every other service depends on LangChain's abstract chat/embeddings types, not a concrete provider class — see "LLM provider" above.

**Ingestion pipeline** (`apps/api/src/ingestion/`): the core "turn a document into graph data" logic.
- `ingestion.service.ts` — orchestrates the full flow: hash → delta-check → extract → resolve → persist relationships → chunk → embed
- `extraction.service.ts` — calls the injected chat model to pull structured entities/relationships out of raw text, grounded against already-known entity names to reduce duplicate/renamed entities
- `resolution.service.ts` — decides whether a mentioned entity is one that already exists (via six layered matching strategies: exact match, alias match, substring, acronym, token-overlap, embedding similarity) or genuinely new — shared by both ingestion and query answering
- `chunking.service.ts` — splits document text into overlapping pieces for embedding/vector search, separate from the whole-document extraction step above

**Query pipeline** (`apps/api/src/query/`): the "answer a question" logic.
- `query-analyzer.service.ts` — figures out which entities a question is actually about
- `query.service.ts` — resolves those entities (using the *same* matching logic as ingestion), traverses the graph 1–2 hops from each, searches document chunks by embedding similarity, and asks the injected chat model to synthesize an answer from both

**The graph itself**: one table, `relationships`, with `(sourceType, sourceId) --relationshipType--> (targetType, targetId)` rows. Every entity type (person, project, client, decision, topic) can be a source or target of any relationship — this is what lets the system represent arbitrary connections without a rigid predefined schema.

**Chat history** (`apps/api/src/conversations/`): each question/answer pair is persisted with the resolved entities/relationships/sources from that specific run. Revisiting a past conversation is a plain database read — no LLM calls are re-run.

## Running tests

```bash
# npm
npm test -w apps/api
npm run test:integration -w apps/api

# yarn
yarn workspace api test
yarn workspace api test:integration
```

- `test` — fast unit tests (`RelationshipsService`, `ResolutionService`), fully mocked, no external dependencies.
- `test:integration` — exercises the ingestion → resolution → relationship → query pipeline wiring using a fully in-memory fake database and fixed mock LLM responses. **Does not connect to any real database and does not make any real API call of any kind** — it starts with an empty in-memory store, runs entirely in-process, and discards everything when finished. No Postgres needs to be running, no API key is needed, no `.env` values matter for this command. (An earlier version of this test connected to a real database for its assertions and had a cleanup bug that deleted real seeded data — it was rewritten to be fully self-contained specifically to make that category of incident structurally impossible, not just less likely.)

## Known limitations

See `DESIGN.md` §7 for the full list. The short version: Vertex AI's chat models are blocked by a confirmed upstream LangChain JS bug (direct API key works fully), the global graph view can get visually dense with many entities, there's no caching for repeated identical questions, and two backend modules (`ingestion`, `google-docs`) don't yet follow the same service/repository separation the rest of the codebase uses.