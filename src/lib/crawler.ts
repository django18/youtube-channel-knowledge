import robotsParser from 'robots-parser';
import { JinaScraper } from './scraper';
import type { ScrapeJob, ScrapedPage } from '../types';
import { config } from '../config';

export class RecursiveCrawler {
  private scraper: JinaScraper;
  private robotsCache = new Map<string, any>();

  constructor() {
    this.scraper = new JinaScraper();
  }

  async crawl(
    startUrl: string,
    maxDepth: number = config.maxDepth,
    respectRobots: boolean = true,
    allowedDomains?: string[]
  ): Promise<ScrapedPage[]> {
    const job: ScrapeJob = {
      id: crypto.randomUUID(),
      startUrl,
      maxDepth,
      status: 'running',
      visitedUrls: new Set<string>(),
      queuedUrls: new Map<string, number>([[startUrl, 0]]),
      results: [],
      startedAt: new Date(),
    };

    console.log(`Starting crawl of ${startUrl} with max depth ${maxDepth}`);

    while (job.queuedUrls.size > 0) {
      const batch: Array<[string, number]> = [];

      // Get a batch of URLs to process concurrently
      for (const [url, depth] of job.queuedUrls.entries()) {
        if (batch.length >= config.maxConcurrent) break;
        batch.push([url, depth]);
        job.queuedUrls.delete(url);
      }

      // Process batch concurrently
      const results = await Promise.all(
        batch.map(([url, depth]) => this.processUrl(url, depth, job, respectRobots, allowedDomains))
      );

      // Add delay between batches to be respectful
      if (job.queuedUrls.size > 0) {
        await this.delay(config.requestDelay);
      }
    }

    job.status = 'completed';
    job.completedAt = new Date();

    console.log(`Crawl completed. Scraped ${job.results.length} pages.`);

    return job.results;
  }

  private async processUrl(
    url: string,
    depth: number,
    job: ScrapeJob,
    respectRobots: boolean,
    allowedDomains?: string[]
  ): Promise<void> {
    // Normalize URL
    const normalizedUrl = this.scraper.normalizeUrl(url);

    // Check if already visited
    if (job.visitedUrls.has(normalizedUrl)) {
      return;
    }

    job.visitedUrls.add(normalizedUrl);

    // Validate URL
    if (!this.scraper.isValidUrl(normalizedUrl, allowedDomains)) {
      console.log(`Skipping invalid or disallowed URL: ${normalizedUrl}`);
      return;
    }

    // Check robots.txt
    if (respectRobots) {
      const allowed = await this.isAllowedByRobots(normalizedUrl);
      if (!allowed) {
        console.log(`Blocked by robots.txt: ${normalizedUrl}`);
        return;
      }
    }

    // Scrape the page
    console.log(`Scraping [depth ${depth}]: ${normalizedUrl}`);
    const page = await this.scraper.scrapePage(normalizedUrl, depth);

    if (!page) {
      return;
    }

    job.results.push(page);

    // Queue links if we haven't reached max depth
    if (depth < job.maxDepth) {
      for (const link of page.links) {
        const normalizedLink = this.scraper.normalizeUrl(link);

        if (
          !job.visitedUrls.has(normalizedLink) &&
          !job.queuedUrls.has(normalizedLink) &&
          this.scraper.isValidUrl(normalizedLink, allowedDomains)
        ) {
          // If allowedDomains is set, ensure we stay within those domains
          if (allowedDomains && allowedDomains.length > 0) {
            const urlObj = new URL(normalizedLink);
            const linkDomain = urlObj.hostname;
            const allowed = allowedDomains.some(domain => linkDomain.includes(domain));

            if (allowed) {
              job.queuedUrls.set(normalizedLink, depth + 1);
            }
          } else {
            // If no domain restriction, stay on same domain as start URL
            const startDomain = new URL(job.startUrl).hostname;
            const linkDomain = new URL(normalizedLink).hostname;

            if (linkDomain === startDomain) {
              job.queuedUrls.set(normalizedLink, depth + 1);
            }
          }
        }
      }
    }
  }

  private async isAllowedByRobots(url: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

      // Check cache
      if (this.robotsCache.has(robotsUrl)) {
        const robots = this.robotsCache.get(robotsUrl);
        return robots.isAllowed(url, config.userAgent);
      }

      // Fetch robots.txt
      const response = await fetch(robotsUrl);

      if (!response.ok) {
        // No robots.txt file, allow by default
        return true;
      }

      const robotsTxt = await response.text();
      const robots = robotsParser(robotsUrl, robotsTxt);

      this.robotsCache.set(robotsUrl, robots);

      return robots.isAllowed(url, config.userAgent);
    } catch (error) {
      // If we can't fetch robots.txt, allow by default
      console.warn(`Could not fetch robots.txt for ${url}:`, error);
      return true;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
