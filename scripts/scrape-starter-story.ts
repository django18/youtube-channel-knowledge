#!/usr/bin/env bun

/**
 * Scrape Starter Story YouTube Channel
 *
 * Starter Story features founder interviews with insights on:
 * - How they got their first customers
 * - Revenue and growth strategies
 * - Marketing tactics that worked
 * - Common mistakes and lessons learned
 * - Pricing and business models
 *
 * Usage: bun run scripts/scrape-starter-story.ts
 */

const API_BASE = 'http://localhost:3000/api';
const CHANNEL_URL = 'https://www.youtube.com/@starterstory';

// Starter Story specific search queries
const STARTER_STORY_QUERIES = [
  // Customer Acquisition
  'How did they get their first customers?',
  'What marketing channels worked best?',
  'How did they validate their idea?',

  // Revenue & Growth
  'How much revenue are they making?',
  'What made the business grow?',
  'When did they reach profitability?',

  // Product Development
  'What features did they launch first?',
  'How did they build their MVP?',
  'What mistakes did they make with their product?',

  // Pricing Strategy
  'How did they decide on pricing?',
  'What pricing model works best?',
  'How much do customers pay?',

  // Challenges & Lessons
  'What was the biggest challenge?',
  'What mistakes did they make?',
  'What would they do differently?',

  // Time & Resources
  'How long did it take to build?',
  'Did they have a co-founder or work solo?',
  'How much money did they invest?',
];

interface ScraperOptions {
  maxVideos: number;
  runSearch: boolean;
  searchLimit: number;
}

async function scrapeStarterStory(options: ScraperOptions) {
  const { maxVideos, runSearch, searchLimit } = options;

  console.log('\n' + '='.repeat(80));
  console.log('🎬 STARTER STORY SCRAPER');
  console.log('='.repeat(80) + '\n');

  console.log(`Channel: ${CHANNEL_URL}`);
  console.log(`Videos to scrape: ${maxVideos}`);
  console.log(`Run search after: ${runSearch ? 'Yes' : 'No'}\n`);

  // Step 1: Scrape the channel
  console.log('📥 Step 1: Scraping channel videos...\n');

  try {
    const scrapeResponse = await fetch(`${API_BASE}/youtube/scrape-channel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelUrl: CHANNEL_URL,
        maxVideos,
        storeInDB: true,
      }),
    });

    if (!scrapeResponse.ok) {
      const error = await scrapeResponse.json();
      throw new Error(`Scraping failed: ${error.message}`);
    }

    const scrapeResult = await scrapeResponse.json();

    console.log('✅ Scraping complete!\n');
    console.log(`   Videos processed: ${scrapeResult.videosProcessed}`);
    console.log(`   Total chunks: ${scrapeResult.totalChunks}`);
    console.log(`   Stored in DB: ${scrapeResult.stored ? 'Yes' : 'No'}\n`);

    if (scrapeResult.videos && scrapeResult.videos.length > 0) {
      console.log('📺 Scraped videos:');
      scrapeResult.videos.slice(0, 5).forEach((video: any, i: number) => {
        console.log(`   ${i + 1}. ${video.title} (${video.chunksCount} chunks)`);
      });
      if (scrapeResult.videos.length > 5) {
        console.log(`   ... and ${scrapeResult.videos.length - 5} more\n`);
      }
    }

    // Step 2: Run searches if requested
    if (runSearch) {
      console.log('\n' + '='.repeat(80));
      console.log('🔍 Step 2: Searching for insights...\n');

      const insights: Record<string, any[]> = {};

      for (const query of STARTER_STORY_QUERIES) {
        console.log(`Searching: "${query}"`);

        try {
          const searchResponse = await fetch(`${API_BASE}/youtube/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit: searchLimit }),
          });

          if (searchResponse.ok) {
            const searchResult = await searchResponse.json();
            insights[query] = searchResult.results || [];
            console.log(`   ✓ Found ${searchResult.resultsCount} results`);
          } else {
            console.log(`   ✗ Search failed`);
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.log(`   ✗ Error: ${error}`);
        }
      }

      // Display insights summary
      console.log('\n' + '='.repeat(80));
      console.log('📊 INSIGHTS SUMMARY');
      console.log('='.repeat(80) + '\n');

      for (const [query, results] of Object.entries(insights)) {
        if (results.length === 0) continue;

        console.log(`\n## ${query}\n`);

        results.slice(0, 2).forEach((result: any, i: number) => {
          console.log(`${i + 1}. ${result.videoTitle} (${result.timestamp})`);
          console.log(`   ${result.text.slice(0, 150)}...`);
          console.log(`   🔗 ${result.timestampUrl}\n`);
        });
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL DONE!');
    console.log('='.repeat(80) + '\n');

    console.log('💡 Next steps:');
    console.log('1. Use the search endpoint to find specific insights');
    console.log('2. Integrate with Claude API for AI-powered analysis');
    console.log('3. Build a dashboard to visualize the data');
    console.log('4. Export insights to guide your SaaS development\n');

    console.log('📚 Useful commands:');
    console.log('   Search: curl -X POST http://localhost:3000/api/youtube/search -H "Content-Type: application/json" -d \'{"query": "your query"}\'');
    console.log('   Stats:  curl http://localhost:3000/api/youtube/stats\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);

    if (error.message?.includes('ECONNREFUSED')) {
      console.log('\n⚠️  Is the server running? Start it with:');
      console.log('   bun run dev\n');
    }

    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const maxVideos = parseInt(args[0]) || 30;
  const runSearch = args[1] !== '--no-search';
  const searchLimit = 3;

  console.log('\n🚀 Starting Starter Story scraper...');
  console.log('\nℹ️  Usage: bun run scripts/scrape-starter-story.ts [maxVideos] [--no-search]');
  console.log('   Examples:');
  console.log('     bun run scripts/scrape-starter-story.ts 50         # Scrape 50 videos and search');
  console.log('     bun run scripts/scrape-starter-story.ts 20 --no-search  # Only scrape, skip search\n');

  // Wait a moment for user to read
  await new Promise(resolve => setTimeout(resolve, 2000));

  await scrapeStarterStory({
    maxVideos,
    runSearch,
    searchLimit,
  });
}

if (import.meta.main) {
  main();
}

export { scrapeStarterStory, STARTER_STORY_QUERIES };
