import { getNeo4jDriver } from '../extraction/graph-store';
import { getRedis } from '../queue/redis';
import { config } from '../../config';
import { contextCacheKey, type QueryContext } from '../schemas/context';

export interface StrategyPattern {
  name: string;
  category: string | null;
  usage: number;
  successRate: number | null;
}

export interface ToolPattern {
  name: string;
  category: string | null;
  usage: number;
}

export interface WorkflowSummary {
  key: string;
  name: string;
  goal: string | null;
  outcome: string | null;
  startup: string;
}

export interface OutcomeStats {
  founderCount: number;
  avgMrr: number | null;
  avgUsers: number | null;
}

export interface ContextPatterns {
  context: QueryContext;
  cacheKey: string;
  topStrategies: StrategyPattern[];
  topTools: ToolPattern[];
  workflows: WorkflowSummary[];
  outcomes: OutcomeStats;
  computedAt: string;
  fromCache: boolean;
  /** Which filters were dropped to find matches (empty = exact context matched). */
  relaxedFilters: string[];
}

/**
 * Progressive relaxation order. Interview data describes startups
 * retrospectively (most are at 'growth' stage by interview time), so a
 * question about "building an MVP" must not hard-filter on stage=MVP —
 * drop the least-discriminating filters first until the graph matches.
 */
export function relaxationLevels(context: QueryContext): Array<{ context: QueryContext; dropped: string[] }> {
  const levels: Array<{ context: QueryContext; dropped: string[] }> = [
    { context, dropped: [] },
  ];
  if (context.stage !== undefined) {
    const { stage, ...rest } = context;
    levels.push({ context: rest, dropped: ['stage'] });
  }
  const last = levels[levels.length - 1].context;
  if (last.startupType !== undefined || last.businessModel !== undefined) {
    const { startupType, businessModel, ...rest } = last;
    levels.push({
      context: rest,
      dropped: [...levels[levels.length - 1].dropped, 'startupType', 'businessModel'],
    });
  }
  const keys = Object.keys(levels[levels.length - 1].context).filter(k => k !== 'goal');
  if (keys.length > 0) {
    levels.push({ context: {}, dropped: ['all'] });
  }
  return levels;
}

/**
 * Builds the Cypher WHERE clause for a context. Only defined dimensions
 * filter; an empty context returns global patterns.
 */
function buildContextFilter(context: QueryContext): {
  clause: string;
  params: Record<string, unknown>;
} {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (context.founderType) {
    conditions.push('f.type = $founderType');
    params.founderType = context.founderType;
  }
  if (context.technical !== undefined) {
    conditions.push('f.technical = $technical');
    params.technical = context.technical;
  }
  if (context.stage) {
    conditions.push('s.stage = $stage');
    params.stage = context.stage;
  }
  if (context.startupType) {
    conditions.push('s.type = $startupType');
    params.startupType = context.startupType;
  }
  if (context.businessModel) {
    conditions.push('s.businessModel = $businessModel');
    params.businessModel = context.businessModel;
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/**
 * Get precomputed patterns for a context. Redis-cached (TTL from config)
 * so repeat queries cost zero graph traversals. Falls back to live
 * computation when Redis is down.
 */
export async function getPatterns(context: QueryContext): Promise<ContextPatterns> {
  const cacheKey = `patterns:${contextCacheKey(context)}`;

  try {
    const cached = await getRedis().get(cacheKey);
    if (cached) {
      return { ...(JSON.parse(cached) as ContextPatterns), fromCache: true };
    }
  } catch (error) {
    console.warn('Pattern cache read failed, computing live:', error);
  }

  const patterns = await computePatterns(context);

  try {
    await getRedis().set(
      cacheKey,
      JSON.stringify(patterns),
      'EX',
      config.patternCacheTtlSeconds
    );
  } catch (error) {
    console.warn('Pattern cache write failed:', error);
  }

  return patterns;
}

/**
 * Compute patterns live from Neo4j with progressive filter relaxation:
 * if the exact context matches nothing, drop filters (stage first)
 * until it does.
 */
export async function computePatterns(context: QueryContext): Promise<ContextPatterns> {
  const levels = relaxationLevels(context);
  let result: ContextPatterns | null = null;

  for (const level of levels) {
    result = {
      ...(await computePatternsExact(level.context)),
      context,
      cacheKey: contextCacheKey(context),
      relaxedFilters: level.dropped,
    };
    const hasData =
      result.topStrategies.length > 0 ||
      result.topTools.length > 0 ||
      result.workflows.length > 0;
    if (hasData) return result;
  }

  return result as ContextPatterns;
}

async function computePatternsExact(context: QueryContext): Promise<ContextPatterns> {
  const session = getNeo4jDriver().session();
  const { clause, params } = buildContextFilter(context);

  try {
    const strategiesResult = await session.executeRead(tx =>
      tx.run(
        `MATCH (f:Founder)-[:FOUNDED]->(s:Startup)-[r:IMPLEMENTED_STRATEGY]->(st:Strategy)
         ${clause}
         RETURN st.name AS name, st.category AS category,
                count(r) AS usage,
                avg(CASE r.success WHEN true THEN 1.0 WHEN false THEN 0.0 ELSE null END) AS successRate
         ORDER BY usage DESC, successRate DESC
         LIMIT 10`,
        params
      )
    );

    const toolsResult = await session.executeRead(tx =>
      tx.run(
        `MATCH (f:Founder)-[:FOUNDED]->(s:Startup)-[r:USED_TOOL]->(t:Tool)
         ${clause}
         RETURN t.name AS name, t.category AS category, count(r) AS usage
         ORDER BY usage DESC
         LIMIT 15`,
        params
      )
    );

    const workflowsResult = await session.executeRead(tx =>
      tx.run(
        `MATCH (f:Founder)-[:FOUNDED]->(s:Startup)-[:HAS_WORKFLOW]->(w:Workflow)
         ${clause}
         RETURN w.key AS key, w.name AS name, w.goal AS goal,
                w.outcome AS outcome, s.name AS startup
         LIMIT 10`,
        params
      )
    );

    const outcomesResult = await session.executeRead(tx =>
      tx.run(
        `MATCH (f:Founder)-[:FOUNDED]->(s:Startup)-[:ACHIEVED_OUTCOME]->(o:Outcome)
         ${clause}
         RETURN count(DISTINCT f) AS founderCount,
                avg(o.mrr) AS avgMrr,
                avg(o.users) AS avgUsers`,
        params
      )
    );

    const outcomeRecord = outcomesResult.records[0];

    return {
      context,
      cacheKey: contextCacheKey(context),
      topStrategies: strategiesResult.records.map(record => ({
        name: record.get('name'),
        category: record.get('category'),
        usage: record.get('usage').toNumber(),
        successRate: record.get('successRate'),
      })),
      topTools: toolsResult.records.map(record => ({
        name: record.get('name'),
        category: record.get('category'),
        usage: record.get('usage').toNumber(),
      })),
      workflows: workflowsResult.records.map(record => ({
        key: record.get('key'),
        name: record.get('name'),
        goal: record.get('goal'),
        outcome: record.get('outcome'),
        startup: record.get('startup'),
      })),
      outcomes: {
        founderCount: outcomeRecord?.get('founderCount')?.toNumber() ?? 0,
        avgMrr: outcomeRecord?.get('avgMrr') ?? null,
        avgUsers: outcomeRecord?.get('avgUsers') ?? null,
      },
      computedAt: new Date().toISOString(),
      fromCache: false,
      relaxedFilters: [],
    };
  } finally {
    await session.close();
  }
}

/**
 * Invalidate all cached patterns — call after graph writes (new videos
 * extracted) so stale patterns don't survive past fresh data.
 */
export async function invalidatePatternCache(): Promise<void> {
  try {
    const redis = getRedis();
    const keys = await redis.keys('patterns:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`✓ Invalidated ${keys.length} cached pattern entries`);
    }
  } catch (error) {
    console.warn('Pattern cache invalidation failed:', error);
  }
}
