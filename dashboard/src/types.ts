export interface Stats {
  totalProcessed: number
  successful: number
  failed: number
  successRate: string
  totalChunks: number
}

export interface Video {
  videoId: string
  videoTitle: string
  scrapedAt: string
  chunksCount: number
  channelTitle?: string
}

export interface Channel {
  name: string
  url: string
  videoCount: number
  totalChunks: number
  videos: Video[]
}

export interface SearchResult {
  videoId: string
  videoTitle: string
  videoUrl: string
  text: string
  timestamp: string
  timestampUrl: string
  similarity: number
}
