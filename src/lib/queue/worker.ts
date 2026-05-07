import { popNextJob, updateJob, type Job } from './task-queue';
import { processVideo } from '../youtube';
import { processChannelVideos } from '../youtube-channel';
import { storeInVectorDB } from '../youtube-vectorstore';
import { markVideoAsScraped } from '../youtube-tracker';
import { config } from '../../config';

let isRunning = false;

/**
 * Background worker to process scraping jobs
 */
export async function startWorker() {
  if (isRunning) return;
  isRunning = true;
  
  console.log('👷 Background worker started...');

  while (isRunning) {
    try {
      const job = await popNextJob();
      
      if (!job) {
        // Wait 5 seconds before checking again if queue is empty
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      console.log(`\n📦 Processing job ${job.id} (${job.type})`);
      
      try {
        if (job.type === 'scrape-video') {
          await handleScrapeVideo(job);
        } else if (job.type === 'scrape-channel') {
          await handleScrapeChannel(job);
        }

        await updateJob(job.id, { status: 'completed', progress: 100 });
        console.log(`✅ Job ${job.id} completed`);
      } catch (error: any) {
        console.error(`❌ Job ${job.id} failed:`, error);
        await updateJob(job.id, { status: 'failed', error: error.message });
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
      await updateJob(job.id, { progress });
    },
  });

  if (processedTranscripts.length > 0) {
    await storeInVectorDB(processedTranscripts);
  }

  return { videosProcessed: processedTranscripts.length };
}
