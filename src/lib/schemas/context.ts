import { z } from 'zod';

/**
 * Context dimensions used to filter graph patterns.
 * Mirrors the attributes stored on Founder/Startup nodes.
 */
export const QueryContextSchema = z.object({
  founderType: z.enum(['solo', 'team']).optional(),
  technical: z.boolean().optional(),
  stage: z.enum(['idea', 'MVP', 'growth', 'scale']).optional(),
  startupType: z
    .enum([
      'SaaS',
      'mobile app',
      'marketplace',
      'content site',
      'e-commerce',
      'tool',
      'API',
      'other',
    ])
    .optional(),
  businessModel: z
    .enum(['subscription', 'one-time', 'freemium', 'ads', 'marketplace'])
    .optional(),
  budget: z.enum(['free', 'low', 'medium', 'high']).optional(),
  goal: z.string().optional().describe('What the user is trying to achieve'),
});

export type QueryContext = z.infer<typeof QueryContextSchema>;

/**
 * Deterministic cache key for a context — sorted keys, stable across
 * property insertion order.
 */
export function contextCacheKey(context: QueryContext): string {
  const entries = Object.entries(context)
    .filter(([key, value]) => value !== undefined && key !== 'goal')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);
  return entries.length > 0 ? entries.join('|') : 'all';
}
