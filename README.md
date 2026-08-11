# Knowledge Graph Assignment

Connected knowledge management system for a small consulting team. NestJS + React + PostgreSQL/pgvector + Gemini + LangChain.

## Stack
- API: NestJS (TypeScript), Prisma ORM
- DB: PostgreSQL with pgvector extension (single database — structured data + vector search)
- LLM: Gemini (extraction, query analysis, answer synthesis), via LangChain JS
- Frontend: React + Vite

## Repo layout
```
apps/api      NestJS backend
apps/web      React frontend
packages/shared-types   shared DTOs
```

## Setup

1. Copy env file:
   ```
   cp .env.example .env
   ```
   Fill in `GEMINI_API_KEY`.

2. Start Postgres (pgvector-enabled image):
   ```
   npm run db:up
   ```

3. Install dependencies:
   ```
   npm install
   ```

4. Run migrations:
   ```
   npm run db:migrate
   ```

5. Start the API:
   ```
   npm run dev:api
   ```

6. Start the frontend:
   ```
   npm run dev:web
   ```

## What's built vs stubbed
- Full CRUD reference: `people` module (replicate this pattern for clients/projects/documents/decisions/topics — same shape, swap the Prisma model)
- Full graph core: `relationships` module (upsert-on-create, 1-2 hop traversal)
- Full ingestion pipeline: `ingestion` module (delta detection via content hash → LLM extraction → entity resolution → relationship upsert → chunk + embed)
- Full query pipeline: `query` module (question analysis → entity resolution → graph traversal → vector search → synthesis with citations)
- Frontend: only the "Ask AI" page is wired end-to-end; Dashboard/Explorer/Entity Detail/Graph pages are still to build

## Design document
See `DESIGN.md` for architecture rationale, trade-offs, and data model.
