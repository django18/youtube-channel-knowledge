export interface SearchResult {
  id: string;
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  content: string;
  score: number;
  startTime?: number;
  endTime?: number;
  timestamp?: string;
  metadata: Record<string, any>;
}
