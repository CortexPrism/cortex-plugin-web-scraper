# cortex-plugin-web-scraper

Firecrawl/Tavily/Apify-based structured web scraping plugin for CortexPrism. Agents can crawl sites,
extract structured data (JSON), monitor pages for changes, and build datasets.

## Installation

```bash
# From marketplace
cortex plugin install marketplace:cortex-plugin-web-scraper

# From GitHub (for development)
cortex plugin install github:CortexPrism/cortex-plugin-web-scraper

# Local installation (for development)
cortex plugin install ./manifest.json
```

## API Key Setup

This plugin supports external search and scraping APIs. Configure in plugin settings:

| API       | Key Setting                | Get Key At            |
| --------- | -------------------------- | --------------------- |
| Firecrawl | `firecrawlApiKey` (secret) | https://firecrawl.dev |
| Tavily    | `tavilyApiKey` (secret)    | https://tavily.com    |

Without API keys, all tools still work using basic HTTP fetching. Search tools with API keys
configured will use the respective service's API for enhanced results.

### Configuring via CLI

```bash
cortex plugin config set cortex-plugin-web-scraper firecrawlApiKey "fc-xxxxx"
cortex plugin config set cortex-plugin-web-scraper tavilyApiKey "tvly-xxxxx"
```

### Configuring via UI

Open Cortex settings, navigate to the cortex-plugin-web-scraper section, and fill in the API Keys
and General settings fields.

## Quick Start

```bash
# List available tools
cortex tools list --plugin cortex-plugin-web-scraper

# Use in an agent session
cortex chat --plugin cortex-plugin-web-scraper
```

## Configuration

| Setting           | Type   | Default                        | Description                            |
| ----------------- | ------ | ------------------------------ | -------------------------------------- |
| `firecrawlApiKey` | secret | —                              | Firecrawl API key                      |
| `tavilyApiKey`    | secret | —                              | Tavily API key                         |
| `defaultMaxPages` | number | 10                             | Default max pages for crawl operations |
| `userAgent`       | text   | `CortexPrism-WebScraper/1.0.0` | User-Agent header for requests         |
| `requestDelayMs`  | number | 1000                           | Delay between requests (ms)            |

## Tools

### scrape_url

Scrape a single URL and extract content.

**Parameters:**

- `url` (string, required) — The URL to scrape (HTTP or HTTPS)
- `format` (string, optional, default: `"text"`) — Output format: `"text"`, `"markdown"`, or
  `"html"`
- `selector` (string, optional) — CSS selector to extract specific content
- `include_metadata` (boolean, optional, default: `true`) — Include page metadata

**Example:**

```bash
cortex tool call scrape_url --url https://example.com --format markdown
```

**Example with selector:**

```bash
cortex tool call scrape_url --url https://example.com --selector ".main-content"
```

**Response includes:** URL, format, content, metadata (title, description, OG tags, headings),
extracted tables, and lists.

---

### scrape_crawl

Crawl a website starting from a URL, following links up to a configurable depth and page limit.

**Parameters:**

- `start_url` (string, required) — Starting URL for the crawl
- `max_pages` (number, optional, default: `10`) — Maximum pages to crawl
- `max_depth` (number, optional, default: `2`) — Maximum crawl depth
- `same_domain` (boolean, optional, default: `true`) — Only follow same-domain links
- `selector` (string, optional) — CSS selector to extract from each page

**Example:**

```bash
cortex tool call scrape_crawl --start_url https://docs.example.com --max_pages 20 --max_depth 3
```

**Response includes:** Array of crawled pages with URL, depth, title, content, and content length.

---

### scrape_search

Search the web and extract structured results.

**Parameters:**

- `query` (string, required) — Search query
- `max_results` (number, optional, default: `10`) — Max results to return
- `engine` (string, optional, default: `"tavily"`) — Search engine: `"tavily"`, `"firecrawl"`, or
  `"google"`

**Example:**

```bash
cortex tool call scrape_search --query "latest AI research papers 2026" --engine tavily --max_results 5
```

**Note:** Requires an API key configured for the chosen engine. Without an API key, a warning is
returned.

---

### scrape_extract_schema

Extract structured data from a URL following a JSON schema.

**Parameters:**

- `url` (string, required) — URL to extract from
- `schema` (string, required) — JSON schema string defining the extraction structure
- `multiple` (boolean, optional, default: `false`) — Extract multiple matching items

**Example:**

```bash
cortex tool call scrape_extract_schema \
  --url https://example.com/products \
  --schema '{"properties":{"name":{"type":"string"},"price":{"type":"string"},"description":{"type":"string"}}}' \
  --multiple true
```

**Extraction strategies (tried in order):**

1. `<meta>` tags matching schema keys
2. `og:` meta tags
3. `itemprop` attributes
4. JSON-LD structured data
5. Heading-based section extraction

---

### scrape_monitor

Monitor a URL for changes by recording a content hash baseline.

**Parameters:**

- `url` (string, required) — URL to monitor
- `interval_hours` (number, optional, default: `24`) — Suggested check interval
- `selector` (string, optional) — Monitor only a specific part of the page

**Example:**

```bash
cortex tool call scrape_monitor --url https://example.com/status --selector ".status-banner"
```

**Response includes:** Changed flag, previous/current content hashes, last check timestamps, and a
human-readable note.

---

### scrape_export

Export scraped data to a format.

**Parameters:**

- `format` (string, optional, default: `"json"`) — `"json"`, `"csv"`, or `"markdown"`
- `data` (string, required) — JSON array string of scraped items

**Example:**

```bash
cortex tool call scrape_export --format csv --data '[{"name":"Item 1","price":"$10"},{"name":"Item 2","price":"$20"}]'
```

**Output formats:**

- **json** — Pretty-printed JSON array
- **csv** — RFC 4180-compatible CSV with headers
- **markdown** — GitHub-flavored markdown table

---

## Capabilities

This plugin declares:

- `tools` — Core plugin capability
- `network:fetch` — Makes HTTP/HTTPS requests to scrape web pages and call APIs

## Development

### Setup

```bash
# Install dependencies
deno cache mod.ts

# Run tests
deno task test

# Format code
deno fmt

# Lint
deno lint
```

### Testing

```bash
# Run all tests
deno task test

# Run specific test
deno test --allow-all test/unit/mod.test.ts --filter "scrape_url"

# Run with coverage
deno test --coverage=.coverage --allow-all test/
```

### Validate

```bash
deno task validate
```

## Best Practices

**Do:**

- Validate all tool parameters before use
- Handle errors gracefully with try-catch
- Return `ToolCallResult` with `success`, `output`/`error`, and `durationMs`
- Respect `requestDelayMs` between crawl requests
- Use `AbortSignal.timeout` for all HTTP requests

**Don't:**

- Hardcode API keys or secrets (use plugin config)
- Request overly broad permissions
- Ignore errors or timeouts
- Crawl without respecting robots.txt conventions (be a good netizen)

## Troubleshooting

### Tool returns empty results

Ensure the URL is accessible and returns HTML content. Some sites block programmatic access.

### Search returns warning about API key

Configure `tavilyApiKey` or `firecrawlApiKey` in plugin settings to enable search engine API calls.

### Crawl is slow

Reduce `max_pages`, decrease `max_depth`, or lower `requestDelayMs` in plugin settings.

## License

MIT — See [LICENSE](./LICENSE) file.

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development standards.

## Support

- [Developing Plugins](../docs/developing.md)
- [Plugin Best Practices](../docs/best-practices.md)
- [Manifest Reference](../docs/manifest-reference.md)
- [Discord Community](https://discord.gg/y7DkaEbPQC)
- [Report Issues](https://github.com/CortexPrism/cortex/issues)
