import { QueryContextSchema, type QueryContext } from '../schemas/context';
import { getOpenAI } from '../openai';

const EXTRACTION_PROMPT = `Extract the founder/startup context from this question about building products and businesses.

QUESTION:
{question}

Return a JSON object with ONLY the fields that are clearly implied by the question (omit anything not mentioned):
- founderType: "solo" | "team"
- technical: boolean (does the asker code?)
- stage: "idea" | "MVP" | "growth" | "scale"
- startupType: "SaaS" | "mobile app" | "marketplace" | "content site" | "e-commerce" | "tool" | "API" | "other"
- businessModel: "subscription" | "one-time" | "freemium" | "ads" | "marketplace"
- budget: "free" | "low" | "medium" | "high"
- goal: short phrase describing what they want to achieve (e.g. "validate idea", "first customers", "reach $10k MRR")

Do not guess. Only include fields with clear evidence in the question.`;

/**
 * Extract structured context from a free-text question using gpt-4o-mini.
 * Falls back to keyword heuristics when no API key is configured or the
 * call fails, so /api/ask degrades instead of erroring.
 */
export async function extractQueryContext(question: string): Promise<QueryContext> {
  if (!process.env.OPENAI_API_KEY) {
    return heuristicContext(question);
  }

  try {
    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: EXTRACTION_PROMPT.replace('{question}', question) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from context extraction');
    }

    return QueryContextSchema.parse(JSON.parse(content));
  } catch (error) {
    console.warn('LLM context extraction failed, using heuristics:', error);
    return heuristicContext(question);
  }
}

/**
 * Keyword-based fallback. Coarse but free and instant.
 */
export function heuristicContext(question: string): QueryContext {
  const q = question.toLowerCase();
  const context: QueryContext = {};

  if (/\bsolo\b|by myself|on my own|indie/.test(q)) {
    context.founderType = 'solo';
  } else if (/\bco-?founders?\b|\bteam\b/.test(q)) {
    context.founderType = 'team';
  }

  if (/\b(developer|engineer|programmer|i can code|technical founder)\b/.test(q)) {
    context.technical = true;
  } else if (/\b(non-?technical|can'?t code|no-?code)\b/.test(q)) {
    context.technical = false;
  }

  if (/\b(idea|validate|validation)\b/.test(q)) {
    context.stage = 'idea';
  } else if (/\bmvp\b|first version|launch/.test(q)) {
    context.stage = 'MVP';
  } else if (/\b(grow|growth|scale|scaling)\b/.test(q)) {
    context.stage = 'growth';
  }

  if (/\bsaas\b/.test(q)) {
    context.startupType = 'SaaS';
  } else if (/mobile app|ios app|android app/.test(q)) {
    context.startupType = 'mobile app';
  } else if (/\bmarketplace\b/.test(q)) {
    context.startupType = 'marketplace';
  } else if (/e-?commerce|online store/.test(q)) {
    context.startupType = 'e-commerce';
  }

  if (/no budget|for free|zero budget|without money/.test(q)) {
    context.budget = 'free';
  } else if (/low budget|cheap|bootstrapp/.test(q)) {
    context.budget = 'low';
  }

  return context;
}
