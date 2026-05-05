export const config = {
  // Server config
  port: parseInt(process.env.PORT || '3000'),

  // Jina.ai config
  jinaReaderUrl: 'https://r.jina.ai/',
  jinaApiKey: process.env.JINA_API_KEY || '', // Optional for basic usage

  // ChromaDB config
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  collectionName: process.env.COLLECTION_NAME || 'scraped_content',

  // Scraper config
  maxDepth: parseInt(process.env.MAX_DEPTH || '3'),
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '5'),
  requestDelay: parseInt(process.env.REQUEST_DELAY || '1000'), // ms
  userAgent: 'Mozilla/5.0 (compatible; CustomScraper/1.0)',

  // Embedding config
  embeddingModel: process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2', // Local transformers.js model
  useJinaEmbeddings: process.env.USE_JINA_EMBEDDINGS === 'true',
  jinaEmbeddingApiKey: process.env.JINA_EMBEDDING_API_KEY || '',

  // Vector DB config
  chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),

  // YouTube config
  youtubeCollectionName: process.env.YOUTUBE_COLLECTION_NAME || 'youtube_transcripts',
};
