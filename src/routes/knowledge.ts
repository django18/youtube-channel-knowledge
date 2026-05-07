import { Hono } from 'hono';
import { generatePlaybook } from '../lib/extraction/guide-generator';
import { z } from 'zod';

const knowledge = new Hono();

const GenerateRequestSchema = z.object({
  profile: z.string(),
  goals: z.array(z.string()),
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
  } catch (error: any) {
    console.error('Error in /generate-playbook:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to generate playbook',
    }, 500);
  }
});

/**
 * GET /api/knowledge/stats
 * Returns stats about the knowledge engine (Graph + Vector)
 */
knowledge.get('/stats', async (c) => {
  // Placeholder for future stats (e.g. node count, collection size)
  return c.json({
    engine: 'Dual-Memory (Semantic + Graph)',
    status: 'operational',
    version: '1.0.0'
  });
});

export default knowledge;
