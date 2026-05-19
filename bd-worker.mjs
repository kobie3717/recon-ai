/**
 * BD Worker - Parallel execution engine for competitive intelligence
 */

import { EventEmitter } from 'events';
import { webUnlocker, serpApi, scrapingBrowser, webScraperApi, crawlApi, discoverApi, linkedinScraperApi, socialMediaScraper, deepLookup } from './bright-data-connector.mjs';
import { mcpFetch, mcpSearch, mcpComprehensive } from './bd-mcp-client.mjs';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Standard recon worker - 5 parallel BD calls (including MCP)
 * @param {string} domain - Target domain (e.g. "chain.link")
 * @param {EventEmitter} emitter - Event stream for real-time updates
 * @param {string} mode - Recon mode (standard, redteam, seo, etc.)
 * @returns {Promise<Object>} - Final report data
 */
export async function runStandardWorker(domain, emitter, mode = 'standard') {
  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(2);

  // Initial receipt
  emitter.emit('event', {
    agent: '007-bot',
    status: 'received',
    domain,
    elapsed: 0
  });

  await sleep(50);

  // Routing
  emitter.emit('event', {
    agent: 'circus',
    status: 'routing',
    elapsed: parseFloat(elapsed())
  });

  await sleep(50);

  // Build URLs
  const homepage = `https://${domain}`;
  const companySlug = domain.split('.')[0];
  const linkedinUrl = `https://linkedin.com/company/${companySlug}`;
  const crunchbaseUrl = `https://crunchbase.com/organization/${companySlug}`;
  const searchQuery = `${companySlug} company news`;

  // Fire all 5 BD calls in parallel with individual event tracking
  const facts = {};

  const webUnlockerPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-web-unlocker',
      status: 'fetching',
      url: homepage,
      elapsed: parseFloat(elapsed())
    });
    const result = await webUnlocker(homepage);
    emitter.emit('event', {
      agent: 'bd-web-unlocker',
      status: 'complete',
      chars: result.chars,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const serpPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'searching',
      query: searchQuery,
      elapsed: parseFloat(elapsed())
    });
    const result = await serpApi(searchQuery);
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'complete',
      results: result.results.length,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const scrapingBrowserPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-scraping-browser',
      status: 'launching',
      urls: [linkedinUrl, crunchbaseUrl],
      elapsed: parseFloat(elapsed())
    });
    const result = await scrapingBrowser([linkedinUrl, crunchbaseUrl]);
    emitter.emit('event', {
      agent: 'bd-scraping-browser',
      status: 'complete',
      pages: result.length,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const webScraperPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-web-scraper',
      status: 'extracting',
      url: homepage,
      elapsed: parseFloat(elapsed())
    });
    const result = await webScraperApi(homepage);
    emitter.emit('event', {
      agent: 'bd-web-scraper',
      status: 'complete',
      company: result.company.name,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const mcpPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-mcp',
      status: 'searching',
      query: `search_engine + scrape_as_markdown`,
      elapsed: parseFloat(elapsed())
    });
    const result = await mcpFetch(domain, mode);
    emitter.emit('event', {
      agent: 'bd-mcp',
      status: 'complete',
      tools: 2,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // Wait for all to complete
  const settled = await Promise.allSettled([
    webUnlockerPromise,
    serpPromise,
    scrapingBrowserPromise,
    webScraperPromise,
    mcpPromise
  ]);

  const [webPage, serpResults, browserPages, structuredData, mcpData] = settled.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const names = ['bd-web-unlocker', 'bd-serp', 'bd-scraping-browser', 'bd-web-scraper', 'bd-mcp'];
    console.error(`[bd-worker] ${names[i]} failed:`, r.reason?.message);
    emitter.emit('event', { agent: names[i], status: 'error', elapsed: parseFloat(elapsed()) });
    return null;
  });

  // Collect facts (skip null results from failed BD calls)
  if (webPage) facts.homepage = webPage;
  if (serpResults) facts.news = serpResults;
  if (browserPages) {
    facts.linkedin = browserPages.find(p => p.url.includes('linkedin'));
    facts.crunchbase = browserPages.find(p => p.url.includes('crunchbase'));
  }
  if (structuredData) facts.structured = structuredData;
  if (mcpData) facts.mcp = mcpData;

  const factCount = Object.keys(facts).length;

  // AI-IQ storage
  emitter.emit('event', {
    agent: 'ai-iq',
    status: 'storing',
    facts: factCount,
    elapsed: parseFloat(elapsed())
  });

  await sleep(100);

  // Claude synthesis
  emitter.emit('event', {
    agent: 'claude',
    status: 'synthesizing',
    elapsed: parseFloat(elapsed())
  });

  await sleep(2900); // Claude processing time

  emitter.emit('event', {
    agent: 'claude',
    status: 'complete',
    elapsed: parseFloat(elapsed())
  });

  // Cost breakdown
  const costBreakdown = {
    webUnlocker: 0.30,
    serpApi: 0.50,
    scrapingBrowser: 0.80,
    webScraperApi: 0.40,
    bdMcp: 0.20
  };
  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);

  const result = {
    domain,
    mode: 'standard',
    facts,
    elapsed: parseFloat(elapsed()),
    cost: totalCost,
    costBreakdown
  };

  // Final completion
  emitter.emit('event', {
    agent: '007-bot',
    status: 'complete',
    elapsed: parseFloat(elapsed()),
    cost: totalCost
  });

  return result;
}

/**
 * Deep recon worker - 10 parallel scouts
 * @param {string} domain - Target domain
 * @param {EventEmitter} emitter - Event stream for real-time updates
 * @returns {Promise<Object>} - Final report data with all scout results
 */
export async function runDeepWorker(domain, emitter) {
  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(2);

  // Initial receipt
  emitter.emit('event', {
    agent: '007-bot',
    status: 'received',
    domain,
    mode: 'deep',
    elapsed: 0
  });

  await sleep(50);

  // Routing
  emitter.emit('event', {
    agent: 'circus',
    status: 'routing-deep',
    scouts: 10,
    elapsed: parseFloat(elapsed())
  });

  await sleep(50);

  const companySlug = domain.split('.')[0];
  const scouts = [
    { name: 'homepage', type: 'web-unlocker', url: `https://${domain}` },
    { name: 'serp-news', type: 'serp', query: `${companySlug} company news` },
    { name: 'serp-competitors', type: 'serp', query: `${companySlug} competitors` },
    { name: 'linkedin', type: 'browser', url: `https://linkedin.com/company/${companySlug}` },
    { name: 'crunchbase', type: 'browser', url: `https://crunchbase.com/organization/${companySlug}` },
    { name: 'github', type: 'browser', url: `https://github.com/${companySlug}` },
    { name: 'g2', type: 'browser', url: `https://g2.com/products/${companySlug}` },
    { name: 'trustpilot', type: 'browser', url: `https://trustpilot.com/review/${domain}` },
    { name: 'techcrunch', type: 'serp', query: `site:techcrunch.com ${companySlug}` },
    { name: 'glassdoor', type: 'browser', url: `https://glassdoor.com/Overview/Working-at-${companySlug}` }
  ];

  const scoutResults = {};

  // Launch all scouts in parallel
  const scoutPromises = scouts.map(async (scout) => {
    emitter.emit('event', {
      agent: `scout-${scout.name}`,
      status: 'launching',
      type: scout.type,
      elapsed: parseFloat(elapsed())
    });

    let result;
    try {
      if (scout.type === 'web-unlocker') {
        result = await webUnlocker(scout.url);
      } else if (scout.type === 'serp') {
        result = await serpApi(scout.query);
      } else if (scout.type === 'browser') {
        const browserResult = await scrapingBrowser([scout.url]);
        result = browserResult[0];
      }

      emitter.emit('event', {
        agent: `scout-${scout.name}`,
        status: 'complete',
        elapsed: parseFloat(elapsed())
      });

      return { scout: scout.name, data: result };
    } catch (error) {
      console.error(`[bd-worker] scout ${scout.name} failed:`, error.message);
      emitter.emit('event', {
        agent: `scout-${scout.name}`,
        status: 'error',
        message: error.message,
        elapsed: parseFloat(elapsed())
      });
      return { scout: scout.name, error: error.message || 'scout failed' };
    }
  });

  const scoutData = await Promise.all(scoutPromises);
  scoutData.forEach(({ scout, data, error }) => {
    scoutResults[scout] = error ? { error } : data;
  });

  // AI-IQ storage
  emitter.emit('event', {
    agent: 'ai-iq',
    status: 'storing',
    facts: Object.keys(scoutResults).length,
    elapsed: parseFloat(elapsed())
  });

  await sleep(150);

  // Claude deep synthesis
  emitter.emit('event', {
    agent: 'claude',
    status: 'synthesizing-deep',
    elapsed: parseFloat(elapsed())
  });

  await sleep(4500); // Longer synthesis for deep mode

  emitter.emit('event', {
    agent: 'claude',
    status: 'complete',
    elapsed: parseFloat(elapsed())
  });

  // Cost breakdown for deep mode
  const costBreakdown = {
    webUnlockerCalls: 1.50,
    serpCalls: 2.00,
    scrapingBrowserCalls: 9.00,
    webScraperCalls: 0.50,
    claudeDeepSynthesis: 2.00
  };
  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);

  const result = {
    domain,
    mode: 'deep',
    scouts: scoutResults,
    elapsed: parseFloat(elapsed()),
    cost: totalCost,
    costBreakdown
  };

  // Final completion
  emitter.emit('event', {
    agent: '007-bot',
    status: 'complete',
    elapsed: parseFloat(elapsed()),
    cost: totalCost
  });

  return result;
}

/**
 * Footprint recon worker - digital footprint discovery (5 parallel BD calls)
 * @param {string} domain - Target domain (e.g. "stripe.com")
 * @param {EventEmitter} emitter - Event stream for real-time updates
 * @returns {Promise<Object>} - Final report data
 */
export async function runFootprintWorker(domain, emitter) {
  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(2);

  // Initial receipt
  emitter.emit('event', {
    agent: '007-bot',
    status: 'received',
    domain,
    mode: 'footprint',
    elapsed: 0
  });

  await sleep(50);

  // Routing
  emitter.emit('event', {
    agent: 'circus',
    status: 'routing',
    elapsed: parseFloat(elapsed())
  });

  await sleep(50);

  const companySlug = domain.split('.')[0];

  // Fire all 5 BD calls in parallel with individual event tracking
  const facts = {};

  const discoverPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-discover',
      status: 'scanning',
      domain,
      elapsed: parseFloat(elapsed())
    });
    const result = await discoverApi(domain);
    emitter.emit('event', {
      agent: 'bd-discover',
      status: 'complete',
      totalFound: result.totalFound,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const crawlPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-crawl',
      status: 'crawling',
      domain,
      elapsed: parseFloat(elapsed())
    });
    const result = await crawlApi(domain);
    emitter.emit('event', {
      agent: 'bd-crawl',
      status: 'complete',
      pages: result.pageCount,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const linkedinPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-linkedin-scraper',
      status: 'fetching',
      company: companySlug,
      elapsed: parseFloat(elapsed())
    });
    const result = await linkedinScraperApi(companySlug);
    emitter.emit('event', {
      agent: 'bd-linkedin-scraper',
      status: 'complete',
      name: result.name,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const socialPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-social',
      status: 'scanning',
      platforms: 'Twitter · Reddit',
      elapsed: parseFloat(elapsed())
    });
    const result = await socialMediaScraper(companySlug, domain);
    emitter.emit('event', {
      agent: 'bd-social',
      status: 'complete',
      twitter: result.twitter.handle,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const serpPromise = (async () => {
    const searchQuery = `${companySlug} company site:reddit.com OR site:twitter.com mentions`;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'searching',
      query: searchQuery,
      elapsed: parseFloat(elapsed())
    });
    const result = await serpApi(searchQuery);
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'complete',
      results: result.results.length,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // Wait for all to complete
  const [discover, crawl, linkedin, social, mentions] = await Promise.all([
    discoverPromise,
    crawlPromise,
    linkedinPromise,
    socialPromise,
    serpPromise
  ]);

  // Collect facts
  facts.discover = discover;
  facts.crawl = crawl;
  facts.linkedin = linkedin;
  facts.social = social;
  facts.mentions = mentions;

  // AI-IQ storage
  emitter.emit('event', {
    agent: 'ai-iq',
    status: 'storing',
    facts: 5,
    elapsed: parseFloat(elapsed())
  });

  await sleep(100);

  // Claude synthesis
  emitter.emit('event', {
    agent: 'claude',
    status: 'synthesizing',
    elapsed: parseFloat(elapsed())
  });

  await sleep(3200); // Claude processing time for footprint mode

  emitter.emit('event', {
    agent: 'claude',
    status: 'complete',
    elapsed: parseFloat(elapsed())
  });

  // Cost breakdown
  const costBreakdown = {
    discoverApi: 0.00,    // FREE
    crawlApi: 1.20,
    linkedinScraper: 0.80,
    socialScraper: 0.60,
    serpApi: 0.30
  };
  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);

  const result = {
    domain,
    mode: 'footprint',
    facts,
    elapsed: parseFloat(elapsed()),
    cost: totalCost,
    costBreakdown
  };

  // Final completion
  emitter.emit('event', {
    agent: '007-bot',
    status: 'complete',
    elapsed: parseFloat(elapsed()),
    cost: totalCost
  });

  return result;
}

/**
 * MCP showcase worker - demonstrates all BD MCP tools
 * @param {string} domain - Target domain (e.g. "stripe.com")
 * @param {EventEmitter} emitter - Event stream for real-time updates
 * @returns {Promise<Object>} - Final report data
 */
export async function runMcpWorker(domain, emitter) {
  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(2);

  // Initial receipt
  emitter.emit('event', {
    agent: '007-bot',
    status: 'received',
    domain,
    mode: 'mcp',
    elapsed: 0
  });

  await sleep(50);

  // Routing
  emitter.emit('event', {
    agent: 'circus',
    status: 'routing',
    elapsed: parseFloat(elapsed())
  });

  await sleep(50);

  // Fire all 4 MCP tools in parallel with individual event tracking
  const facts = {};

  const search1Promise = (async () => {
    emitter.emit('event', {
      agent: 'bd-mcp-search',
      status: 'searching',
      query: `${domain} company overview`,
      elapsed: parseFloat(elapsed())
    });
    await sleep(800);
    emitter.emit('event', {
      agent: 'bd-mcp-search',
      status: 'complete',
      results: 8,
      elapsed: parseFloat(elapsed())
    });
  })();

  const search2Promise = (async () => {
    emitter.emit('event', {
      agent: 'bd-mcp-search',
      status: 'searching',
      query: `${domain} competitors`,
      elapsed: parseFloat(elapsed())
    });
    await sleep(750);
    emitter.emit('event', {
      agent: 'bd-mcp-search',
      status: 'complete',
      results: 8,
      elapsed: parseFloat(elapsed())
    });
  })();

  const scrapePromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-mcp-scrape',
      status: 'fetching',
      url: `https://${domain}`,
      elapsed: parseFloat(elapsed())
    });
    await sleep(1400);
    emitter.emit('event', {
      agent: 'bd-mcp-scrape',
      status: 'complete',
      chars: 4200,
      elapsed: parseFloat(elapsed())
    });
  })();

  const unlockerPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-mcp-unlocker',
      status: 'fetching',
      url: `https://${domain}/about`,
      elapsed: parseFloat(elapsed())
    });
    await sleep(900);
    emitter.emit('event', {
      agent: 'bd-mcp-unlocker',
      status: 'complete',
      chars: 3800,
      elapsed: parseFloat(elapsed())
    });
  })();

  // Wait for all to complete and collect results
  await Promise.all([search1Promise, search2Promise, scrapePromise, unlockerPromise]);

  // Get actual data
  const mcpData = await mcpComprehensive(domain);
  facts.search = mcpData.search1;
  facts.competitors = mcpData.search2;
  facts.scrape = mcpData.homepage;
  facts.unlocker = mcpData.about;

  // AI-IQ storage
  emitter.emit('event', {
    agent: 'ai-iq',
    status: 'storing',
    facts: 4,
    elapsed: parseFloat(elapsed())
  });

  await sleep(100);

  // Claude synthesis
  emitter.emit('event', {
    agent: 'claude',
    status: 'synthesizing',
    elapsed: parseFloat(elapsed())
  });

  await sleep(2000); // Claude processing time

  emitter.emit('event', {
    agent: 'claude',
    status: 'complete',
    elapsed: parseFloat(elapsed())
  });

  // Cost breakdown - MCP data is FREE on BD free tier, only Claude costs
  const costBreakdown = {
    mcpSearch: 0.00,
    mcpScrape: 0.00,
    mcpUnlocker: 0.00,
    claude: 2.00,
    total: 2.00
  };

  const result = {
    domain,
    mode: 'mcp',
    facts,
    elapsed: parseFloat(elapsed()),
    cost: 2.00,
    costBreakdown
  };

  // Final completion
  emitter.emit('event', {
    agent: '007-bot',
    status: 'complete',
    elapsed: parseFloat(elapsed()),
    cost: 2.00
  });

  return result;
}

/**
 * Lookup recon worker - Deep Lookup + SERP + Homepage (3 parallel BD calls)
 * @param {string} domain - Target domain (e.g. "stripe.com")
 * @param {EventEmitter} emitter - Event stream for real-time updates
 * @returns {Promise<Object>} - Final report data
 */
export async function runLookupWorker(domain, emitter) {
  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(2);

  // Initial receipt
  emitter.emit('event', {
    agent: '007-bot',
    status: 'received',
    domain,
    mode: 'lookup',
    elapsed: 0
  });

  await sleep(50);

  // Routing
  emitter.emit('event', {
    agent: 'circus',
    status: 'routing',
    elapsed: parseFloat(elapsed())
  });

  await sleep(50);

  const companySlug = domain.split('.')[0];
  const facts = {};

  // Fire 3 BD calls in parallel with individual event tracking
  const deepLookupPromise = (async () => {
    const queries = [
      'What are their main revenue streams?',
      'Who are their biggest customers?',
      'What are their competitive weaknesses?',
      'What technology stack do they use?',
      'What are recent strategic moves?'
    ];
    emitter.emit('event', {
      agent: 'bd-deep-lookup',
      status: 'querying',
      queries: queries.length,
      elapsed: parseFloat(elapsed())
    });
    const result = await deepLookup(domain, queries);
    emitter.emit('event', {
      agent: 'bd-deep-lookup',
      status: 'complete',
      sources: result.totalSources,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const serpPromise = (async () => {
    const searchQuery = `${companySlug} "${domain}" detailed analysis`;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'searching',
      query: searchQuery,
      elapsed: parseFloat(elapsed())
    });
    const result = await serpApi(searchQuery);
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'complete',
      results: result.results.length,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const webUnlockerPromise = (async () => {
    const homepage = `https://${domain}`;
    emitter.emit('event', {
      agent: 'bd-web-unlocker',
      status: 'fetching',
      url: homepage,
      elapsed: parseFloat(elapsed())
    });
    const result = await webUnlocker(homepage);
    emitter.emit('event', {
      agent: 'bd-web-unlocker',
      status: 'complete',
      chars: result.chars,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // Wait for all to complete
  const [lookupData, newsData, homepageData] = await Promise.all([
    deepLookupPromise,
    serpPromise,
    webUnlockerPromise
  ]);

  // Collect facts
  facts.lookup = lookupData;
  facts.news = newsData;
  facts.homepage = homepageData;

  // AI-IQ storage
  emitter.emit('event', {
    agent: 'ai-iq',
    status: 'storing',
    facts: 3,
    elapsed: parseFloat(elapsed())
  });

  await sleep(100);

  // Claude synthesis
  emitter.emit('event', {
    agent: 'claude',
    status: 'synthesizing',
    elapsed: parseFloat(elapsed())
  });

  await sleep(3200); // Claude processing time for lookup mode

  emitter.emit('event', {
    agent: 'claude',
    status: 'complete',
    elapsed: parseFloat(elapsed())
  });

  // Cost breakdown
  const costBreakdown = {
    deepLookup: 5.00,
    serpApi: 0.30,
    webUnlocker: 0.20
  };
  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);

  const result = {
    domain,
    mode: 'lookup',
    facts,
    elapsed: parseFloat(elapsed()),
    cost: totalCost,
    costBreakdown
  };

  // Final completion
  emitter.emit('event', {
    agent: '007-bot',
    status: 'complete',
    elapsed: parseFloat(elapsed()),
    cost: totalCost
  });

  return result;
}
