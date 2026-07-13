import { ExtractedEntitiesSchema, type ExtractedEntities } from '../schemas/entities';
import { buildExtractionPrompt } from './prompts';
import type { VideoTranscript } from './chroma-reader';
import { saveToGraph } from './graph-store';
import { getLLM, llmModels } from '../llm';

export interface ExtractionResult {
  success: boolean;
  videoId: string;
  entities?: ExtractedEntities;
  error?: string;
  tokensUsed?: number;
}

// Cap prompt size: full transcripts run 20-110K chars, which blows both
// per-request and per-day token budgets on free tiers. Founder/startup
// intro lives at the head, strategies in the middle, outcomes/advice at
// the tail — sample those regions instead of sending everything.
const MAX_EXTRACTION_CHARS = parseInt(process.env.MAX_EXTRACTION_CHARS || '12000');

export function sampleTranscript(text: string, maxChars: number = MAX_EXTRACTION_CHARS): string {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.45);
  const mid = Math.floor(maxChars * 0.2);
  const tail = maxChars - head - mid;
  const midStart = Math.floor(text.length / 2 - mid / 2);
  return (
    text.slice(0, head) +
    '\n[...transcript trimmed...]\n' +
    text.slice(midStart, midStart + mid) +
    '\n[...transcript trimmed...]\n' +
    text.slice(text.length - tail)
  );
}

/**
 * Extract entities from a video transcript using OpenAI
 */
export async function extractEntities(
  transcript: VideoTranscript,
  options: {
    model?: string;
    maxRetries?: number;
  } = {}
): Promise<ExtractionResult> {
  const { model = llmModels().extraction, maxRetries = 3 } = options;

  console.log(`Extracting entities from: ${transcript.videoTitle}`);

  let lastError: string = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = buildExtractionPrompt(sampleTranscript(transcript.fullTranscript));

      const response = await getLLM().chat.completions.create({
        model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse JSON response
      const rawData = JSON.parse(content);

      // Add video metadata
      const dataWithMetadata = {
        videoId: transcript.videoId,
        videoTitle: transcript.videoTitle,
        videoUrl: transcript.videoUrl,
        ...rawData,
      };

      // Validate against schema
      const entities = ExtractedEntitiesSchema.parse(dataWithMetadata);

      // Persist to Neo4j (atomic per video). Failure here retries the
      // whole extraction attempt so vector/graph stores never diverge.
      await saveToGraph(entities);

      console.log(`✓ Successfully extracted entities from: ${transcript.videoTitle}`);

      return {
        success: true,
        videoId: transcript.videoId,
        entities,
        tokensUsed: response.usage?.total_tokens,
      };

    } catch (error: any) {
      lastError = error.message || String(error);
      const isRateLimit = error?.status === 429 || /429|rate limit|quota/i.test(lastError);
      console.error(`Attempt ${attempt}/${maxRetries} failed for ${transcript.videoId}: ${lastError}`);

      if (attempt < maxRetries) {
        // Rate limits are per-minute windows — exponential ms backoff
        // never clears them. Wait out the window instead.
        const delay = isRateLimit ? 45_000 : Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms${isRateLimit ? ' (rate limit window)' : ''}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`✗ Failed to extract entities from: ${transcript.videoTitle}`);

  return {
    success: false,
    videoId: transcript.videoId,
    error: lastError,
  };
}

/**
 * Extract entities from multiple transcripts in batch
 */
export async function extractEntitiesBatch(
  transcripts: VideoTranscript[],
  options: {
    batchSize?: number;
    delayMs?: number;
    onProgress?: (current: number, total: number, videoTitle: string) => void;
  } = {}
): Promise<ExtractionResult[]> {
  const { batchSize = 5, delayMs = 1000, onProgress } = options;

  const results: ExtractionResult[] = [];
  let processed = 0;

  console.log(`Starting batch extraction of ${transcripts.length} videos`);
  console.log(`Batch size: ${batchSize}, Delay: ${delayMs}ms`);

  for (let i = 0; i < transcripts.length; i += batchSize) {
    const batch = transcripts.slice(i, i + batchSize);

    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}...`);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(transcript => extractEntities(transcript))
    );

    results.push(...batchResults);
    processed += batch.length;

    // Report progress
    batchResults.forEach((result, idx) => {
      const transcript = batch[idx];
      onProgress?.(processed - batch.length + idx + 1, transcripts.length, transcript.videoTitle);
    });

    // Delay between batches (except for last batch)
    if (i + batchSize < transcripts.length) {
      console.log(`Waiting ${delayMs}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalTokens = results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0);

  if (successful > 0) {
    // Graph changed — cached patterns are stale.
    const { invalidatePatternCache } = await import('../patterns/pattern-layer');
    await invalidatePatternCache();
  }

  console.log(`\n✓ Batch extraction complete:`);
  console.log(`  - Successful: ${successful}`);
  console.log(`  - Failed: ${failed}`);
  console.log(`  - Total tokens: ${totalTokens.toLocaleString()}`);

  return results;
}
