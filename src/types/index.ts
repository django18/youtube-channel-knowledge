export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  markdown: string;
  links: string[];
  metadata: {
    scrapedAt: string;
    depth: number;
    statusCode?: number;
  };
}

export interface ScrapeJob {
  id: string;
  startUrl: string;
  maxDepth: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  visitedUrls: Set<string>;
  queuedUrls: Map<string, number>; // url -> depth
  results: ScrapedPage[];
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ChunkData {
  id: string;
  url: string;
  content: string;
  chunkIndex: number;
  metadata: Record<string, any>;
}

export interface SearchResult {
  id: string;
  url: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}

export interface ScrapeRequest {
  url: string;
  maxDepth?: number;
  respectRobots?: boolean;
  allowedDomains?: string[];
}

export interface SearchRequest {
  query: string;
  limit?: number;
  filter?: Record<string, any>;
}
