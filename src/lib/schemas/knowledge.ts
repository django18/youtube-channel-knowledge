import { z } from 'zod';
import { 
  FounderSchema, 
  StartupSchema, 
  StrategySchema, 
  ToolSchema, 
  OutcomeSchema,
  WorkflowSchema 
} from './entities';

/**
 * EVIDENCE SCHEMAS
 * Links claims back to source transcripts
 */
export const EvidenceSchema = z.object({
  videoId: z.string().describe('Source video ID'),
  videoTitle: z.string().describe('Source video title'),
  videoUrl: z.string().describe('Source video URL'),
  timestamp: z.string().describe('Timestamp in video (e.g. "12:34")'),
  timestampUrl: z.string().describe('Direct link to timestamp'),
  quote: z.string().describe('Exact quote from transcript'),
  relevance: z.string().describe('Why this evidence is relevant to the lesson'),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * LESSON & MODULE SCHEMAS
 * Building blocks of a course/playbook
 */
export const LessonSchema = z.object({
  id: z.string(),
  title: z.string().describe('Action-oriented title'),
  description: z.string().describe('Detailed explanation of the lesson'),
  actionItems: z.array(z.string()).describe('Specific steps to take'),
  tools: z.array(z.string()).describe('Tools recommended for this lesson'),
  strategies: z.array(z.string()).describe('Strategies discussed'),
  evidence: z.array(EvidenceSchema).describe('Evidence from transcripts supporting this lesson'),
});

export type Lesson = z.infer<typeof LessonSchema>;

export const ModuleSchema = z.object({
  id: z.string(),
  title: z.string().describe('Phase name (e.g. "Phase 1: Validation")'),
  description: z.string(),
  lessons: z.array(LessonSchema),
});

export type Module = z.infer<typeof ModuleSchema>;

/**
 * PLAYBOOK SCHEMA
 * The final synthesized output
 */
export const PlaybookSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  targetAudience: z.object({
    profile: z.string().describe('e.g. "Solo Technical Founder"'),
    goals: z.array(z.string()),
    constraints: z.array(z.string()),
  }),
  modules: z.array(ModuleSchema),
  summary: z.object({
    keySuccessFactors: z.array(z.string()),
    commonPitfalls: z.array(z.string()),
    estimatedTimeline: z.string(),
  }),
  metadata: z.object({
    generatedAt: z.string(),
    sourceVideoCount: z.number(),
    model: z.string(),
  }),
});

export type Playbook = z.infer<typeof PlaybookSchema>;

/**
 * GRAPH MEMORY SCHEMAS
 * Defining the structure for Neo4j nodes and relationships
 */
export const GraphNodeSchema = z.object({
  id: z.string(),
  label: z.enum(['Founder', 'Startup', 'Tool', 'Strategy', 'Outcome', 'Video']),
  properties: z.record(z.string(), z.any()),
});

export const GraphRelationshipSchema = z.object({
  type: z.enum([
    'FOUNDED',
    'USED_TOOL',
    'IMPLEMENTED_STRATEGY',
    'ACHIEVED_OUTCOME',
    'MENTIONED_IN',
    'WORKS_WITH',
    'PRECEEDS'
  ]),
  fromId: z.string(),
  toId: z.string(),
  properties: z.record(z.string(), z.any()).optional(),
});
