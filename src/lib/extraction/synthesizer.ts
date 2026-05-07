import { getNeo4jDriver } from './graph-store';
import { ChromaClient } from 'chromadb';
import { config } from '../../config';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface SynthesisRequest {
  profile: string; // e.g. "Solo Technical Founder"
  goals: string[]; // e.g. ["Build SaaS", "Reach $10k MRR"]
}

/**
 * The Synthesizer queries both Neo4j (Graph) and ChromaDB (Semantic)
 * to find the "Golden Path" for a specific user profile.
 */
export async function synthesizeKnowledge(request: SynthesisRequest) {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    console.log(`\n🧠 Synthesizing knowledge for: ${request.profile}`);

    // 1. Graph Query: Find patterns for this profile
    // We look for founders with similar background/type and the tools/strategies they used
    const graphResult = await session.executeRead(tx =>
      tx.run(`
        MATCH (f:Founder)
        WHERE f.type CONTAINS $type OR f.background CONTAINS $profile
        MATCH (f)-[:FOUNDED]->(s:Startup)
        MATCH (s)-[r:USED_TOOL|IMPLEMENTED_STRATEGY]->(target)
        RETURN 
          labels(target)[0] as type,
          target.name as name,
          count(r) as frequency,
          collect(target.category) as categories
        ORDER BY frequency DESC
        LIMIT 10
      `, { 
        type: request.profile.toLowerCase().includes('solo') ? 'solo' : 'team',
        profile: request.profile
      })
    );

    const patterns = graphResult.records.map(record => ({
      type: record.get('type'),
      name: record.get('name'),
      frequency: record.get('frequency').toNumber(),
      categories: record.get('categories')
    }));

    console.log(`✓ Found ${patterns.length} structural patterns from Graph Memory`);

    // 2. Semantic Query: Get the "How" and "Why" for these patterns
    // We'll search ChromaDB for the most frequent tools and strategies
    const topKeywords = patterns.slice(0, 5).map(p => p.name).join(' ');
    
    // Note: In a real implementation, we'd use the existing search API or ChromaClient directly
    // For this prototype, we'll assume a search function is available or we use the REST API
    const semanticResponse = await fetch(`${config.chromaUrl}/api/youtube/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query: `${request.profile} ${topKeywords}`,
        limit: 10 
      })
    }).catch(() => null);

    const semanticContext = semanticResponse ? await semanticResponse.json() : { results: [] };

    // 3. LLM Synthesis: Merge patterns and context
    const synthesisPrompt = `
      You are a Knowledge Synthesizer. You are building a course for a "${request.profile}".
      
      GRAPH PATTERNS (Statistical Evidence):
      ${JSON.stringify(patterns, null, 2)}
      
      SEMANTIC CONTEXT (Real Stories & Quotes):
      ${JSON.stringify(semanticContext.results, null, 2)}
      
      GOALS:
      ${request.goals.join(', ')}
      
      TASK:
      Synthesize this into a "Golden Path". Identify:
      1. The most common toolstack for this profile.
      2. The top 3 marketing/growth strategies that actually worked.
      3. Key insights that differentiate successful founders in this category.
      
      Be specific and cite the patterns.
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: synthesisPrompt }],
      temperature: 0.3,
    });

    return {
      profile: request.profile,
      patterns,
      synthesizedInsights: response.choices[0]?.message?.content,
      sourceContextCount: semanticContext.results.length
    };

  } finally {
    await session.close();
  }
}
