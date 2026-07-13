import { config } from '../config';

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export class JinaEmbeddings implements EmbeddingProvider {
  readonly name = 'jina-embeddings-v2-base-en';
  readonly dimension = 768;
  private apiKey: string;
  private apiUrl = 'https://api.jina.ai/v1/embeddings';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.jinaEmbeddingApiKey;
    if (!this.apiKey) {
      throw new Error('Jina API key is required for embeddings');
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.name,
      }),
    });

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((item) => item.embedding);
  }

  async embedQuery(text: string): Promise<number[]> {
    const embeddings = await this.embed([text]);
    return embeddings[0];
  }
}

// Demo-only hash embeddings. Not for production retrieval.
export class SimpleEmbeddings implements EmbeddingProvider {
  readonly name = 'simple-hash-demo';
  readonly dimension = 384;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(text => this.textToVector(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.textToVector(text);
  }

  private textToVector(text: string): number[] {
    const vector = new Array(this.dimension).fill(0);
    const normalized = text.toLowerCase();

    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const idx = (charCode * (i + 1)) % this.dimension;
      vector[idx] += 1 / (i + 1);
    }

    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(v => v / magnitude) : vector;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (config.useJinaEmbeddings && config.jinaEmbeddingApiKey) {
    console.log('Using Jina AI embeddings');
    return new JinaEmbeddings();
  }

  console.warn('Using simple hash-based embeddings (demo only)');
  console.warn('For production, set USE_JINA_EMBEDDINGS=true and provide JINA_EMBEDDING_API_KEY');
  return new SimpleEmbeddings();
}
