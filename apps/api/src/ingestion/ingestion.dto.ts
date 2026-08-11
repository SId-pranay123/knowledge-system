import { z } from 'zod';

// Structured output schema for the extraction LLM call.
// Forcing this shape avoids free-text parsing.
export const ExtractionSchema = z.object({
  entities: z.array(z.object({
    name: z.string(),
    type: z.enum(['person', 'client', 'project', 'decision', 'topic']),
    attributes: z.record(z.string()).optional(),
  })),
  relationships: z.array(z.object({
    sourceName: z.string(),
    relationshipType: z.string(),
    targetName: z.string(),
    context: z.string().optional(), // short quote/paraphrase supporting this edge
  })),
});

export type ExtractionResult = z.infer<typeof ExtractionSchema>;
