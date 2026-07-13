import OpenAI from 'openai';

let client: OpenAI | null = null;

export function hasOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Lazy OpenAI singleton. The v6 client throws at construction when no
 * API key is present, so constructing it at module load crashes the
 * server on boot. Callers must check hasOpenAI() first or catch.
 */
export function getOpenAI(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}
