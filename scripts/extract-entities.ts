#!/usr/bin/env bun
/**
 * Extract entities from all scraped transcripts
 */

import { readTranscriptsFromChroma, readSingleTranscript } from '../src/lib/extraction/chroma-reader';
import { extractEntities, extractEntitiesBatch } from '../src/lib/extraction/extractor';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(process.cwd(), 'data', 'extracted');

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function extractSingle(videoId: string) {
  console.log(`\n🎯 Extracting entities for single video: ${videoId}\n`);

  const transcript = await readSingleTranscript(videoId);

  if (!transcript) {
    console.error(`Video not found: ${videoId}`);
    process.exit(1);
  }

  const result = await extractEntities(transcript, {
    model: 'gpt-4o-mini',
  });

  if (result.success && result.entities) {
    const outputPath = join(OUTPUT_DIR, `${videoId}.json`);
    writeFileSync(outputPath, JSON.stringify(result.entities, null, 2));
    console.log(`\n✓ Saved to: ${outputPath}`);
    console.log(`\nExtracted entities:`);
    console.log(`- Founder: ${result.entities.founder?.name || 'Unknown'}`);
    console.log(`- Startup: ${result.entities.startup.name}`);
    console.log(`- Strategies: ${result.entities.strategies.length}`);
    console.log(`- Tools: ${result.entities.tools.length}`);
    console.log(`- Workflows: ${result.entities.workflows?.length || 0}`);
  } else {
    console.error(`\n✗ Failed: ${result.error}`);
    process.exit(1);
  }
}

async function extractAll() {
  console.log(`\n🎯 Extracting entities from all transcripts\n`);

  // Read all transcripts
  const transcripts = await readTranscriptsFromChroma();

  if (transcripts.length === 0) {
    console.error('No transcripts found in ChromaDB');
    process.exit(1);
  }

  console.log(`Found ${transcripts.length} transcripts to process\n`);

  // Extract in batches
  const results = await extractEntitiesBatch(transcripts, {
    batchSize: 5,
    delayMs: 2000,
    onProgress: (current, total, videoTitle) => {
      console.log(`[${current}/${total}] ${videoTitle}`);
    },
  });

  // Save all results
  const allEntities = results
    .filter(r => r.success && r.entities)
    .map(r => r.entities!);

  const summaryPath = join(OUTPUT_DIR, 'all-entities.json');
  writeFileSync(summaryPath, JSON.stringify(allEntities, null, 2));
  console.log(`\n✓ Saved all entities to: ${summaryPath}`);

  // Save individual files
  for (const result of results) {
    if (result.success && result.entities) {
      const outputPath = join(OUTPUT_DIR, `${result.videoId}.json`);
      writeFileSync(outputPath, JSON.stringify(result.entities, null, 2));
    }
  }

  // Summary stats
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalTokens = results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);
  const estimatedCost = (totalTokens / 1000) * 0.00015; // gpt-4o-mini pricing

  console.log(`\n📊 Summary:`);
  console.log(`  - Total videos: ${transcripts.length}`);
  console.log(`  - Successful: ${successful}`);
  console.log(`  - Failed: ${failed}`);
  console.log(`  - Total tokens: ${totalTokens.toLocaleString()}`);
  console.log(`  - Estimated cost: $${estimatedCost.toFixed(2)}`);

  // Save failed list
  const failedList = results.filter(r => !r.success).map(r => ({
    videoId: r.videoId,
    error: r.error,
  }));

  if (failedList.length > 0) {
    const failedPath = join(OUTPUT_DIR, 'failed.json');
    writeFileSync(failedPath, JSON.stringify(failedList, null, 2));
    console.log(`\n⚠️  Failed extractions saved to: ${failedPath}`);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length > 0) {
  const videoId = args[0];
  extractSingle(videoId).catch(console.error);
} else {
  extractAll().catch(console.error);
}
