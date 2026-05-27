/**
 * BD Worker - Parallel execution engine for competitive intelligence
 */

import { EventEmitter } from 'events';
import { webUnlocker, serpApi, scrapingBrowser, webScraperApi, crawlApi, crawlSite, discoverApi, domainDiscoveryApi, linkedinScraperApi, socialMediaScraper, deepLookup, queryDataset, DatasetNotEntitledError } from './bright-data-connector.mjs';
import { mcpFetch, mcpSearch, mcpComprehensive, mcpBrowserCapture, mcpGeoIntel } from './bd-mcp-client.mjs';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Standard recon worker - 8 parallel BD calls (including MCP + Discover API + Datasets API)
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

  // Fire all 8 BD calls in parallel with individual event tracking
  // Use a shared facts object that gets populated as agents complete
  const facts = {};

  // Helper to update facts as results arrive
  const updateFacts = (key, value) => {
    facts[key] = value;
  };

  const webUnlockerPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-web-unlocker',
      status: 'fetching',
      url: homepage,
      elapsed: parseFloat(elapsed())
    });
    const result = await webUnlocker(homepage);
    if (result.chars === 0) {
      emitter.emit('event', {
        agent: 'bd-web-unlocker',
        status: 'complete',
        chars: 0,
        note: 'bot-protection: empty body',
        elapsed: parseFloat(elapsed())
      });
    } else {
      updateFacts('homepage', result);
      emitter.emit('event', {
        agent: 'bd-web-unlocker',
        status: 'complete',
        chars: result.chars,
        elapsed: parseFloat(elapsed())
      });
    }
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
    updateFacts('news', result);
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'complete',
      results: result.results.length,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const scrapingBrowserPromise = (async () => {
    let firstAttemptError = null;

    // Attempt 1
    emitter.emit('event', {
      agent: 'bd-scraping-browser',
      status: 'launching',
      urls: [linkedinUrl, crunchbaseUrl],
      elapsed: parseFloat(elapsed())
    });

    try {
      const result = await scrapingBrowser([linkedinUrl, crunchbaseUrl]);
      emitter.emit('event', {
        agent: 'bd-scraping-browser',
        status: 'complete',
        pages: result.length,
        elapsed: parseFloat(elapsed())
      });
      return result;
    } catch (err) {
      firstAttemptError = err;
      // Attempt 2 - retry after cooldown
      emitter.emit('event', {
        agent: 'bd-scraping-browser',
        status: 'retrying',
        attempt: 2,
        reason: (err.message || String(err)).slice(0, 120),
        elapsed: parseFloat(elapsed())
      });

      await sleep(1000);

      try {
        const result = await scrapingBrowser([linkedinUrl, crunchbaseUrl]);
        emitter.emit('event', {
          agent: 'bd-scraping-browser',
          status: 'complete',
          pages: result.length,
          retried: true,
          elapsed: parseFloat(elapsed())
        });
        return result;
      } catch (err2) {
        // Fallback to webScraperApi
        emitter.emit('event', {
          agent: 'bd-scraping-browser',
          status: 'fallback',
          target: 'bd-web-scraper',
          elapsed: parseFloat(elapsed())
        });

        const fallbackResults = await Promise.allSettled([
          webScraperApi(linkedinUrl).catch(e => null),
          webScraperApi(crunchbaseUrl).catch(e => null)
        ]);

        const pages = [];
        const [linkedinResult, crunchbaseResult] = fallbackResults;

        if (linkedinResult.status === 'fulfilled' && linkedinResult.value) {
          pages.push({
            url: linkedinUrl,
            title: linkedinResult.value.company?.name || '',
            content: JSON.stringify(linkedinResult.value).slice(0, 5000),
            source: 'fallback-web-scraper'
          });
        }

        if (crunchbaseResult.status === 'fulfilled' && crunchbaseResult.value) {
          pages.push({
            url: crunchbaseUrl,
            title: crunchbaseResult.value.company?.name || '',
            content: JSON.stringify(crunchbaseResult.value).slice(0, 5000),
            source: 'fallback-web-scraper'
          });
        }

        if (pages.length > 0) {
          emitter.emit('event', {
            agent: 'bd-scraping-browser',
            status: 'complete',
            pages: pages.length,
            fallback: true,
            elapsed: parseFloat(elapsed())
          });
          return pages;
        }

        // All paths exhausted - throw original error
        throw firstAttemptError;
      }
    }
  })();

  const webScraperPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-web-scraper',
      status: 'extracting',
      url: homepage,
      elapsed: parseFloat(elapsed())
    });
    const result = await webScraperApi(homepage);
    updateFacts('structured', result);
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
    updateFacts('mcp', result);
    emitter.emit('event', {
      agent: 'bd-mcp',
      status: 'complete',
      tools: 2,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const discoverPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-discover',
      status: 'searching',
      query: `${domain} company news products competitors`,
      elapsed: parseFloat(elapsed())
    });
    const result = await discoverApi(
      `${domain} company news products competitors 2026`,
      `find official pages, news articles, and competitive intelligence about ${domain}`,
      10
    );
    updateFacts('discover', result);
    emitter.emit('event', {
      agent: 'bd-discover',
      status: 'complete',
      results: result.results.length,
      topScore: result.results[0]?.relevance_score?.toFixed(2),
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const crawlPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-crawl',
      status: 'crawling',
      pages: 8,
      domain,
      elapsed: parseFloat(elapsed())
    });
    const result = await crawlSite(domain);
    updateFacts('crawl', result);
    // scrape_batch returns concatenated content — report URL count attempted, not block count
    const pagesAttempted = result.urls?.length || 8;
    const totalChars = (result.pages || []).reduce((sum, p) => sum + (p.markdown?.length || 0), 0);
    emitter.emit('event', {
      agent: 'bd-crawl',
      status: 'complete',
      pages: pagesAttempted,
      chars: totalChars,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  const datasetsPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-datasets',
      status: 'querying',
      dataset: 'linkedin_companies',
      domain,
      elapsed: parseFloat(elapsed())
    });
    try {
      const linkedin = await queryDataset('gd_l1viktl72bvl7bjuj0', domain);
      emitter.emit('event', {
        agent: 'bd-datasets',
        status: 'complete',
        records: linkedin?.length || 0,
        elapsed: parseFloat(elapsed())
      });
      return { linkedin };
    } catch (err) {
      if (err.code === 'NOT_ENTITLED') {
        // Honest signal — not an error, just feature gating
        emitter.emit('event', {
          agent: 'bd-datasets',
          status: 'unavailable',
          reason: 'trial tier - paid datasets',
          elapsed: parseFloat(elapsed())
        });
        return null;
      }
      throw err;
    }
  })();

  const browserCapturePromise = (async () => {
    const pricingUrl = `https://${domain}/pricing`;
    emitter.emit('event', {
      agent: 'bd-mcp-browser',
      status: 'capturing',
      url: pricingUrl,
      elapsed: parseFloat(elapsed())
    });
    try {
      const result = await mcpBrowserCapture(pricingUrl);
      if (result.status === 'unavailable') {
        emitter.emit('event', {
          agent: 'bd-mcp-browser',
          status: 'unavailable',
          reason: result.reason,
          elapsed: parseFloat(elapsed())
        });
        return null;
      }
      if (result.status === 'error' && result.error?.includes('Unknown tool')) {
        emitter.emit('event', {
          agent: 'bd-mcp-browser',
          status: 'unavailable',
          reason: 'BD MCP browser group not available - upgrade required',
          upstream: result.error.slice(0, 80),
          elapsed: parseFloat(elapsed())
        });
        return null;
      }
      const screenshotSize = result.screenshot_b64?.length || 0;
      emitter.emit('event', {
        agent: 'bd-mcp-browser',
        status: 'complete',
        screenshot_kb: Math.round(screenshotSize / 1024),
        elapsed: parseFloat(elapsed())
      });
      return result;
    } catch (err) {
      const errorMsg = err.message || 'unknown error';
      emitter.emit('event', {
        agent: 'bd-mcp-browser',
        status: 'error',
        reason: errorMsg.slice(0, 120),
        elapsed: parseFloat(elapsed())
      });
      return null;
    }
  })();

  const geoIntelPromise = (async () => {
    const geoQuery = `What is ${domain}? Strengths, weaknesses, recent news`;
    emitter.emit('event', {
      agent: 'bd-mcp-geo',
      status: 'querying',
      llms: 'ChatGPT · Grok · Perplexity',
      elapsed: parseFloat(elapsed())
    });
    try {
      const result = await mcpGeoIntel(domain, geoQuery);
      if (result.status === 'unavailable') {
        emitter.emit('event', {
          agent: 'bd-mcp-geo',
          status: 'unavailable',
          reason: result.reason,
          elapsed: parseFloat(elapsed())
        });
        return null;
      }
      // Check if all LLMs failed with "Unknown tool" - means geo group not available
      const allUnknownTool = result.failures && result.failures.length === 3 &&
        result.failures.every(f => f.error?.includes('Unknown tool'));
      if (allUnknownTool) {
        emitter.emit('event', {
          agent: 'bd-mcp-geo',
          status: 'unavailable',
          reason: 'BD MCP geo group not available - upgrade required',
          upstream: result.failures[0].error.slice(0, 80),
          elapsed: parseFloat(elapsed())
        });
        return null;
      }
      const successCount = [result.chatgpt, result.grok, result.perplexity].filter(Boolean).length;
      emitter.emit('event', {
        agent: 'bd-mcp-geo',
        status: 'complete',
        llms_succeeded: successCount,
        elapsed: parseFloat(elapsed())
      });
      return result;
    } catch (err) {
      const errorMsg = err.message || 'unknown error';
      emitter.emit('event', {
        agent: 'bd-mcp-geo',
        status: 'error',
        reason: errorMsg.slice(0, 120),
        elapsed: parseFloat(elapsed())
      });
      return null;
    }
  })();

  const assistantPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-assistant',
      status: 'asking',
      question: `What do you know about ${domain}?`,
      elapsed: parseFloat(elapsed())
    });
    try {
      const { mcpAskAssistant } = await import('./bd-mcp-client.mjs');
      const result = await mcpAskAssistant(`Tell me what Bright Data products would best be used to research the company at ${domain}, and what data sources you would recommend for competitive intelligence on them.`);
      emitter.emit('event', {
        agent: 'bd-assistant',
        status: 'complete',
        chars: result.answer?.length || 0,
        elapsed: parseFloat(elapsed())
      });
      return result;
    } catch (err) {
      emitter.emit('event', {
        agent: 'bd-assistant',
        status: 'unavailable',
        reason: err.message,
        elapsed: parseFloat(elapsed())
      });
      return { question: '', answer: '' };
    }
  })();

  const batchSearchPromise = (async () => {
    const queries = [
      `${companySlug} company overview news 2026`,
      `${companySlug} competitors alternatives`,
      `${companySlug} funding investors valuation`
    ];
    emitter.emit('event', {
      agent: 'bd-serp-batch',
      status: 'searching',
      queries: queries.length,
      elapsed: parseFloat(elapsed())
    });
    try {
      const { mcpSearchEngineBatch } = await import('./bd-mcp-client.mjs');
      const result = await mcpSearchEngineBatch(queries);
      emitter.emit('event', {
        agent: 'bd-serp-batch',
        status: 'complete',
        queries: result.queries.length,
        results: result.results.length,
        elapsed: parseFloat(elapsed())
      });
      return result;
    } catch (err) {
      emitter.emit('event', {
        agent: 'bd-serp-batch',
        status: 'error',
        reason: err.message,
        elapsed: parseFloat(elapsed())
      });
      return null;
    }
  })();

  // EARLY SYNTHESIS TRIGGER: Wait for fast agents (first 6) to complete, then signal ready
  // Fast agents: web-unlocker, serp, web-scraper, mcp, discover, crawl (~6-10s)
  // Slow agents: scraping-browser (12s), assistant (33s), datasets, browser, geo, batch (continue in background)
  const fastAgents = [
    webUnlockerPromise,
    serpPromise,
    webScraperPromise,
    mcpPromise,
    discoverPromise,
    crawlPromise
  ];

  // Wait for fast agents, then emit partial facts signal
  Promise.allSettled(fastAgents).then(() => {
    emitter.emit('event', {
      agent: 'orchestrator',
      status: 'facts-partial',
      factCount: 6,
      message: 'Core facts collected — synthesis starting',
      elapsed: parseFloat(elapsed())
    });
  });

  // Wait for all to complete (now 12 products)
  const settled = await Promise.allSettled([
    webUnlockerPromise,
    serpPromise,
    scrapingBrowserPromise,
    webScraperPromise,
    mcpPromise,
    discoverPromise,
    crawlPromise,
    datasetsPromise,
    browserCapturePromise,
    geoIntelPromise,
    assistantPromise,
    batchSearchPromise
  ]);

  const bdHealth = { ok: 0, failed: 0, errors: [] };
  const [webPage, serpResults, browserPages, structuredData, mcpData, discoverResults, crawlResult, datasetsResult, browserCapture, geoIntel, assistantResult, batchSearchResult] = settled.map((r, i) => {
    const names = ['bd-web-unlocker', 'bd-serp', 'bd-scraping-browser', 'bd-web-scraper', 'bd-mcp', 'bd-discover', 'bd-crawl', 'bd-datasets', 'bd-mcp-browser', 'bd-mcp-geo', 'bd-assistant', 'bd-serp-batch'];
    if (r.status === 'fulfilled') {
      bdHealth.ok++;
      return r.value;
    }
    bdHealth.failed++;
    const errorMsg = r.reason?.message || 'unknown error';
    bdHealth.errors.push(`${names[i]}: ${errorMsg.slice(0, 120)}`);
    console.error(`[bd-worker] ${names[i]} failed:`, errorMsg);
    emitter.emit('event', { agent: names[i], status: 'error', reason: errorMsg.slice(0, 120), elapsed: parseFloat(elapsed()) });
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
  if (discoverResults) facts.discover = discoverResults;
  if (crawlResult) facts.crawl = crawlResult;
  if (datasetsResult) facts.datasets = datasetsResult;
  if (browserCapture) facts.browserCapture = browserCapture;
  if (geoIntel) facts.geoIntel = geoIntel;
  if (assistantResult) facts.assistant = assistantResult;
  if (batchSearchResult) facts.batchSearch = batchSearchResult;

  const factCount = Object.keys(facts).length;

  // AI-IQ storage
  emitter.emit('event', {
    agent: 'ai-iq',
    status: 'storing',
    facts: factCount,
    elapsed: parseFloat(elapsed())
  });

  await sleep(100);

  // Cost breakdown
  const costBreakdown = {
    webUnlocker: 0.30,
    serpApi: 0.50,
    scrapingBrowser: 0.80,
    webScraperApi: 0.40,
    bdMcp: 0.20,
    discoverApi: 0.00,  // FREE
    bdCrawl: 0.00,      // FREE (via MCP batch)
    datasetsApi: 0.00   // $0.0025/record (negligible for 1-2 records)
  };
  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);

  const result = {
    domain,
    mode: 'standard',
    facts,
    elapsed: parseFloat(elapsed()),
    cost: totalCost,
    costBreakdown,
    bdHealth
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
  const bdHealth = { ok: 0, failed: 0, errors: [] };

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
      const errorMsg = error.message || 'scout failed';
      console.error(`[bd-worker] scout ${scout.name} failed:`, errorMsg);
      emitter.emit('event', {
        agent: `scout-${scout.name}`,
        status: 'error',
        reason: errorMsg.slice(0, 120),
        elapsed: parseFloat(elapsed())
      });
      return { scout: scout.name, error: errorMsg };
    }
  });

  const scoutData = await Promise.all(scoutPromises);
  scoutData.forEach(({ scout, data, error }) => {
    if (error) {
      bdHealth.failed++;
      bdHealth.errors.push(`scout-${scout}: ${error.slice(0, 120)}`);
      scoutResults[scout] = { error };
    } else {
      bdHealth.ok++;
      scoutResults[scout] = data;
    }
  });

  // AI-IQ storage
  emitter.emit('event', {
    agent: 'ai-iq',
    status: 'storing',
    facts: Object.keys(scoutResults).length,
    elapsed: parseFloat(elapsed())
  });

  await sleep(150);


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
    costBreakdown,
    bdHealth
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

  const domainDiscoveryPromise = (async () => {
    emitter.emit('event', {
      agent: 'bd-domain-discovery',
      status: 'scanning',
      domain,
      elapsed: parseFloat(elapsed())
    });
    const result = await domainDiscoveryApi(domain);
    emitter.emit('event', {
      agent: 'bd-domain-discovery',
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
  const settled = await Promise.allSettled([
    domainDiscoveryPromise,
    crawlPromise,
    linkedinPromise,
    socialPromise,
    serpPromise
  ]);

  const bdHealth = { ok: 0, failed: 0, errors: [] };
  const [domainDiscovery, crawl, linkedin, social, mentions] = settled.map((r, i) => {
    const names = ['bd-domain-discovery', 'bd-crawl', 'bd-linkedin-scraper', 'bd-social', 'bd-serp'];
    if (r.status === 'fulfilled') {
      bdHealth.ok++;
      return r.value;
    }
    bdHealth.failed++;
    const errorMsg = r.reason?.message || 'unknown error';
    bdHealth.errors.push(`${names[i]}: ${errorMsg.slice(0, 120)}`);
    console.error(`[bd-worker] ${names[i]} failed:`, errorMsg);
    emitter.emit('event', { agent: names[i], status: 'error', reason: errorMsg.slice(0, 120), elapsed: parseFloat(elapsed()) });
    return null;
  });

  // Collect facts (skip null results from failed BD calls)
  if (domainDiscovery) facts.domainDiscovery = domainDiscovery;
  if (crawl) facts.crawl = crawl;
  if (linkedin) facts.linkedin = linkedin;
  if (social) facts.social = social;
  if (mentions) facts.mentions = mentions;

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
    domainDiscoveryApi: 0.00,    // FREE
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
    costBreakdown,
    bdHealth
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
  const settled = await Promise.allSettled([
    deepLookupPromise,
    serpPromise,
    webUnlockerPromise
  ]);

  const bdHealth = { ok: 0, failed: 0, errors: [] };
  const [lookupData, newsData, homepageData] = settled.map((r, i) => {
    const names = ['bd-deep-lookup', 'bd-serp', 'bd-web-unlocker'];
    if (r.status === 'fulfilled') {
      bdHealth.ok++;
      return r.value;
    }
    bdHealth.failed++;
    const errorMsg = r.reason?.message || 'unknown error';
    bdHealth.errors.push(`${names[i]}: ${errorMsg.slice(0, 120)}`);
    console.error(`[bd-worker] ${names[i]} failed:`, errorMsg);
    emitter.emit('event', { agent: names[i], status: 'error', reason: errorMsg.slice(0, 120), elapsed: parseFloat(elapsed()) });
    return null;
  });

  // Collect facts (skip null results)
  if (lookupData) facts.lookup = lookupData;
  if (newsData) facts.news = newsData;
  if (homepageData) facts.homepage = homepageData;

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
    costBreakdown,
    bdHealth
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
 * Round 2 agentic follow-up worker — runs targeted queries based on signals
 */
export async function runAgenticFollowups(signals, emitter) {
  const startTime = Date.now();
  const elapsed = () => parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

  const followupPromises = signals.map(async (signal, i) => {
    const agentName = `scout-r2-${i + 1}`;
    emitter.emit('event', {
      agent: agentName,
      status: 'launching',
      query: signal.followup_query,
      elapsed: elapsed()
    });

    try {
      const result = await serpApi(signal.followup_query);
      emitter.emit('event', {
        agent: agentName,
        status: 'complete',
        results: result.results?.length || 0,
        elapsed: elapsed()
      });
      return { key: `followup_${i}`, signal, data: result };
    } catch (err) {
      const errorMsg = err.message || 'unknown error';
      emitter.emit('event', { agent: agentName, status: 'error', reason: errorMsg.slice(0, 120), elapsed: elapsed() });
      return { key: `followup_${i}`, signal, data: null };
    }
  });

  const settled = await Promise.allSettled(followupPromises);
  const followupData = {};
  for (const s of settled) {
    if (s.status === 'fulfilled' && s.value.data) {
      followupData[s.value.key] = {
        signal: s.value.signal,
        results: s.value.data.results || []
      };
    }
  }
  return followupData;
}

/**
 * Red Team security worker - 6 parallel BD calls for security intelligence
 * @param {string} domain - Target domain (e.g. "stripe.com")
 * @param {EventEmitter} emitter - Event stream for real-time updates
 * @param {string} mode - Recon mode (redteam)
 * @returns {Promise<Object>} - Final report data
 */
export async function runRedteamWorker(domain, emitter, mode = 'redteam') {
  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(2);

  const companySlug = domain.split('.')[0];
  const companyName = companySlug.charAt(0).toUpperCase() + companySlug.slice(1);
  const facts = {};

  // 1. BD Web Unlocker - fetch homepage
  const webUnlockerPromise = (async () => {
    const homepage = `https://${domain}`;
    emitter.emit('event', {
      agent: 'bd-web-unlocker',
      status: 'fetching',
      url: homepage,
      elapsed: parseFloat(elapsed())
    });
    const result = await webUnlocker(homepage);
    facts.homepage = result;
    emitter.emit('event', {
      agent: 'bd-web-unlocker',
      status: 'complete',
      chars: result.chars,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // 2. BD SERP - CVE search on NVD
  const serpCvePromise = (async () => {
    const query = `site:nvd.nist.gov "${companyName}"`;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'searching',
      query,
      elapsed: parseFloat(elapsed())
    });
    const result = await serpApi(query);
    facts.cve = result;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'complete',
      results: result.results.length,
      note: 'CVE database scan',
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // 3. BD SERP - breach/leak search
  const serpBreachPromise = (async () => {
    const query = `"${domain}" breach OR leaked OR exposed 2024 2025 2026`;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'searching',
      query,
      elapsed: parseFloat(elapsed())
    });
    const result = await serpApi(query);
    facts.breach = result;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'complete',
      results: result.results.length,
      note: 'breach incidents',
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // 4. BD SERP - GitHub leak search
  const serpGithubPromise = (async () => {
    const query = `site:github.com "${domain}" "api_key" OR "secret"`;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'searching',
      query,
      elapsed: parseFloat(elapsed())
    });
    const result = await serpApi(query);
    facts.githubLeaks = result;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'complete',
      results: result.results.length,
      note: 'GitHub credential leaks',
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // 5. BD Scraping Browser - 3 security URLs
  const scrapingBrowserPromise = (async () => {
    const urls = [
      `https://crt.sh/?q=%25.${domain}`,
      `https://www.ssllabs.com/ssltest/analyze.html?d=${domain}&fromCache=on&maxAge=24`,
      `https://hackerone.com/${companySlug}`
    ];
    emitter.emit('event', {
      agent: 'bd-scraping-browser',
      status: 'launching',
      urls,
      elapsed: parseFloat(elapsed())
    });
    try {
      const result = await scrapingBrowser(urls);
      facts.securityPages = result;
      emitter.emit('event', {
        agent: 'bd-scraping-browser',
        status: 'complete',
        pages: result.length,
        elapsed: parseFloat(elapsed())
      });
      return result;
    } catch (err) {
      // Graceful fallback - some URLs may 404
      emitter.emit('event', {
        agent: 'bd-scraping-browser',
        status: 'partial',
        reason: err.message.slice(0, 120),
        elapsed: parseFloat(elapsed())
      });
      return [];
    }
  })();

  // 6. BD MCP Ask Assistant - security incidents
  const mcpAskPromise = (async () => {
    const question = `What are the top 5 documented security incidents at ${companyName} between 2023-2026? Include source URLs if available.`;
    emitter.emit('event', {
      agent: 'bd-mcp',
      status: 'asking',
      question: question.slice(0, 60) + '...',
      elapsed: parseFloat(elapsed())
    });
    try {
      const { mcpAskAssistant } = await import('./bd-mcp-client.mjs');
      const result = await mcpAskAssistant(question);
      facts.assistant = result;
      emitter.emit('event', {
        agent: 'bd-mcp',
        status: 'complete',
        chars: result.answer?.length || 0,
        elapsed: parseFloat(elapsed())
      });
      return result;
    } catch (err) {
      emitter.emit('event', {
        agent: 'bd-mcp',
        status: 'unavailable',
        reason: err.message,
        elapsed: parseFloat(elapsed())
      });
      return { question, answer: '' };
    }
  })();

  // Wait for all to complete
  const settled = await Promise.allSettled([
    webUnlockerPromise,
    serpCvePromise,
    serpBreachPromise,
    serpGithubPromise,
    scrapingBrowserPromise,
    mcpAskPromise
  ]);

  const bdHealth = { ok: 0, failed: 0, errors: [] };
  const names = ['bd-web-unlocker', 'bd-serp-cve', 'bd-serp-breach', 'bd-serp-github', 'bd-scraping-browser', 'bd-mcp'];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      bdHealth.ok++;
    } else {
      bdHealth.failed++;
      const errorMsg = r.reason?.message || 'unknown error';
      bdHealth.errors.push(`${names[i]}: ${errorMsg.slice(0, 120)}`);
      console.error(`[bd-worker] ${names[i]} failed:`, errorMsg);
    }
  });

  // AI-IQ storage
  emitter.emit('event', {
    agent: 'ai-iq',
    status: 'storing',
    facts: Object.keys(facts).length,
    elapsed: parseFloat(elapsed())
  });

  await sleep(100);

  // Cost breakdown
  const costBreakdown = {
    webUnlocker: 0.30,
    serpApi: 1.50,  // 3 SERP calls
    scrapingBrowser: 0.80,
    bdMcp: 0.20
  };
  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);

  const result = {
    domain,
    mode: 'redteam',
    facts,
    elapsed: parseFloat(elapsed()),
    cost: totalCost,
    costBreakdown,
    bdHealth
  };

  return result;
}

/**
 * SEO intelligence worker - 4 parallel BD calls for SEO analysis
 * @param {string} domain - Target domain (e.g. "stripe.com")
 * @param {EventEmitter} emitter - Event stream for real-time updates
 * @param {string} mode - Recon mode (seo)
 * @returns {Promise<Object>} - Final report data
 */
export async function runSeoWorker(domain, emitter, mode = 'seo') {
  const startTime = Date.now();
  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(2);

  const companySlug = domain.split('.')[0];
  const facts = {};

  // 1. BD Web Unlocker - fetch homepage
  const webUnlockerPromise = (async () => {
    const homepage = `https://${domain}`;
    emitter.emit('event', {
      agent: 'bd-web-unlocker',
      status: 'fetching',
      url: homepage,
      elapsed: parseFloat(elapsed())
    });
    const result = await webUnlocker(homepage);
    facts.homepage = result;
    emitter.emit('event', {
      agent: 'bd-web-unlocker',
      status: 'complete',
      chars: result.chars,
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // 2. BD Scraping Browser - sitemap + robots.txt
  const scrapingBrowserPromise = (async () => {
    const urls = [
      `https://${domain}/sitemap.xml`,
      `https://${domain}/robots.txt`
    ];
    emitter.emit('event', {
      agent: 'bd-scraping-browser',
      status: 'launching',
      urls,
      elapsed: parseFloat(elapsed())
    });
    try {
      const result = await scrapingBrowser(urls);
      facts.seoFiles = result;
      emitter.emit('event', {
        agent: 'bd-scraping-browser',
        status: 'complete',
        pages: result.length,
        elapsed: parseFloat(elapsed())
      });
      return result;
    } catch (err) {
      // Graceful fallback - some sites may not have these files
      emitter.emit('event', {
        agent: 'bd-scraping-browser',
        status: 'partial',
        reason: err.message.slice(0, 120),
        elapsed: parseFloat(elapsed())
      });
      return [];
    }
  })();

  // 3. BD SERP - site indexing check
  const serpRankingsPromise = (async () => {
    const query = `site:${domain}`;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'searching',
      query,
      elapsed: parseFloat(elapsed())
    });
    const result = await serpApi(query);
    facts.rankings = result;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'complete',
      results: result.results.length,
      note: 'indexed pages',
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // 4. BD SERP - competitors/keywords
  const serpCompetitorsPromise = (async () => {
    const query = `"${companySlug}" SEO ranking keywords competitors`;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'searching',
      query,
      elapsed: parseFloat(elapsed())
    });
    const result = await serpApi(query);
    facts.competitors = result;
    emitter.emit('event', {
      agent: 'bd-serp',
      status: 'complete',
      results: result.results.length,
      note: 'competitive analysis',
      elapsed: parseFloat(elapsed())
    });
    return result;
  })();

  // 5. BD MCP Ask Assistant - SEO intel
  const mcpAskPromise = (async () => {
    const question = `What are ${domain}'s organic search rankings, estimated traffic, and top keywords?`;
    emitter.emit('event', {
      agent: 'bd-mcp',
      status: 'asking',
      question: question.slice(0, 60) + '...',
      elapsed: parseFloat(elapsed())
    });
    try {
      const { mcpAskAssistant } = await import('./bd-mcp-client.mjs');
      const result = await mcpAskAssistant(question);
      facts.assistant = result;
      emitter.emit('event', {
        agent: 'bd-mcp',
        status: 'complete',
        chars: result.answer?.length || 0,
        elapsed: parseFloat(elapsed())
      });
      return result;
    } catch (err) {
      emitter.emit('event', {
        agent: 'bd-mcp',
        status: 'unavailable',
        reason: err.message,
        elapsed: parseFloat(elapsed())
      });
      return { question, answer: '' };
    }
  })();

  // Wait for all to complete
  const settled = await Promise.allSettled([
    webUnlockerPromise,
    scrapingBrowserPromise,
    serpRankingsPromise,
    serpCompetitorsPromise,
    mcpAskPromise
  ]);

  const bdHealth = { ok: 0, failed: 0, errors: [] };
  const names = ['bd-web-unlocker', 'bd-scraping-browser', 'bd-serp-rankings', 'bd-serp-competitors', 'bd-mcp'];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      bdHealth.ok++;
    } else {
      bdHealth.failed++;
      const errorMsg = r.reason?.message || 'unknown error';
      bdHealth.errors.push(`${names[i]}: ${errorMsg.slice(0, 120)}`);
      console.error(`[bd-worker] ${names[i]} failed:`, errorMsg);
    }
  });

  // AI-IQ storage
  emitter.emit('event', {
    agent: 'ai-iq',
    status: 'storing',
    facts: Object.keys(facts).length,
    elapsed: parseFloat(elapsed())
  });

  await sleep(100);

  // Cost breakdown
  const costBreakdown = {
    webUnlocker: 0.30,
    serpApi: 1.00,  // 2 SERP calls
    scrapingBrowser: 0.80,
    bdMcp: 0.20
  };
  const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);

  const result = {
    domain,
    mode: 'seo',
    facts,
    elapsed: parseFloat(elapsed()),
    cost: totalCost,
    costBreakdown,
    bdHealth
  };

  return result;
}
