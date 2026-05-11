#!/usr/bin/env bun
/**
 * Bootstrap a domain-specific golden set from already-scraped transcripts.
 *
 * Strategy:
 *  - Pull random sample of N chunks from Chroma.
 *  - For each chunk, ask the LLM to write 1-2 search queries that the
 *    chunk should answer (the chunk's id becomes the relevant id).
 *  - Also build embedding triplets by pairing each chunk with a same-video
 *    chunk (positive) and a random-other-video chunk (negative).
 *  - Optionally: pull entities from Neo4j for the source video and add as
 *    expectedEntities.
 *
 * Output: appends to eval/golden.jsonl. Review by hand before trusting.
 */
import { ChromaClient } from 'chromadb';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import OpenAI from 'openai';
import { config } from '../src/config';
import { getNeo4jDriver } from '../src/lib/extraction/graph-store';
import type { EvalCase } from '../src/eval/types';

const SAMPLE_SIZE = parseInt(process.env.BOOTSTRAP_SAMPLE ?? '15', 10);
const OUTPUT_PATH = config.evalGoldenPath;

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function generateQueriesForChunk(client: OpenAI, text: string): Promise<string[]> {
  const resp = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'You generate 2 short search queries that the given transcript chunk should answer. Output JSON array of strings only. No prose.',
      },
      { role: 'user', content: text.slice(0, 2000) },
    ],
    temperature: 0.4,
  });
  try {
    const content = resp.choices[0]?.message?.content ?? '[]';
    const json = content.match(/\[[\s\S]*\]/)?.[0] ?? '[]';
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.length > 0) : [];
  } catch {
    return [];
  }
}

async function getEntitiesForVideo(videoId: string) {
  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: 'READ' });
  try {
    const r = await session.run(
      `MATCH (v:Video {id: $videoId})
       OPTIONAL MATCH (v)<-[:MENTIONED_IN]-(s:Startup)
       OPTIONAL MATCH (s)-[:USED_TOOL]->(t:Tool)
       OPTIONAL MATCH (s)-[:IMPLEMENTED_STRATEGY]->(st:Strategy)
       OPTIONAL MATCH (f:Founder)-[:FOUNDED]->(s)
       RETURN collect(DISTINCT s.name) AS startups,
              collect(DISTINCT t.name) AS tools,
              collect(DISTINCT st.name) AS strategies,
              collect(DISTINCT f.name) AS founders`,
      { videoId }
    );
    const row = r.records[0];
    if (!row) return undefined;
    return {
      startups: (row.get('startups') ?? []).filter(Boolean),
      tools: (row.get('tools') ?? []).filter(Boolean),
      strategies: (row.get('strategies') ?? []).filter(Boolean),
      founders: (row.get('founders') ?? []).filter(Boolean),
    };
  } finally {
    await session.close();
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY required for query generation. Aborting.');
    process.exit(1);
  }
  const client = new OpenAI();

  const chroma = new ChromaClient({ path: config.chromaUrl });
  const coll = await chroma.getOrCreateCollection({ name: config.youtubeCollectionName });
  const count = await coll.count();
  if (count === 0) {
    console.error('Collection is empty. Scrape some videos first.');
    process.exit(1);
  }

  const all = await coll.get({ limit: 1000 });
  const sample = pickRandom(
    (all.ids ?? []).map((id, i) => ({
      id,
      document: (all.documents ?? [])[i] as string,
      metadata: (all.metadatas ?? [])[i] as any,
    })),
    SAMPLE_SIZE
  );

  const cases: EvalCase[] = [];

  // Retrieval + graph cases
  for (const chunk of sample) {
    if (!chunk.document) continue;
    const queries = await generateQueriesForChunk(client, chunk.document);
    const entities = chunk.metadata?.videoId ? await getEntitiesForVideo(chunk.metadata.videoId) : undefined;

    queries.forEach((q, i) => {
      cases.push({
        id: `auto-${chunk.id}-q${i}`,
        query: q,
        relevantChunkIds: [chunk.id],
        expectedEntities: entities && Object.values(entities).some((arr: any) => arr.length > 0) ? entities : undefined,
        notes: `auto-generated from chunk ${chunk.id}`,
      });
    });
  }

  // Embedding triplets: pair same-video chunks as positives, different-video as negatives
  const byVideo = new Map<string, typeof sample>();
  for (const c of sample) {
    const vid = (c.metadata as any)?.videoId;
    if (!vid) continue;
    if (!byVideo.has(vid)) byVideo.set(vid, []);
    byVideo.get(vid)!.push(c);
  }
  const videos = Array.from(byVideo.keys());
  for (const [vid, chunks] of byVideo) {
    if (chunks.length < 2) continue;
    const otherVid = videos.find((v) => v !== vid);
    if (!otherVid) continue;
    const otherChunk = byVideo.get(otherVid)![0];
    const [a, p] = chunks;
    cases.push({
      id: `trip-${a.id}`,
      triplet: {
        anchor: a.document.slice(0, 400),
        positive: p.document.slice(0, 400),
        negative: otherChunk.document.slice(0, 400),
      },
      notes: 'auto-generated triplet',
    });
  }

  await mkdir('eval', { recursive: true });
  const existing = existsSync(OUTPUT_PATH) ? await readFile(OUTPUT_PATH, 'utf8') : '';
  const lines = cases.map((c) => JSON.stringify(c)).join('\n') + '\n';
  await writeFile(OUTPUT_PATH, existing + lines, 'utf8');
  console.log(`✓ Appended ${cases.length} cases to ${OUTPUT_PATH}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
