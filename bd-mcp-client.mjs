/**
 * Bright Data MCP Client — calls BD hosted MCP server via StreamableHTTP
 * Tools used: search_engine (free tier), scrape_as_markdown (free tier)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BD_API_KEY = process.env.BD_API_KEY;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// SECURITY: BD_API_KEY is sent as a URL query param (?token=...) because
// StreamableHTTPClientTransport does not support custom auth headers.
// This means the key appears in Node.js HTTP debug logs, proxy access logs,
// and any network inspection tool. Mitigations:
//   1. Scope the BD API key to MCP-only permissions (not full account access)
//   2. Rotate the key immediately if any log aggregator is attached
//   3. Check https://brightdata.com/mcp docs for header-auth support when it ships
// Tracked: replace ?token= with Authorization header once BD supports it.

/**
 * Search via BD MCP search_engine tool
 * @param {string} query - Search query
 * @param {string} domain - Target domain (for mock mode)
 * @returns {Promise<Object>}
 */
export async function mcpSearch(query, domain) {
  await sleep(1800);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    const slug = domain.split('.')[0];
    return {
      query,
      results: [
        {
          title: `${slug.charAt(0).toUpperCase() + slug.slice(1)} Company Overview & Funding`,
          snippet: `${slug} has raised significant venture funding and is expanding rapidly. Latest round led by top-tier VCs.`,
          url: `https://crunchbase.com/organization/${slug}`
        },
        {
          title: `${slug} vs Competitors — G2 Comparison 2026`,
          snippet: `See how ${slug} stacks up against alternatives. Users rate ${slug} highly for ease of use and support.`,
          url: `https://g2.com/products/${slug}/competitors/alternatives`
        },
        {
          title: `${slug} hiring surge signals product expansion`,
          snippet: `${slug} posted 47 new engineering roles in Q1 2026, suggesting major product investment ahead.`,
          url: `https://linkedin.com/company/${slug}/jobs`
        }
      ],
      tool: 'search_engine',
      via: 'bd-mcp'
    };
  }

  const MCP_TIMEOUT_MS = 30000;
  const mcpUrl = new URL(`https://mcp.brightdata.com/mcp?token=${BD_API_KEY}`);
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  const client = new Client({ name: 'recon', version: '1.0.0' }, { capabilities: {} });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MCP timeout')), MCP_TIMEOUT_MS)
  );

  try {
    await Promise.race([client.connect(transport), timeout]);
    const result = await Promise.race([
      client.callTool({ name: 'search_engine', arguments: { query, num: 8 } }),
      timeout
    ]);
    const text = Array.isArray(result.content)
      ? result.content.map(c => c.text || '').join('\n')
      : String(result.content || '');
    return { query, raw: text, tool: 'search_engine', via: 'bd-mcp' };
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Scrape URL as clean markdown via BD MCP
 * @param {string} url - Target URL
 * @returns {Promise<Object>}
 */
export async function mcpScrape(url) {
  await sleep(2100);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    return {
      url,
      markdown: `# Company Page\n\nLeading enterprise software company serving 5,000+ customers globally.\n\n## Products\n- Core platform\n- Analytics suite\n- Integration hub\n\n## Recent news\n- Series D funding round completed\n- Expanded to European market`,
      tool: 'scrape_as_markdown',
      via: 'bd-mcp'
    };
  }

  const MCP_TIMEOUT_MS = 30000;
  const mcpUrl = new URL(`https://mcp.brightdata.com/mcp?token=${BD_API_KEY}`);
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  const client = new Client({ name: 'recon', version: '1.0.0' }, { capabilities: {} });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('MCP timeout')), MCP_TIMEOUT_MS)
  );

  try {
    await Promise.race([client.connect(transport), timeout]);
    const result = await Promise.race([
      client.callTool({ name: 'scrape_as_markdown', arguments: { url } }),
      timeout
    ]);
    const markdown = Array.isArray(result.content)
      ? result.content.map(c => c.text || '').join('\n')
      : String(result.content || '');
    return { url, markdown, tool: 'scrape_as_markdown', via: 'bd-mcp' };
  } finally {
    await client.close().catch(() => {});
  }
}
