import { getNeo4jDriver } from './graph-store';
import { searchVectorDB, type SearchResult } from '../youtube-vectorstore';
import { getLLM, hasLLM, llmModels, stripReasoning, reasoningRequestOverrides } from '../llm';

export interface SynthesisRequest {
  profile: string; // e.g. "Solo Technical Founder"
  goals: string[]; // e.g. ["Build SaaS", "Reach $10k MRR"]
}

export interface GraphPattern {
  type: string;
  name: string;
  frequency: number;
  successRate: number | null;
  avgMrr: number | null;
}

export interface SynthesisResult {
  profile: string;
  patterns: GraphPattern[];
  workflows: Array<{
    name: string;
    goal: string | null;
    outcome: string | null;
    startup: string;
  }>;
  synthesizedInsights: string | null;
  sourceContextCount: number;
}

/**
 * The Synthesizer queries both Neo4j (graph) and ChromaDB (semantic)
 * to find the "Golden Path" for a specific user profile.
 *
 * Graph side is multi-hop: Founder → Startup → Strategy/Tool → Outcome,
 * so every pattern carries a success rate and average MRR — not just
 * a raw frequency count.
 */
export async function synthesizeKnowledge(
  request: SynthesisRequest
): Promise<SynthesisResult> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    console.log(`\n🧠 Synthesizing knowledge for: ${request.profile}`);

    const founderType = request.profile.toLowerCase().includes('solo')
      ? 'solo'
      : 'team';

    // Multi-hop: strategies/tools linked through to outcomes, with
    // success rates and revenue evidence attached.
    const graphResult = await session.executeRead(tx =>
      tx.run(
        `MATCH (f:Founder)-[:FOUNDED]->(s:Startup)
         WHERE f.type = $founderType OR f.background CONTAINS $profile
         MATCH (s)-[r:USED_TOOL|IMPLEMENTED_STRATEGY]->(target)
         OPTIONAL MATCH (s)-[:ACHIEVED_OUTCOME]->(o:Outcome)
         RETURN
           labels(target)[0] AS type,
           target.name AS name,
           count(DISTINCT s) AS frequency,
           avg(CASE r.success WHEN true THEN 1.0 WHEN false THEN 0.0 ELSE null END) AS successRate,
           avg(o.mrr) AS avgMrr
         ORDER BY frequency DESC, avgMrr DESC
         LIMIT 15`,
        { founderType, profile: request.profile }
      )
    );

    const patterns: GraphPattern[] = graphResult.records.map(record => ({
      type: record.get('type'),
      name: record.get('name'),
      frequency: record.get('frequency').toNumber(),
      successRate: record.get('successRate'),
      avgMrr: record.get('avgMrr'),
    }));

    // Second hop: proven workflows from matching founders.
    const workflowResult = await session.executeRead(tx =>
      tx.run(
        `MATCH (f:Founder)-[:FOUNDED]->(s:Startup)-[:HAS_WORKFLOW]->(w:Workflow)
         WHERE f.type = $founderType
         RETURN w.name AS name, w.goal AS goal, w.outcome AS outcome,
                s.name AS startup
         LIMIT 8`,
        { founderType }
      )
    );

    const workflows = workflowResult.records.map(record => ({
      name: record.get('name'),
      goal: record.get('goal'),
      outcome: record.get('outcome'),
      startup: record.get('startup'),
    }));

    console.log(`✓ Found ${patterns.length} patterns, ${workflows.length} workflows from Graph Memory`);

    // Semantic side: query ChromaDB directly for the "how" and "why"
    // behind the top graph patterns.
    const topKeywords = patterns.slice(0, 5).map(p => p.name).join(' ');
    const semanticResults: SearchResult[] = await searchVectorDB(
      `${request.profile} ${request.goals.join(' ')} ${topKeywords}`,
      10
    ).catch((error): SearchResult[] => {
      console.warn('Semantic search failed during synthesis:', error);
      return [];
    });

    if (!hasLLM()) {
      return {
        profile: request.profile,
        patterns,
        workflows,
        synthesizedInsights: null,
        sourceContextCount: semanticResults.length,
      };
    }

    const synthesisPrompt = `
      You are a Knowledge Synthesizer. You are building a course for a "${request.profile}".

      GRAPH PATTERNS (statistical evidence — frequency, success rate, avg MRR):
      ${JSON.stringify(patterns, null, 2)}

      PROVEN WORKFLOWS:
      ${JSON.stringify(workflows, null, 2)}

      SEMANTIC CONTEXT (real stories & quotes from transcripts):
      ${JSON.stringify(
        semanticResults.map(r => ({
          video: r.videoTitle,
          quote: r.text.slice(0, 400),
        })),
        null,
        2
      )}

      GOALS:
      ${request.goals.join(', ')}

      TASK:
      Synthesize this into a "Golden Path". Identify:
      1. The most common toolstack for this profile.
      2. The top 3 marketing/growth strategies that actually worked (cite success rates).
      3. Key insights that differentiate successful founders in this category.

      Be specific and cite the patterns and quotes.
    `;

    const response = await getLLM().chat.completions.create({
      model: llmModels().synthesis,
      messages: [{ role: 'user', content: synthesisPrompt }],
      temperature: 0.3,
      ...reasoningRequestOverrides(llmModels().synthesis),
    });

    return {
      profile: request.profile,
      patterns,
      workflows,
      synthesizedInsights: stripReasoning(response.choices[0]?.message?.content ?? ''),
      sourceContextCount: semanticResults.length,
    };
  } finally {
    await session.close();
  }
}
