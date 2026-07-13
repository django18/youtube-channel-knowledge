import { PlaybookSchema, type Playbook } from '../schemas/knowledge';
import { synthesizeKnowledge, type SynthesisRequest } from './synthesizer';
import { validatePlaybookEvidence } from './evidence-validator';
import { v4 as uuidv4 } from 'uuid';
import { getLLM, llmModels } from '../llm';

/**
 * The Guide Generator takes synthesized knowledge and transforms it
 * into a structured Playbook/Course.
 */
export async function generatePlaybook(request: SynthesisRequest): Promise<Playbook> {
  // 1. Get synthesized knowledge from dual-memory
  const synthesis = await synthesizeKnowledge(request);

  console.log(`\n📘 Generating structured Playbook for: ${request.profile}`);

  // 2. Format into structured Playbook using LLM
  const prompt = `
    You are an expert Course Designer. Based on the following synthesized knowledge from YouTube transcripts, 
    create a structured "Step-by-Step Playbook" for building a successful app/SaaS.

    SYNTHESIZED KNOWLEDGE:
    ${synthesis.synthesizedInsights}

    STRUCTURAL PATTERNS:
    ${JSON.stringify(synthesis.patterns, null, 2)}

    TARGET AUDIENCE:
    Profile: ${request.profile}
    Goals: ${request.goals.join(', ')}

    REQUIREMENTS:
    - Output must be a valid JSON matching the PlaybookSchema.
    - Organize into 3-4 logical Modules (e.g., "Market Validation", "Tech Stack", "Growth").
    - Each Lesson MUST have actionItems and cite specific tools/strategies.
    - Include evidence quotes or references where available.

    SCHEMA REFERENCE:
    The JSON should have: id, title, description, targetAudience, modules, summary, and metadata.
  `;

  const response = await getLLM().chat.completions.create({
    model: llmModels().synthesis,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI for Playbook generation');
  }

  // Parse and validate against schema
  const rawPlaybook = JSON.parse(content);
  
  // Ensure IDs and metadata are set
  const playbook = PlaybookSchema.parse({
    ...rawPlaybook,
    id: uuidv4(),
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceVideoCount: synthesis.sourceContextCount,
      model: llmModels().synthesis,
    }
  });

  // 3. Final Step: Validate evidence against ChromaDB
  const validatedPlaybook = await validatePlaybookEvidence(playbook);

  console.log(`✓ Successfully generated and validated Playbook: ${validatedPlaybook.title}`);
  return validatedPlaybook;
}
