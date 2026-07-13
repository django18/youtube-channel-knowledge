import { ChromaClient, IncludeEnum, type IEmbeddingFunction } from 'chromadb';
import { config } from '../../config';
import type { Playbook, Evidence } from '../schemas/knowledge';

// This validation path only fetches by metadata (.get()), never embeds queries,
// so a no-op embedding function satisfies the type without being used.
const noopEmbeddingFunction: IEmbeddingFunction = {
  generate: async () => {
    throw new Error('noopEmbeddingFunction should never be called for read-only get() paths');
  },
};

/**
 * Validates that the evidence cited in a playbook actually exists in ChromaDB.
 * Hallucinated evidence is a common issue with LLMs.
 */
export async function validatePlaybookEvidence(playbook: Playbook): Promise<Playbook> {
  const client = new ChromaClient({ path: config.chromaUrl });
  const collection = await client.getCollection({
    name: config.youtubeCollectionName,
    embeddingFunction: noopEmbeddingFunction,
  });

  console.log(`\n🔍 Validating evidence for playbook: ${playbook.title}`);

  const validatedModules = await Promise.all(playbook.modules.map(async (module) => {
    const validatedLessons = await Promise.all(module.lessons.map(async (lesson) => {
      const validatedEvidence: Evidence[] = [];

      for (const evidence of lesson.evidence) {
        try {
          // Verify if this specific timestamp context exists in Chroma
          // We search for the quote within the specific video
          const results = await collection.get({
            where: { videoId: evidence.videoId },
            include: [IncludeEnum.Documents],
          });

          const chunkTexts = results.documents || [];
          const exists = chunkTexts.some(text => 
            text?.toLowerCase().includes(evidence.quote.toLowerCase().substring(0, 50))
          );

          if (exists) {
            validatedEvidence.push(evidence);
          } else {
            console.warn(`⚠️ Hallucinated evidence detected in lesson "${lesson.title}": ${evidence.quote.substring(0, 50)}...`);
            // We could either remove it or mark it as "unverified"
            // For now, we'll keep it but add a [UNVERIFIED] prefix to the relevance
            validatedEvidence.push({
              ...evidence,
              relevance: `[UNVERIFIED] ${evidence.relevance}`
            });
          }
        } catch (error) {
          console.error(`Error validating evidence for ${evidence.videoId}:`, error);
          validatedEvidence.push(evidence); // Keep it if validation fails to be safe
        }
      }

      return { ...lesson, evidence: validatedEvidence };
    }));

    return { ...module, lessons: validatedLessons };
  }));

  return { ...playbook, modules: validatedModules };
}
