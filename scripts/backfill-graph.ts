#!/usr/bin/env bun

/**
 * 🛠️ Graph Backfill Utility (Staff Engineer Choice)
 * 
 * This script synchronizes Graph Memory (Neo4j) with Semantic Memory (ChromaDB).
 * It reconstructs full transcripts from ChromaDB chunks and runs the 
 * extraction engine to populate the Neo4j graph for all existing data.
 */

import { readTranscriptsFromChroma } from '../src/lib/extraction/chroma-reader';
import { extractEntitiesBatch } from '../src/lib/extraction/extractor';
import { closeNeo4jDriver, getNeo4jDriver } from '../src/lib/extraction/graph-store';

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Starting Graph Backfill: ChromaDB -> Neo4j');
  console.log('='.repeat(60) + '\n');

  try {
    // 1. Verify Connections
    console.log('📡 Verifying database connections...');
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    console.log('✓ Neo4j connection verified');

    // 2. Read existing transcripts from ChromaDB
    const transcripts = await readTranscriptsFromChroma();
    
    if (transcripts.length === 0) {
      console.log('⚠️ No transcripts found in ChromaDB. Nothing to backfill.');
      process.exit(0);
    }

    console.log(`\n📋 Found ${transcripts.length} videos to process.`);

    // 3. Check Neo4j for already processed videos to avoid double work
    const session = driver.session();
    const existingResult = await session.executeRead(tx =>
      tx.run('MATCH (v:Video) RETURN v.id as id')
    );
    const existingIds = new Set(existingResult.records.map(r => r.get('id')));
    await session.close();

    const pendingTranscripts = transcripts.filter(t => !existingIds.has(t.videoId));
    
    console.log(`✓ ${existingIds.size} videos already in Graph Memory.`);
    console.log(`🎯 ${pendingTranscripts.length} videos need backfilling.`);

    if (pendingTranscripts.length === 0) {
      console.log('\n✅ Graph is already fully synchronized!');
      await closeNeo4jDriver();
      process.exit(0);
    }

    // 4. Run Batch Extraction
    // This will trigger extractEntities which now includes saveToGraph()
    console.log('\n🧠 Starting extraction and graph ingestion...');
    
    await extractEntitiesBatch(pendingTranscripts, {
      batchSize: 3, // Smaller batch size for backfill to avoid rate limits
      delayMs: 2000,
      onProgress: (current, total, title) => {
        const percent = Math.round((current / total) * 100);
        console.log(`[${percent}%] (${current}/${total}) Processed: ${title}`);
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Graph Backfill Complete!');
    console.log('='.repeat(60) + '\n');

  } catch (error: any) {
    console.error('\n❌ Backfill failed:', error.message || error);
    process.exit(1);
  } finally {
    await closeNeo4jDriver();
  }
}

// Run the script
main();
