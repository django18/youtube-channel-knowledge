#!/usr/bin/env bun
/**
 * CLI entry: `bun run eval` or `bun scripts/run-eval.ts [golden-path]`.
 * Writes JSON to eval/results/ and prints markdown summary to stdout.
 */
import { runEval, formatReport } from '../src/eval/runner';

const goldenPath = process.argv[2];

(async () => {
  try {
    const report = await runEval(goldenPath ? { goldenPath } : undefined);
    console.log('\n' + formatReport(report));
    process.exit(0);
  } catch (err: any) {
    console.error('Eval failed:', err);
    process.exit(1);
  }
})();
