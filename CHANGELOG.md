# Changelog

## [Unreleased]

### Changed
- Renamed manifest file from `cortex.json` to `manifest.json` for consistency with Cortex standard
- Standardized UI section structure to `ui.settings` format
- Normalized parameter naming: `defaultValue` → `default`, `options` → `enum`
- Added `homepage` field with repository URL
- Added `dependencies` field to manifest

## [1.0.1] — 2026-06-15

### Added
- Initial release
## [1.0.1] — 2026-06-17

### Fixed

- Replaced non-existent `cortex/plugins` import with local `types.ts` containing inline type definitions
- Removed broken `cortex/plugins` import map from `deno.json`
- Fixed test files with complete mock contexts (`state.delete`, `state.list`, `config.get/set/getAll`, `logger`, `host`)
- Rewrote scaffold test files to test actual plugin tools instead of template leftovers
- Added `defaultValue` and `default` fields to `ToolParam` type for compatibility

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-06-15

### Added

- Initial release of cortex-plugin-web-scraper
- `scrape_url` tool — Scrape single URLs with text/markdown/HTML output, CSS selector support, and
  metadata extraction
- `scrape_crawl` tool — Multi-page crawling with depth/domain controls and BFS-based link following
- `scrape_search` tool — Web search via Tavily and Firecrawl APIs with fallback warnings
- `scrape_extract_schema` tool — Structured data extraction using JSON schema with meta tags,
  JSON-LD, itemprop, and heading heuristics
- `scrape_monitor` tool — Content change detection via hash-based baseline comparison
- `scrape_export` tool — Export scraped datasets to JSON, CSV, or Markdown table format
- Module-level configuration via `onLoad` hook with closure pattern
- UI settings for API keys (Firecrawl, Tavily) and general scraping options
- Basic HTML-to-Markdown converter for cleaner agent consumption
- CSS selector-based content extraction with tag/class/id matching
- Table and list extraction from HTML
- `requestDelayMs` between crawl requests with configurable user agent
- Comprehensive README with tool reference, examples, and troubleshooting
- Unit test suite covering all 6 tools
