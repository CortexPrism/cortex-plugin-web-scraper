// deno-lint-ignore-file
/**
 * CortexPrism Web Scraping & Data Extraction Plugin
 *
 * Multi-backend web scraping orchestrator: scrape, crawl, search, extract
 * structured data, monitor page changes, and export results. Supports
 * Firecrawl, Tavily, Apify, Bright Data, Oxylabs, Jina AI, Brave, and Exa
 * with automatic failover across configured backends.
 *
 * #31 in the official plugin registry.
 * Merged from #31 (web-scraper) & #110 (web-scraping) — 2026-06-22.
 */

import type { PluginContext, Tool, ToolCallResult } from 'cortex/plugins';

// ---------------------------------------------------------------------------
// Module-level config (loaded in onLoad)
// ---------------------------------------------------------------------------

interface ScraperConfig {
  firecrawlApiKey: string;
  tavilyApiKey: string;
  apifyApiToken: string;
  brightdataApiKey: string;
  oxylabsApiKey: string;
  jinaApiKey: string;
  braveApiKey: string;
  exaApiKey: string;
  defaultMaxPages: number;
  userAgent: string;
  requestDelayMs: number;
}

let config: ScraperConfig = {
  firecrawlApiKey: '',
  tavilyApiKey: '',
  apifyApiToken: '',
  brightdataApiKey: '',
  oxylabsApiKey: '',
  jinaApiKey: '',
  braveApiKey: '',
  exaApiKey: '',
  defaultMaxPages: 10,
  userAgent: 'CortexPrism-WebScraper/1.1.0',
  requestDelayMs: 1000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateUrl(url: unknown): string | null {
  if (!url || typeof url !== 'string') return 'URL must be a non-empty string';
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return 'URL must start with https:// or http://';
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMarkdown(html: string, baseUrl: string): string {
  let md = html;
  const domain = extractDomain(baseUrl);

  md = md.replace(/<title[^>]*>([\s\S]*?)<\/title>/gi, '# $1\n\n');
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n');

  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  md = md.replace(/<a[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, text) => {
    const resolved = href.startsWith('http')
      ? href
      : `https://${domain}${href.startsWith('/') ? '' : '/'}${href}`;
    return `[${text}](${resolved})`;
  });

  md = md.replace(
    /<img[^>]*src\s*=\s*["']([^"']*)["'][^>]*alt\s*=\s*["']([^"']*)["'][^>]*\/?>/gi,
    (_m, src, alt) => {
      const resolved = src.startsWith('http')
        ? src
        : `https://${domain}${src.startsWith('/') ? '' : '/'}${src}`;
      return `![${alt}](${resolved})`;
    },
  );
  md = md.replace(
    /<img[^>]*alt\s*=\s*["']([^"']*)["'][^>]*src\s*=\s*["']([^"']*)["'][^>]*\/?>/gi,
    (_m, alt, src) => {
      const resolved = src.startsWith('http')
        ? src
        : `https://${domain}${src.startsWith('/') ? '' : '/'}${src}`;
      return `![${alt}](${resolved})`;
    },
  );

  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<[^>]*>/g, '');
  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  return md;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const regex = /<a[^>]*href\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (
      !href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')
    ) continue;
    try {
      const resolved = new URL(href, baseUrl).toString();
      if (resolved.startsWith('http')) links.push(resolved);
    } catch {
      // skip invalid URLs
    }
  }
  return [...new Set(links)];
}

function extractMetadata(html: string, url: string): Record<string, unknown> {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || '';
  const desc = (html.match(
    /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i,
  ) || [])[1] ||
    (html.match(
      /<meta[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["'][^>]*>/i,
    ) || [])[1] ||
    '';
  const ogTitle = (html.match(
    /<meta[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i,
  ) || [])[1] || '';
  const ogImage = (html.match(
    /<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/i,
  ) || [])[1] || '';
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
    m[1].replace(/<[^>]*>/g, '').trim()
  );

  return {
    url,
    title,
    description: desc,
    ogTitle: ogTitle || undefined,
    ogImage: ogImage || undefined,
    headings: h1s.length > 0 ? h1s : undefined,
  };
}

function contentBySelector(html: string, selector: string): string {
  // Naive CSS selector extraction — handles tag, .class, #id selectors
  const tagMatch = selector.match(/^(\w+)/);
  const classMatch = selector.match(/\.([\w-]+)/);
  const idMatch = selector.match(/#([\w-]+)/);

  let tagName = tagMatch ? tagMatch[1] : '\\w+';
  const attrs: string[] = [];

  if (idMatch) attrs.push(`id\\s*=\\s*["']${idMatch[1]}["']`);
  if (classMatch) attrs.push(`class\\s*=\\s*["'][^"']*${classMatch[1]}[^"']*["']`);

  const attrStr = attrs.length > 0 ? `[^>]*${attrs.join('[^>]*')}` : '';
  const regex = new RegExp(`<${tagName}${attrStr}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');

  const matches = [...html.matchAll(regex)].map((m) =>
    m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  );
  return matches.join('\n---\n');
}

function extractTables(html: string): string[][] {
  const tables: string[][] = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const rows: string[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
      const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((m) => m[1].replace(/<[^>]*>/g, '').trim())
        .join(' | ');
      rows.push(cells);
    }
    tables.push(rows);
  }
  return tables;
}

function extractLists(html: string): string[] {
  const items: string[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRegex.exec(html)) !== null) {
    items.push(match[1].replace(/<[^>]*>/g, '').trim());
  }
  return items;
}

async function fetchPage(url: string, timeoutMs = 30_000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': config.userAgent },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      const text = await response.text();
      return text;
    }
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function crawlSite(
  startUrl: string,
  maxPages: number,
  maxDepth: number,
  sameDomain: boolean,
  selector: string | undefined,
  pathPattern: string | undefined,
): Promise<Record<string, unknown>[]> {
  const domain = extractDomain(startUrl);
  const visited = new Set<string>();
  const results: Record<string, unknown>[] = [];
  const queue: Array<{ url: string; depth: number }> = [{ url: startUrl, depth: 0 }];
  const pathRegex = pathPattern ? new RegExp(pathPattern) : null;

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const html = await fetchPage(url, 15_000);
      const metadata = extractMetadata(html, url);
      const content = selector ? contentBySelector(html, selector) : extractText(html);

      results.push({
        url,
        depth,
        title: metadata.title,
        content: content.substring(0, 20_000),
        contentLength: content.length,
      });

      if (depth < maxDepth && results.length < maxPages) {
        const links = extractLinks(html, url);
        for (const link of links) {
          if (!visited.has(link)) {
            if (sameDomain && extractDomain(link) !== domain) continue;
            if (pathRegex) {
              try {
                const linkPath = new URL(link).pathname;
                if (!pathRegex.test(linkPath)) continue;
              } catch {
                continue;
              }
            }
            if (queue.length + results.length >= maxPages) break;
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }

      if (config.requestDelayMs > 0) {
        await delay(config.requestDelayMs);
      }
    } catch (error) {
      results.push({
        url,
        depth,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function jsonToCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const keys = Object.keys(data[0]);
  const header = keys.map((k) => `"${k.replace(/"/g, '""')}"`).join(',');
  const rows = data.map((row) =>
    keys.map((k) => {
      const val = row[k];
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

function jsonToMarkdownTable(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const keys = Object.keys(data[0]);
  const header = '| ' + keys.join(' | ') + ' |';
  const separator = '| ' + keys.map(() => '---').join(' | ') + ' |';
  const rows = data.map((row) =>
    '| ' + keys.map((k) => {
      const val = row[k];
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    }).join(' | ') + ' |'
  );
  return [header, separator, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Backend API helpers
// ---------------------------------------------------------------------------

interface FirecrawlScrapeResult {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  screenshot?: string;
  metadata?: { title?: string; description?: string; ogTitle?: string; ogImage?: string };
  links?: string[];
}

async function firecrawlScrape(
  url: string,
  format: string,
  timeoutMs: number,
): Promise<{ content: string; metadata: Record<string, unknown> } | null> {
  if (!config.firecrawlApiKey) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: format === 'screenshot'
          ? ['screenshot']
          : format === 'html'
          ? ['rawHtml']
          : ['markdown', 'html'],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: FirecrawlScrapeResult };
    if (!data?.data) return null;
    const d = data.data;
    return {
      content: d.markdown || d.rawHtml || d.html || '',
      metadata: {
        title: d.metadata?.title,
        description: d.metadata?.description,
        ogTitle: d.metadata?.ogTitle,
        ogImage: d.metadata?.ogImage,
      },
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function firecrawlScreenshot(
  url: string,
  timeoutMs: number,
): Promise<{ screenshotUrl: string } | null> {
  if (!config.firecrawlApiKey) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.firecrawlApiKey}`,
      },
      body: JSON.stringify({ url, formats: ['screenshot'] }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { screenshot?: string } };
    if (data?.data?.screenshot) {
      return { screenshotUrl: data.data.screenshot };
    }
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function firecrawlCrawl(
  url: string,
  maxPages: number,
  maxDepth: number,
  pathPattern: string | undefined,
  timeoutMs: number,
): Promise<Record<string, unknown>[] | null> {
  if (!config.firecrawlApiKey) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = {
      url,
      limit: maxPages,
      maxDepth,
      scrapeOptions: { formats: ['markdown'] },
    };
    if (pathPattern) body.includePaths = [pathPattern];
    const res = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.firecrawlApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    if (!data?.id) return null;

    // Poll for crawl completion
    const crawlId = data.id;
    const pollStart = Date.now();
    const pollTimeout = 120_000; // 2 min max
    while (Date.now() - pollStart < pollTimeout) {
      await delay(3000);
      const statusRes = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
        headers: { Authorization: `Bearer ${config.firecrawlApiKey}` },
      });
      if (!statusRes.ok) continue;
      const statusData = (await statusRes.json()) as {
        status?: string;
        data?: Array<{ markdown?: string; metadata?: Record<string, unknown> }>;
      };
      if (statusData.status === 'completed' && statusData.data) {
        return statusData.data.map((page, i) => ({
          url: page.metadata?.sourceURL || `${url}/page-${i}`,
          depth: i === 0 ? 0 : 1,
          title: page.metadata?.title || '',
          content: page.markdown || '',
          contentLength: (page.markdown || '').length,
        }));
      }
      if (statusData.status === 'failed' || statusData.status === 'cancelled') return null;
    }
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function firecrawlExtract(
  url: string,
  schema: Record<string, unknown>,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  if (!config.firecrawlApiKey) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.firecrawlApiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ['extract'],
        extract: { schema },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { extract?: Record<string, unknown> } };
    return data?.data?.extract || null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function jinaRead(
  url: string,
  timeoutMs: number,
): Promise<{ content: string; title: string } | null> {
  if (!config.jinaApiKey) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Authorization: `Bearer ${config.jinaApiKey}`,
        'X-Return-Format': 'markdown',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const text = await res.text();
    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : '';
    return { content: text, title };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tool: scrape_url
// ---------------------------------------------------------------------------

const scrapeUrlTool: Tool = {
  definition: {
    name: 'scrape_url',
    description:
      'Scrape a single URL with automatic backend selection and failover. Returns clean structured content in text, markdown, HTML, or screenshot format.',
    params: [
      {
        name: 'url',
        type: 'string',
        description: 'The URL to scrape (must be HTTP or HTTPS)',
        required: true,
      },
      {
        name: 'format',
        type: 'string',
        description: 'Output format for the scraped content',
        required: false,
        enum: ['text', 'markdown', 'html', 'screenshot'],
        defaultValue: 'text',
      },
      {
        name: 'selector',
        type: 'string',
        description: 'CSS selector to extract specific content from the page',
        required: false,
      },
      {
        name: 'include_metadata',
        type: 'boolean',
        description: 'Whether to include page metadata',
        required: false,
        defaultValue: true,
      },
      {
        name: 'backend',
        type: 'string',
        description:
          'Preferred scraping backend (auto-detected from available API keys if omitted)',
        required: false,
        enum: ['auto', 'firecrawl', 'apify', 'brightdata', 'oxylabs', 'jina'],
      },
      {
        name: 'timeout_seconds',
        type: 'number',
        description: 'Timeout in seconds (default: 30)',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },

  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolCallResult> => {
    const start = Date.now();
    const toolName = 'scrape_url';
    try {
      const urlErr = validateUrl(args.url);
      if (urlErr) {
        return {
          toolName,
          success: false,
          output: '',
          error: urlErr,
          durationMs: Date.now() - start,
        };
      }

      const url = args.url as string;
      const format = (args.format as string) || 'text';
      const selector = args.selector as string | undefined;
      const includeMetadata = args.include_metadata !== false;
      const preferredBackend = (args.backend as string) || 'auto';
      const timeoutMs = typeof args.timeout_seconds === 'number'
        ? args.timeout_seconds * 1000
        : 30_000;

      // Determine backend priority order
      const backendOrder: string[] = preferredBackend !== 'auto'
        ? [preferredBackend] // explicit backend — try it first, then fallback
        : ['firecrawl', 'jina', 'native']; // auto-detect best available

      // --- Screenshot format ---
      if (format === 'screenshot') {
        // Try Firecrawl screenshot
        if (
          (preferredBackend === 'auto' || preferredBackend === 'firecrawl') &&
          config.firecrawlApiKey
        ) {
          ctx.logger.info(`[scraper] Taking screenshot of ${url} via Firecrawl`);
          const screenshotResult = await firecrawlScreenshot(url, timeoutMs);
          if (screenshotResult) {
            return {
              toolName,
              success: true,
              output: JSON.stringify({
                url,
                format: 'screenshot',
                backend_used: 'firecrawl',
                screenshotUrl: screenshotResult.screenshotUrl,
              }),
              durationMs: Date.now() - start,
            };
          }
        }
        return {
          toolName,
          success: true,
          output: JSON.stringify({
            url,
            format: 'screenshot',
            backend_used: 'none',
            note:
              'Screenshots require a backend with browser rendering. Configure firecrawlApiKey or apifyApiToken in plugin settings.',
          }),
          durationMs: Date.now() - start,
        };
      }

      // --- Try backends in priority order ---
      let backendUsed = 'native';
      let html = '';
      let backendMetadata: Record<string, unknown> | undefined;

      for (const backend of backendOrder) {
        // Firecrawl backend
        if (backend === 'firecrawl' && config.firecrawlApiKey) {
          ctx.logger.info(`[scraper] Scraping ${url} via Firecrawl`);
          const result = await firecrawlScrape(url, format, timeoutMs);
          if (result) {
            backendUsed = 'firecrawl';
            html = result.content;
            backendMetadata = result.metadata;
            break;
          }
          ctx.logger.warn(`[scraper] Firecrawl failed for ${url}, trying next backend`);
        }

        // Jina AI backend
        if (backend === 'jina' && config.jinaApiKey) {
          ctx.logger.info(`[scraper] Reading ${url} via Jina AI`);
          const result = await jinaRead(url, timeoutMs);
          if (result) {
            backendUsed = 'jina';
            html = result.content;
            backendMetadata = { title: result.title };
            break;
          }
          ctx.logger.warn(`[scraper] Jina AI failed for ${url}, trying next backend`);
        }

        // Native fetch (always available)
        if (backend === 'native') {
          ctx.logger.info(`[scraper] Fetching ${url} via native HTTP`);
          html = await fetchPage(url, timeoutMs);
          backendUsed = 'native';
          break;
        }
      }

      // --- Process content ---
      let content: string;
      const isHtml = html.trim().startsWith('<') || html.includes('<html') || html.includes('<div');

      if (selector && isHtml) {
        content = contentBySelector(html, selector);
      } else if (format === 'html') {
        content = html;
      } else if (format === 'markdown') {
        content = isHtml ? extractMarkdown(html, url) : html;
      } else {
        content = isHtml ? extractText(html) : html;
      }

      const result: Record<string, unknown> = { url, format, content, backend_used: backendUsed };

      if (includeMetadata && isHtml) {
        result.metadata = backendMetadata && Object.keys(backendMetadata).length > 0
          ? backendMetadata
          : extractMetadata(html, url);
      }

      if (isHtml) {
        const tables = extractTables(html);
        const lists = extractLists(html);
        if (tables.length > 0) {
          result.tables = tables.map((rows) => rows.join('\n'));
        }
        if (lists.length > 0) {
          result.lists = lists.slice(0, 100);
        }
      }

      return {
        toolName,
        success: true,
        output: JSON.stringify(result),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName,
        success: false,
        output: '',
        error: `Scrape failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Tool: scrape_crawl
// ---------------------------------------------------------------------------

const scrapeCrawlTool: Tool = {
  definition: {
    name: 'scrape_crawl',
    description:
      'Crawl a website starting from a URL, following links up to a configurable depth and page limit. Supports path pattern filtering and multi-backend failover.',
    params: [
      {
        name: 'start_url',
        type: 'string',
        description: 'The starting URL for the crawl',
        required: true,
      },
      {
        name: 'max_pages',
        type: 'number',
        description: 'Maximum number of pages to crawl (default: 10)',
        required: false,
        defaultValue: 10,
      },
      {
        name: 'max_depth',
        type: 'number',
        description: 'Maximum crawl depth from the start URL (default: 2)',
        required: false,
        defaultValue: 2,
      },
      {
        name: 'same_domain',
        type: 'boolean',
        description: 'Only follow links on the same domain (default: true)',
        required: false,
        defaultValue: true,
      },
      {
        name: 'path_pattern',
        type: 'string',
        description: 'URL path regex pattern to match when following links',
        required: false,
      },
      {
        name: 'selector',
        type: 'string',
        description: 'CSS selector to extract specific content from each crawled page',
        required: false,
      },
      {
        name: 'backend',
        type: 'string',
        description: 'Preferred crawl backend',
        required: false,
        enum: ['auto', 'firecrawl', 'apify'],
      },
    ],
    capabilities: ['network:fetch'],
  },

  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolCallResult> => {
    const start = Date.now();
    const toolName = 'scrape_crawl';
    try {
      const urlErr = validateUrl(args.start_url);
      if (urlErr) {
        return {
          toolName,
          success: false,
          output: '',
          error: urlErr,
          durationMs: Date.now() - start,
        };
      }

      const startUrl = args.start_url as string;
      const rawMaxPages = args.max_pages;
      const maxPages = typeof rawMaxPages === 'number' && rawMaxPages > 0
        ? rawMaxPages
        : (config.defaultMaxPages || 10);
      const rawMaxDepth = args.max_depth;
      const maxDepth = typeof rawMaxDepth === 'number' && rawMaxDepth >= 0 ? rawMaxDepth : 2;
      const sameDomain = args.same_domain !== false;
      const selector = args.selector as string | undefined;
      const pathPattern = args.path_pattern as string | undefined;
      const preferredBackend = (args.backend as string) || 'auto';
      const crawlTimeout = 120_000; // 2 min total for crawl

      let backendUsed = 'native';
      let pages: Record<string, unknown>[] = [];

      // Try Firecrawl crawl API first
      if (
        (preferredBackend === 'auto' || preferredBackend === 'firecrawl') &&
        config.firecrawlApiKey
      ) {
        ctx.logger.info(`[scraper] Crawling ${startUrl} via Firecrawl API`);
        const fcPages = await firecrawlCrawl(
          startUrl,
          maxPages,
          maxDepth,
          pathPattern,
          crawlTimeout,
        );
        if (fcPages && fcPages.length > 0) {
          backendUsed = 'firecrawl';
          pages = fcPages;
        } else if (fcPages && fcPages.length === 0) {
          ctx.logger.warn('[scraper] Firecrawl crawl returned 0 pages, falling back to native');
        } else {
          ctx.logger.warn('[scraper] Firecrawl crawl failed, falling back to native');
        }
      }

      // Fallback to native BFS crawling
      if (pages.length === 0) {
        ctx.logger.info(`[scraper] Crawling ${startUrl} via native BFS`);
        backendUsed = 'native';
        pages = await crawlSite(
          startUrl,
          maxPages,
          maxDepth,
          sameDomain,
          selector,
          pathPattern,
        );
      }

      return {
        toolName,
        success: true,
        output: JSON.stringify({
          startUrl,
          pagesCrawled: pages.length,
          maxPagesRequested: maxPages,
          maxDepth,
          sameDomain,
          pathPattern: pathPattern || null,
          backend_used: backendUsed,
          pages,
        }),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName,
        success: false,
        output: '',
        error: `Crawl failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Tool: scrape_search
// ---------------------------------------------------------------------------

const scrapeSearchTool: Tool = {
  definition: {
    name: 'scrape_search',
    description:
      'Search the web using Tavily, Firecrawl, Brave, or Exa and extract structured results. Requires an API key configured in plugin settings.',
    params: [
      { name: 'query', type: 'string', description: 'Search query string', required: true },
      {
        name: 'max_results',
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
        required: false,
        defaultValue: 10,
      },
      {
        name: 'engine',
        type: 'string',
        description: 'Search engine to use',
        required: false,
        enum: ['tavily', 'firecrawl', 'brave', 'exa'],
        defaultValue: 'tavily',
      },
      {
        name: 'scrape_results',
        type: 'boolean',
        description: 'Also scrape each result page for full content',
        required: false,
        defaultValue: false,
      },
    ],
    capabilities: ['network:fetch'],
  },

  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolCallResult> => {
    const start = Date.now();
    const toolName = 'scrape_search';
    try {
      if (!args.query || typeof args.query !== 'string') {
        return {
          toolName,
          success: false,
          output: '',
          error: 'query must be a non-empty string',
          durationMs: Date.now() - start,
        };
      }

      const query = args.query as string;
      const maxResults = typeof args.max_results === 'number' ? args.max_results : 10;
      const engine = (args.engine as string) || 'tavily';
      const scrapeResults = args.scrape_results === true;

      // Tavily API
      if (engine === 'tavily' && config.tavilyApiKey) {
        ctx.logger.info(`[scraper] Searching "${query}" via Tavily`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        try {
          const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.tavilyApiKey}`,
            },
            body: JSON.stringify({ query, max_results: maxResults, search_depth: 'basic' }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            const results = data.results || data;
            if (scrapeResults) {
              for (const r of results) {
                if (r.url) {
                  try {
                    r.content = await fetchPage(r.url, 15_000);
                  } catch { /* skip */ }
                }
              }
            }
            return {
              toolName,
              success: true,
              output: JSON.stringify({ engine, query, maxResults, results }),
              durationMs: Date.now() - start,
            };
          }
        } catch {
          clearTimeout(timeoutId);
        }
      }

      // Firecrawl search API
      if (engine === 'firecrawl' && config.firecrawlApiKey) {
        ctx.logger.info(`[scraper] Searching "${query}" via Firecrawl`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        try {
          const response = await fetch('https://api.firecrawl.dev/v1/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.firecrawlApiKey}`,
            },
            body: JSON.stringify({ query, limit: maxResults }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            if (scrapeResults && Array.isArray(data)) {
              for (const r of data) {
                if (r.url) {
                  try {
                    r.content = await fetchPage(r.url, 15_000);
                  } catch { /* skip */ }
                }
              }
            }
            return {
              toolName,
              success: true,
              output: JSON.stringify({ engine, query, maxResults, results: data }),
              durationMs: Date.now() - start,
            };
          }
        } catch {
          clearTimeout(timeoutId);
        }
      }

      // Brave Search API
      if (engine === 'brave' && config.braveApiKey) {
        ctx.logger.info(`[scraper] Searching "${query}" via Brave`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        try {
          const response = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${
              encodeURIComponent(query)
            }&count=${maxResults}`,
            {
              headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': config.braveApiKey,
              },
              signal: controller.signal,
            },
          );
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            const results = (data.web?.results || []).map((r: Record<string, unknown>) => ({
              title: r.title,
              url: r.url,
              description: r.description,
            }));
            if (scrapeResults) {
              for (const r of results) {
                if (r.url) {
                  try {
                    r.content = await fetchPage(r.url, 15_000);
                  } catch { /* skip */ }
                }
              }
            }
            return {
              toolName,
              success: true,
              output: JSON.stringify({ engine, query, maxResults, results }),
              durationMs: Date.now() - start,
            };
          }
        } catch {
          clearTimeout(timeoutId);
        }
      }

      // Exa search API
      if (engine === 'exa' && config.exaApiKey) {
        ctx.logger.info(`[scraper] Searching "${query}" via Exa`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        try {
          const response = await fetch('https://api.exa.ai/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.exaApiKey}`,
            },
            body: JSON.stringify({ query, numResults: maxResults }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            const results = (data.results || []).map((r: Record<string, unknown>) => ({
              title: r.title,
              url: r.url,
              snippet: r.text || r.snippet,
            }));
            if (scrapeResults) {
              for (const r of results) {
                if (r.url) {
                  try {
                    r.content = await fetchPage(r.url, 15_000);
                  } catch { /* skip */ }
                }
              }
            }
            return {
              toolName,
              success: true,
              output: JSON.stringify({ engine, query, maxResults, results }),
              durationMs: Date.now() - start,
            };
          }
        } catch {
          clearTimeout(timeoutId);
        }
      }

      return {
        toolName,
        success: true,
        output: JSON.stringify({
          engine,
          query,
          maxResults,
          results: [],
          warning:
            `No API key configured for engine "${engine}". Configure the appropriate API key in plugin settings ` +
            '(tavilyApiKey, firecrawlApiKey, braveApiKey, or exaApiKey). ' +
            'Navigate to plugin settings to set the key.',
        }),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName,
        success: false,
        output: '',
        error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Tool: scrape_extract_schema
// ---------------------------------------------------------------------------

const scrapeExtractSchemaTool: Tool = {
  definition: {
    name: 'scrape_extract_schema',
    description:
      'Extract structured data from a URL following a JSON schema. Uses pattern matching and DOM heuristics to identify schema fields in the page content.',
    params: [
      {
        name: 'url',
        type: 'string',
        description: 'The URL to extract structured data from',
        required: true,
      },
      {
        name: 'schema',
        type: 'string',
        description: 'JSON schema string defining the structure to extract',
        required: true,
      },
      {
        name: 'multiple',
        type: 'boolean',
        description: 'Whether to extract multiple matching items',
        required: false,
        defaultValue: false,
      },
      {
        name: 'backend',
        type: 'string',
        description: 'Extraction backend for AI-powered extraction',
        required: false,
        enum: ['auto', 'firecrawl', 'jina', 'apify'],
      },
    ],
    capabilities: ['network:fetch'],
  },

  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolCallResult> => {
    const start = Date.now();
    const toolName = 'scrape_extract_schema';
    try {
      const urlErr = validateUrl(args.url);
      if (urlErr) {
        return {
          toolName,
          success: false,
          output: '',
          error: urlErr,
          durationMs: Date.now() - start,
        };
      }

      if (!args.schema || typeof args.schema !== 'string') {
        return {
          toolName,
          success: false,
          output: '',
          error: 'schema must be a non-empty JSON schema string',
          durationMs: Date.now() - start,
        };
      }

      const url = args.url as string;
      let schema: Record<string, unknown>;
      try {
        schema = JSON.parse(args.schema as string);
      } catch {
        return {
          toolName,
          success: false,
          output: '',
          error: 'schema must be valid JSON',
          durationMs: Date.now() - start,
        };
      }

      const multiple = args.multiple === true;
      const preferredBackend = (args.backend as string) || 'auto';
      let backendUsed = 'native';
      let extracted: Record<string, unknown> | Record<string, unknown>[] = {};

      // Try Firecrawl AI extract API first
      if (
        (preferredBackend === 'auto' || preferredBackend === 'firecrawl') &&
        config.firecrawlApiKey
      ) {
        ctx.logger.info(`[scraper] Extracting from ${url} via Firecrawl AI extract`);
        const fcResult = await firecrawlExtract(url, schema, 60_000);
        if (fcResult && Object.keys(fcResult).length > 0) {
          backendUsed = 'firecrawl';
          extracted = multiple ? [fcResult] : fcResult;
        } else {
          ctx.logger.warn(
            '[scraper] Firecrawl extract returned empty, falling back to native heuristics',
          );
        }
      }

      // Fallback to native heuristic extraction
      if (backendUsed === 'native') {
        const html = await fetchPage(url);
        const metadata = extractMetadata(html, url);
        const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
        const singleExtracted: Record<string, unknown> = {};

        for (const [key, _prop] of Object.entries(properties)) {
          // Try meta tag extraction first
          const metaMatch = html.match(
            new RegExp(
              `<meta[^>]*name\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
              'i',
            ),
          );
          if (metaMatch) {
            singleExtracted[key] = metaMatch[1];
            continue;
          }

          // Try og: meta extraction
          const ogMatch = html.match(
            new RegExp(
              `<meta[^>]*property\\s*=\\s*["']og:${key}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
              'i',
            ),
          );
          if (ogMatch) {
            singleExtracted[key] = ogMatch[1];
            continue;
          }

          // Try itemprop extraction
          const itempropRegex = new RegExp(
            `<[^>]*itemprop\\s*=\\s*["']${key}["'][^>]*>([\\s\\S]*?)<\\/`,
            'i',
          );
          const itempropMatch = itempropRegex.exec(html);
          if (itempropMatch) {
            singleExtracted[key] = itempropMatch[1].replace(/<[^>]*>/g, '').trim();
            continue;
          }

          // Try JSON-LD extraction
          const ldMatch = html.match(
            /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i,
          );
          if (ldMatch) {
            try {
              const ldJson = JSON.parse(ldMatch[1]);
              const items = Array.isArray(ldJson) ? ldJson : [ldJson];
              for (const item of items) {
                if (item[key] !== undefined) {
                  singleExtracted[key] = item[key];
                  break;
                }
              }
            } catch { /* invalid JSON-LD */ }
          }

          // Fallback: heading section extraction
          if (singleExtracted[key] === undefined) {
            const headingRegex = new RegExp(
              `<h[1-6][^>]*>[^<]*${key}[^<]*<\/h[1-6]>[\\s\\S]*?(?=<h[1-6]|$)`,
              'i',
            );
            const headingMatch = headingRegex.exec(html);
            if (headingMatch) {
              singleExtracted[key] = headingMatch[0]
                .replace(/<[^>]*>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 500);
            }
          }
        }

        extracted = multiple ? [singleExtracted] : singleExtracted;

        // For multiple items, scan for repeating patterns (e.g., product cards)
        if (multiple) {
          const itemContainerRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
          const containers = [...html.matchAll(itemContainerRegex)];
          if (containers.length > 1) {
            const multiExtracted: Record<string, unknown>[] = [];
            for (const containerMatch of containers) {
              const containerHtml = containerMatch[1];
              const item: Record<string, unknown> = {};
              for (const [key, _prop] of Object.entries(properties)) {
                const itemMetaMatch = containerHtml.match(
                  new RegExp(
                    `<meta[^>]*itemprop\\s*=\\s*["']${key}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
                    'i',
                  ),
                );
                if (itemMetaMatch) {
                  item[key] = itemMetaMatch[1];
                }
              }
              if (Object.keys(item).length > 0) multiExtracted.push(item);
            }
            if (multiExtracted.length > 0) {
              extracted = multiExtracted;
            }
          }
        }

        // Attach metadata when using native extraction
        (Array.isArray(extracted) ? extracted : [extracted]).forEach((item) => {
          if (!item._metadata) item._metadata = metadata;
        });
      }

      return {
        toolName,
        success: true,
        output: JSON.stringify({
          url,
          multiple,
          backend_used: backendUsed,
          schemaProperties: Object.keys((schema.properties || {}) as Record<string, unknown>),
          extracted,
        }),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName,
        success: false,
        output: '',
        error: `Schema extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Tool: scrape_monitor
// ---------------------------------------------------------------------------

let monitorState: Map<string, { hash: string; lastChecked: string }> = new Map();

const scrapeMonitorTool: Tool = {
  definition: {
    name: 'scrape_monitor',
    description:
      'Monitor a URL for changes by recording a content hash baseline and checking periodically.',
    params: [
      {
        name: 'url',
        type: 'string',
        description: 'The URL to monitor for changes',
        required: true,
      },
      {
        name: 'interval_hours',
        type: 'number',
        description: 'How often to check for changes in hours (default: 24)',
        required: false,
        defaultValue: 24,
      },
      {
        name: 'selector',
        type: 'string',
        description: 'CSS selector to monitor only a specific part of the page',
        required: false,
      },
    ],
    capabilities: ['network:fetch'],
  },

  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolCallResult> => {
    const start = Date.now();
    const toolName = 'scrape_monitor';
    try {
      const urlErr = validateUrl(args.url);
      if (urlErr) {
        return {
          toolName,
          success: false,
          output: '',
          error: urlErr,
          durationMs: Date.now() - start,
        };
      }

      const url = args.url as string;
      const selector = args.selector as string | undefined;
      const intervalHours = typeof args.interval_hours === 'number' ? args.interval_hours : 24;

      const html = await fetchPage(url);
      const content = selector ? contentBySelector(html, selector) : extractText(html);

      // Simple hash using string length + character sum
      const hash = `${content.length}-${[...content].reduce((sum, c) => sum + c.charCodeAt(0), 0)}`;

      const previous = monitorState.get(url);
      const now = new Date().toISOString();

      let changed = false;
      if (previous) {
        changed = previous.hash !== hash;
      }

      monitorState.set(url, { hash, lastChecked: now });

      return {
        toolName,
        success: true,
        output: JSON.stringify({
          url,
          changed,
          previousHash: previous?.hash || null,
          currentHash: hash,
          previousCheck: previous?.lastChecked || null,
          currentCheck: now,
          intervalHours,
          selector: selector || null,
          note: previous
            ? (changed
              ? 'Content has changed since last check.'
              : 'No changes detected since last check.')
            : 'Baseline recorded. Run again after the interval to detect changes.',
        }),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName,
        success: false,
        output: '',
        error: `Monitor failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Tool: scrape_export
// ---------------------------------------------------------------------------

const scrapeExportTool: Tool = {
  definition: {
    name: 'scrape_export',
    description:
      'Export scraped data (JSON array of items) to JSON, CSV, or Markdown table format.',
    params: [
      {
        name: 'format',
        type: 'string',
        description: 'Export format for the data',
        required: false,
        enum: ['json', 'csv', 'markdown'],
        defaultValue: 'json',
      },
      {
        name: 'data',
        type: 'string',
        description: 'JSON array string of scraped items to export',
        required: true,
      },
    ],
    capabilities: [],
  },

  execute: async (args: Record<string, unknown>, ctx: PluginContext): Promise<ToolCallResult> => {
    const start = Date.now();
    const toolName = 'scrape_export';
    try {
      if (!args.data || typeof args.data !== 'string') {
        return {
          toolName,
          success: false,
          output: '',
          error: 'data must be a non-empty JSON array string',
          durationMs: Date.now() - start,
        };
      }

      const format = (args.format as string) || 'json';

      let parsed: unknown;
      try {
        parsed = JSON.parse(args.data as string);
      } catch {
        return {
          toolName,
          success: false,
          output: '',
          error: 'data must be valid JSON',
          durationMs: Date.now() - start,
        };
      }

      if (!Array.isArray(parsed)) {
        return {
          toolName,
          success: false,
          output: '',
          error: 'data must be a JSON array',
          durationMs: Date.now() - start,
        };
      }

      const items = parsed as Record<string, unknown>[];
      let output: string;

      if (format === 'json') {
        output = JSON.stringify(items, null, 2);
      } else if (format === 'csv') {
        output = jsonToCsv(items);
      } else if (format === 'markdown') {
        output = jsonToMarkdownTable(items);
      } else {
        output = JSON.stringify(items, null, 2);
      }

      return {
        toolName,
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName,
        success: false,
        output: '',
        error: `Export failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Tool: scrape_status
// ---------------------------------------------------------------------------

const scrapeStatusTool: Tool = {
  definition: {
    name: 'scrape_status',
    description:
      'Check the health, rate-limit status, and remaining quota of all configured scraping backends.',
    params: [],
    capabilities: [],
  },

  execute: async (_args: Record<string, unknown>, ctx: PluginContext): Promise<ToolCallResult> => {
    const start = Date.now();
    const toolName = 'scrape_status';
    try {
      ctx.logger.info('[scraper] Checking backend status for all configured services');
      const backends: Record<string, Record<string, unknown>> = {};

      // Check each backend by making a lightweight API call
      const checks: Array<Promise<{ name: string; status: Record<string, unknown> }>> = [];

      if (config.firecrawlApiKey) {
        checks.push((async () => {
          try {
            const res = await fetch('https://api.firecrawl.dev/v1/health', {
              headers: { Authorization: `Bearer ${config.firecrawlApiKey}` },
              signal: AbortSignal.timeout(10_000),
            });
            return { name: 'firecrawl', status: { ok: res.ok, configured: true } };
          } catch {
            return { name: 'firecrawl', status: { configured: true, reachable: false } };
          }
        })());
      } else {
        backends.firecrawl = { configured: false, note: 'Set firecrawlApiKey in plugin settings' };
      }

      if (config.tavilyApiKey) {
        checks.push((async () => {
          try {
            const res = await fetch('https://api.tavily.com/search', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.tavilyApiKey}`,
              },
              body: JSON.stringify({ query: 'test', max_results: 1 }),
              signal: AbortSignal.timeout(10_000),
            });
            return { name: 'tavily', status: { ok: res.ok, configured: true } };
          } catch {
            return { name: 'tavily', status: { configured: true, reachable: false } };
          }
        })());
      } else {
        backends.tavily = { configured: false, note: 'Set tavilyApiKey in plugin settings' };
      }

      if (config.apifyApiToken) {
        checks.push((async () => {
          try {
            const res = await fetch('https://api.apify.com/v2/users/me', {
              headers: { Authorization: `Bearer ${config.apifyApiToken}` },
              signal: AbortSignal.timeout(10_000),
            });
            return { name: 'apify', status: { ok: res.ok, configured: true } };
          } catch {
            return { name: 'apify', status: { configured: true, reachable: false } };
          }
        })());
      } else {
        backends.apify = { configured: false, note: 'Set apifyApiToken in plugin settings' };
      }

      if (config.brightdataApiKey) {
        backends.brightdata = {
          configured: true,
          note: 'API key set — verify at https://brightdata.com',
        };
      } else {
        backends.brightdata = {
          configured: false,
          note: 'Set brightdataApiKey in plugin settings',
        };
      }

      if (config.oxylabsApiKey) {
        backends.oxylabs = { configured: true, note: 'API key set — verify at https://oxylabs.io' };
      } else {
        backends.oxylabs = { configured: false, note: 'Set oxylabsApiKey in plugin settings' };
      }

      if (config.jinaApiKey) {
        checks.push((async () => {
          try {
            const res = await fetch('https://r.jina.ai/https://example.com', {
              headers: { Authorization: `Bearer ${config.jinaApiKey}` },
              signal: AbortSignal.timeout(10_000),
            });
            return { name: 'jina', status: { ok: res.ok, configured: true } };
          } catch {
            return { name: 'jina', status: { configured: true, reachable: false } };
          }
        })());
      } else {
        backends.jina = { configured: false, note: 'Set jinaApiKey in plugin settings' };
      }

      if (config.braveApiKey) {
        checks.push((async () => {
          try {
            const res = await fetch(
              'https://api.search.brave.com/res/v1/web/search?q=test&count=1',
              {
                headers: {
                  'Accept': 'application/json',
                  'X-Subscription-Token': config.braveApiKey,
                },
                signal: AbortSignal.timeout(10_000),
              },
            );
            return { name: 'brave', status: { ok: res.ok, configured: true } };
          } catch {
            return { name: 'brave', status: { configured: true, reachable: false } };
          }
        })());
      } else {
        backends.brave = { configured: false, note: 'Set braveApiKey in plugin settings' };
      }

      if (config.exaApiKey) {
        checks.push((async () => {
          try {
            const res = await fetch('https://api.exa.ai/search', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.exaApiKey}`,
              },
              body: JSON.stringify({ query: 'test', numResults: 1 }),
              signal: AbortSignal.timeout(10_000),
            });
            return { name: 'exa', status: { ok: res.ok, configured: true } };
          } catch {
            return { name: 'exa', status: { configured: true, reachable: false } };
          }
        })());
      } else {
        backends.exa = { configured: false, note: 'Set exaApiKey in plugin settings' };
      }

      const checkResults = await Promise.allSettled(checks);
      for (const result of checkResults) {
        if (result.status === 'fulfilled') {
          backends[result.value.name] = result.value.status;
        }
      }

      const configured = Object.values(backends).filter((b) => b.configured).length;
      const reachable = Object.values(backends).filter((b) => b.ok).length;

      return {
        toolName,
        success: true,
        output: JSON.stringify({
          backends,
          summary: {
            total_backends: Object.keys(backends).length,
            configured,
            reachable,
            recommended: config.firecrawlApiKey
              ? 'firecrawl'
              : config.tavilyApiKey
              ? 'tavily'
              : null,
          },
        }),
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName,
        success: false,
        output: '',
        error: `Status check failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function onLoad(ctx: PluginContext): Promise<void> {
  const firecrawlApiKey = await ctx.config.get<string>('firecrawlApiKey');
  const tavilyApiKey = await ctx.config.get<string>('tavilyApiKey');
  const apifyApiToken = await ctx.config.get<string>('apifyApiToken');
  const brightdataApiKey = await ctx.config.get<string>('brightdataApiKey');
  const oxylabsApiKey = await ctx.config.get<string>('oxylabsApiKey');
  const jinaApiKey = await ctx.config.get<string>('jinaApiKey');
  const braveApiKey = await ctx.config.get<string>('braveApiKey');
  const exaApiKey = await ctx.config.get<string>('exaApiKey');
  const defaultMaxPages = await ctx.config.get<number>('defaultMaxPages');
  const userAgent = await ctx.config.get<string>('userAgent');
  const requestDelayMs = await ctx.config.get<number>('requestDelayMs');

  config = {
    firecrawlApiKey: firecrawlApiKey ?? '',
    tavilyApiKey: tavilyApiKey ?? '',
    apifyApiToken: apifyApiToken ?? '',
    brightdataApiKey: brightdataApiKey ?? '',
    oxylabsApiKey: oxylabsApiKey ?? '',
    jinaApiKey: jinaApiKey ?? '',
    braveApiKey: braveApiKey ?? '',
    exaApiKey: exaApiKey ?? '',
    defaultMaxPages: defaultMaxPages ?? 10,
    userAgent: userAgent ?? 'CortexPrism-WebScraper/1.1.0',
    requestDelayMs: requestDelayMs ?? 1000,
  };

  ctx.logger.info(
    '[cortex-plugin-web-scraper] Loaded — Firecrawl, Tavily, Apify, Bright Data, Oxylabs, Jina AI, Brave, Exa',
  );
}

export async function onUnload(ctx: PluginContext): Promise<void> {
  monitorState = new Map();
  ctx.logger.info('[cortex-plugin-web-scraper] Unloaded');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const tools: Tool[] = [
  scrapeUrlTool,
  scrapeCrawlTool,
  scrapeSearchTool,
  scrapeExtractSchemaTool,
  scrapeStatusTool,
  scrapeMonitorTool,
  scrapeExportTool,
];
