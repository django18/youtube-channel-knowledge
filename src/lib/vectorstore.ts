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
    this.collection = await this.client.getOrCreateCollection({
      name: config.collectionName,
      metadata: {
        description: 'Scraped web content with embeddings',
        'hnsw:space': 'cosine',
        provider: this.embeddings.name,
        dimension: this.embeddings.dimension,
      },
    });

    await this.assertProviderMatch();
    console.log(`ChromaDB collection '${config.collectionName}' initialized (${this.embeddings.name}, dim=${this.embeddings.dimension})`);
  }

  /**
   * If collection was created with a different embedding provider/dim, fail fast.
   * Mixing dimensions in one collection corrupts retrieval.
   */
  private async assertProviderMatch(): Promise<void> {
    if (!this.collection) return;
    const meta = (this.collection as any).metadata ?? {};
    const storedProvider = meta.provider;
    const storedDim = meta.dimension;

    if (storedProvider && storedProvider !== this.embeddings.name) {
      throw new Error(
        `Collection '${config.collectionName}' was created with provider '${storedProvider}' but current is '${this.embeddings.name}'. ` +
        `Switching providers mid-collection corrupts retrieval. Either revert provider or recreate the collection.`
      );
    }
    if (storedDim && storedDim !== this.embeddings.dimension) {
      throw new Error(
        `Collection '${config.collectionName}' dimension is ${storedDim} but provider yields ${this.embeddings.dimension}. ` +
        `Recreate the collection.`
      );
    }
  }

  async addPages(pages: ScrapedPage[]): Promise<void> {
    if (!this.collection) await this.initialize();
    console.log(`Processing ${pages.length} pages for vector storage...`);
    for (const page of pages) {
      await this.addPage(page);
    }
    console.log('All pages added to vector store');
  }

  /**
   * Delete-then-add to keep re-scrapes clean. Without this, if a page shrinks
   * from 12 chunks to 8 chunks on re-scrape, chunks 8..11 of the old version
   * remain in the index forever.
   */
  async addPage(page: ScrapedPage): Promise<void> {
    if (!this.collection) await this.initialize();
    if (!this.collection) throw new Error('Collection not initialized');

    await this.deleteByUrl(page.url).catch(() => {});

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

    const texts = chunkData.map(c => c.content);
    const embeddings = await this.embeddings.embed(texts);

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
    if (!this.collection) await this.initialize();
    if (!this.collection) throw new Error('Collection not initialized');

    const queryEmbedding = await this.embeddings.embedQuery(query);

    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
      where: filter,
    });

    const searchResults: SearchResult[] = [];

    if (results.ids && results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        const distance = results.distances?.[0]?.[i];
        // Cosine distance -> similarity. Matches youtube-vectorstore convention.
        const score = distance !== undefined && distance !== null ? 1 - distance : 0;
        searchResults.push({
          id: results.ids[0][i],
          url: (results.metadatas?.[0]?.[i]?.url as string) || '',
          content: (results.documents?.[0]?.[i] as string) || '',
          score,
          metadata: (results.metadatas?.[0]?.[i] as Record<string, any>) || {},
        });
      }
    }

    return searchResults;
  }

  async deleteByUrl(url: string): Promise<void> {
    if (!this.collection) await this.initialize();
    if (!this.collection) throw new Error('Collection not initialized');

    await this.collection.delete({ where: { url } });
  }

  async getStats(): Promise<any> {
    if (!this.collection) await this.initialize();
    if (!this.collection) return { count: 0 };

    const count = await this.collection.count();

    return {
      collectionName: config.collectionName,
      totalChunks: count,
      provider: this.embeddings.name,
      dimension: this.embeddings.dimension,
    };
  }

  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    const { chunkSize, chunkOverlap } = config;

    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

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

      if (start < text.length) {
        start -= chunkOverlap;
      }
    }

    return chunks.filter(chunk => chunk.length > 0);
  }
}
