import { ChromaClient, Collection } from 'chromadb';
import { config } from '../config';
import { getEmbeddingProvider, type EmbeddingProvider } from './embeddings';
import type { ScrapedPage, ChunkData, SearchResult } from '../types';

export class VectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embeddings: EmbeddingProvider;

  constructor() {
    this.client = new ChromaClient({ path: config.chromaUrl });
    this.embeddings = getEmbeddingProvider();
  }

  async initialize(): Promise<void> {
    try {
      // Get or create collection
      this.collection = await this.client.getOrCreateCollection({
        name: config.collectionName,
        metadata: {
          description: 'Scraped web content with embeddings',
          'hnsw:space': 'cosine'
        },
      });

      console.log(`ChromaDB collection '${config.collectionName}' initialized`);
    } catch (error) {
      console.error('Error initializing ChromaDB:', error);
      throw error;
    }
  }

  async addPages(pages: ScrapedPage[]): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }

    console.log(`Processing ${pages.length} pages for vector storage...`);

    for (const page of pages) {
      await this.addPage(page);
    }

    console.log('All pages added to vector store');
  }

  async addPage(page: ScrapedPage): Promise<void> {
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    // Split content into chunks
    const chunks = this.splitIntoChunks(page.content);

    const chunkData: ChunkData[] = chunks.map((chunk, index) => ({
      id: `${page.url}_chunk_${index}`,
      url: page.url,
      content: chunk,
      chunkIndex: index,
      metadata: {
        ...page.metadata,
        title: page.title,
        totalChunks: chunks.length,
      },
    }));

    // Generate embeddings for all chunks
    const texts = chunkData.map(c => c.content);
    const embeddings = await this.embeddings.embed(texts);

    // Add to ChromaDB
    await this.collection.add({
      ids: chunkData.map(c => c.id),
      embeddings,
      documents: texts,
      metadatas: chunkData.map(c => ({
        url: c.url,
        chunkIndex: c.chunkIndex,
        title: c.metadata.title,
        scrapedAt: c.metadata.scrapedAt,
        depth: c.metadata.depth,
        totalChunks: c.metadata.totalChunks,
      })),
    });

    console.log(`Added ${chunks.length} chunks from ${page.url}`);
  }

  async search(query: string, limit: number = 10, filter?: Record<string, any>): Promise<SearchResult[]> {
    if (!this.collection) {
      await this.initialize();
    }

    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    // Generate query embedding
    const queryEmbedding = await this.embeddings.embedQuery(query);

    // Search in ChromaDB
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      where: filter,
    });

    // Format results
    const searchResults: SearchResult[] = [];

    if (results.ids && results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        searchResults.push({
          id: results.ids[0][i],
          url: results.metadatas?.[0]?.[i]?.url as string || '',
          content: results.documents?.[0]?.[i] as string || '',
          score: results.distances?.[0]?.[i] || 0,
          metadata: results.metadatas?.[0]?.[i] as Record<string, any> || {},
        });
      }
    }

    return searchResults;
  }

  async deleteByUrl(url: string): Promise<void> {
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }

    // Delete all chunks from this URL
    await this.collection.delete({
      where: { url },
    });

    console.log(`Deleted all chunks from ${url}`);
  }

  async getStats(): Promise<any> {
    if (!this.collection) {
      await this.initialize();
    }

    if (!this.collection) {
      return { count: 0 };
    }

    const count = await this.collection.count();

    return {
      collectionName: config.collectionName,
      totalChunks: count,
    };
  }

  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    const { chunkSize, chunkOverlap } = config;

    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

      // Try to break at sentence boundary
      if (end < text.length) {
        const lastPeriod = chunk.lastIndexOf('.');
        const lastNewline = chunk.lastIndexOf('\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);

        if (breakPoint > chunkSize / 2) {
          chunk = chunk.slice(0, breakPoint + 1);
          start += breakPoint + 1;
        } else {
          start = end;
        }
      } else {
        start = end;
      }

      chunks.push(chunk.trim());

      // Apply overlap for next chunk
      if (start < text.length) {
        start -= chunkOverlap;
      }
    }

    return chunks.filter(chunk => chunk.length > 0);
  }
}
