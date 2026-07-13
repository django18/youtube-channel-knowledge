import { z } from 'zod';

/**
 * Founder entity schema
 */
export const FounderSchema = z.object({
  name: z.string().describe('Founder name'),
  type: z.enum(['solo', 'team']).optional().catch(undefined).describe('Solo founder or team'),
  technical: z.boolean().describe('Has technical/coding background'),
  background: z.string().optional().catch(undefined).describe('Previous experience and background'),
  experience: z.enum(['beginner', 'experienced']).optional().catch(undefined),
});

export type Founder = z.infer<typeof FounderSchema>;

/**
 * Startup entity schema
 */
export const StartupSchema = z.object({
  name: z.string().describe('Startup/product name'),
  type: z.enum([
    'SaaS',
    'mobile app',
    'marketplace',
    'content site',
    'e-commerce',
    'tool',
    'API',
    'other'
  ]).catch('other').describe('Type of product'),
  niche: z.string().optional().catch(undefined).describe('Specific market niche or vertical'),
  stage: z.enum(['idea', 'MVP', 'growth', 'scale']).optional().catch(undefined).describe('Current stage'),
  platform: z.enum(['web', 'mobile', 'desktop', 'API', 'multi-platform']).optional().catch(undefined),
  businessModel: z.enum(['subscription', 'one-time', 'freemium', 'ads', 'marketplace']).optional().catch(undefined),
});

export type Startup = z.infer<typeof StartupSchema>;

/**
 * Strategy entity schema
 */
export const StrategySchema = z.object({
  name: z.string().describe('Strategy name (e.g., "SEO", "Product Hunt")'),
  category: z.enum([
    'content marketing',
    'paid ads',
    'social media',
    'SEO',
    'community',
    'partnerships',
    'cold outreach',
    'product-led',
    'other'
  ]).catch('other').describe('Strategy category'),
  details: z.string().optional().catch(undefined).describe('How they executed this strategy'),
  success: z.boolean().optional().catch(undefined).describe('Whether this strategy worked well'),
  cost: z.enum(['free', 'low', 'medium', 'high']).optional().catch(undefined),
  timeToResults: z.string().optional().describe('How long until they saw results'),
});

export type Strategy = z.infer<typeof StrategySchema>;

/**
 * Tool entity schema
 */
export const ToolSchema = z.object({
  name: z.string().describe('Tool or platform name'),
  category: z.enum([
    'framework',
    'database',
    'hosting',
    'payment',
    'analytics',
    'marketing',
    'design',
    'no-code',
    'AI',
    'other'
  ]).catch('other').describe('Tool category'),
  purpose: z.string().optional().describe('Why they used it'),
});

export type Tool = z.infer<typeof ToolSchema>;

/**
 * Outcome entity schema
 */
export const OutcomeSchema = z.object({
  users: z.number().optional().catch(undefined).describe('Number of users/customers'),
  revenue: z.number().optional().catch(undefined).describe('Monthly revenue in USD'),
  mrr: z.number().optional().catch(undefined).describe('Monthly recurring revenue'),
  timeline: z.string().optional().catch(undefined).describe('Time taken to reach this outcome'),
  metric: z.string().optional().describe('Primary success metric'),
  value: z.string().optional().describe('Value of the metric'),
});

export type Outcome = z.infer<typeof OutcomeSchema>;

/**
 * Workflow step schema
 */
export const WorkflowStepSchema = z.object({
  order: z.number().describe('Step number'),
  action: z.string().describe('What to do'),
  details: z.string().optional().catch(undefined).describe('How to do it'),
  duration: z.string().optional().describe('Expected time'),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

/**
 * Workflow entity schema
 */
export const WorkflowSchema = z.object({
  name: z.string().describe('Workflow name'),
  goal: z.string().optional().catch(undefined).describe('What this workflow achieves'),
  steps: z.array(WorkflowStepSchema).describe('Step-by-step process'),
  outcome: z.string().optional().catch(undefined).describe('Result achieved'),
  successFactors: z.array(z.string()).optional().describe('Key factors for success'),
  context: z.object({
    founderType: z.enum(['solo', 'team']).optional(),
    technical: z.boolean().optional(),
    stage: z.enum(['idea', 'MVP', 'growth', 'scale']).optional(),
    budget: z.enum(['low', 'medium', 'high']).optional(),
  }).optional(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

/**
 * Complete extracted entities for a video
 */
export const ExtractedEntitiesSchema = z.object({
  videoId: z.string(),
  videoTitle: z.string(),
  videoUrl: z.string(),
  founder: FounderSchema.optional(),
  startup: StartupSchema,
  strategies: z.array(StrategySchema),
  tools: z.array(ToolSchema),
  outcomes: OutcomeSchema.optional(),
  workflows: z.array(WorkflowSchema).optional(),
  keyInsights: z.array(z.string()).optional().describe('Important takeaways'),
});

export type ExtractedEntities = z.infer<typeof ExtractedEntitiesSchema>;
