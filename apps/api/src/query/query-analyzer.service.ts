import { Injectable } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { QueryIntentSchema } from './query.dto';

// Step 1 of the query pipeline: figure out which entities the question is
// about and what kind of question it is, before touching the DB.
@Injectable()
export class QueryAnalyzerService {
  private model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-1.5-flash', // cheaper/faster model is fine for this classification step
    temperature: 0,
  }).withStructuredOutput(QueryIntentSchema);

  async analyze(question: string) {
    return this.model.invoke(
      `Extract the entity names mentioned (people, projects, clients, decisions, topics) and classify intent.\nQuestion: "${question}"`,
    );
  }
}
