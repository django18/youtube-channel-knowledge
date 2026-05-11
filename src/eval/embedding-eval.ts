import { pipeline } from '@xenova/transformers';
import { config } from '../config';
import { cosine, mean } from './metrics';
import type { EvalCase, EmbeddingMetrics } from './types';

let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', config.embeddingModel);
  }
  return embedder;
}

async function embed(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const out = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

/**
 * Triplet accuracy: for each (anchor, positive, negative), check that
 * cosine(anchor, positive) > cosine(anchor, negative). Higher = embedder
 * encodes semantic similarity in a way the application can rely on.
 *
 * Margin > 0.1 typically indicates a strong embedder for the domain.
 */
export async function evaluateEmbeddings(cases: EvalCase[]): Promise<EmbeddingMetrics | null> {
  const triplets = cases.filter((c) => c.triplet);
  if (triplets.length === 0) return null;

  let correct = 0;
  const positiveSims: number[] = [];
  const negativeSims: number[] = [];

  for (const c of triplets) {
    const t = c.triplet!;
    const [a, p, n] = await Promise.all([embed(t.anchor), embed(t.positive), embed(t.negative)]);
    const simP = cosine(a, p);
    const simN = cosine(a, n);
    positiveSims.push(simP);
    negativeSims.push(simN);
    if (simP > simN) correct++;
  }

  const avgPos = mean(positiveSims);
  const avgNeg = mean(negativeSims);

  return {
    triplets: triplets.length,
    tripletAccuracy: correct / triplets.length,
    avgPositiveSim: avgPos,
    avgNegativeSim: avgNeg,
    margin: avgPos - avgNeg,
  };
}
