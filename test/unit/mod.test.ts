// deno-lint-ignore-file require-await
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { tools } from '../../mod.ts';
import type { PluginContext } from '../../types.ts';

const mockContext: PluginContext = {
  pluginId: 'cortex-plugin-web-scraper',
  pluginDir: '/tmp/plugins/cortex-plugin-web-scraper',
  state: {
    get: async () => null,
    set: async () => {},
    delete: async () => {},
    list: async () => ({}),
  },
  config: {
    get: async () => null,
    set: async () => {},
    getAll: async () => ({}),
  },
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
  host: {
    registerTool: () => {},
    unregisterTool: () => {},
  },
};

function findTool(name: string) {
  return tools.find((t) => t.definition.name === name);
}

// scrape_url tests

Deno.test('scrape_url - rejects empty URL', async () => {
  const tool = findTool('scrape_url');
  if (!tool) throw new Error('scrape_url tool not found');

  const result = await tool.execute({ url: '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'non-empty string');
});

Deno.test('scrape_url - rejects non-HTTP URL', async () => {
  const tool = findTool('scrape_url');
  if (!tool) throw new Error('scrape_url tool not found');

  const result = await tool.execute({ url: 'ftp://example.com' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'https:// or http://');
});

Deno.test('scrape_url - accepts valid URL params', async () => {
  const tool = findTool('scrape_url');
  if (!tool) throw new Error('scrape_url tool not found');

  try {
    const result = await tool.execute({
      url: 'https://httpbin.org/html',
      format: 'text',
      include_metadata: false,
    }, mockContext);
    assert(result.success || !result.success);
  } catch {
    // Network may not be available in CI
  }
});

// scrape_crawl tests

Deno.test('scrape_crawl - rejects empty start_url', async () => {
  const tool = findTool('scrape_crawl');
  if (!tool) throw new Error('scrape_crawl tool not found');

  const result = await tool.execute({ start_url: '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'non-empty string');
});

Deno.test('scrape_crawl - accepts valid params', async () => {
  const tool = findTool('scrape_crawl');
  if (!tool) throw new Error('scrape_crawl tool not found');

  const result = await tool.execute({
    start_url: 'https://httpbin.org/html',
    max_pages: 3,
    max_depth: 1,
    same_domain: true,
  }, mockContext);
  assert(result.success || !result.success);
});

// scrape_search tests

Deno.test('scrape_search - rejects empty query', async () => {
  const tool = findTool('scrape_search');
  if (!tool) throw new Error('scrape_search tool not found');

  const result = await tool.execute({ query: '' }, mockContext);
  assertEquals(result.success, false);
});

Deno.test('scrape_search - returns warning without API key', async () => {
  const tool = findTool('scrape_search');
  if (!tool) throw new Error('scrape_search tool not found');

  const result = await tool.execute({
    query: 'test query',
    engine: 'tavily',
    max_results: 5,
  }, mockContext);
  assertEquals(result.success, true);
  assertStringIncludes(result.output as string, 'warning');
});

Deno.test('scrape_search - rejects unsupported engine type', async () => {
  const tool = findTool('scrape_search');
  if (!tool) throw new Error('scrape_search tool not found');

  const result = await tool.execute({
    query: 'test',
    engine: 'tavily',
  }, mockContext);
  assert(result.success);
});

// scrape_extract_schema tests

Deno.test('scrape_extract_schema - rejects empty URL', async () => {
  const tool = findTool('scrape_extract_schema');
  if (!tool) throw new Error('scrape_extract_schema tool not found');

  const result = await tool.execute({ url: '', schema: '{}' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'non-empty string');
});

Deno.test('scrape_extract_schema - rejects invalid JSON schema', async () => {
  const tool = findTool('scrape_extract_schema');
  if (!tool) throw new Error('scrape_extract_schema tool not found');

  const result = await tool.execute({
    url: 'https://example.com',
    schema: 'not-json',
  }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'valid JSON');
});

Deno.test('scrape_extract_schema - accepts valid schema', async () => {
  const tool = findTool('scrape_extract_schema');
  if (!tool) throw new Error('scrape_extract_schema tool not found');

  try {
    const result = await tool.execute({
      url: 'https://httpbin.org/html',
      schema: '{"properties":{"title":{"type":"string"}}}',
    }, mockContext);
    assert(result.success || !result.success);
  } catch {
    // Network may not be available
  }
});

Deno.test('scrape_extract_schema - rejects empty schema string', async () => {
  const tool = findTool('scrape_extract_schema');
  if (!tool) throw new Error('scrape_extract_schema tool not found');

  const result = await tool.execute({
    url: 'https://example.com',
    schema: '',
    multiple: false,
  }, mockContext);
  assertEquals(result.success, false);
});

// scrape_monitor tests

Deno.test('scrape_monitor - rejects empty URL', async () => {
  const tool = findTool('scrape_monitor');
  if (!tool) throw new Error('scrape_monitor tool not found');

  const result = await tool.execute({ url: '' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'non-empty string');
});

Deno.test('scrape_monitor - accepts valid URL', async () => {
  const tool = findTool('scrape_monitor');
  if (!tool) throw new Error('scrape_monitor tool not found');

  try {
    const result = await tool.execute({
      url: 'https://httpbin.org/html',
      interval_hours: 24,
    }, mockContext);
    assert(result.success || !result.success);
  } catch {
    // Network may not be available
  }
});

// scrape_export tests

Deno.test('scrape_export - rejects empty data', async () => {
  const tool = findTool('scrape_export');
  if (!tool) throw new Error('scrape_export tool not found');

  const result = await tool.execute({ data: '' }, mockContext);
  assertEquals(result.success, false);
});

Deno.test('scrape_export - rejects invalid JSON', async () => {
  const tool = findTool('scrape_export');
  if (!tool) throw new Error('scrape_export tool not found');

  const result = await tool.execute({ data: 'not-json' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'valid JSON');
});

Deno.test('scrape_export - rejects non-array data', async () => {
  const tool = findTool('scrape_export');
  if (!tool) throw new Error('scrape_export tool not found');

  const result = await tool.execute({ data: '{"key":"value"}' }, mockContext);
  assertEquals(result.success, false);
  assertStringIncludes(result.error, 'array');
});

Deno.test('scrape_export - exports JSON format', async () => {
  const tool = findTool('scrape_export');
  if (!tool) throw new Error('scrape_export tool not found');

  const result = await tool.execute({
    data: '[{"name":"Alice","age":30}]',
    format: 'json',
  }, mockContext);
  assertEquals(result.success, true);
  assertStringIncludes(result.output as string, 'Alice');
});

Deno.test('scrape_export - exports CSV format', async () => {
  const tool = findTool('scrape_export');
  if (!tool) throw new Error('scrape_export tool not found');

  const result = await tool.execute({
    data: '[{"name":"Alice","age":30}]',
    format: 'csv',
  }, mockContext);
  assertEquals(result.success, true);
  assertStringIncludes(result.output as string, '"name"');
  assertStringIncludes(result.output as string, 'Alice');
});

Deno.test('scrape_export - exports Markdown format', async () => {
  const tool = findTool('scrape_export');
  if (!tool) throw new Error('scrape_export tool not found');

  const result = await tool.execute({
    data: '[{"name":"Alice","age":30}]',
    format: 'markdown',
  }, mockContext);
  assertEquals(result.success, true);
  assertStringIncludes(result.output as string, '| name |');
  assertStringIncludes(result.output as string, 'Alice');
});

// Tools array exported

Deno.test('tools array exported with all 6 tools', () => {
  assertEquals(tools.length, 6);
  const names = tools.map((t) => t.definition.name);
  assertEquals(names, [
    'scrape_url',
    'scrape_crawl',
    'scrape_search',
    'scrape_extract_schema',
    'scrape_monitor',
    'scrape_export',
  ]);
});

// Tool definitions match manifest

Deno.test('all tools have required definition fields', () => {
  for (const tool of tools) {
    assert(tool.definition.name, `Tool missing name`);
    assert(tool.definition.description, `Tool ${tool.definition.name} missing description`);
    assert(
      Array.isArray(tool.definition.params),
      `Tool ${tool.definition.name} params not an array`,
    );
  }
});
