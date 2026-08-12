import { Injectable, Inject } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { QueryIntentSchema } from './query.dto';
import { CHAT_MODEL_LITE } from '../llm/llm.tokens';

// Step 1 of the query pipeline: figure out which entities the question is
// about and what kind of question it is, before touching the DB.
// Injects the LITE chat model token — a cheaper/faster model is fine for
// this classification task; provider (direct API vs Vertex) is decided by
// LlmModule, not this service.
@Injectable()
export class QueryAnalyzerService {
  private readonly structuredModel;

  constructor(@Inject(CHAT_MODEL_LITE) chatModel: BaseChatModel) {
    this.structuredModel = (chatModel as any).withStructuredOutput(QueryIntentSchema);
  }

  async analyze(question: string) {
    return this.structuredModel.invoke(
      `Extract the entity names mentioned (people, projects, clients, decisions, topics) and classify intent.\nQuestion: "${question}"`,
    );
  }
}