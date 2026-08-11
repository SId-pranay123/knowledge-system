import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

// Thin wrapper around Gemini embeddings. Kept behind an interface so swapping
// providers later (e.g. to OpenAI) only touches this one file.
//
// NOTE: gemini-embedding-001 outputs 3072-dim vectors by default. The
// chunks.embedding column in schema.prisma is vector(3072) to match — if you
// ever change this model, update both places together (see also
// resolution.service.ts, which relies on the same dimensionality implicitly).
@Injectable()
export class EmbeddingsService {
  private embedder = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-embedding-001',
  });

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