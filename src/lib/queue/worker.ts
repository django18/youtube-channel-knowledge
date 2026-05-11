import { popNextJob, completeJob, failJob, heartbeat, reapStaleJobs, type Job } from './task-queue';
import { processVideo } from '../youtube';
import { processChannelVideos } from '../youtube-channel';
import { storeInVectorDB } from '../youtube-vectorstore';
import { markVideoAsScraped } from '../youtube-tracker';
import { config } from '../../config';

let isRunning = false;
const REAP_INTERVAL_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

export async function startWorker() {
  if (isRunning) return;
  isRunning = true;

  console.log('👷 Background worker started...');

  const initialReap = await reapStaleJobs();
  if (initialReap > 0) {
    console.log(`Recovered ${initialReap} stale jobs on boot`);
  }

  setInterval(() => {
    reapStaleJobs().catch(err => console.error('Reaper error:', err));
  }, REAP_INTERVAL_MS);

  while (isRunning) {
    try {
      const job = await popNextJob();

      if (!job) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      console.log(`\n📦 Processing job ${job.id} (${job.type}, attempt ${job.attempts})`);

      const hbTimer = setInterval(() => {
        heartbeat(job.id).catch(() => {});
      }, HEARTBEAT_INTERVAL_MS);

      try {
        let result: any;
        if (job.type === 'scrape-video') {
          result = await handleScrapeVideo(job);
        } else if (job.type === 'scrape-channel') {
          result = await handleScrapeChannel(job);
        }

        await completeJob(job.id, result);
        console.log(`✅ Job ${job.id} completed`);
      } catch (error: any) {
        console.error(`❌ Job ${job.id} failed:`, error);
        await failJob(job.id, error?.message ?? String(error));
      } finally {
        clearInterval(hbTimer);
      }
    } catch (error) {
      console.error('Worker loop error:', error);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

async function handleScrapeVideo(job: Job) {
  const { videoUrl } = job.payload;

  const processed = await processVideo(
    videoUrl,
    config.chunkSize,
    config.chunkOverlap
  );

  await storeInVectorDB([processed]);

  markVideoAsScraped({
    videoId: processed.videoId,
    videoTitle: processed.videoTitle,
    videoUrl: processed.videoUrl,
    channelTitle: processed.chunks[0]?.metadata?.channelTitle,
    chunksCount: processed.chunks.length,
    transcriptLength: processed.fullTranscript.length,
  });

  return { videoId: processed.videoId };
}

async function handleScrapeChannel(job: Job) {
  const { channelUrl, maxVideos, skipScraped, concurrency } = job.payload;

  const processedTranscripts = await processChannelVideos(channelUrl, {
    maxVideos,
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    skipScraped,
    concurrency,
    onProgress: async (current, total) => {
      const progress = Math.round((current / total) * 100);
      await heartbeat(job.id);
      const { updateJob } = await import('./task-queue');
      await updateJob(job.id, { progress });
    },
  });

  if (processedTranscripts.length > 0) {
    await storeInVectorDB(processedTranscripts);
  }

  return { videosProcessed: processedTranscripts.length };
}
