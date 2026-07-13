/**
 * Rebuild the ChromaDB vector store from the tracker file
 * (data/youtube/scraped-videos.json) after data loss — e.g. a ChromaDB
 * container recreate that wiped the old storage layout.
 *
 * Re-fetches transcripts from YouTube (free, no API key), re-chunks,
 * re-embeds locally, and stores. Does NOT touch the tracker.
 *
 * Usage:
 *   bun run scripts/reingest-from-tracker.ts           # all videos
 *   bun run scripts/reingest-from-tracker.ts 5         # first 5 (smoke test)
 */
import { processVideo } from '../src/lib/youtube';
import { storeInVectorDB } from '../src/lib/youtube-vectorstore';
import { config } from '../src/config';

interface TrackedVideo {
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  chunksCount?: number;
}

interface TrackerFile {
  version: string;
  totalVideosProcessed: number;
  videos: Record<string, TrackedVideo>;
}

const TRACKER_PATH = './data/youtube/scraped-videos.json';
const BATCH_SIZE = 5;
const DELAY_BETWEEN_BATCHES_MS = 2000;

async function main() {
  const limitArg = process.argv[2];
  const limit = limitArg ? parseInt(limitArg, 10) : Infinity;

  const tracker: TrackerFile = await Bun.file(TRACKER_PATH).json();
  const videos = Object.values(tracker.videos).slice(0, limit);

  console.log(`Re-ingesting ${videos.length} videos from tracker`);
  console.log(`Chroma: ${config.chromaUrl} → collection ${config.youtubeCollectionName}\n`);

  let ok = 0;
  let failed = 0;
  const failures: Array<{ videoId: string; error: string }> = [];

  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    const batch = videos.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(video =>
        processVideo(video.videoUrl, config.chunkSize, config.chunkOverlap)
      )
    );

    const processed = [];
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        processed.push(result.value);
      } else {
        failed++;
        failures.push({
          videoId: batch[j].videoId,
          error: result.reason?.message ?? String(result.reason),
        });
        console.warn(`  ✗ ${batch[j].videoId} (${batch[j].videoTitle.slice(0, 50)}): ${result.reason?.message ?? result.reason}`);
      }
    }

    if (processed.length > 0) {
      await storeInVectorDB(processed);
      ok += processed.length;
    }

    console.log(`Progress: ${Math.min(i + BATCH_SIZE, videos.length)}/${videos.length} (ok=${ok}, failed=${failed})`);

    if (i + BATCH_SIZE < videos.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  console.log(`\nDone. Re-ingested ${ok}/${videos.length} videos (${failed} failed).`);
  if (failures.length > 0) {
    console.log('\nFailures (usually: transcript disabled or video removed):');
    for (const f of failures) console.log(`  - ${f.videoId}: ${f.error}`);
  }
}

main().catch(error => {
  console.error('Re-ingest failed:', error);
  process.exit(1);
});
