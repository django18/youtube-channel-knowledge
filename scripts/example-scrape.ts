#!/usr/bin/env bun

/**
 * Example script to scrape a YouTube channel and search transcripts
 *
 * Usage:
 * 1. Make sure the server is running: bun run dev
 * 2. Run this script: bun run scripts/example-scrape.ts
 */

const API_BASE = 'http://localhost:3000/api';

interface ScrapeChannelResponse {
  success: boolean;
  videosProcessed: number;
  totalChunks: number;
  stored: boolean;
  videos: Array<{
    videoId: string;
    title: string;
    url: string;
    chunksCount: number;
  }>;
}

interface SearchResponse {
  success: boolean;
  query: string;
  resultsCount: number;
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
 * Scrape a YouTube channel
 */
async function scrapeChannel(channelUrl: string, maxVideos: number = 20) {
  console.log(`\n📺 Scraping channel: ${channelUrl}`);
  console.log(`⏱️  This may take a few minutes...\n`);

  const response = await fetch(`${API_BASE}/youtube/scrape-channel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelUrl,
      maxVideos,
      storeInDB: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to scrape channel: ${error.message}`);
  }

  const result: ScrapeChannelResponse = await response.json();

  console.log(`\n✅ Scraping complete!`);
  console.log(`📊 Videos processed: ${result.videosProcessed}`);
  console.log(`📝 Total chunks: ${result.totalChunks}`);
  console.log(`💾 Stored in database: ${result.stored ? 'Yes' : 'No'}\n`);

  return result;
}

/**
 * Search transcripts
 */
async function searchTranscripts(query: string, limit: number = 5) {
  console.log(`\n🔍 Searching for: "${query}"\n`);

  const response = await fetch(`${API_BASE}/youtube/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Search failed: ${error.message}`);
  }

  const result: SearchResponse = await response.json();

  console.log(`Found ${result.resultsCount} results:\n`);

  result.results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.videoTitle} (${r.timestamp})`);
    console.log(`   Similarity: ${(r.similarity * 100).toFixed(1)}%`);
    console.log(`   ${r.text.slice(0, 150)}...`);
    console.log(`   🔗 ${r.timestampUrl}\n`);
  });

  return result;
}

/**
 * Example queries for SaaS building
 */
const SAAS_QUERIES = [
  "What problems do users face?",
  "Why did customers choose this product?",
  "What features are most important?",
  "How much are users willing to pay?",
  "What made them switch from competitors?",
  "What mistakes did founders make?",
];

/**
 * Main execution
 */
async function main() {
  try {
    // Example 1: Scrape a single video
    console.log('\n' + '='.repeat(60));
    console.log('Example 1: Scrape a single video');
    console.log('='.repeat(60));

    const singleVideoUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    console.log(`\nSkipping single video example. To try it, uncomment and replace with your video URL.`);
    // await scrapeVideo(singleVideoUrl);

    // Example 2: Scrape a channel
    console.log('\n' + '='.repeat(60));
    console.log('Example 2: Scrape a YouTube channel');
    console.log('='.repeat(60));

    // CHANGE THIS to your channel URL
    const channelUrl = "https://www.youtube.com/@IndieHackers";
    const maxVideos = 10; // Start with 10 videos for testing

    console.log(`\n⚠️  Update the channelUrl variable to scrape a real channel`);
    console.log(`Current URL: ${channelUrl}\n`);

    // Uncomment to actually scrape:
    // await scrapeChannel(channelUrl, maxVideos);

    // Example 3: Search for insights
    console.log('\n' + '='.repeat(60));
    console.log('Example 3: Search for SaaS building insights');
    console.log('='.repeat(60));

    console.log('\nSkipping search examples. First scrape a channel, then uncomment this section.\n');

    // Uncomment after scraping:
    // for (const query of SAAS_QUERIES) {
    //   await searchTranscripts(query, 3);
    //   await new Promise(resolve => setTimeout(resolve, 1000));
    // }

    console.log('\n' + '='.repeat(60));
    console.log('✅ All examples complete!');
    console.log('='.repeat(60) + '\n');

    console.log('Next steps:');
    console.log('1. Update the channelUrl variable with your target channel');
    console.log('2. Uncomment the scrapeChannel() call');
    console.log('3. Run the script: bun run scripts/example-scrape.ts');
    console.log('4. Once scraped, uncomment the search examples');
    console.log('5. Build your own queries based on your needs\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
