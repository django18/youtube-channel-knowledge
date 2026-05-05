import { extractChannelIdentifier, processVideo, type ProcessedTranscript } from './youtube';
import {
  isVideoScraped,
  markVideoAsScraped,
  markVideoAsFailed,
  filterUnscrapedVideos,
} from './youtube-tracker';

export interface ChannelVideo {
  videoId: string;
  title: string;
  url: string;
  publishedAt?: string;
}

/**
 * Scrape channel videos using YouTube's RSS feed (no API key required)
 * RSS feed provides the 15 most recent videos
 */
export async function scrapeChannelVideosFromRSS(
  channelIdOrUrl: string
): Promise<ChannelVideo[]> {
  let channelId = channelIdOrUrl;

  // If it's a URL, extract the channel identifier
  if (channelIdOrUrl.includes('youtube.com')) {
    const identifier = extractChannelIdentifier(channelIdOrUrl);
    if (!identifier) {
      throw new Error('Invalid YouTube channel URL');
    }

    // If it's a @username, we need to resolve it to a channel ID
    if (channelIdOrUrl.includes('/@')) {
      channelId = await resolveChannelId(identifier);
    } else {
      channelId = identifier;
    }
  }

  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  try {
    const response = await fetch(rssUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status}`);
    }

    const xmlText = await response.text();
    return parseYouTubeRSS(xmlText);
  } catch (error) {
    throw new Error(`Failed to scrape channel videos: ${error}`);
  }
}

/**
 * Resolve @username to channel ID by fetching the channel page
 */
async function resolveChannelId(username: string): Promise<string> {
  const url = `https://www.youtube.com/@${username}`;

  try {
    const response = await fetch(url);
    const html = await response.text();

    // Extract channel ID from meta tag or embedded data
    const channelIdMatch = html.match(/"channelId":"([^"]+)"/);
    const externalIdMatch = html.match(/"externalId":"([^"]+)"/);

    const channelId = channelIdMatch?.[1] || externalIdMatch?.[1];

    if (!channelId) {
      throw new Error('Could not extract channel ID from page');
    }

    return channelId;
  } catch (error) {
    throw new Error(`Failed to resolve channel ID for @${username}: ${error}`);
  }
}

/**
 * Parse YouTube RSS XML feed
 */
function parseYouTubeRSS(xmlText: string): ChannelVideo[] {
  const videos: ChannelVideo[] = [];

  // Simple XML parsing (could use a proper XML parser library for production)
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  const videoIdRegex = /<yt:videoId>([^<]+)<\/yt:videoId>/;
  const titleRegex = /<title>([^<]+)<\/title>/;
  const publishedRegex = /<published>([^<]+)<\/published>/;

  let match;
  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entry = match[1];

    const videoIdMatch = entry.match(videoIdRegex);
    const titleMatch = entry.match(titleRegex);
    const publishedMatch = entry.match(publishedRegex);

    if (videoIdMatch && titleMatch) {
      videos.push({
        videoId: videoIdMatch[1],
        title: titleMatch[1],
        url: `https://www.youtube.com/watch?v=${videoIdMatch[1]}`,
        publishedAt: publishedMatch?.[1],
      });
    }
  }

  return videos;
}

/**
 * Scrape all available videos from a channel using pagination
 * This method scrapes from the channel's videos page with continuation tokens
 */
export async function scrapeAllChannelVideos(
  channelIdOrUrl: string,
  maxVideos: number = Infinity
): Promise<ChannelVideo[]> {
  let channelId = channelIdOrUrl;

  // Extract channel identifier if URL provided
  if (channelIdOrUrl.includes('youtube.com')) {
    const identifier = extractChannelIdentifier(channelIdOrUrl);
    if (!identifier) {
      throw new Error('Invalid YouTube channel URL');
    }

    if (channelIdOrUrl.includes('/@')) {
      channelId = await resolveChannelId(identifier);
    } else {
      channelId = identifier;
    }
  }

  const videosUrl = `https://www.youtube.com/channel/${channelId}/videos`;

  try {
    const response = await fetch(videosUrl);
    const html = await response.text();

    // Extract initial data and API key
    const ytInitialDataMatch = html.match(/var ytInitialData = ({.+?});/);
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);

    if (!ytInitialDataMatch) {
      console.warn('Could not find ytInitialData, falling back to RSS feed');
      return scrapeChannelVideosFromRSS(channelId);
    }

    const ytInitialData = JSON.parse(ytInitialDataMatch[1]);
    const apiKey = apiKeyMatch?.[1];

    // Navigate the complex YouTube data structure
    const videos: ChannelVideo[] = [];
    const tabs =
      ytInitialData?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];

    let continuationToken: string | null = null;

    // Extract initial videos and continuation token
    for (const tab of tabs) {
      const tabRenderer = tab.tabRenderer;
      if (!tabRenderer?.content) continue;

      const richGrid = tabRenderer.content.richGridRenderer?.contents || [];

      for (const item of richGrid) {
        const videoRenderer = item.richItemRenderer?.content?.videoRenderer;

        if (videoRenderer) {
          videos.push({
            videoId: videoRenderer.videoId,
            title: videoRenderer.title?.runs?.[0]?.text || 'Unknown',
            url: `https://www.youtube.com/watch?v=${videoRenderer.videoId}`,
            publishedAt: videoRenderer.publishedTimeText?.simpleText,
          });
        }

        // Extract continuation token
        const continuationItemRenderer = item.continuationItemRenderer;
        if (continuationItemRenderer) {
          continuationToken =
            continuationItemRenderer.continuationEndpoint?.continuationCommand
              ?.token;
        }
      }
    }

    console.log(`📺 Found ${videos.length} initial videos`);

    // Paginate through remaining videos if we have API key and continuation token
    if (apiKey && continuationToken && videos.length < maxVideos) {
      console.log('🔄 Fetching additional videos via pagination...');

      let pageCount = 1;
      while (continuationToken && videos.length < maxVideos) {
        try {
          const moreVideos = await fetchContinuationPage(
            apiKey,
            continuationToken,
            channelId
          );

          if (moreVideos.videos.length === 0) {
            break;
          }

          videos.push(...moreVideos.videos);
          continuationToken = moreVideos.continuationToken;
          pageCount++;

          console.log(`📄 Page ${pageCount}: ${videos.length} total videos`);

          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error('Error fetching continuation page:', error);
          break;
        }
      }
    }

    if (videos.length === 0) {
      console.warn('No videos found via scraping, falling back to RSS');
      return scrapeChannelVideosFromRSS(channelId);
    }

    console.log(`✅ Total videos found: ${videos.length}`);
    return videos.slice(0, maxVideos);
  } catch (error) {
    console.error('Error scraping channel page:', error);
    console.log('Falling back to RSS feed');
    return scrapeChannelVideosFromRSS(channelId);
  }
}

/**
 * Fetch additional videos using YouTube's continuation API
 */
async function fetchContinuationPage(
  apiKey: string,
  continuationToken: string,
  channelId: string
): Promise<{ videos: ChannelVideo[]; continuationToken: string | null }> {
  const response = await fetch(
    `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        continuation: continuationToken,
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00',
          },
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch continuation: ${response.status}`);
  }

  const data = await response.json();
  const videos: ChannelVideo[] = [];
  let nextContinuationToken: string | null = null;

  // Parse continuation response
  const continuationItems =
    data?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction
      ?.continuationItems || [];

  for (const item of continuationItems) {
    const videoRenderer = item.richItemRenderer?.content?.videoRenderer;

    if (videoRenderer) {
      videos.push({
        videoId: videoRenderer.videoId,
        title: videoRenderer.title?.runs?.[0]?.text || 'Unknown',
        url: `https://www.youtube.com/watch?v=${videoRenderer.videoId}`,
        publishedAt: videoRenderer.publishedTimeText?.simpleText,
      });
    }

    // Extract next continuation token
    const continuationItemRenderer = item.continuationItemRenderer;
    if (continuationItemRenderer) {
      nextContinuationToken =
        continuationItemRenderer.continuationEndpoint?.continuationCommand
          ?.token;
    }
  }

  return { videos, continuationToken: nextContinuationToken };
}

/**
 * Process all videos from a channel: scrape, fetch transcripts, and chunk
 */
export async function processChannelVideos(
  channelIdOrUrl: string,
  options: {
    maxVideos?: number;
    chunkSize?: number;
    chunkOverlap?: number;
    skipScraped?: boolean;
    concurrency?: number;
    onProgress?: (current: number, total: number, videoTitle: string) => void;
  } = {}
): Promise<ProcessedTranscript[]> {
  const {
    maxVideos = Infinity,
    chunkSize = 1000,
    chunkOverlap = 200,
    skipScraped = true,
    concurrency = 5,
    onProgress,
  } = options;

  console.log(`Fetching videos from channel: ${channelIdOrUrl}`);

  // Extract channel name from URL if possible
  let channelName = 'Unknown Channel';
  if (channelIdOrUrl.includes('/@')) {
    const match = channelIdOrUrl.match(/@([^/]+)/);
    if (match) channelName = match[1];
  }

  // Get all video IDs from the channel
  const channelVideos = await scrapeAllChannelVideos(channelIdOrUrl);

  // Filter out already scraped videos if requested
  let videosToProcess = channelVideos;
  if (skipScraped) {
    const originalCount = channelVideos.length;
    videosToProcess = filterUnscrapedVideos(channelVideos);
    const skippedCount = originalCount - videosToProcess.length;

    if (skippedCount > 0) {
      console.log(`📋 Skipping ${skippedCount} already scraped videos`);
    }
  }

  // Limit to maxVideos
  videosToProcess = videosToProcess.slice(0, maxVideos);

  console.log(`Found ${channelVideos.length} videos, processing ${videosToProcess.length} new videos with ${concurrency} concurrent workers`);

  const processedTranscripts: ProcessedTranscript[] = [];
  let successCount = 0;
  let failCount = 0;
  let processedCount = 0;

  // Process videos in parallel batches
  const processVideoTask = async (video: ChannelVideo) => {
    // Double check if already scraped (safety check)
    if (skipScraped && isVideoScraped(video.videoId)) {
      console.log(`⏭️  Skipping already scraped: ${video.title}`);
      return null;
    }

    try {
      const processed = await processVideo(
        video.videoId,
        chunkSize,
        chunkOverlap
      );

      // Mark as successfully scraped with channel info
      markVideoAsScraped({
        videoId: processed.videoId,
        videoTitle: processed.videoTitle,
        videoUrl: processed.videoUrl,
        channelTitle: processed.chunks[0]?.metadata?.channelTitle || channelName,
        chunksCount: processed.chunks.length,
        transcriptLength: processed.fullTranscript.length,
      });

      successCount++;
      processedCount++;
      onProgress?.(processedCount, videosToProcess.length, video.title);
      console.log(`✓ [${processedCount}/${videosToProcess.length}] ${video.title} (${processed.chunks.length} chunks)`);

      return processed;
    } catch (error: any) {
      failCount++;
      processedCount++;
      const errorMsg = error.message || String(error);
      const noTranscript = errorMsg.includes('Transcript is disabled') ||
                          errorMsg.includes('No transcript');

      // Mark as failed
      markVideoAsFailed(video.videoId, video.title, video.url, errorMsg, noTranscript);

      console.error(`✗ [${processedCount}/${videosToProcess.length}] ${video.title}: ${errorMsg}`);
      return null;
    }
  };

  // Process in batches with concurrency limit
  for (let i = 0; i < videosToProcess.length; i += concurrency) {
    const batch = videosToProcess.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(processVideoTask));

    // Add successful results
    results.forEach(result => {
      if (result) {
        processedTranscripts.push(result);
      }
    });

    // Small delay between batches to be respectful
    if (i + concurrency < videosToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\nProcessing complete: ${successCount} succeeded, ${failCount} failed`);

  return processedTranscripts;
}
