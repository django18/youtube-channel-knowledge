import { generatePlaybook } from '../src/lib/extraction/guide-generator';
import { closeNeo4jDriver } from '../src/lib/extraction/graph-store';

/**
 * 🧪 Knowledge Engine End-to-End Test
 * 
 * This script tests the full Dual-Memory pipeline:
 * 1. Queries Neo4j for structural patterns
 * 2. Queries ChromaDB for semantic context
 * 3. Synthesizes a "Golden Path"
 * 4. Generates a structured Playbook
 * 5. Validates evidence citations against the source
 */
async function testEngine() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 TESTING KNOWLEDGE ENGINE: DUAL-MEMORY + VALIDATION');
  console.log('='.repeat(60) + '\n');

  const request = {
    profile: "Solo Technical Founder",
    goals: ["Build a SaaS to $10k MRR", "Automate marketing"]
  };

  try {
    console.log(`Step 1: Generating Playbook for "${request.profile}"...`);
    const playbook = await generatePlaybook(request);

    console.log('\n' + '-'.repeat(40));
    console.log(`📘 PLAYBOOK: ${playbook.title}`);
    console.log(`🎯 TARGET: ${playbook.targetAudience.profile}`);
    console.log(`📦 MODULES: ${playbook.modules.length}`);
    console.log('-'.repeat(40) + '\n');

    // Sample the first lesson
    const firstLesson = playbook.modules[0].lessons[0];
    console.log(`📝 First Lesson: ${firstLesson.title}`);
    console.log(`✅ Action Items: ${firstLesson.actionItems.length}`);
    console.log(`🔍 Evidence Cites: ${firstLesson.evidence.length}`);

    firstLesson.evidence.forEach((ev, i) => {
      const status = ev.relevance.startsWith('[UNVERIFIED]') ? '❌ HALLUCINATION' : '✅ VERIFIED';
      console.log(`   [${i+1}] ${status}: "${ev.quote.substring(0, 60)}..."`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETE: Knowledge Engine is Operational');
    console.log('='.repeat(60) + '\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message || error);
  } finally {
    await closeNeo4jDriver();
  }
}

testEngine();
