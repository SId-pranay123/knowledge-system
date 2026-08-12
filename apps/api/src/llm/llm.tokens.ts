// DI tokens for injectable LLM/embeddings instances. Consuming services
// inject these tokens and depend on LangChain's abstract BaseChatModel /
// Embeddings types — never a concrete provider class directly. This is the
// Dependency Inversion piece: swapping providers means changing this
// module's factories only, not touching ExtractionService, QueryService,
// QueryAnalyzerService, or EmbeddingsService.
export const CHAT_MODEL_MAIN = 'CHAT_MODEL_MAIN';   // extraction + answer synthesis — needs more reasoning
export const CHAT_MODEL_LITE = 'CHAT_MODEL_LITE';   // query intent classification — cheap/fast task
export const EMBEDDINGS_MODEL = 'EMBEDDINGS_MODEL';