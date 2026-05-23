/**
 * Bright Data MCP Client — calls BD hosted MCP server via StreamableHTTP
 * Tools used: search_engine (free tier), scrape_as_markdown (free tier)
 *
 * Main export: mcpFetch(domain, mode) — runs both tools in parallel with mode-aware queries
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
 * Build mode-specific search query
 * @param {string} domain - Target domain
 * @param {string} mode - Recon mode (redteam|seo|person|bundle|deep|standard)
 * @returns {string}
 */
function buildQuery(domain, mode) {
  const slug = domain.split('.')[0];
  switch(mode) {
    case 'redteam':
      return `${slug} security vulnerabilities CVE breach data leak 2024 2025`;
    case 'seo':
      return `${slug} site ranking keywords backlinks SEO competitors SERP`;
    case 'person':
      return `${domain} background career companies founded investors`;
    case 'bundle':
      return `${slug} company funding competitors news acquisitions 2025 2026`;
    case 'deep':
      return `${slug} company deep analysis technology stack funding team 2026`;
    default:
      return `${slug} company funding competitors news hiring 2026`;
  }
}

/**
 * Generate mode-aware mock data
 * @param {string} domain - Target domain
 * @param {string} mode - Recon mode
 * @returns {Object}
 */
function generateMock(domain, mode) {
  const slug = domain.split('.')[0];
  const query = buildQuery(domain, mode);

  let searchResults;
  let scrapedMarkdown;

  switch(mode) {
    case 'redteam':
      searchResults = [
        {
          title: `CVE-2024-8372: ${slug} authentication bypass vulnerability`,
          snippet: `Critical security flaw in ${slug} API authentication. CVSS score 9.1. Patch released March 2025.`,
          url: `https://nvd.nist.gov/vuln/detail/CVE-2024-8372`
        },
        {
          title: `${slug} data breach incident — 2024 security report`,
          snippet: `Unauthorized access to ${slug} customer database discovered in Q4 2024. 150K records potentially exposed.`,
          url: `https://securityaffairs.com/${slug}-breach-2024`
        },
        {
          title: `${slug} bug bounty program — HackerOne`,
          snippet: `Active bounty program. 47 vulnerabilities disclosed and patched since 2023. Average payout $2,400.`,
          url: `https://hackerone.com/${slug}`
        }
      ];
      scrapedMarkdown = `# ${slug.charAt(0).toUpperCase() + slug.slice(1)} Security Center\n\n## Vulnerability Disclosure\nWe take security seriously. Report issues to security@${domain}\n\n## Recent patches\n- CVE-2024-8372: Auth bypass (patched)\n- CVE-2024-7219: XSS in dashboard (patched)\n\n## Compliance\nSOC 2 Type II certified, GDPR compliant`;
      break;

    case 'seo':
      searchResults = [
        {
          title: `${slug} SEO analysis — Domain Authority 72`,
          snippet: `${slug}.com ranks for 14,200 organic keywords. Top positions: "enterprise software" (rank 4), "cloud platform" (rank 7).`,
          url: `https://ahrefs.com/site-explorer/${domain}`
        },
        {
          title: `${slug} backlink profile — 8,400+ referring domains`,
          snippet: `High-quality backlinks from TechCrunch, Forbes, Product Hunt. DR 71, organic traffic est. 420K/month.`,
          url: `https://moz.com/link-explorer/${domain}`
        },
        {
          title: `${slug} vs competitors SERP comparison 2026`,
          snippet: `${slug} gaining market share in enterprise SaaS keywords, outranking legacy competitors in 62% of target terms.`,
          url: `https://semrush.com/analytics/overview/${domain}`
        }
      ];
      scrapedMarkdown = `# ${slug.charAt(0).toUpperCase() + slug.slice(1)} — Enterprise Software Platform\n\n## Leading the industry\n5,000+ customers, 72 domain authority, 14K organic keywords\n\n## Products\n- Core Platform (ranks #3 for "enterprise workflow")\n- Analytics Suite (ranks #5 for "business intelligence")\n\n## Featured in\nTechCrunch, Forbes, Wall Street Journal`;
      break;

    case 'person':
      searchResults = [
        {
          title: `${domain} — LinkedIn Profile`,
          snippet: `Co-founder at Acme Inc, former VP Engineering at MegaCorp. Stanford CS '14. Angel investor in 12 startups.`,
          url: `https://linkedin.com/in/${slug}`
        },
        {
          title: `${slug} portfolio companies — Crunchbase`,
          snippet: `Active investments: DataCo ($5M Series A), CloudStart ($2M seed), AILabs ($8M Series B).`,
          url: `https://crunchbase.com/person/${slug}`
        },
        {
          title: `Interview: ${domain} on founding ${slug}Corp`,
          snippet: `"We saw a gap in enterprise tooling and built what we needed ourselves." Company now valued at $120M.`,
          url: `https://techcrunch.com/interview-${slug}`
        }
      ];
      scrapedMarkdown = `# ${domain}\n\n## Background\nEntrepreneur, investor, and software engineer\n\n## Career\n- 2022-present: Co-founder & CTO, ${slug}Corp\n- 2018-2022: VP Engineering, MegaCorp\n- 2014-2018: Senior Engineer, StartupXYZ\n\n## Investments\n12 early-stage companies, 3 exits\n\n## Education\nStanford University, BS Computer Science 2014`;
      break;

    case 'bundle':
      searchResults = [
        {
          title: `${slug} raises $45M Series C led by Sequoia`,
          snippet: `${slug} closed $45M Series C at $320M valuation. Funds will accelerate enterprise expansion and R&D.`,
          url: `https://techcrunch.com/${slug}-series-c-2026`
        },
        {
          title: `${slug} acquires CompetitorX for $18M`,
          snippet: `Strategic acquisition expands ${slug}'s market reach. CompetitorX brings 1,200 customers and integration tech.`,
          url: `https://techcrunch.com/${slug}-acquires-competitorx`
        },
        {
          title: `${slug} vs AlternativeCo — competitive analysis`,
          snippet: `${slug} leads in enterprise features, AlternativeCo stronger in SMB pricing. Market share: ${slug} 23%, AlternativeCo 19%.`,
          url: `https://g2.com/compare/${slug}-vs-alternativeco`
        }
      ];
      scrapedMarkdown = `# ${slug.charAt(0).toUpperCase() + slug.slice(1)} Company\n\n## Overview\nEnterprise SaaS platform serving 5,000+ customers globally\n\n## Recent news\n- Series C: $45M at $320M valuation (March 2026)\n- Acquisition of CompetitorX for $18M (Jan 2026)\n- Expanded to EMEA with London office (Nov 2025)\n\n## Competitors\nAlternativeCo, LegacySoft, NewStartup\n\n## Team size\n240 employees, hiring 50+ in 2026`;
      break;

    case 'deep':
      searchResults = [
        {
          title: `${slug} technology stack — BuiltWith analysis`,
          snippet: `${slug} runs on AWS, uses React + Node.js, PostgreSQL backend. Kubernetes orchestration, DataDog monitoring.`,
          url: `https://builtwith.com/${domain}`
        },
        {
          title: `Inside ${slug}: engineering culture and team structure`,
          snippet: `60-person engineering team split into 8 product squads. Bi-weekly sprints, ship-on-green CI/CD.`,
          url: `https://blog.${domain}/engineering-culture`
        },
        {
          title: `${slug} funding history and investor deck analysis`,
          snippet: `$78M total raised across Seed ($2M), A ($12M), B ($19M), C ($45M). Top investors: Sequoia, a16z, Index.`,
          url: `https://pitchbook.com/profiles/company/${slug}`
        }
      ];
      scrapedMarkdown = `# ${slug.charAt(0).toUpperCase() + slug.slice(1)} — Deep Company Profile\n\n## Technology\n- Stack: React, Node.js, PostgreSQL, Redis\n- Infrastructure: AWS (us-east-1, eu-west-1)\n- Architecture: Microservices on Kubernetes\n- Monitoring: DataDog, Sentry, PagerDuty\n\n## Team\n- Total: 240 employees\n- Engineering: 60 (8 product squads)\n- Sales: 45\n- Customer Success: 30\n\n## Funding\n- Total: $78M\n- Series C: $45M @ $320M valuation (2026)\n- Series B: $19M @ $95M valuation (2024)\n- Series A: $12M (2022)\n- Seed: $2M (2021)\n\n## Traction\n- Customers: 5,000+\n- ARR: $32M (2025)\n- Growth: 180% YoY`;
      break;

    default: // standard
      searchResults = [
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
      ];
      scrapedMarkdown = `# ${slug.charAt(0).toUpperCase() + slug.slice(1)} Company\n\nLeading enterprise software company serving 5,000+ customers globally.\n\n## Products\n- Core platform\n- Analytics suite\n- Integration hub\n\n## Recent news\n- Series D funding round completed\n- Expanded to European market\n- New executive hires announced`;
  }

  return {
    domain,
    mode,
    search: {
      query,
      raw: JSON.stringify(searchResults, null, 2),
      results: searchResults,
      tool: 'search_engine'
    },
    scraped: {
      url: `https://${domain}`,
      markdown: scrapedMarkdown,
      tool: 'scrape_as_markdown'
    },
    via: 'bd-mcp-mock'
  };
}

/**
 * Main export: Fetch domain intelligence using both BD MCP tools in parallel
 * @param {string} domain - Target domain
 * @param {string} mode - Recon mode (redteam|seo|person|bundle|deep|standard)
 * @returns {Promise<Object>}
 */
export async function mcpFetch(domain, mode = 'standard') {
  await sleep(300);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    return generateMock(domain, mode);
  }

  const MCP_TIMEOUT_MS = 30000;
  const mcpUrl = new URL(`https://mcp.brightdata.com/mcp?token=${BD_API_KEY}`);
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  const client = new Client({ name: 'recon', version: '1.0.0' }, { capabilities: {} });

  let timeoutHandle;
  const makeTimeout = () => new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('MCP timeout')), MCP_TIMEOUT_MS);
  });

  try {
    await Promise.race([client.connect(transport), makeTimeout()]);
    clearTimeout(timeoutHandle);

    const query = buildQuery(domain, mode);
    const homepageUrl = `https://${domain}`;

    // Run both tools in parallel
    const [searchResult, scrapeResult] = await Promise.race([
      Promise.all([
        client.callTool({ name: 'search_engine', arguments: { query, num: 8 } }),
        client.callTool({ name: 'scrape_as_markdown', arguments: { url: homepageUrl } })
      ]),
      makeTimeout()
    ]);
    clearTimeout(timeoutHandle);

    const searchText = Array.isArray(searchResult.content)
      ? searchResult.content.map(c => c.text || '').join('\n')
      : String(searchResult.content || '');

    const markdown = Array.isArray(scrapeResult.content)
      ? scrapeResult.content.map(c => c.text || '').join('\n')
      : String(scrapeResult.content || '');

    return {
      domain,
      mode,
      search: {
        query,
        raw: searchText,
        tool: 'search_engine'
      },
      scraped: {
        url: homepageUrl,
        markdown,
        tool: 'scrape_as_markdown'
      },
      via: 'bd-mcp'
    };
  } finally {
    clearTimeout(timeoutHandle);
    await client.close().catch(() => {});
  }
}

/**
 * Legacy export: Search via BD MCP search_engine tool
 * @param {string} query - Search query
 * @param {string} domain - Target domain (for mock mode)
 * @returns {Promise<Object>}
 */
export async function mcpSearch(query, domain) {
  const result = await mcpFetch(domain || 'example.com', 'standard');
  return result.search;
}

/**
 * Legacy export: Scrape URL as clean markdown via BD MCP
 * @param {string} url - Target URL
 * @returns {Promise<Object>}
 */
export async function mcpScrape(url) {
  const domain = new URL(url).hostname;
  const result = await mcpFetch(domain, 'standard');
  return result.scraped;
}

/**
 * New exports for MCP showcase mode
 */

/**
 * Run search_engine tool
 * @param {string} query - Search query
 * @returns {Promise<Object>}
 */
export async function mcpSearchEngine(query) {
  await sleep(200);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock: return realistic search results
    await sleep(800);
    return {
      query,
      results: [
        { title: `${query} - Overview`, snippet: 'Comprehensive analysis and insights...', url: 'https://example.com/1' },
        { title: `Latest news about ${query}`, snippet: 'Recent developments and announcements...', url: 'https://example.com/2' },
        { title: `${query} funding and growth`, snippet: 'Investment rounds and expansion details...', url: 'https://example.com/3' },
        { title: `${query} competitors analysis`, snippet: 'Market positioning and competitive landscape...', url: 'https://example.com/4' },
        { title: `${query} technology stack`, snippet: 'Technical infrastructure and engineering...', url: 'https://example.com/5' }
      ],
      tool: 'search_engine',
      via: 'mock'
    };
  }

  const MCP_TIMEOUT_MS = 30000;
  const mcpUrl = new URL(`https://mcp.brightdata.com/mcp?token=${BD_API_KEY}`);
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  const client = new Client({ name: 'recon-mcp', version: '1.0.0' }, { capabilities: {} });

  let timeoutHandle;
  const makeTimeout = () => new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('MCP timeout')), MCP_TIMEOUT_MS);
  });

  try {
    await Promise.race([client.connect(transport), makeTimeout()]);
    clearTimeout(timeoutHandle);

    const result = await Promise.race([
      client.callTool({ name: 'search_engine', arguments: { query, num: 8 } }),
      makeTimeout()
    ]);
    clearTimeout(timeoutHandle);

    const text = Array.isArray(result.content)
      ? result.content.map(c => c.text || '').join('\n')
      : String(result.content || '');

    // Parse results from text response
    let results = [];
    try {
      const parsed = JSON.parse(text);
      results = Array.isArray(parsed) ? parsed : parsed.results || [];
    } catch {
      results = [{ title: 'Search Results', snippet: text.substring(0, 200), url: '#' }];
    }

    return { query, results, tool: 'search_engine', via: 'bd-mcp' };
  } finally {
    clearTimeout(timeoutHandle);
    await client.close().catch(() => {});
  }
}

/**
 * Run scrape_as_markdown tool
 * @param {string} url - Target URL
 * @returns {Promise<Object>}
 */
export async function mcpScrapeMarkdown(url) {
  await sleep(200);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock: return realistic markdown
    await sleep(1400);
    const domain = url.replace(/^https?:\/\//, '').split('/')[0];
    const slug = domain.split('.')[0];
    const companyName = slug.charAt(0).toUpperCase() + slug.slice(1);
    return {
      url,
      markdown: `# ${companyName}\n\n## Enterprise Software Platform\n\nLeading provider of enterprise solutions serving 5,000+ customers globally.\n\n### Products\n- Core Platform\n- Analytics Suite\n- Integration Hub\n\n### Recent News\n- Series D funding announced\n- European expansion\n- New product launches\n\n### About Us\nFounded in 2018, ${companyName} has grown to 850+ employees and raised $425M from top-tier VCs including Sequoia Capital and Andreessen Horowitz.`,
      chars: 450,
      tool: 'scrape_as_markdown',
      via: 'mock'
    };
  }

  const MCP_TIMEOUT_MS = 30000;
  const mcpUrl = new URL(`https://mcp.brightdata.com/mcp?token=${BD_API_KEY}`);
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  const client = new Client({ name: 'recon-mcp', version: '1.0.0' }, { capabilities: {} });

  let timeoutHandle;
  const makeTimeout = () => new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('MCP timeout')), MCP_TIMEOUT_MS);
  });

  try {
    await Promise.race([client.connect(transport), makeTimeout()]);
    clearTimeout(timeoutHandle);

    const result = await Promise.race([
      client.callTool({ name: 'scrape_as_markdown', arguments: { url } }),
      makeTimeout()
    ]);
    clearTimeout(timeoutHandle);

    const markdown = Array.isArray(result.content)
      ? result.content.map(c => c.text || '').join('\n')
      : String(result.content || '');

    return {
      url,
      markdown,
      chars: markdown.length,
      tool: 'scrape_as_markdown',
      via: 'bd-mcp'
    };
  } finally {
    clearTimeout(timeoutHandle);
    await client.close().catch(() => {});
  }
}

/**
 * Run web_unlocker tool (if available)
 * @param {string} url - Target URL
 * @returns {Promise<Object>}
 */
export async function mcpWebUnlocker(url) {
  await sleep(200);

  if (!BD_API_KEY || BD_API_KEY === 'STUB') {
    // Mock: return realistic unlocked content
    await sleep(900);
    const domain = url.replace(/^https?:\/\//, '').split('/')[0];
    const slug = domain.split('.')[0];
    const companyName = slug.charAt(0).toUpperCase() + slug.slice(1);
    return {
      url,
      content: `About ${companyName}\n\nMission: Transforming enterprise workflows through innovative technology.\n\nTeam: 850+ employees across San Francisco, London, and Berlin.\n\nCustomers: Trusted by 5,000+ companies including Fortune 500 leaders.\n\nFunding: $425M raised from Sequoia Capital, Andreessen Horowitz, and Accel Partners.\n\nCulture: Fast-paced, innovative, and customer-focused.`,
      chars: 380,
      tool: 'web_unlocker',
      via: 'mock'
    };
  }

  const MCP_TIMEOUT_MS = 30000;
  const mcpUrl = new URL(`https://mcp.brightdata.com/mcp?token=${BD_API_KEY}`);
  const transport = new StreamableHTTPClientTransport(mcpUrl);
  const client = new Client({ name: 'recon-mcp', version: '1.0.0' }, { capabilities: {} });

  let timeoutHandle;
  const makeTimeout = () => new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('MCP timeout')), MCP_TIMEOUT_MS);
  });

  try {
    await Promise.race([client.connect(transport), makeTimeout()]);
    clearTimeout(timeoutHandle);

    const result = await Promise.race([
      client.callTool({ name: 'web_unlocker', arguments: { url } }),
      makeTimeout()
    ]);
    clearTimeout(timeoutHandle);

    const content = Array.isArray(result.content)
      ? result.content.map(c => c.text || '').join('\n')
      : String(result.content || '');

    return {
      url,
      content,
      chars: content.length,
      tool: 'web_unlocker',
      via: 'bd-mcp'
    };
  } finally {
    clearTimeout(timeoutHandle);
    await client.close().catch(() => {});
  }
}

/**
 * Comprehensive MCP showcase - runs all 4 tools in parallel
 * @param {string} domain - Target domain
 * @returns {Promise<Object>}
 */
export async function mcpComprehensive(domain) {
  const startTime = Date.now();

  const [search1, search2, homepage, about] = await Promise.all([
    mcpSearchEngine(`${domain} company overview funding news 2026`),
    mcpSearchEngine(`${domain} competitors market position`),
    mcpScrapeMarkdown(`https://${domain}`),
    mcpWebUnlocker(`https://${domain}/about`)
  ]);

  const elapsed = (Date.now() - startTime) / 1000;

  return {
    domain,
    search1,
    search2,
    homepage,
    about,
    toolsUsed: 4,
    elapsed
  };
}
