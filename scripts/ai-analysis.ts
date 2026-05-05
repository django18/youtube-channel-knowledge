#!/usr/bin/env bun

/**
 * AI-Powered Analysis of YouTube Transcripts
 *
 * This script demonstrates how to use the scraped transcripts with Claude
 * to extract structured insights for SaaS building.
 *
 * Setup:
 * 1. Set ANTHROPIC_API_KEY environment variable
 * 2. Ensure server is running (bun run dev)
 * 3. Scrape a channel first
 * 4. Run: bun run scripts/ai-analysis.ts
 */

import Anthropic from '@anthropic-ai/sdk';

const API_BASE = 'http://localhost:3000/api';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ Please set ANTHROPIC_API_KEY environment variable');
  console.log('\nExport it in your shell:');
  console.log('  export ANTHROPIC_API_KEY=sk-ant-...\n');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface SearchResult {
  results: Array<{
    videoTitle: string;
    videoUrl: string;
    text: string;
    timestamp: string;
    timestampUrl: string;
    similarity: number;
  }>;
}

/**
 * Search transcripts for a query
 */
async function searchTranscripts(query: string, limit: number = 5): Promise<SearchResult> {
  const response = await fetch(`${API_BASE}/youtube/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Format search results as context for Claude
 */
function formatContext(results: SearchResult): string {
  return results.results
    .map((r, i) => {
      return `[${i + 1}] ${r.videoTitle} (${r.timestamp})
URL: ${r.timestampUrl}
Content: ${r.text}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Ask Claude to analyze transcripts and extract insights
 */
async function analyzeWithClaude(query: string, context: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `You are analyzing YouTube video transcripts to extract insights for building SaaS products.

Context from video transcripts:

${context}

Question: ${query}

Please provide:
1. Key insights from the transcripts
2. Specific examples with video references
3. Actionable recommendations

Be concise and cite specific videos with timestamps.`,
      },
    ],
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

/**
 * Comprehensive SaaS analysis queries
 */
const ANALYSIS_QUERIES = [
  {
    category: 'Pain Points',
    query: 'What problems and frustrations do users face?',
    prompt: 'List the top 3-5 user pain points mentioned, with specific examples.',
  },
  {
    category: 'Feature Requests',
    query: 'What features and capabilities do users want?',
    prompt: 'Identify the most requested features and prioritize them.',
  },
  {
    category: 'Pricing Insights',
    query: 'How much are users willing to pay and what pricing models work?',
    prompt: 'Summarize pricing expectations and willingness to pay.',
  },
  {
    category: 'Competitive Analysis',
    query: 'Why do users choose this product over alternatives?',
    prompt: 'Extract the key differentiators and competitive advantages.',
  },
  {
    category: 'Success Metrics',
    query: 'What outcomes and results do users care about?',
    prompt: 'Identify the metrics and outcomes that matter to users.',
  },
];

/**
 * Generate a comprehensive SaaS insights report
 */
async function generateInsightsReport() {
  console.log('\n' + '='.repeat(80));
  console.log('🤖 AI-Powered SaaS Insights Report');
  console.log('='.repeat(80) + '\n');

  const report: Record<string, string> = {};

  for (const analysis of ANALYSIS_QUERIES) {
    console.log(`\n📊 Analyzing: ${analysis.category}...`);

    try {
      // Search for relevant transcripts
      const searchResults = await searchTranscripts(analysis.query, 5);

      if (searchResults.results.length === 0) {
        console.log(`⚠️  No results found for "${analysis.category}"`);
        continue;
      }

      // Format context
      const context = formatContext(searchResults);

      // Analyze with Claude
      const insights = await analyzeWithClaude(analysis.prompt, context);

      report[analysis.category] = insights;

      console.log(`✓ ${analysis.category} analyzed`);

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`❌ Error analyzing ${analysis.category}:`, error);
    }
  }

  return report;
}

/**
 * Print the report
 */
function printReport(report: Record<string, string>) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 SAAS INSIGHTS REPORT');
  console.log('='.repeat(80) + '\n');

  for (const [category, insights] of Object.entries(report)) {
    console.log(`\n## ${category}\n`);
    console.log(insights);
    console.log('\n' + '-'.repeat(80));
  }

  console.log('\n✅ Report complete!\n');
}

/**
 * Example: Ask a custom question
 */
async function askCustomQuestion(question: string) {
  console.log(`\n❓ Question: ${question}\n`);

  // Search for relevant context
  const searchResults = await searchTranscripts(question, 5);

  if (searchResults.results.length === 0) {
    console.log('⚠️  No relevant transcripts found.');
    return;
  }

  console.log(`Found ${searchResults.results.length} relevant transcript segments\n`);

  // Format and analyze
  const context = formatContext(searchResults);
  const answer = await analyzeWithClaude(question, context);

  console.log('💡 Answer:\n');
  console.log(answer);
  console.log('\n' + '-'.repeat(80));
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🎬 Starting AI-powered transcript analysis...\n');

    // Option 1: Generate full report
    const shouldGenerateReport = false; // Set to true to generate full report

    if (shouldGenerateReport) {
      const report = await generateInsightsReport();
      printReport(report);
    }

    // Option 2: Ask custom questions
    console.log('\n' + '='.repeat(80));
    console.log('💬 Custom Q&A Examples');
    console.log('='.repeat(80));

    const customQuestions = [
      'What are the most common mistakes founders make when building SaaS?',
      'How should I prioritize features for my MVP?',
      'What pricing strategy works best for B2B SaaS?',
    ];

    for (const question of customQuestions) {
      await askCustomQuestion(question);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log('\n✅ Analysis complete!\n');

    console.log('💡 Next steps:');
    console.log('1. Review the insights above');
    console.log('2. Modify the queries to match your specific needs');
    console.log('3. Export insights to a report or dashboard');
    console.log('4. Use findings to guide product development\n');
  } catch (error) {
    console.error('\n❌ Error:', error);

    if (error.message?.includes('ECONNREFUSED')) {
      console.log('\n⚠️  Make sure the API server is running:');
      console.log('  bun run dev\n');
    }

    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}

export { analyzeWithClaude, searchTranscripts, generateInsightsReport };
