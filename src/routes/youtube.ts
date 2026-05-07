import { Hono } from 'hono';
import { processVideo } from '../lib/youtube';
import { enqueueJob, getJobStatus } from '../lib/queue/task-queue';
import { processChannelVideos } from '../lib/youtube-channel';
import { storeInVectorDB, searchVectorDB } from '../lib/youtube-vectorstore';
import { config } from '../config';
import {
  isVideoScraped,
  markVideoAsScraped,
  markVideoAsFailed,
  getTrackerStats,
  getRecentlyScrapedVideos,
  filterUnscrapedVideos,
  loadTracker,
} from '../lib/youtube-tracker';

const router = new Hono();

/**
 * POST /api/youtube/scrape-video
 * Scrape a single YouTube video transcript and store in vector DB
 */
router.post('/youtube/scrape-video', async (c) => {
  try {
    const body = await c.req.json();
    const { videoUrl, storeInDB = true, forceRescrape = false } = body;

    if (!videoUrl) {
      return c.json({ error: 'videoUrl is required' }, 400);
    }

    const processed = await processVideo(
      videoUrl,
      config.chunkSize,
      config.chunkOverlap
    );

    // Check if already scraped
    if (!forceRescrape && isVideoScraped(processed.videoId)) {
      return c.json({
        success: true,
        alreadyScraped: true,
        message: 'Video already scraped. Use forceRescrape=true to re-scrape.',
        video: {
          videoId: processed.videoId,
          title: processed.videoTitle,
          url: processed.videoUrl,
        },
      });
    }

    let stored = false;
    if (storeInDB) {
      await storeInVectorDB([processed]);
      stored = true;

      // Mark as scraped with channel info
      markVideoAsScraped({
        videoId: processed.videoId,
        videoTitle: processed.videoTitle,
        videoUrl: processed.videoUrl,
        channelTitle: processed.chunks[0]?.metadata?.channelTitle,
        chunksCount: processed.chunks.length,
        transcriptLength: processed.fullTranscript.length,
      });
    }

    return c.json({
      success: true,
      alreadyScraped: false,
      video: {
        videoId: processed.videoId,
        title: processed.videoTitle,
        url: processed.videoUrl,
        chunksCount: processed.chunks.length,
        transcriptLength: processed.fullTranscript.length,
      },
      chunks: processed.chunks,
      stored,
    });
  } catch (error: any) {
    console.error('Error scraping video:', error);
    return c.json(
      {
        error: 'Failed to scrape video',
        message: error.message,
      },
      500
    );
  }
});

/**
 * POST /api/youtube/scrape-channel
 * Scrape all videos from a YouTube channel and store in vector DB
 */
router.post('/youtube/scrape-channel', async (c) => {
  try {
    const body = await c.req.json();
    const { channelUrl, maxVideos = 50, skipScraped = true, concurrency = 5 } = body;

    if (!channelUrl) {
      return c.json({ error: 'channelUrl is required' }, 400);
    }

    // Enqueue the job for background processing
    const jobId = await enqueueJob('scrape-channel', {
      channelUrl,
      maxVideos,
      skipScraped,
      concurrency,
    });

    return c.json({
      success: true,
      message: 'Channel scraping job started in the background',
      jobId,
      statusUrl: `/api/youtube/jobs/${jobId}`,
    });
  } catch (error: any) {
    console.error('Error enqueuing channel scrape:', error);
    return c.json(
      {
        error: 'Failed to start channel scrape',
        message: error.message,
      },
      500
    );
  }
});

/**
 * GET /api/youtube/jobs/:id
 * Get the status of a background job
 */
router.get('/youtube/jobs/:id', async (c) => {
  const id = c.req.param('id');
  const job = await getJobStatus(id);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json({
    success: true,
    job,
  });
});

/**
 * POST /api/youtube/search
 * Semantic search across YouTube transcripts
 */
router.post('/youtube/search', async (c) => {
  try {
    const body = await c.req.json();
    const { query, limit = 5 } = body;

    if (!query) {
      return c.json({ error: 'query is required' }, 400);
    }

    const results = await searchVectorDB(query, limit);

    return c.json({
      success: true,
      query,
      resultsCount: results.length,
      results: results.map(r => ({
        videoId: r.videoId,
        videoTitle: r.videoTitle,
        videoUrl: r.videoUrl,
        text: r.text,
        timestamp: r.timestamp,
        timestampUrl: `${r.videoUrl}&t=${Math.floor(r.startTime / 1000)}s`,
        similarity: r.similarity,
        metadata: r.metadata,
      })),
    });
  } catch (error: any) {
    console.error('Error searching:', error);
    return c.json(
      {
        error: 'Search failed',
        message: error.message,
      },
      500
    );
  }
});

/**
 * POST /api/youtube/chat
 * RAG-powered chat with YouTube transcript context
 */
router.post('/youtube/chat', async (c) => {
  try {
    const body = await c.req.json();
    const { question, contextLimit = 3 } = body;

    if (!question) {
      return c.json({ error: 'question is required' }, 400);
    }

    // Retrieve relevant context
    const context = await searchVectorDB(question, contextLimit);

    if (context.length === 0) {
      return c.json({
        success: true,
        answer: "I don't have enough information to answer that question based on the available transcripts.",
        context: [],
      });
    }

    // Format context for LLM
    const contextText = context
      .map((c, i) => `[${i + 1}] ${c.videoTitle} (${c.timestamp})\n${c.text}`)
      .join('\n\n---\n\n');

    return c.json({
      success: true,
      question,
      context: context.map(c => ({
        videoTitle: c.videoTitle,
        videoUrl: `${c.videoUrl}&t=${Math.floor(c.startTime / 1000)}s`,
        text: c.text,
        timestamp: c.timestamp,
      })),
      contextText,
      message: 'Use this context with your preferred LLM (Claude, GPT-4, etc.) to answer the question',
    });
  } catch (error: any) {
    console.error('Error in chat:', error);
    return c.json(
      {
        error: 'Chat failed',
        message: error.message,
      },
      500
    );
  }
});

/**
 * GET /api/youtube/stats
 * Get statistics about stored YouTube transcripts
 */
router.get('/youtube/stats', async (c) => {
  try {
    const trackerStats = getTrackerStats();
    const recentVideos = getRecentlyScrapedVideos(5);
    const tracker = loadTracker();

    return c.json({
      success: true,
      stats: {
        totalProcessed: trackerStats.totalProcessed,
        successful: trackerStats.successful,
        failed: trackerStats.failed,
        noTranscript: trackerStats.noTranscript,
        successRate: trackerStats.successRate,
        collectionName: config.youtubeCollectionName,
      },
      recentVideos: recentVideos.map(v => ({
        videoId: v.videoId,
        title: v.videoTitle,
        scrapedAt: v.scrapedAt,
        chunksCount: v.chunksCount,
      })),
      totalChunks: Object.values(tracker.videos)
        .filter(v => v.status === 'success')
        .reduce((sum, v) => sum + v.chunksCount, 0),
    });
  } catch (error: any) {
    console.error('Error getting stats:', error);
    return c.json(
      {
        error: 'Failed to get stats',
        message: error.message,
      },
      500
    );
  }
});

export default router;

/**
 * GET /api/youtube/tracker
 * Get all tracked videos with full metadata
 */
router.get('/youtube/tracker', async (c) => {
  try {
    const tracker = loadTracker();

    const videos = Object.values(tracker.videos)
      .filter(v => v.status === 'success')
      .sort((a, b) => new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime());

    return c.json({
      success: true,
      videos: videos.map(v => ({
        videoId: v.videoId,
        videoTitle: v.videoTitle,
        videoUrl: v.videoUrl,
        channelTitle: v.channelTitle || 'Starter Story',
        scrapedAt: v.scrapedAt,
        chunksCount: v.chunksCount,
        transcriptLength: v.transcriptLength,
      })),
      totalVideos: videos.length,
    });
  } catch (error: any) {
    console.error('Error getting tracker data:', error);
    return c.json(
      {
        error: 'Failed to get tracker data',
        message: error.message,
      },
      500
    );
  }
});
