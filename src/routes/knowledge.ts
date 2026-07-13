import { Hono } from 'hono';
import { z } from 'zod';
import { generatePlaybook } from '../lib/extraction/guide-generator';
import { ask } from '../lib/retrieval/advisor';
import { getPatterns, computePatterns } from '../lib/patterns/pattern-layer';
import { QueryContextSchema } from '../lib/schemas/context';
import { getNeo4jDriver } from '../lib/extraction/graph-store';
import { getCollectionStats } from '../lib/youtube-vectorstore';

const knowledge = new Hono();

const GenerateRequestSchema = z.object({
  profile: z.string(),
  goals: z.array(z.string()),
});

const AskRequestSchema = z.object({
  question: z.string().min(3),
  context: QueryContextSchema.optional(),
});

/**
 * POST /api/knowledge/ask
 * Main advisor endpoint. Extracts context from the question, combines
 * cached graph patterns + multi-hop founder examples + semantic search,
 * and synthesizes a grounded answer.
 */
knowledge.post('/ask', async (c) => {
  try {
    const body = await c.req.json();
    const validated = AskRequestSchema.parse(body);

    const result = await ask(validated.question, validated.context);

    return c.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error('Error in /ask:', error);
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Invalid request', issues: error.issues }, 400);
    }
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to answer question' },
      500
    );
  }
});

/**
 * GET /api/knowledge/patterns
 * Precomputed patterns for a context (Redis-cached graph aggregates).
 * Context passed as query params, e.g. ?founderType=solo&stage=MVP
 * Add &refresh=true to bypass the cache.
 */
knowledge.get('/patterns', async (c) => {
  try {
    const query = c.req.query();
    const context = QueryContextSchema.parse({
      founderType: query.founderType,
      technical: query.technical === undefined ? undefined : query.technical === 'true',
      stage: query.stage,
      startupType: query.startupType,
      businessModel: query.businessModel,
      budget: query.budget,
    });

    const refresh = query.refresh === 'true';
    const patterns = refresh ? await computePatterns(context) : await getPatterns(context);

    return c.json({ success: true, data: patterns });
  } catch (error: unknown) {
    console.error('Error in /patterns:', error);
    if (error instanceof z.ZodError) {
      return c.json({ success: false, error: 'Invalid context', issues: error.issues }, 400);
    }
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to compute patterns' },
      500
    );
  }
});

/**
 * POST /api/knowledge/generate-playbook
 * Generates a structured playbook based on synthesized knowledge
 */
knowledge.post('/generate-playbook', async (c) => {
  try {
    const body = await c.req.json();
    const validated = GenerateRequestSchema.parse(body);

    const playbook = await generatePlaybook(validated);

    return c.json({
      success: true,
      playbook,
    });
  } catch (error: unknown) {
    console.error('Error in /generate-playbook:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate playbook',
    }, 500);
  }
});

/**
 * GET /api/knowledge/stats
 * Live stats from both memories: Neo4j node counts + Chroma chunk count.
 */
knowledge.get('/stats', async (c) => {
  const [graphStats, vectorStats] = await Promise.all([
    getGraphStats().catch((error): Record<string, number> | null => {
      console.warn('Graph stats unavailable:', error);
      return null;
    }),
    getCollectionStats().catch((error): { totalChunks: number; collectionName: string } | null => {
      console.warn('Vector stats unavailable:', error);
      return null;
    }),
  ]);

  return c.json({
    engine: 'Dual-Memory (Semantic + Graph)',
    graph: graphStats,
    vector: vectorStats,
    status: graphStats || vectorStats ? 'operational' : 'degraded',
  });
});

async function getGraphStats(): Promise<Record<string, number>> {
  const session = getNeo4jDriver().session();
  try {
    const result = await session.executeRead(tx =>
      tx.run(
        `MATCH (n)
         UNWIND labels(n) AS label
         RETURN label, count(*) AS count
         ORDER BY count DESC`
      )
    );
    return Object.fromEntries(
      result.records.map(record => [record.get('label'), record.get('count').toNumber()])
    );
  } finally {
    await session.close();
  }
}

export default knowledge;
