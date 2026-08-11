import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

// Thin wrapper around Gemini embeddings. Kept behind an interface so swapping
// providers later (e.g. to OpenAI) only touches this one file.
@Injectable()
export class EmbeddingsService {
  private embedder = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'text-embedding-004',
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
