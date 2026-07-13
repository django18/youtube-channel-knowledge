import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import youtubeRouter from './routes/youtube';
import knowledgeRouter from './routes/knowledge';
import evalRouter from './routes/eval';
import { config } from './config';
import { startWorker } from './lib/queue/worker';
import { initGraph } from './lib/extraction/graph-store';
import { apiKeyAuth, rateLimit } from './middleware/security';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());
app.use('/api/*', rateLimit());
app.use('/api/*', apiKeyAuth());

app.get('/', (c) =>
  c.json({
    name: 'YouTube Knowledge Engine API',
    version: '2.0.0',
    status: 'healthy',
    endpoints: {
      youtube: {
        scrapeVideo: 'POST /api/youtube/scrape-video',
        scrapeChannel: 'POST /api/youtube/scrape-channel',
        search: 'POST /api/youtube/search',
        chat: 'POST /api/youtube/chat',
        stats: 'GET /api/youtube/stats',
      },
      knowledge: {
        ask: 'POST /api/knowledge/ask',
        patterns: 'GET /api/knowledge/patterns',
        generatePlaybook: 'POST /api/knowledge/generate-playbook',
        stats: 'GET /api/knowledge/stats',
      },
      eval: {
        run: 'POST /api/eval/run',
        latest: 'GET /api/eval/latest',
        history: 'GET /api/eval/history',
      },
    },
  })
);

app.get('/health', (c) =>
  c.json({ status: 'ok', timestamp: new Date().toISOString() })
);

app.route('/api', youtubeRouter);
app.route('/api/knowledge', knowledgeRouter);
app.route('/api/eval', evalRouter);

console.log(`🚀 Server starting on port ${config.port}`);
console.log(`📊 ChromaDB URL: ${config.chromaUrl}`);
console.log(`🤖 Embedding: ${config.embeddingModel}`);
console.log(`🕸️  Neo4j URI: ${config.neo4jUri}`);

initGraph()
  .catch((err) => console.error('Neo4j init failed (continuing):', err))
  .finally(() => {
    startWorker().catch((err) => console.error('Worker failed to start:', err));
  });

export default {
  port: config.port,
  fetch: app.fetch,
};
