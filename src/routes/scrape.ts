import { Hono } from 'hono';
import { RecursiveCrawler } from '../lib/crawler';
import { VectorStore } from '../lib/vectorstore';
import type { ScrapeRequest } from '../types';

const scrapeRouter = new Hono();

// Background jobs store
const jobs = new Map<string, any>();

scrapeRouter.post('/scrape', async (c) => {
  try {
    const body = await c.req.json<ScrapeRequest>();

    const { url, maxDepth = 3, respectRobots = true, allowedDomains } = body;

    if (!url) {
      return c.json({ error: 'URL is required' }, 400);
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return c.json({ error: 'Invalid URL format' }, 400);
    }

    const jobId = crypto.randomUUID();

    // Start scraping in background
    jobs.set(jobId, {
      id: jobId,
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    // Run crawl and store in background
    (async () => {
      try {
        const crawler = new RecursiveCrawler();
        const pages = await crawler.crawl(url, maxDepth, respectRobots, allowedDomains);

        // Store in vector database
        const vectorStore = new VectorStore();
        await vectorStore.initialize();
        await vectorStore.addPages(pages);

        jobs.set(jobId, {
          id: jobId,
          status: 'completed',
          startedAt: jobs.get(jobId)?.startedAt,
          completedAt: new Date().toISOString(),
          pagesScraped: pages.length,
        });
      } catch (error) {
        jobs.set(jobId, {
          id: jobId,
          status: 'failed',
          startedAt: jobs.get(jobId)?.startedAt,
          completedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();

    return c.json({
      jobId,
      message: 'Scraping job started',
      status: 'running',
    });
  } catch (error) {
    console.error('Error starting scrape:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

scrapeRouter.get('/scrape/:jobId', async (c) => {
  const jobId = c.req.param('jobId');
  const job = jobs.get(jobId);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json(job);
});

scrapeRouter.get('/scrape', async (c) => {
  const allJobs = Array.from(jobs.values());
  return c.json({ jobs: allJobs });
});

export default scrapeRouter;
