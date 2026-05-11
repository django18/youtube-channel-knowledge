import { z } from 'zod';

/**
 * Golden eval case. Each case can exercise one or more sub-evals:
 *  - retrieval: needs `query` + `relevantChunkIds`
 *  - graph:     needs `query` + `expectedEntities`
 *  - embedding: needs `triplet` {anchor, positive, negative}
 */
export const EvalCaseSchema = z.object({
  id: z.string(),
  query: z.string().optional(),
  relevantChunkIds: z.array(z.string()).optional(),
  expectedEntities: z
    .object({
      startups: z.array(z.string()).optional(),
      tools: z.array(z.string()).optional(),
      strategies: z.array(z.string()).optional(),
      founders: z.array(z.string()).optional(),
    })
    .optional(),
  triplet: z
    .object({
      anchor: z.string(),
      positive: z.string(),
      negative: z.string(),
    })
    .optional(),
  notes: z.string().optional(),
});

export type EvalCase = z.infer<typeof EvalCaseSchema>;

export interface RetrievalMetrics {
  queries: number;
  recallAt1: number;
  recallAt5: number;
  recallAt10: number;
  precisionAt5: number;
  precisionAt10: number;
  mrr: number;
  ndcgAt10: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  perQuery: Array<{
    id: string;
    query: string;
    hitRank: number | null;
    latencyMs: number;
  }>;
}

export interface EmbeddingMetrics {
  triplets: number;
  tripletAccuracy: number;
  avgPositiveSim: number;
  avgNegativeSim: number;
  margin: number;
}

export interface GraphMetrics {
  queries: number;
  entityRecall: number;
  entityPrecision: number;
  byLabel: Record<string, { recall: number; precision: number }>;
  missing: Array<{ id: string; missing: string[] }>;
}

export interface EvalReport {
  timestamp: string;
  config: {
    provider: string;
    dimension: number;
    chunkSize: number;
    chunkOverlap: number;
    collection: string;
  };
  embedding: EmbeddingMetrics | null;
  retrieval: RetrievalMetrics | null;
  graph: GraphMetrics | null;
  /**
   * Weighted composite. Embedding=0.2, Retrieval=0.5, Graph=0.3.
   * Skipped categories renormalize remaining weights.
   */
  score: number;
}
