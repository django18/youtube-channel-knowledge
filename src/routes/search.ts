import { Hono } from 'hono';
import { VectorStore } from '../lib/vectorstore';
import type { SearchRequest } from '../types';

const searchRouter = new Hono();

// Initialize vector store (singleton)
let vectorStore: VectorStore | null = null;

async function getVectorStore(): Promise<VectorStore> {
  if (!vectorStore) {
    vectorStore = new VectorStore();
    await vectorStore.initialize();
  }
  return vectorStore;
}

searchRouter.post('/search', async (c) => {
  try {
    const body = await c.req.json<SearchRequest>();
    const { query, limit = 10, filter } = body;

    if (!query) {
      return c.json({ error: 'Query is required' }, 400);
    }

    const store = await getVectorStore();
    const results = await store.search(query, limit, filter);

    return c.json({
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error searching:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

searchRouter.get('/search', async (c) => {
  try {
    const query = c.req.query('q');
    const limit = parseInt(c.req.query('limit') || '10');

    if (!query) {
      return c.json({ error: 'Query parameter "q" is required' }, 400);
    }

    const store = await getVectorStore();
    const results = await store.search(query, limit);

    return c.json({
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error searching:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

searchRouter.get('/stats', async (c) => {
  try {
    const store = await getVectorStore();
    const stats = await store.getStats();

    return c.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

searchRouter.delete('/url', async (c) => {
  try {
    const url = c.req.query('url');

    if (!url) {
      return c.json({ error: 'URL parameter is required' }, 400);
    }

    const store = await getVectorStore();
    await store.deleteByUrl(url);

    return c.json({ message: 'URL deleted successfully', url });
  } catch (error) {
    console.error('Error deleting URL:', error);
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default searchRouter;
