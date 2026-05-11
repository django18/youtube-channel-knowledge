import { getNeo4jDriver } from '../extraction/graph-store';
import { ChromaClient } from 'chromadb';
import { pipeline } from '@xenova/transformers';
import { config } from '../config';
import { mean, normalize, setPrecision, setRecall } from './metrics';
import type { EvalCase, GraphMetrics } from './types';

let embedder: any = null;
let chromaClient: ChromaClient | null = null;

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
 * Graph retrieval eval: simulates the real RAG path.
 *  1. Run vector search → get top-k video chunks.
 *  2. Take videoIds from those chunks.
 *  3. Query Neo4j: MATCH (v:Video)<-[:MENTIONED_IN]-(s:Startup)
 *                  -[*1..2]->(any)
 *     to expand the seed videos into related entities.
 *  4. Compare extracted Startup/Tool/Strategy/Founder names against
 *     `expectedEntities` from the golden case.
 *
 * This is the metric that matters most for the synthesizer:
 * "given a question, does the graph surface the right concepts."
 */
export async function evaluateGraph(cases: EvalCase[]): Promise<GraphMetrics | null> {
  const usable = cases.filter((c) => c.query && c.expectedEntities);
  if (usable.length === 0) return null;

  if (!chromaClient) chromaClient = new ChromaClient({ path: config.chromaUrl });
  const coll = await chromaClient.getOrCreateCollection({ name: config.youtubeCollectionName });

  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: 'READ' });

  const TOP_VIDEOS = 5;
  const labels: Array<['startups', 'Startup'] | ['tools', 'Tool'] | ['strategies', 'Strategy'] | ['founders', 'Founder']> = [
    ['startups', 'Startup'],
    ['tools', 'Tool'],
    ['strategies', 'Strategy'],
    ['founders', 'Founder'],
  ];

  const byLabelAcc: Record<string, { recall: number[]; precision: number[] }> = {
    Startup: { recall: [], precision: [] },
    Tool: { recall: [], precision: [] },
    Strategy: { recall: [], precision: [] },
    Founder: { recall: [], precision: [] },
  };
  const overallRecall: number[] = [];
  const overallPrecision: number[] = [];
  const missing: GraphMetrics['missing'] = [];

  try {
    for (const cse of usable) {
      const qEmb = await embedQuery(cse.query!);
      const res = await coll.query({
        queryEmbeddings: [qEmb],
        nResults: 20,
        include: ['metadatas'],
      });

      const videoIds = Array.from(
        new Set(
          ((res.metadatas?.[0] ?? []) as any[]).map((m) => m?.videoId).filter(Boolean)
        )
      ).slice(0, TOP_VIDEOS);

      if (videoIds.length === 0) {
        overallRecall.push(0);
        overallPrecision.push(0);
        missing.push({ id: cse.id, missing: ['no chunks retrieved'] });
        continue;
      }

      const actualByLabel: Record<string, Set<string>> = {
        Startup: new Set(),
        Tool: new Set(),
        Strategy: new Set(),
        Founder: new Set(),
      };

      // Pull entities reachable within 2 hops from seed videos.
      const cypher = `
        MATCH (v:Video) WHERE v.id IN $videoIds
        OPTIONAL MATCH (v)<-[:MENTIONED_IN]-(s:Startup)
        OPTIONAL MATCH (s)-[:USED_TOOL]->(t:Tool)
        OPTIONAL MATCH (s)-[:IMPLEMENTED_STRATEGY]->(st:Strategy)
        OPTIONAL MATCH (f:Founder)-[:FOUNDED]->(s)
        RETURN
          collect(DISTINCT s.name) AS startups,
          collect(DISTINCT t.name) AS tools,
          collect(DISTINCT st.name) AS strategies,
          collect(DISTINCT f.name) AS founders
      `;
      const r = await session.run(cypher, { videoIds });
      const row = r.records[0];
      if (row) {
        for (const k of ['startups', 'tools', 'strategies', 'founders']) {
          const labelMap: Record<string, string> = {
            startups: 'Startup',
            tools: 'Tool',
            strategies: 'Strategy',
            founders: 'Founder',
          };
          for (const n of (row.get(k) ?? []) as string[]) {
            if (n) actualByLabel[labelMap[k]].add(normalize(n));
          }
        }
      }

      const allExpected = new Set<string>();
      const allActual = new Set<string>();
      const caseMissing: string[] = [];

      for (const [key, label] of labels) {
        const expected = new Set((cse.expectedEntities![key] ?? []).map(normalize));
        const actual = actualByLabel[label];
        if (expected.size === 0) continue;
        const rec = setRecall(expected, actual);
        const prec = setPrecision(expected, actual);
        byLabelAcc[label].recall.push(rec);
        byLabelAcc[label].precision.push(prec);
        for (const e of expected) {
          allExpected.add(`${label}:${e}`);
          if (!actual.has(e)) caseMissing.push(`${label}:${e}`);
        }
        for (const a of actual) allActual.add(`${label}:${a}`);
      }

      overallRecall.push(setRecall(allExpected, allActual));
      overallPrecision.push(setPrecision(allExpected, allActual));
      if (caseMissing.length > 0) missing.push({ id: cse.id, missing: caseMissing });
    }
  } finally {
    await session.close();
  }

  const byLabel: GraphMetrics['byLabel'] = {};
  for (const [label, acc] of Object.entries(byLabelAcc)) {
    byLabel[label] = {
      recall: mean(acc.recall),
      precision: mean(acc.precision),
    };
  }

  return {
    queries: usable.length,
    entityRecall: mean(overallRecall),
    entityPrecision: mean(overallPrecision),
    byLabel,
    missing,
  };
}
