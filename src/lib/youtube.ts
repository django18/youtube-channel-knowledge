import { YoutubeTranscript } from 'youtube-transcript';

export interface VideoMetadata {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration: string;
  viewCount: string;
  likeCount: string;
  thumbnailUrl: string;
  url: string;
}

export interface TranscriptSegment {
  text: string;
  offset: number; // milliseconds
  duration: number; // milliseconds
  timestamp: string; // formatted as HH:MM:SS
}

export interface ProcessedTranscript {
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  fullTranscript: string;
  segments: TranscriptSegment[];
  chunks: TranscriptChunk[];
}

export interface TranscriptChunk {
  id: string;
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  text: string;
  startTime: number; // milliseconds
  endTime: number;
  timestamp: string;
  chunkIndex: number;
  metadata: Record<string, any>;
}

/**
 * Extract video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  // If it's already just the video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }

  return null;
}

/**
 * Extract channel ID/username from YouTube URL
 */
export function extractChannelIdentifier(url: string): string | null {
  const patterns = [
    /youtube\.com\/@([a-zA-Z0-9_-]+)/,
    /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/c\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/user\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Format milliseconds to HH:MM:SS timestamp
 */
export function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Fetch transcript for a single video
 */
export async function fetchVideoTranscript(
  videoId: string
): Promise<TranscriptSegment[]> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    return transcript.map((item) => ({
      text: item.text,
      offset: item.offset,
      duration: item.duration,
      timestamp: formatTimestamp(item.offset),
    }));
  } catch (error) {
    throw new Error(`Failed to fetch transcript for video ${videoId}: ${error}`);
  }
}

/**
 * Fetch video metadata using YouTube's oEmbed API (no API key required)
 */
export async function fetchVideoMetadata(
  videoId: string
): Promise<Partial<VideoMetadata>> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      throw new Error(`oEmbed API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    return {
      videoId,
      title: data.title,
      channelTitle: data.author_name,
      thumbnailUrl: data.thumbnail_url,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch (error) {
    console.warn(`Could not fetch metadata for ${videoId}:`, error);
    return {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }
}

/**
 * Chunk transcript into manageable pieces with overlap
 */
export function chunkTranscript(
  segments: TranscriptSegment[],
  videoMetadata: Partial<VideoMetadata>,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let currentChunk: TranscriptSegment[] = [];
  let currentChunkText = '';
  let chunkIndex = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentText = segment.text + ' ';

    // If adding this segment exceeds chunk size, save current chunk
    if (currentChunkText.length + segmentText.length > chunkSize && currentChunk.length > 0) {
      const startTime = currentChunk[0].offset;
      const endTime = currentChunk[currentChunk.length - 1].offset +
                      currentChunk[currentChunk.length - 1].duration;

      chunks.push({
        id: `${videoMetadata.videoId}_chunk_${chunkIndex}`,
        videoId: videoMetadata.videoId!,
        videoTitle: videoMetadata.title || 'Unknown',
        videoUrl: videoMetadata.url!,
        text: currentChunkText.trim(),
        startTime,
        endTime,
        timestamp: formatTimestamp(startTime),
        chunkIndex,
        metadata: {
          channelTitle: videoMetadata.channelTitle,
          thumbnailUrl: videoMetadata.thumbnailUrl,
          segmentCount: currentChunk.length,
        },
      });

      // Create overlap: keep last few segments for context
      const overlapText = currentChunkText.slice(-chunkOverlap);
      const overlapSegments = [];
      let textLength = 0;

      for (let j = currentChunk.length - 1; j >= 0; j--) {
        textLength += currentChunk[j].text.length + 1;
        overlapSegments.unshift(currentChunk[j]);
        if (textLength >= chunkOverlap) break;
      }

      currentChunk = overlapSegments;
      currentChunkText = overlapSegments.map(s => s.text).join(' ') + ' ';
      chunkIndex++;
    }

    currentChunk.push(segment);
    currentChunkText += segmentText;
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    const startTime = currentChunk[0].offset;
    const endTime = currentChunk[currentChunk.length - 1].offset +
                    currentChunk[currentChunk.length - 1].duration;

    chunks.push({
      id: `${videoMetadata.videoId}_chunk_${chunkIndex}`,
      videoId: videoMetadata.videoId!,
      videoTitle: videoMetadata.title || 'Unknown',
      videoUrl: videoMetadata.url!,
      text: currentChunkText.trim(),
      startTime,
      endTime,
      timestamp: formatTimestamp(startTime),
      chunkIndex,
      metadata: {
        channelTitle: videoMetadata.channelTitle,
        thumbnailUrl: videoMetadata.thumbnailUrl,
        segmentCount: currentChunk.length,
      },
    });
  }

  return chunks;
}

/**
 * Process a single video: fetch transcript, metadata, and chunk it
 */
export async function processVideo(
  videoIdOrUrl: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): Promise<ProcessedTranscript> {
  const videoId = extractVideoId(videoIdOrUrl);

  if (!videoId) {
    throw new Error('Invalid YouTube video URL or ID');
  }

  console.log(`Processing video: ${videoId}`);

  // Fetch transcript and metadata in parallel
  const [segments, metadata] = await Promise.all([
    fetchVideoTranscript(videoId),
    fetchVideoMetadata(videoId),
  ]);

  const fullTranscript = segments.map(s => s.text).join(' ');
  const chunks = chunkTranscript(segments, metadata, chunkSize, chunkOverlap);

  return {
    videoId,
    videoTitle: metadata.title || 'Unknown',
    videoUrl: metadata.url!,
    fullTranscript,
    segments,
    chunks,
  };
}
