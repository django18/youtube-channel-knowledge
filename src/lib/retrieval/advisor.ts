import { int as neo4jInt } from 'neo4j-driver';
import { getNeo4jDriver } from '../extraction/graph-store';
import { searchVectorDB, type SearchResult } from '../youtube-vectorstore';
import { getPatterns, type ContextPatterns } from '../patterns/pattern-layer';
import { extractQueryContextDetailed } from './context-extractor';
import { QueryContextSchema, type QueryContext } from '../schemas/context';
import { getLLM, hasLLM, llmModels, stripReasoning, reasoningRequestOverrides } from '../llm';

export interface TraceStage {
  stage: string;
  ms: number;
  status: 'ok' | 'failed' | 'skipped';
  detail: Record<string, unknown>;
}

export interface QueryTrace {
  totalMs: number;
  stages: TraceStage[];
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await fn();
  return { result, ms: Math.round(performance.now() - start) };
}

export interface FounderExample {
  founder: string;
  startup: string;
  startupType: string | null;
  stage: string | null;
  strategies: string[];
  tools: string[];
  outcome: {
    mrr: number | null;
    users: number | null;
    timeline: string | null;
  } | null;
  videoUrl: string | null;
  videoTitle: string | null;
}

export interface AdvisorAnswer {
  question: string;
  context: QueryContext;
  answer: string | null;
  patterns: ContextPatterns;
  examples: FounderExample[];
  sources: Array<{
    videoTitle: string;
    videoUrl: string;
    timestamp: string;
    excerpt: string;
    similarity: number;
  }>;
  synthesized: boolean;
  trace: QueryTrace;
}

/**
 * Multi-hop graph query: founders matching the context, with their full
 * chain — startup → strategies → tools → outcomes → source video.
 */
async function findSimilarFounders(
  context: QueryContext,
  limit: number = 5
): Promise<FounderExample[]> {
  const session = getNeo4jDriver().session();

  const conditions: string[] = [];
  const params: Record<string, unknown> = { limit };

  if (context.founderType) {
    conditions.push('f.type = $founderType');
    params.founderType = context.founderType;
  }
  if (context.technical !== undefined) {
    conditions.push('f.technical = $technical');
    params.technical = context.technical;
  }
  if (context.startupType) {
    conditions.push('s.type = $startupType');
    params.startupType = context.startupType;
  }
  if (context.stage) {
    conditions.push('s.stage = $stage');
    params.stage = context.stage;
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await session.executeRead(tx =>
      tx.run(
        `MATCH (f:Founder)-[:FOUNDED]->(s:Startup)
         ${clause}
         OPTIONAL MATCH (s)-[:IMPLEMENTED_STRATEGY]->(st:Strategy)
         OPTIONAL MATCH (s)-[:USED_TOOL]->(t:Tool)
         OPTIONAL MATCH (s)-[:ACHIEVED_OUTCOME]->(o:Outcome)
         OPTIONAL MATCH (s)-[:MENTIONED_IN]->(v:Video)
         RETURN f.name AS founder, s.name AS startup, s.type AS startupType,
                s.stage AS stage,
                collect(DISTINCT st.name) AS strategies,
                collect(DISTINCT t.name) AS tools,
                o.mrr AS mrr, o.users AS users, o.timeline AS timeline,
                v.url AS videoUrl, v.title AS videoTitle
         ORDER BY o.mrr DESC
         LIMIT $limit`,
        { ...params, limit: neo4jInt(limit) }
      )
    );

    return result.records.map(record => ({
      founder: record.get('founder'),
      startup: record.get('startup'),
      startupType: record.get('startupType'),
      stage: record.get('stage'),
      strategies: (record.get('strategies') as string[]).filter(Boolean),
      tools: (record.get('tools') as string[]).filter(Boolean),
      outcome:
        record.get('mrr') !== null || record.get('users') !== null
          ? {
              mrr: toNumber(record.get('mrr')),
              users: toNumber(record.get('users')),
              timeline: record.get('timeline'),
            }
          : null,
      videoUrl: record.get('videoUrl'),
      videoTitle: record.get('videoTitle'),
    }));
  } finally {
    await session.close();
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'toNumber' in (value as object)) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return null;
}

const SYNTHESIS_SYSTEM_PROMPT = `You are a startup advisor powered by data from 200+ founder interviews (Starter Story).

ALWAYS:
- Reference specific founders and startups from the provided data
- Cite usage counts and success rates from the patterns
- Give step-by-step, actionable advice
- Mention source videos when available

NEVER:
- Give generic advice not grounded in the data
- Invent founders, numbers, or outcomes not present in the input`;

/**
 * Main advisor pipeline:
 * 1. Extract structured context from the question
 * 2. Fetch precomputed patterns (Redis-cached graph aggregates)
 * 3. Multi-hop graph query for similar founders
 * 4. Semantic search for supporting quotes
 * 5. LLM synthesis (skipped gracefully without an API key)
 */
export async function ask(
  question: string,
  explicitContext?: unknown
): Promise<AdvisorAnswer> {
  const askStart = performance.now();
  const stages: TraceStage[] = [];

  // Stage 1: context extraction
  const contextTimed = await timed(async () => {
    if (explicitContext) {
      return {
        context: QueryContextSchema.parse(explicitContext),
        method: 'explicit' as const,
      };
    }
    return extractQueryContextDetailed(question);
  });
  const { context, method: contextMethod } = contextTimed.result;
  stages.push({
    stage: 'context-extraction',
    ms: contextTimed.ms,
    status: 'ok',
    detail: { method: contextMethod, context },
  });

  // Stages 2-4 run in parallel: pattern layer, graph multi-hop, vector search
  const [patternsLeg, examplesLeg, vectorLeg] = await Promise.all([
    timed(async () => {
      try {
        return { value: await getPatterns(context), failed: false };
      } catch (error) {
        console.warn('Pattern lookup failed:', error);
        const empty: ContextPatterns = {
          context,
          cacheKey: 'unavailable',
          topStrategies: [],
          topTools: [],
          workflows: [],
          outcomes: { founderCount: 0, avgMrr: null, avgUsers: null },
          computedAt: new Date().toISOString(),
          fromCache: false,
        };
        return { value: empty, failed: true };
      }
    }),
    timed(async () => {
      try {
        return { value: await findSimilarFounders(context), failed: false };
      } catch (error) {
        console.warn('Graph example lookup failed:', error);
        return { value: [] as FounderExample[], failed: true };
      }
    }),
    timed(async () => {
      try {
        return { value: await searchVectorDB(question, 8), failed: false };
      } catch (error) {
        console.warn('Vector search failed:', error);
        return { value: [] as SearchResult[], failed: true };
      }
    }),
  ]);

  const patterns = patternsLeg.result.value;
  const examples = examplesLeg.result.value;
  const vectorResults = vectorLeg.result.value;

  stages.push({
    stage: 'pattern-layer',
    ms: patternsLeg.ms,
    status: patternsLeg.result.failed ? 'failed' : 'ok',
    detail: {
      fromCache: patterns.fromCache,
      cacheKey: patterns.cacheKey,
      strategies: patterns.topStrategies.length,
      tools: patterns.topTools.length,
      workflows: patterns.workflows.length,
      foundersWithOutcomes: patterns.outcomes.founderCount,
    },
  });
  stages.push({
    stage: 'graph-examples',
    ms: examplesLeg.ms,
    status: examplesLeg.result.failed ? 'failed' : 'ok',
    detail: {
      founders: examples.length,
      hops: 'Founder → Startup → Strategy/Tool → Outcome → Video',
    },
  });
  const similarities = vectorResults.map(r => r.similarity);
  stages.push({
    stage: 'vector-search',
    ms: vectorLeg.ms,
    status: vectorLeg.result.failed ? 'failed' : 'ok',
    detail: {
      chunks: vectorResults.length,
      topSimilarity: similarities.length > 0 ? Math.max(...similarities) : null,
      avgSimilarity:
        similarities.length > 0
          ? similarities.reduce((a, b) => a + b, 0) / similarities.length
          : null,
      embedder: 'MiniLM-L6-v2 (384-dim, cosine)',
    },
  });

  const sources = vectorResults.map(result => ({
    videoTitle: result.videoTitle,
    videoUrl: result.videoUrl,
    timestamp: result.timestamp,
    excerpt: result.text.slice(0, 300),
    similarity: result.similarity,
  }));

  if (!hasLLM()) {
    stages.push({
      stage: 'synthesis',
      ms: 0,
      status: 'skipped',
      detail: { reason: 'No LLM API key set (XAI_API_KEY / OPENAI_API_KEY) — raw retrieval returned' },
    });
    return {
      question,
      context,
      answer: null,
      patterns,
      examples,
      sources,
      synthesized: false,
      trace: { totalMs: Math.round(performance.now() - askStart), stages },
    };
  }

  const userPrompt = `QUESTION: ${question}

EXTRACTED CONTEXT:
${JSON.stringify(context, null, 2)}

PATTERNS (graph aggregates for this context):
${JSON.stringify(
    {
      topStrategies: patterns.topStrategies,
      topTools: patterns.topTools,
      outcomes: patterns.outcomes,
    },
    null,
    2
  )}

SIMILAR FOUNDERS (multi-hop graph results):
${JSON.stringify(examples, null, 2)}

TRANSCRIPT EXCERPTS (semantic search):
${JSON.stringify(sources.slice(0, 5), null, 2)}

TASK: Answer the question with:
1. A direct answer grounded in the data above
2. 2-3 specific founder examples (name, startup, what they did, outcome)
3. A step-by-step recommendation
4. Realistic timeline expectations based on the outcomes data`;

  try {
    const synthesisTimed = await timed(() =>
      getLLM().chat.completions.create({
        model: llmModels().synthesis,
        messages: [
          { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        ...reasoningRequestOverrides(llmModels().synthesis),
      })
    );
    const response = synthesisTimed.result;

    stages.push({
      stage: 'synthesis',
      ms: synthesisTimed.ms,
      status: 'ok',
      detail: {
        model: llmModels().synthesis,
        promptChars: userPrompt.length,
        promptTokens: response.usage?.prompt_tokens ?? null,
        completionTokens: response.usage?.completion_tokens ?? null,
      },
    });

    return {
      question,
      context,
      answer: stripReasoning(response.choices[0]?.message?.content ?? ''),
      patterns,
      examples,
      sources,
      synthesized: true,
      trace: { totalMs: Math.round(performance.now() - askStart), stages },
    };
  } catch (error) {
    console.error('Advisor synthesis failed, returning raw retrieval:', error);
    stages.push({
      stage: 'synthesis',
      ms: 0,
      status: 'failed',
      detail: { error: error instanceof Error ? error.message : String(error) },
    });
    return {
      question,
      context,
      answer: null,
      patterns,
      examples,
      sources,
      synthesized: false,
      trace: { totalMs: Math.round(performance.now() - askStart), stages },
    };
  }
}
