/**
 * TypeScript client for YouTube Transcript API
 * Use this in your applications to interact with the scraper
 */

export interface YouTubeClient {
  scrapeVideo(videoUrl: string, storeInDB?: boolean): Promise<VideoResult>;
  scrapeChannel(channelUrl: string, options?: ScrapeChannelOptions): Promise<ChannelResult>;
  search(query: string, limit?: number): Promise<SearchResult>;
  chat(question: string, contextLimit?: number): Promise<ChatResult>;
  getStats(): Promise<StatsResult>;
}

export interface ScrapeChannelOptions {
  maxVideos?: number;
  storeInDB?: boolean;
}

export interface VideoResult {
  success: boolean;
  video: {
    videoId: string;
    title: string;
    url: string;
    chunksCount: number;
    transcriptLength: number;
  };
  chunks: Array<{
    id: string;
    text: string;
    timestamp: string;
  }>;
  stored: boolean;
}

export interface ChannelResult {
  success: boolean;
  videosProcessed: number;
  totalChunks: number;
  stored: boolean;
  videos: Array<{
    videoId: string;
    title: string;
    url: string;
    chunksCount: number;
  }>;
}

export interface SearchResult {
  success: boolean;
  query: string;
  resultsCount: number;
  results: Array<{
    videoId: string;
    videoTitle: string;
    videoUrl: string;
    text: string;
    timestamp: string;
    timestampUrl: string;
    similarity: number;
    metadata: Record<string, any>;
  }>;
}

export interface ChatResult {
  success: boolean;
  question: string;
  context: Array<{
    videoTitle: string;
    videoUrl: string;
    text: string;
    timestamp: string;
  }>;
  contextText: string;
  message: string;
}

export interface StatsResult {
  success: boolean;
  stats: {
    totalChunks: number;
    totalVideos: number;
    collectionName: string;
  };
}

export class YouTubeTranscriptClient implements YouTubeClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000/api') {
    this.baseUrl = baseUrl;
  }

  async scrapeVideo(videoUrl: string, storeInDB: boolean = true): Promise<VideoResult> {
    const response = await fetch(`${this.baseUrl}/youtube/scrape-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, storeInDB }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      throw new Error(`Failed to scrape video: ${error.message}`);
    }

    return response.json() as Promise<VideoResult>;
  }

  async scrapeChannel(
    channelUrl: string,
    options: ScrapeChannelOptions = {}
  ): Promise<ChannelResult> {
    const { maxVideos = 50, storeInDB = true } = options;

    const response = await fetch(`${this.baseUrl}/youtube/scrape-channel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelUrl, maxVideos, storeInDB }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      throw new Error(`Failed to scrape channel: ${error.message}`);
    }

    return response.json() as Promise<ChannelResult>;
  }

  async search(query: string, limit: number = 5): Promise<SearchResult> {
    const response = await fetch(`${this.baseUrl}/youtube/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      throw new Error(`Search failed: ${error.message}`);
    }

    return response.json() as Promise<SearchResult>;
  }

  async chat(question: string, contextLimit: number = 3): Promise<ChatResult> {
    const response = await fetch(`${this.baseUrl}/youtube/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, contextLimit }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      throw new Error(`Chat failed: ${error.message}`);
    }

    return response.json() as Promise<ChatResult>;
  }

  async getStats(): Promise<StatsResult> {
    const response = await fetch(`${this.baseUrl}/youtube/stats`);

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      throw new Error(`Failed to get stats: ${error.message}`);
    }

    return response.json() as Promise<StatsResult>;
  }
}

// Usage example
if (import.meta.main) {
  const client = new YouTubeTranscriptClient();

  // Example: Scrape and search
  console.log('YouTube Transcript Client - Example Usage\n');

  try {
    // Scrape a channel
    console.log('Scraping channel...');
    const channelResult = await client.scrapeChannel(
      'https://www.youtube.com/@IndieHackers',
      { maxVideos: 5 }
    );
    console.log(`✓ Scraped ${channelResult.videosProcessed} videos\n`);

    // Search for insights
    console.log('Searching for insights...');
    const searchResult = await client.search('What problems do users face?', 3);
    console.log(`✓ Found ${searchResult.resultsCount} results\n`);

    searchResult.results.forEach((result, i) => {
      console.log(`${i + 1}. ${result.videoTitle} (${result.timestamp})`);
      console.log(`   ${result.text.slice(0, 100)}...`);
      console.log(`   ${result.timestampUrl}\n`);
    });

    // Get stats
    const stats = await client.getStats();
    console.log(`Total chunks in database: ${stats.stats.totalChunks}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

export default YouTubeTranscriptClient;
