import { Injectable, Inject, Logger } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ExtractionSchema, ExtractionResult } from './ingestion.dto';
import { CHAT_MODEL_MAIN } from '../llm/llm.tokens';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)),
  ]);
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  private readonly structuredModel;

  constructor(@Inject(CHAT_MODEL_MAIN) chatModel: BaseChatModel) {
    this.structuredModel = (chatModel as any).withStructuredOutput(ExtractionSchema);
  }

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
      const result = (await withTimeout(this.structuredModel.invoke(prompt), 30_000, sourceLabel)) as ExtractionResult;
      this.logger.log(`Extracted ${result.entities.length} entities, ${result.relationships.length} relationships from "${sourceLabel}"`);
      return result;
    } catch (err: any) {
      if (err?.message?.includes('API_KEY_INVALID') || err?.message?.includes('API key not valid')) {
        this.logger.error(`Gemini rejected the API key while processing "${sourceLabel}". Check apps/api/.env.`);
      } else if (err?.message?.toLowerCase().includes('quota') || err?.message?.includes('429')) {
        this.logger.error(`Rate limit hit while processing "${sourceLabel}". Wait and re-run — already-ingested docs are skipped via delta detection.`);
      } else if (err?.message?.includes('404') || err?.message?.toLowerCase().includes('not found')) {
        this.logger.error(`Model not found while processing "${sourceLabel}" — check the configured model name is valid for the active provider (direct API vs Vertex AI have different confirmed-working model names).`);
      } else {
        this.logger.error(`Extraction failed for "${sourceLabel}": ${err?.message ?? err}`);
      }
      throw err;
    }
  }
}