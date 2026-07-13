import OpenAI from 'openai';

/**
 * LLM provider abstraction. xAI's API is OpenAI-compatible, so both
 * providers share the same SDK — only apiKey, baseURL, and default
 * model names differ.
 *
 * Provider resolution (first match wins):
 *   1. LLM_PROVIDER env ('groq' | 'gemini' | 'xai' | 'openai')
 *   2. GROQ_API_KEY set → groq
 *   3. GEMINI_API_KEY set → gemini
 *   4. XAI_API_KEY set → xai
 *   5. otherwise → openai
 *
 * Model overrides: LLM_SYNTHESIS_MODEL, LLM_EXTRACTION_MODEL.
 */
export type LLMProvider = 'groq' | 'gemini' | 'xai' | 'openai';

interface ProviderDefaults {
  baseURL?: string;
  apiKeyEnv: string;
  extractionModel: string;
  synthesisModel: string;
}

const PROVIDERS: Record<LLMProvider, ProviderDefaults> = {
  groq: {
    // Groq (LPU inference, not xAI's Grok). Fast open models, generous
    // free tier (~30 req/min, ~1K req/day on llama-3.3-70b).
    baseURL: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    extractionModel: 'llama-3.3-70b-versatile',
    synthesisModel: 'llama-3.3-70b-versatile',
  },
  gemini: {
    // Google's OpenAI-compatible endpoint
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKeyEnv: 'GEMINI_API_KEY',
    // 2.5-flash: fast, cheap, generous free tier, solid JSON mode.
    // Override LLM_SYNTHESIS_MODEL=gemini-2.5-pro for deeper answers.
    extractionModel: 'gemini-2.5-flash',
    synthesisModel: 'gemini-2.5-flash',
  },
  xai: {
    baseURL: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
    // grok-4-fast: cheap, fast, strong at structured extraction and
    // grounded synthesis. Override via env for full grok-4.
    extractionModel: 'grok-4-fast',
    synthesisModel: 'grok-4-fast',
  },
  openai: {
    apiKeyEnv: 'OPENAI_API_KEY',
    extractionModel: 'gpt-4o-mini',
    synthesisModel: 'gpt-4o',
  },
};

export function resolveProvider(): LLMProvider {
  const explicit = process.env.LLM_PROVIDER;
  if (
    explicit === 'groq' ||
    explicit === 'gemini' ||
    explicit === 'xai' ||
    explicit === 'openai'
  ) {
    return explicit;
  }
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.XAI_API_KEY) return 'xai';
  return 'openai';
}

export function hasLLM(): boolean {
  return Boolean(process.env[PROVIDERS[resolveProvider()].apiKeyEnv]);
}

export interface LLMModels {
  provider: LLMProvider;
  extraction: string;
  synthesis: string;
}

export function llmModels(): LLMModels {
  const provider = resolveProvider();
  const defaults = PROVIDERS[provider];
  return {
    provider,
    extraction: process.env.LLM_EXTRACTION_MODEL || defaults.extractionModel,
    synthesis: process.env.LLM_SYNTHESIS_MODEL || defaults.synthesisModel,
  };
}

let client: OpenAI | null = null;
let clientProvider: LLMProvider | null = null;

/**
 * Lazy client singleton. The OpenAI v6 client throws at construction
 * when no API key is present, so constructing at module load would
 * crash the server on boot. Callers must check hasLLM() first or catch.
 */
export function getLLM(): OpenAI {
  const provider = resolveProvider();
  if (!client || clientProvider !== provider) {
    const defaults = PROVIDERS[provider];
    client = new OpenAI({
      apiKey: process.env[defaults.apiKeyEnv],
      baseURL: defaults.baseURL,
    });
    clientProvider = provider;
  }
  return client;
}
