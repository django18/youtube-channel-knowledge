import { config } from '../config';
import type { ScrapedPage } from '../types';
import * as cheerio from 'cheerio';

export class JinaScraper {
  private visitedUrls = new Set<string>();

  async scrapePage(url: string, depth: number = 0): Promise<ScrapedPage | null> {
    try {
      // Use Jina.ai Reader API to get clean markdown content
      const jinaUrl = `${config.jinaReaderUrl}${url}`;

      const headers: Record<string, string> = {
        'User-Agent': config.userAgent,
      };

      if (config.jinaApiKey) {
        headers['Authorization'] = `Bearer ${config.jinaApiKey}`;
      }

      const response = await fetch(jinaUrl, { headers });

      if (!response.ok) {
        console.error(`Failed to scrape ${url}: ${response.status}`);
        return null;
      }

      const markdown = await response.text();

      // Extract links from the markdown content
      const links = this.extractLinks(markdown, url);

      // Extract title (first h1 or from URL)
      const title = this.extractTitle(markdown, url);

      return {
        url,
        title,
        content: markdown,
        markdown,
        links,
        metadata: {
          scrapedAt: new Date().toISOString(),
          depth,
          statusCode: response.status,
        },
      };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return null;
    }
  }

  private extractLinks(markdown: string, baseUrl: string): string[] {
    const links: string[] = [];

    // Match markdown links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(markdown)) !== null) {
      const link = match[2];

      try {
        // Convert relative URLs to absolute
        const absoluteUrl = new URL(link, baseUrl).href;

        // Filter out non-http(s) links
        if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
          links.push(absoluteUrl);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }

    return [...new Set(links)]; // Remove duplicates
  }

  private extractTitle(markdown: string, url: string): string {
    // Try to find the first heading
    const titleMatch = markdown.match(/^#\s+(.+)$/m);

    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Fallback to URL-based title
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + urlObj.pathname;
    } catch {
      return url;
    }
  }

  async scrapeWithJinaJson(url: string): Promise<any> {
    // Alternative: Use Jina's JSON mode if needed
    try {
      const jinaUrl = `${config.jinaReaderUrl}${url}`;
      const response = await fetch(jinaUrl, {
        headers: {
          'Accept': 'application/json',
          'X-Return-Format': 'json',
          ...(config.jinaApiKey && { 'Authorization': `Bearer ${config.jinaApiKey}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to scrape: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return null;
    }
  }

  isValidUrl(url: string, allowedDomains?: string[]): boolean {
    try {
      const urlObj = new URL(url);

      // Check protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Check allowed domains if specified
      if (allowedDomains && allowedDomains.length > 0) {
        return allowedDomains.some(domain => urlObj.hostname.includes(domain));
      }

      return true;
    } catch {
      return false;
    }
  }

  normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove trailing slash and hash
      urlObj.hash = '';
      let normalized = urlObj.href;
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  }
}
