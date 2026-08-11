import { Injectable } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ExtractionSchema, ExtractionResult } from './ingestion.dto';

// Runs the entity + relationship extraction prompt over a document/chunk
// and returns structured, schema-validated output (no free-text parsing).
@Injectable()
export class ExtractionService {
  private model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-1.5-pro',
    temperature: 0,
  }).withStructuredOutput(ExtractionSchema);

  async extract(documentText: string, sourceLabel: string): Promise<ExtractionResult> {
    const prompt = `You are extracting structured knowledge from an internal company document.
Source: ${sourceLabel}

Extract:
1. Entities mentioned: people, clients, projects, decisions, topics.
2. Relationships between them (e.g. WORKED_ON, HAS_DECISION, MADE_BY, INFLUENCED_BY, ABOUT, DISCUSSED_IN, SUPERSEDES).
   For each relationship include a short "context" snippet (<20 words) supporting it.

Only extract what is explicitly stated or clearly implied. Do not invent entities.

Document:
"""
${documentText}
"""`;

    return this.model.invoke(prompt);
  }
}
