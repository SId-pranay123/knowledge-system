import { Injectable, Inject } from '@nestjs/common';
import type { Embeddings } from '@langchain/core/embeddings';
import { EMBEDDINGS_MODEL } from '../llm/llm.tokens';

// Thin wrapper around whichever embeddings provider LlmModule constructed
// (direct Gemini API or Vertex AI) — this service and everything that calls
// it never knows which one is active; it depends only on LangChain's
// abstract Embeddings type, injected via the EMBEDDINGS_MODEL token.
//
// NOTE on dimensionality: gemini-embedding-001 outputs 3072-dim vectors by
// default on the direct API. If Vertex AI's version of this model (or
// whatever embeddings model ends up configured there) outputs a different
// dimension, the chunks.embedding column (vector(3072) in schema.prisma)
// and any inserts will fail with a dimension-mismatch error — the same
// class of issue hit earlier when the model was first changed. If switching
// to Vertex embeddings, verify the output dimension before assuming it's
// still 3072.
@Injectable()
export class EmbeddingsService {
  constructor(@Inject(EMBEDDINGS_MODEL) private embedder: Embeddings) {}

  async embed(text: string): Promise<number[]> {
    return this.embedder.embedQuery(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.embedder.embedDocuments(texts);
  }

  // Cosine similarity — used for entity resolution (comparing a new entity
  // mention against existing nodes of the same type before creating a duplicate).
  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}