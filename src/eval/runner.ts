import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
import { getEmbeddingProvider } from '../lib/embeddings';
import { loadGolden, partition } from './golden';
import { evaluateEmbeddings } from './embedding-eval';
import { evaluateRetrieval } from './retrieval-eval';
import { evaluateGraph } from './graph-eval';
import type { EvalReport } from './types';

/**
 * Weighted composite. Renormalizes when a category is skipped (no golden
 * cases of that type), so an eval with only retrieval data still produces
 * a meaningful single score.
 */
function composite(report: EvalReport): number {
  const weights = { embedding: 0.2, retrieval: 0.5, graph: 0.3 };
  let total = 0;
  let weightSum = 0;

  if (report.embedding) {
    total += weights.embedding * report.embedding.tripletAccuracy;
    weightSum += weights.embedding;
  }
  if (report.retrieval) {
    // Headline retrieval number = nDCG@10. Captures rank-awareness.
    total += weights.retrieval * report.retrieval.ndcgAt10;
    weightSum += weights.retrieval;
  }
  if (report.graph) {
    // Use F1 of recall/precision for the graph score.
    const r = report.graph.entityRecall;
    const p = report.graph.entityPrecision;
    const f1 = r + p === 0 ? 0 : (2 * r * p) / (r + p);
    total += weights.graph * f1;
    weightSum += weights.graph;
  }

  return weightSum === 0 ? 0 : total / weightSum;
}

export async function runEval(opts?: {
  goldenPath?: string;
  skip?: { embedding?: boolean; retrieval?: boolean; graph?: boolean };
}): Promise<EvalReport> {
  const path = opts?.goldenPath ?? config.evalGoldenPath;
  const skip = opts?.skip ?? {};

  console.log(`Loading golden cases from ${path}...`);
  const cases = await loadGolden(path);
  const buckets = partition(cases);
  console.log(
    `Loaded ${cases.length} cases: retrieval=${buckets.retrieval.length}, ` +
      `graph=${buckets.graph.length}, embedding=${buckets.embedding.length}`
  );

  const provider = getEmbeddingProvider();

  const embedding = skip.embedding ? null : await safeRun('embedding', () => evaluateEmbeddings(buckets.embedding));
  const retrieval = skip.retrieval ? null : await safeRun('retrieval', () => evaluateRetrieval(buckets.retrieval));
  const graph = skip.graph ? null : await safeRun('graph', () => evaluateGraph(buckets.graph));

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    config: {
      provider: provider.name,
      dimension: provider.dimension,
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      collection: config.youtubeCollectionName,
    },
    embedding,
    retrieval,
    graph,
    score: 0,
  };
  report.score = composite(report);

  await persist(report);
  return report;
}

async function safeRun<T>(label: string, fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch (err: any) {
    console.error(`[eval:${label}] failed:`, err?.message ?? err);
    return null;
  }
}

async function persist(report: EvalReport): Promise<string> {
  await mkdir(config.evalOutputDir, { recursive: true });
  const filename = `${report.timestamp.replace(/[:.]/g, '-')}.json`;
  const path = join(config.evalOutputDir, filename);
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(config.evalOutputDir, 'latest.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`✓ Report written: ${path}`);
  return path;
}

export async function loadLatest(): Promise<EvalReport | null> {
  try {
    const raw = await readFile(join(config.evalOutputDir, 'latest.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadHistory(limit: number = 20): Promise<EvalReport[]> {
  try {
    const files = (await readdir(config.evalOutputDir))
      .filter((f) => f.endsWith('.json') && f !== 'latest.json')
      .sort()
      .reverse()
      .slice(0, limit);
    const reports: EvalReport[] = [];
    for (const f of files) {
      try {
        const raw = await readFile(join(config.evalOutputDir, f), 'utf8');
        reports.push(JSON.parse(raw));
      } catch {
        /* skip */
      }
    }
    return reports;
  } catch {
    return [];
  }
}

/**
 * Pretty markdown summary for terminal / Slack / PR comment.
 */
export function formatReport(r: EvalReport): string {
  const lines: string[] = [];
  lines.push(`# Eval Report — ${r.timestamp}`);
  lines.push('');
  lines.push(`**Composite score:** ${(r.score * 100).toFixed(1)} / 100`);
  lines.push('');
  lines.push(`**Config:** provider=${r.config.provider} dim=${r.config.dimension} chunk=${r.config.chunkSize}/${r.config.chunkOverlap}`);
  lines.push('');

  if (r.embedding) {
    lines.push('## Embedding (triplet)');
    lines.push(`- Triplets: ${r.embedding.triplets}`);
    lines.push(`- Accuracy: ${(r.embedding.tripletAccuracy * 100).toFixed(1)}%`);
    lines.push(`- Margin (avgPos − avgNeg): ${r.embedding.margin.toFixed(3)}`);
    lines.push('');
  }

  if (r.retrieval) {
    lines.push('## Retrieval');
    lines.push(`- Queries: ${r.retrieval.queries}`);
    lines.push(`- Recall@1 / @5 / @10: ${pct(r.retrieval.recallAt1)} / ${pct(r.retrieval.recallAt5)} / ${pct(r.retrieval.recallAt10)}`);
    lines.push(`- Precision@5 / @10: ${pct(r.retrieval.precisionAt5)} / ${pct(r.retrieval.precisionAt10)}`);
    lines.push(`- MRR: ${r.retrieval.mrr.toFixed(3)}`);
    lines.push(`- nDCG@10: ${r.retrieval.ndcgAt10.toFixed(3)}`);
    lines.push(`- Latency p50 / p95: ${r.retrieval.latencyP50Ms}ms / ${r.retrieval.latencyP95Ms}ms`);
    lines.push('');
  }

  if (r.graph) {
    lines.push('## Graph retrieval');
    lines.push(`- Queries: ${r.graph.queries}`);
    lines.push(`- Entity recall / precision: ${pct(r.graph.entityRecall)} / ${pct(r.graph.entityPrecision)}`);
    for (const [label, m] of Object.entries(r.graph.byLabel)) {
      lines.push(`  - ${label}: recall=${pct(m.recall)} precision=${pct(m.precision)}`);
    }
    if (r.graph.missing.length > 0) {
      lines.push(`- Missing entities (first 5):`);
      for (const m of r.graph.missing.slice(0, 5)) {
        lines.push(`  - ${m.id}: ${m.missing.join(', ')}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
