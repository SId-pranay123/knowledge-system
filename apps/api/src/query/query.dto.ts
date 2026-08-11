import { IsString } from 'class-validator';
import { z } from 'zod';

export class AskQuestionDto {
  @IsString() question!: string;
}

// Structured output for the query-analyzer LLM call
export const QueryIntentSchema = z.object({
  entities: z.array(z.string()), // entity names mentioned in the question
  intent: z.string(),            // e.g. "project_summary", "decision_lineage", "exploration"
});
export type QueryIntent = ReturnType<typeof QueryIntentSchema.parse>;
