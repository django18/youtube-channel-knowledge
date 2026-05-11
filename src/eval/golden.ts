import { readFile } from 'node:fs/promises';
import { EvalCaseSchema, type EvalCase } from './types';
import { config } from '../config';

/**
 * Load and validate golden cases from a JSONL file.
 * Invalid lines are dropped with a console warning so a single bad row
 * doesn't kill the whole eval run.
 */
export async function loadGolden(path: string = config.evalGoldenPath): Promise<EvalCase[]> {
  const raw = await readFile(path, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const cases: EvalCase[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]);
      cases.push(EvalCaseSchema.parse(parsed));
    } catch (err: any) {
      console.warn(`golden:${path}:${i + 1} skipped: ${err?.message ?? err}`);
    }
  }

  return cases;
}

export function partition(cases: EvalCase[]): {
  retrieval: EvalCase[];
  graph: EvalCase[];
  embedding: EvalCase[];
} {
  return {
    retrieval: cases.filter((c) => c.query && c.relevantChunkIds && c.relevantChunkIds.length > 0),
    graph: cases.filter((c) => c.query && c.expectedEntities),
    embedding: cases.filter((c) => c.triplet),
  };
}
