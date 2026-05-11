export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000'),

  // ChromaDB
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',

  // Chunking (transcript chunks)
  chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),

  // Embedding
  embeddingModel: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2',
  useJinaEmbeddings: process.env.USE_JINA_EMBEDDINGS === 'true',
  jinaEmbeddingApiKey: process.env.JINA_EMBEDDING_API_KEY || '',

  // YouTube collection in Chroma
  youtubeCollectionName: process.env.YOUTUBE_COLLECTION_NAME || 'youtube_transcripts',

  // Neo4j
  neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4jUser: process.env.NEO4J_USER || 'neo4j',
  neo4jPassword: process.env.NEO4J_PASSWORD || 'password',

  // Eval
  evalOutputDir: process.env.EVAL_OUTPUT_DIR || './eval/results',
  evalGoldenPath: process.env.EVAL_GOLDEN_PATH || './eval/golden.jsonl',
};
