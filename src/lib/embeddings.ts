import { config } from '../config';

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export class JinaEmbeddings implements EmbeddingProvider {
  private apiKey: string;
  private apiUrl = 'https://api.jina.ai/v1/embeddings';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.jinaEmbeddingApiKey;
    if (!this.apiKey) {
      throw new Error('Jina API key is required for embeddings');
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model: 'jina-embeddings-v2-base-en',
        }),
      });

      if (!response.ok) {
        throw new Error(`Jina API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data.map((item: any) => item.embedding);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw error;
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    const embeddings = await this.embed([text]);
    return embeddings[0];
  }
}

// Simple embedding provider that uses a hash-based approach (for testing/demo)
export class SimpleEmbeddings implements EmbeddingProvider {
  private dimension = 384; // Match common embedding dimensions

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(text => this.textToVector(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.textToVector(text);
  }

  private textToVector(text: string): number[] {
    // Simple hash-based embedding for demo purposes
    // In production, use proper embeddings (Jina, OpenAI, or local models)
    const vector = new Array(this.dimension).fill(0);
    const normalized = text.toLowerCase();

    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const idx = (charCode * (i + 1)) % this.dimension;
      vector[idx] += 1 / (i + 1);
    }

    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(v => v / magnitude) : vector;
  }
}

// Factory function to get the appropriate embedding provider
export function getEmbeddingProvider(): EmbeddingProvider {
  if (config.useJinaEmbeddings && config.jinaEmbeddingApiKey) {
    console.log('Using Jina AI embeddings');
    return new JinaEmbeddings();
  }

  console.warn('Using simple hash-based embeddings (for demo only)');
  console.warn('For production, set USE_JINA_EMBEDDINGS=true and provide JINA_EMBEDDING_API_KEY');
  return new SimpleEmbeddings();
}
