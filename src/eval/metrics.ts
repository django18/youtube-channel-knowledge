/**
 * Pure metric functions. No I/O.
 * Conventions:
 *  - retrieved: ordered array of doc ids returned by the system (rank 0 = best).
 *  - relevant: set of doc ids that are actually relevant.
 *  - k: cutoff.
 */

export function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const top = retrieved.slice(0, k);
  let hits = 0;
  for (const id of top) if (relevant.has(id)) hits++;
  return hits / relevant.size;
}

export function precisionAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (k === 0) return 0;
  const top = retrieved.slice(0, k);
  let hits = 0;
  for (const id of top) if (relevant.has(id)) hits++;
  return hits / Math.min(k, top.length || 1);
}

/**
 * Reciprocal rank of the first relevant doc. Returns 0 if no relevant doc retrieved.
 */
export function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

/**
 * nDCG@k with binary relevance. dcg = sum_i (rel_i / log2(i+2)).
 */
export function ndcgAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  const top = retrieved.slice(0, k);
  let dcg = 0;
  for (let i = 0; i < top.length; i++) {
    const rel = relevant.has(top[i]) ? 1 : 0;
    dcg += rel / Math.log2(i + 2);
  }
  const idealHits = Math.min(relevant.size, k);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

/**
 * Cosine similarity for L2-or-anything vectors.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: dim mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Recall/precision over a set comparison (used for graph entity eval).
 */
export function setRecall(expected: Set<string>, actual: Set<string>): number {
  if (expected.size === 0) return 1; // nothing expected = trivially perfect
  let hits = 0;
  for (const e of expected) if (actual.has(normalize(e))) hits++;
  return hits / expected.size;
}

export function setPrecision(expected: Set<string>, actual: Set<string>): number {
  if (actual.size === 0) return 0;
  const expectedNorm = new Set(Array.from(expected).map(normalize));
  let hits = 0;
  for (const a of actual) if (expectedNorm.has(a)) hits++;
  return hits / actual.size;
}

export function normalize(s: string): string {
  return s.toLowerCase().trim();
}
