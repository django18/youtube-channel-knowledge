import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import scrapeRouter from './routes/scrape';
import searchRouter from './routes/search';
import youtubeRouter from './routes/youtube';
import { config } from './config';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Web Scraper Vector DB API',
    version: '1.0.0',
    status: 'healthy',
    endpoints: {
      scrape: '/api/scrape',
      search: '/api/search',
      stats: '/api/stats',
      youtube: {
        scrapeVideo: '/api/youtube/scrape-video',
        scrapeChannel: '/api/youtube/scrape-channel',
        search: '/api/youtube/search',
        chat: '/api/youtube/chat',
        stats: '/api/youtube/stats',
      },
    },
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routers
app.route('/api', scrapeRouter);
app.route('/api', searchRouter);
app.route('/api', youtubeRouter);

// Start server
console.log(`🚀 Server starting on port ${config.port}`);
console.log(`📊 ChromaDB URL: ${config.chromaUrl}`);
console.log(`🔍 Collection: ${config.collectionName}`);
console.log(`🤖 Max crawl depth: ${config.maxDepth}`);
console.log(`⚙️  Embeddings: ${config.useJinaEmbeddings ? 'Jina AI' : 'Simple (demo)'}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
