import { Injectable, Logger } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ExtractionSchema, ExtractionResult } from './ingestion.dto';

// Runs the entity + relationship extraction prompt over a document/chunk
// and returns structured, schema-validated output (no free-text parsing).
@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  private model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-3.6-flash',
    temperature: 0,
    maxRetries: 2,
  }).withStructuredOutput(ExtractionSchema);

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      this.logger.error(
        'GEMINI_API_KEY is not set. Check that apps/api/.env exists and contains it (root .env is NOT read by the API process).',
      );
    } else {
      this.logger.log(
        `GEMINI_API_KEY loaded (starts with "${process.env.GEMINI_API_KEY.slice(0, 6)}...", length ${process.env.GEMINI_API_KEY.length})`,
      );
    }
  }

  // knownEntityNames grounds extraction against already-existing graph nodes,
  // so the LLM reuses canonical names ("Internal Knowledge Base (v1)")
  // instead of inventing abbreviations/variants ("Internal KB") that
  // downstream resolution then has to guess how to merge. This is the fix
  // upstream of ResolutionService's fuzzy matching, not a replacement for it —
  // resolution still needs to exist for genuinely new documents with no
  // grounding context yet.
  async extract(documentText: string, sourceLabel: string, knownEntityNames: string[] = []): Promise<ExtractionResult> {
    const groundingBlock = knownEntityNames.length
      ? `\nKnown existing entities already in our system (people, projects, clients, decisions, topics):\n${knownEntityNames.join(', ')}\n\nIf a mention in the document refers to one of these, use the EXACT name above in your output — do not invent an abbreviation, nickname, or shortened variant of an existing entity.\n`
      : '';

    const prompt = `You are extracting structured knowledge from an internal company document.
Source: ${sourceLabel}
${groundingBlock}
Extract:
1. Entities mentioned: people, clients, projects, decisions, topics.
2. Relationships between them (e.g. WORKED_ON, HAS_DECISION, MADE_BY, INFLUENCED_BY, ABOUT, DISCUSSED_IN, SUPERSEDES).
   For each relationship include a short "context" snippet (<20 words) supporting it.

Only extract entities and relationships explicitly stated or clearly implied in the document text.
Do not create an entity for the document itself, its title, or its author's opinions/vision as a
standalone "project" or "topic" — only extract the real people/projects/clients/decisions/topics
the document discusses.

Document:
"""
${documentText}
"""`;

    this.logger.log(`Extracting from "${sourceLabel}" (${documentText.length} chars, ${knownEntityNames.length} known entities for grounding)...`);
    try {
      // Explicit timeout: on free-tier quota or network issues, a hung request
      // otherwise blocks the whole ingestion/seed run indefinitely with no error.
      const result = await this.model.invoke(prompt, { timeout: 30_000 });
      this.logger.log(`Extracted ${result.entities.length} entities, ${result.relationships.length} relationships from "${sourceLabel}"`);
      return result;
    } catch (err: any) {
      if (err?.message?.includes('API_KEY_INVALID') || err?.message?.includes('API key not valid')) {
        this.logger.error(
          `Gemini rejected the API key while processing "${sourceLabel}". The key in apps/api/.env is invalid or malformed — regenerate it in AI Studio and re-copy carefully (no trailing spaces/newlines).`,
        );
      } else if (err?.message?.toLowerCase().includes('quota') || err?.message?.includes('429')) {
        this.logger.error(`Gemini rate limit hit while processing "${sourceLabel}". Wait a minute and re-run — already-ingested docs will be skipped via delta detection.`);
      } else {
        this.logger.error(`Extraction failed for "${sourceLabel}": ${err?.message ?? err}`);
      }
      throw err; // still propagate — ingestDocument relies on this to avoid persisting a half-processed document
    }
  }
}