import { ChromaClient, Collection, IncludeEnum } from 'chromadb';
import { pipeline } from '@xenova/transformers';
import { config } from '../config';
import { mean, ndcgAtK, percentile, precisionAtK, recallAtK, reciprocalRank } from './metrics';
import type { EvalCase, RetrievalMetrics } from './types';

let chromaClient: ChromaClient | null = null;
let coll: Collection | null = null;
let embedder: any = null;

async function getCollection(): Promise<Collection> {
  if (coll) return coll;
  if (!chromaClient) chromaClient = new ChromaClient({ path: config.chromaUrl });
  coll = await chromaClient.getOrCreateCollection({ name: config.youtubeCollectionName });
  return coll;
}

async function getEmbedder() {
  if (!embedder) embedder = await pipeline('feature-extraction', config.embeddingModel);
  return embedder;
}

async function embedQuery(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const out = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

/**
 * Run each query against Chroma, score retrieved top-k against golden
 * relevant ids. Returns recall@k, precision@k, MRR, nDCG, latency.
 *
 * Why top_k=10: gives headroom for nDCG@10 without inflating latency.
 * Recall@1 measures "did we put the right thing first." Recall@10
 * measures "did we even consider it."
 */
export async function evaluateRetrieval(cases: EvalCase[]): Promise<RetrievalMetrics | null> {
  const usable = cases.filter((c) => c.query && c.relevantChunkIds && c.relevantChunkIds.length > 0);
  if (usable.length === 0) return null;

  const c = await getCollection();
  const TOP_K = 10;

  const perQuery: RetrievalMetrics['perQuery'] = [];
  const recall1: number[] = [];
  const recall5: number[] = [];
  const recall10: number[] = [];
  const precision5: number[] = [];
  const precision10: number[] = [];
  const rrs: number[] = [];
  const ndcg10: number[] = [];
  const latencies: number[] = [];

  for (const cse of usable) {
    const relevant = new Set(cse.relevantChunkIds!);

    const t0 = performance.now();
    const qEmb = await embedQuery(cse.query!);
    const res = await c.query({
      queryEmbeddings: [qEmb],
      nResults: TOP_K,
      include: [IncludeEnum.Metadatas, IncludeEnum.Distances],
    });
    const latencyMs = performance.now() - t0;
    latencies.push(latencyMs);

    const retrievedIds = (res.ids?.[0] ?? []) as string[];

    const rr = reciprocalRank(retrievedIds, relevant);
    const hitRank = rr > 0 ? Math.round(1 / rr) - 1 : null;

    recall1.push(recallAtK(retrievedIds, relevant, 1));
    recall5.push(recallAtK(retrievedIds, relevant, 5));
    recall10.push(recallAtK(retrievedIds, relevant, 10));
    precision5.push(precisionAtK(retrievedIds, relevant, 5));
    precision10.push(precisionAtK(retrievedIds, relevant, 10));
    rrs.push(rr);
    ndcg10.push(ndcgAtK(retrievedIds, relevant, 10));

    perQuery.push({ id: cse.id, query: cse.query!, hitRank, latencyMs: Math.round(latencyMs) });
  }

  return {
    queries: usable.length,
    recallAt1: mean(recall1),
    recallAt5: mean(recall5),
    recallAt10: mean(recall10),
    precisionAt5: mean(precision5),
    precisionAt10: mean(precision10),
    mrr: mean(rrs),
    ndcgAt10: mean(ndcg10),
    latencyP50Ms: Math.round(percentile(latencies, 50)),
    latencyP95Ms: Math.round(percentile(latencies, 95)),
    perQuery,
  };
}
