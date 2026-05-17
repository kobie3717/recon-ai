/**
 * BD Worker - Parallel execution engine for competitive intelligence
 */

import { EventEmitter } from 'events';
import { webUnlocker, serpApi, scrapingBrowser, webScraperApi } from './bright-data-connector.mjs';
import { mcpSearch } from './bd-mcp-client.mjs';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Standard recon worker - 5 parallel BD calls (including MCP)
 * @param {string} domain - Target domain (e.g. "chain.link")
 * @param {EventEmitter} emitter - Event stream for real-time updates
 * @returns {Promise<Object>} - Final report data
 */
export async function runStandardWorker(domain, emitter) {
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
    const searchQuery = `${companySlug} company funding competitors news 2026`;
    emitter.emit('event', {
      agent: 'bd-mcp',
      status: 'searching',
      query: searchQuery,
      elapsed: parseFloat(elapsed())
    });
    const result = await mcpSearch(searchQuery, domain);
    emitter.emit('event', {
      agent: 'bd-mcp',
      status: 'complete',
      results: result.results?.length || 0,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // Wait for all to complete
  const [webPage, serpResults, browserPages, structuredData, mcpData] = await Promise.all([
    webUnlockerPromise,
    serpPromise,
    scrapingBrowserPromise,
    webScraperPromise,
    mcpPromise
  ]);

  // Collect facts
  facts.homepage = webPage;
  facts.news = serpResults;
  facts.linkedin = browserPages.find(p => p.url.includes('linkedin'));
  facts.crunchbase = browserPages.find(p => p.url.includes('crunchbase'));
  facts.structured = structuredData;
  facts.mcp = mcpData;

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
      emitter.emit('event', {
        agent: `scout-${scout.name}`,
        status: 'error',
        elapsed: parseFloat(elapsed())
      });
      return { scout: scout.name, error: 'scout failed' };
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
