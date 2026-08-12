import { Global, Logger, Module } from '@nestjs/common';
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { ChatVertexAI, VertexAIEmbeddings } from '@langchain/google-vertexai';
import { CHAT_MODEL_MAIN, CHAT_MODEL_LITE, EMBEDDINGS_MODEL } from './llm.tokens';

const logger = new Logger('LlmModule');

// Single source of truth for "which LLM provider are we actually using."
// Vertex AI is selected automatically when GOOGLE_APPLICATION_CREDENTIALS is
// set (pointing at the service account key); otherwise falls back to the
// direct Gemini API key. This is the ONLY file that needs to change to add
// a third provider — every consuming service depends on LangChain's
// BaseChatModel/Embeddings abstract types, injected via the tokens below,
// never a concrete provider class.
function usingVertex(): boolean {
  return !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

function requireDirectApiKey(): string {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'No LLM provider configured. Set either GOOGLE_APPLICATION_CREDENTIALS (Vertex AI) or GEMINI_API_KEY (direct Gemini API) in apps/api/.env.',
    );
  }
  return process.env.GEMINI_API_KEY;
}

// Vertex AI's confirmed-working models differ from the direct API's — see
// the shared-key setup doc. Only gemini-2.5-flash / gemini-2.5-pro are
// confirmed for this Vertex project; default to flash everywhere (cheaper,
// shared quota across the whole cohort) unless overridden via env.
@Global()
@Module({
  providers: [
    {
      provide: CHAT_MODEL_MAIN,
      useFactory: () => {
        if (usingVertex()) {
          logger.log('Using Vertex AI for main chat model');
          // No `project` field here — ChatVertexAI reads the project ID
          // automatically from the service account JSON pointed to by
          // GOOGLE_APPLICATION_CREDENTIALS. Passing `project` directly is
          // not part of this package's actual constructor shape.
          return new ChatVertexAI({
            model: process.env.VERTEX_HEAVY_MODEL ?? 'gemini-2.5-flash',
            location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
            temperature: 0,
          });
        }
        logger.log('Using direct Gemini API for main chat model');
        return new ChatGoogleGenerativeAI({
          apiKey: requireDirectApiKey(),
          model: 'gemini-3.6-flash',
          temperature: 0,
          maxRetries: 2,
        });
      },
    },
    {
      provide: CHAT_MODEL_LITE,
      useFactory: () => {
        if (usingVertex()) {
          logger.log('Using Vertex AI for lite chat model');
          return new ChatVertexAI({
            model: process.env.VERTEX_LITE_MODEL ?? 'gemini-2.5-flash',
            location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
            temperature: 0,
          });
        }
        logger.log('Using direct Gemini API for lite chat model');
        return new ChatGoogleGenerativeAI({
          apiKey: requireDirectApiKey(),
          model: 'gemini-3.5-flash-lite',
          temperature: 0,
        });
      },
    },
    {
      provide: EMBEDDINGS_MODEL,
      useFactory: () => {
        if (usingVertex()) {
          logger.log('Using Vertex AI for embeddings');
          // NOTE: not confirmed whether an embeddings model is available
          // under this specific Vertex project — only the two chat models
          // were confirmed by the shared-key setup doc. If this throws a
          // 404 at runtime, that's this exact uncertainty surfacing.
          // Confirmed separately: gemini-embedding-001 outputs 3072
          // dimensions on BOTH the direct API and Vertex AI, so no
          // dimension-mismatch risk from switching providers, as long as
          // this model name stays the same on both sides.
          return new VertexAIEmbeddings({
            model: process.env.VERTEX_EMBEDDINGS_MODEL ?? 'gemini-embedding-001',
            location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
          });
        }
        logger.log('Using direct Gemini API for embeddings');
        return new GoogleGenerativeAIEmbeddings({
          apiKey: requireDirectApiKey(),
          model: 'gemini-embedding-001',
        });
      },
    },
  ],
  exports: [CHAT_MODEL_MAIN, CHAT_MODEL_LITE, EMBEDDINGS_MODEL],
})
export class LlmModule {}