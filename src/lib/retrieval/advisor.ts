import { int as neo4jInt } from 'neo4j-driver';
import { getNeo4jDriver } from '../extraction/graph-store';
import { searchVectorDB, type SearchResult } from '../youtube-vectorstore';
import { getPatterns, type ContextPatterns } from '../patterns/pattern-layer';
import { extractQueryContext } from './context-extractor';
import { QueryContextSchema, type QueryContext } from '../schemas/context';
import { getOpenAI } from '../openai';

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
  const context = explicitContext
    ? QueryContextSchema.parse(explicitContext)
    : await extractQueryContext(question);

  const [patterns, examples, vectorResults] = await Promise.all([
    getPatterns(context).catch((error): ContextPatterns => {
      console.warn('Pattern lookup failed:', error);
      return {
        context,
        cacheKey: 'unavailable',
        topStrategies: [],
        topTools: [],
        workflows: [],
        outcomes: { founderCount: 0, avgMrr: null, avgUsers: null },
        computedAt: new Date().toISOString(),
        fromCache: false,
      };
    }),
    findSimilarFounders(context).catch((error): FounderExample[] => {
      console.warn('Graph example lookup failed:', error);
      return [];
    }),
    searchVectorDB(question, 8).catch((error): SearchResult[] => {
      console.warn('Vector search failed:', error);
      return [];
    }),
  ]);

  const sources = vectorResults.map(result => ({
    videoTitle: result.videoTitle,
    videoUrl: result.videoUrl,
    timestamp: result.timestamp,
    excerpt: result.text.slice(0, 300),
    similarity: result.similarity,
  }));

  if (!process.env.OPENAI_API_KEY) {
    return {
      question,
      context,
      answer: null,
      patterns,
      examples,
      sources,
      synthesized: false,
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
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    });

    return {
      question,
      context,
      answer: response.choices[0]?.message?.content ?? null,
      patterns,
      examples,
      sources,
      synthesized: true,
    };
  } catch (error) {
    console.error('Advisor synthesis failed, returning raw retrieval:', error);
    return {
      question,
      context,
      answer: null,
      patterns,
      examples,
      sources,
      synthesized: false,
    };
  }
}
