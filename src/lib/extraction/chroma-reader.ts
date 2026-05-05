import { ChromaClient } from 'chromadb';
import { config } from '../../config';

export interface VideoTranscript {
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  fullTranscript: string;
  channelTitle?: string;
  chunksCount: number;
}

/**
 * Read all transcripts from ChromaDB grouped by video
 */
export async function readTranscriptsFromChroma(): Promise<VideoTranscript[]> {
  const client = new ChromaClient({
    path: config.chromaUrl,
  });

  const collection = await client.getCollection({
    name: config.youtubeCollectionName,
  });

  console.log('Reading all chunks from ChromaDB...');

  // Get all documents from the collection
  const results = await collection.get({
    include: ['documents', 'metadatas'],
  });

  if (!results.ids || results.ids.length === 0) {
    console.log('No documents found in ChromaDB');
    return [];
  }

  console.log(`Found ${results.ids.length} chunks in ChromaDB`);

  // Group chunks by videoId
  const videoMap = new Map<string, {
    videoId: string;
    videoTitle: string;
    videoUrl: string;
    channelTitle?: string;
    chunks: Array<{ index: number; text: string }>;
  }>();

  for (let i = 0; i < results.ids.length; i++) {
    const metadata = results.metadatas?.[i] as any;
    const document = results.documents?.[i];

    if (!metadata || !document) continue;

    const videoId = metadata.videoId;

    if (!videoMap.has(videoId)) {
      videoMap.set(videoId, {
        videoId,
        videoTitle: metadata.videoTitle || 'Unknown',
        videoUrl: metadata.videoUrl || '',
        channelTitle: metadata.channelTitle,
        chunks: [],
      });
    }

    const video = videoMap.get(videoId)!;
    video.chunks.push({
      index: metadata.chunkIndex || 0,
      text: document,
    });
  }

  // Sort chunks by index and concatenate to full transcript
  const transcripts: VideoTranscript[] = [];

  for (const [videoId, video] of videoMap.entries()) {
    // Sort chunks by index
    video.chunks.sort((a, b) => a.index - b.index);

    const fullTranscript = video.chunks
      .map(chunk => chunk.text)
      .join(' ')
      .trim();

    transcripts.push({
      videoId,
      videoTitle: video.videoTitle,
      videoUrl: video.videoUrl,
      channelTitle: video.channelTitle,
      fullTranscript,
      chunksCount: video.chunks.length,
    });
  }

  console.log(`Reconstructed ${transcripts.length} full transcripts`);

  return transcripts;
}

/**
 * Read a single video transcript from ChromaDB
 */
export async function readSingleTranscript(videoId: string): Promise<VideoTranscript | null> {
  const client = new ChromaClient({
    path: config.chromaUrl,
  });

  const collection = await client.getCollection({
    name: config.youtubeCollectionName,
  });

  console.log(`Reading transcript for video: ${videoId}`);

  // Query for this video's chunks
  const results = await collection.get({
    where: { videoId },
    include: ['documents', 'metadatas'],
  });

  if (!results.ids || results.ids.length === 0) {
    console.log(`No chunks found for video: ${videoId}`);
    return null;
  }

  // Collect chunks
  const chunks: Array<{ index: number; text: string }> = [];
  let videoTitle = 'Unknown';
  let videoUrl = '';
  let channelTitle: string | undefined;

  for (let i = 0; i < results.ids.length; i++) {
    const metadata = results.metadatas?.[i] as any;
    const document = results.documents?.[i];

    if (!metadata || !document) continue;

    videoTitle = metadata.videoTitle || videoTitle;
    videoUrl = metadata.videoUrl || videoUrl;
    channelTitle = metadata.channelTitle;

    chunks.push({
      index: metadata.chunkIndex || 0,
      text: document,
    });
  }

  // Sort and concatenate
  chunks.sort((a, b) => a.index - b.index);
  const fullTranscript = chunks.map(c => c.text).join(' ').trim();

  return {
    videoId,
    videoTitle,
    videoUrl,
    channelTitle,
    fullTranscript,
    chunksCount: chunks.length,
  };
}
