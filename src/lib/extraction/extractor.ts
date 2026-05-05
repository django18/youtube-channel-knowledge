import OpenAI from 'openai';
import { ExtractedEntitiesSchema, type ExtractedEntities } from '../schemas/entities';
import { buildExtractionPrompt } from './prompts';
import type { VideoTranscript } from './chroma-reader';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ExtractionResult {
  success: boolean;
  videoId: string;
  entities?: ExtractedEntities;
  error?: string;
  tokensUsed?: number;
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
  const { model = 'gpt-4o-mini', maxRetries = 3 } = options;

  console.log(`Extracting entities from: ${transcript.videoTitle}`);

  let lastError: string = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = buildExtractionPrompt(transcript.fullTranscript);

      const response = await openai.chat.completions.create({
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

      console.log(`✓ Successfully extracted entities from: ${transcript.videoTitle}`);

      return {
        success: true,
        videoId: transcript.videoId,
        entities,
        tokensUsed: response.usage?.total_tokens,
      };

    } catch (error: any) {
      lastError = error.message || String(error);
      console.error(`Attempt ${attempt}/${maxRetries} failed for ${transcript.videoId}: ${lastError}`);

      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
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

  console.log(`\n✓ Batch extraction complete:`);
  console.log(`  - Successful: ${successful}`);
  console.log(`  - Failed: ${failed}`);
  console.log(`  - Total tokens: ${totalTokens.toLocaleString()}`);

  return results;
}
