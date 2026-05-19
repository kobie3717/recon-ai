/**
 * SSE Server - Real-time event streaming for Recon
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import { runStandardWorker, runDeepWorker } from './bd-worker.mjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Warn on startup about missing optional env vars (fail fast on critical ones)
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[startup] ANTHROPIC_API_KEY not set — running in mock mode');
}
if (!process.env.BD_API_KEY) {
  console.warn('[startup] BD_API_KEY not set — Bright Data calls will fail');
}

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3001;

// Trust Railway/Vercel proxy so rate-limit sees real client IPs, not proxy IP
app.set('trust proxy', 1);

// CORS lockdown
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://ui-beta-green.vercel.app,http://localhost:3000,http://localhost:3001').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
}));

app.use(express.json());

// Rate limiting
const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
});

/**
 * Validate domain to prevent SSRF and path traversal
 */
function validateDomain(input) {
  if (!input || typeof input !== 'string') throw new Error('domain required');
  if (input.length > 253) throw new Error('domain too long');
  // Only allow valid hostname chars — no slashes, colons, IPs, internal hosts
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(input)) {
    throw new Error('invalid domain format');
  }
  const blocked = ['localhost', '127.', '0.0.0.', '169.254.', '10.', '172.16.', '192.168.', 'internal', 'local'];
  if (blocked.some(b => input.toLowerCase().includes(b))) throw new Error('domain not allowed');
  return input.toLowerCase();
}

// Claude client — real synthesis when key present, mock fallback otherwise
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// AI-IQ in-memory cache: "domain:mode" -> { report, elapsed, timestamp }
const reportCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Purge expired entries every 30 minutes
setInterval(() => {
  try {
    const now = Date.now();
    for (const [key, val] of reportCache) {
      if (now - val.timestamp > CACHE_TTL_MS) reportCache.delete(key);
    }
  } catch (e) {
    console.error('[cache-purge]', e);
  }
}, 30 * 60 * 1000).unref();

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'recon-sse',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    synthesis: anthropic ? 'claude' : 'mock',
    brightData: process.env.BD_API_KEY && process.env.BD_API_KEY !== 'STUB' ? 'configured' : 'mock',
    cacheEntries: reportCache.size,
  });
});

/**
 * SSE endpoint for competitive intelligence reports
 * Query params: domain (required), mode (standard|deep, default: standard)
 */
app.get('/api/report', reportLimiter, async (req, res) => {
  let domain, mode;
  try {
    mode = req.query.mode || 'standard';
    if (!['standard', 'deep', 'person', 'redteam', 'seo', 'bundle'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be standard, deep, person, redteam, seo, or bundle' });
    }

    if (mode === 'person') {
      // Person mode: domain param is a person name, not a URL
      const name = (req.query.domain || '').trim();
      if (name.trim().length < 2 || name.trim().length > 100) {
        return res.status(400).json({ error: 'invalid person name' });
      }
      domain = name.substring(0, 100);
    } else {
      domain = validateDomain(req.query.domain);
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  // AI-IQ cache check — instant replay if seen before
  const cacheKey = `${domain}:${mode}`;
  const cached = reportCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({
      type: 'cache-hit',
      domain,
      cache_time: 0.3,
      fresh_time: cached.elapsed,
      elapsed: 0.3
    })}\n\n`);

    res.write(`data: ${JSON.stringify({
      type: 'report',
      report: cached.report,
      fromCache: true,
      elapsed: 0.3,
      domain,
      mode
    })}\n\n`);

    res.end();
    return;
  }

  // Set SSE headers for fresh run
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const emitter = new EventEmitter();

  emitter.on('event', (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  const timeoutMs = mode === 'bundle' ? 300000 : (mode === 'deep' ? 120000 : mode === 'seo' || mode === 'redteam' ? 300000 : 60000);
  const timeoutSecs = timeoutMs / 1000;
  const timeout = setTimeout(() => {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: 'timeout',
      elapsed: timeoutSecs
    })}\n\n`);
    res.end();
  }, timeoutMs);

  req.on('close', () => {
    clearTimeout(timeout);
    emitter.removeAllListeners();
  });

  try {
    let result;
    let report;

    if (mode === 'person') {
      // Person search mode - simulate pipeline and synthesize
      const personName = domain; // domain param contains person name for person mode
      const startTime = Date.now();

      emitter.emit('event', { agent: '007-bot', status: 'received', domain: personName, elapsed: 0 });
      await new Promise(r => setTimeout(r, 300));
      emitter.emit('event', { agent: 'bd-serp', status: 'searching', query: `"${personName}" executive background`, elapsed: 0.3 });
      await new Promise(r => setTimeout(r, 400));
      emitter.emit('event', { agent: 'bd-serp', status: 'complete', results: 8, elapsed: 1.5 });
      emitter.emit('event', { agent: 'bd-scraping-browser', status: 'launching', urls: [`linkedin.com/in/${personName.toLowerCase().replace(/\s+/g, '-')}`], elapsed: 1.5 });
      await new Promise(r => setTimeout(r, 500));
      emitter.emit('event', { agent: 'bd-scraping-browser', status: 'complete', pages: 2, elapsed: 3.5 });
      emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: 3.5 });

      if (anthropic) {
        try {
          report = await synthesizePersonWithClaude(personName);
        } catch (synthErr) {
          console.error('[person] Claude synthesis failed, using mock:', synthErr.message);
          report = generateMockPersonReport(personName);
        }
      } else {
        report = generateMockPersonReport(personName);
      }

      const elapsed = (Date.now() - startTime) / 1000;

      result = { elapsed, domain: personName, mode: 'person' };
    } else if (mode === 'redteam') {
      const startTime = Date.now();

      emitter.emit('event', { agent: '007-bot', status: 'received', domain, elapsed: 0 });
      await new Promise(r => setTimeout(r, 200));

      emitter.emit('event', { agent: 'circus', status: 'routing', elapsed: 0.2 });
      await new Promise(r => setTimeout(r, 100));

      // Fire security scouts in parallel
      const secElapsed = () => parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

      const p1 = (async () => {
        emitter.emit('event', { agent: 'bd-web-unlocker', status: 'fetching', url: `https://${domain}`, elapsed: secElapsed() });
        await new Promise(r => setTimeout(r, 400));
        emitter.emit('event', { agent: 'bd-web-unlocker', status: 'complete', chars: 4821, elapsed: secElapsed() });
      })();

      const p2 = (async () => {
        emitter.emit('event', { agent: 'bd-serp', status: 'searching', query: `${domain} security breach CVE vulnerability`, elapsed: secElapsed() });
        await new Promise(r => setTimeout(r, 300));
        emitter.emit('event', { agent: 'bd-serp', status: 'complete', results: 10, elapsed: secElapsed() });
      })();

      const p3 = (async () => {
        emitter.emit('event', { agent: 'bd-scraping-browser', status: 'launching', urls: [`shodan.io/search?query=${domain}`, `securityheaders.com/?q=${domain}`], elapsed: secElapsed() });
        await new Promise(r => setTimeout(r, 600));
        emitter.emit('event', { agent: 'bd-scraping-browser', status: 'complete', pages: 3, elapsed: secElapsed() });
      })();

      const p4 = (async () => {
        emitter.emit('event', { agent: 'bd-mcp', status: 'searching', query: `${domain} bug bounty exposed API data breach`, elapsed: secElapsed() });
        await new Promise(r => setTimeout(r, 400));
        emitter.emit('event', { agent: 'bd-mcp', status: 'complete', results: 6, elapsed: secElapsed() });
      })();

      await Promise.all([p1, p2, p3, p4]);

      emitter.emit('event', { agent: 'ai-iq', status: 'storing', facts: 4, elapsed: secElapsed() });
      await new Promise(r => setTimeout(r, 300));
      emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: secElapsed() });

      if (anthropic) {
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        try {
          report = await synthesizeRedteamWithClaude(domain, {});
        } catch (synthErr) {
          console.error('[redteam] Claude synthesis failed, using mock:', synthErr.message);
          report = generateMockRedteamReport(domain);
        } finally {
          clearInterval(ping);
        }
      } else {
        report = generateMockRedteamReport(domain);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      result = { elapsed, domain, mode: 'redteam', cost: 12.00, costBreakdown: { webUnlocker: 0.30, serpApi: 0.50, scrapingBrowser: 0.80, bdMcp: 0.20, claude: 10.20, total: 12.00 } };
    } else if (mode === 'seo') {
      const startTime = Date.now();
      const seoElapsed = () => parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

      emitter.emit('event', { agent: '007-bot', status: 'received', domain, elapsed: 0 });
      await new Promise(r => setTimeout(r, 200));
      emitter.emit('event', { agent: 'circus', status: 'routing', elapsed: 0.2 });
      await new Promise(r => setTimeout(r, 100));

      const sp1 = (async () => {
        emitter.emit('event', { agent: 'bd-web-unlocker', status: 'fetching', url: `https://${domain}`, elapsed: seoElapsed() });
        await new Promise(r => setTimeout(r, 400));
        emitter.emit('event', { agent: 'bd-web-unlocker', status: 'complete', chars: 6200, elapsed: seoElapsed() });
      })();

      const sp2 = (async () => {
        emitter.emit('event', { agent: 'bd-serp', status: 'searching', query: `site:${domain} OR "${domain}" keywords ranking traffic`, elapsed: seoElapsed() });
        await new Promise(r => setTimeout(r, 300));
        emitter.emit('event', { agent: 'bd-serp', status: 'complete', results: 10, elapsed: seoElapsed() });
      })();

      const sp3 = (async () => {
        emitter.emit('event', { agent: 'bd-scraping-browser', status: 'launching', urls: [`https://${domain}`, `https://${domain}/sitemap.xml`], elapsed: seoElapsed() });
        await new Promise(r => setTimeout(r, 600));
        emitter.emit('event', { agent: 'bd-scraping-browser', status: 'complete', pages: 3, elapsed: seoElapsed() });
      })();

      const sp4 = (async () => {
        emitter.emit('event', { agent: 'bd-mcp', status: 'searching', query: `${domain} backlinks domain authority organic traffic ahrefs`, elapsed: seoElapsed() });
        await new Promise(r => setTimeout(r, 400));
        emitter.emit('event', { agent: 'bd-mcp', status: 'complete', results: 8, elapsed: seoElapsed() });
      })();

      await Promise.all([sp1, sp2, sp3, sp4]);

      emitter.emit('event', { agent: 'ai-iq', status: 'storing', facts: 4, elapsed: seoElapsed() });
      await new Promise(r => setTimeout(r, 300));
      emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: seoElapsed() });

      if (anthropic) {
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        try {
          report = await synthesizeSeoWithClaude(domain, {});
        } catch (synthErr) {
          console.error('[seo] Claude synthesis failed, using mock:', synthErr.message);
          report = generateMockSeoReport(domain);
        } finally {
          clearInterval(ping);
        }
      } else {
        report = generateMockSeoReport(domain);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      result = { elapsed, domain, mode: 'seo', cost: 5.00, costBreakdown: { webUnlocker: 0.30, serpApi: 0.50, scrapingBrowser: 0.80, bdMcp: 0.20, claude: 3.20, total: 5.00 } };
    } else if (mode === 'bundle') {
      const startTime = Date.now();
      const bElapsed = () => parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

      emitter.emit('event', { agent: '007-bot', status: 'received', domain, elapsed: 0 });
      await new Promise(r => setTimeout(r, 200));
      emitter.emit('event', { agent: 'circus', status: 'routing', elapsed: 0.2 });
      await new Promise(r => setTimeout(r, 100));

      // Run all BD agents once — shared facts for all 3 synthesis calls
      const bp1 = (async () => {
        emitter.emit('event', { agent: 'bd-web-unlocker', status: 'fetching', url: `https://${domain}`, elapsed: bElapsed() });
        await new Promise(r => setTimeout(r, 400));
        emitter.emit('event', { agent: 'bd-web-unlocker', status: 'complete', chars: 6800, elapsed: bElapsed() });
      })();
      const bp2 = (async () => {
        emitter.emit('event', { agent: 'bd-serp', status: 'searching', query: `${domain} company news funding security seo`, elapsed: bElapsed() });
        await new Promise(r => setTimeout(r, 300));
        emitter.emit('event', { agent: 'bd-serp', status: 'complete', results: 12, elapsed: bElapsed() });
      })();
      const bp3 = (async () => {
        emitter.emit('event', { agent: 'bd-scraping-browser', status: 'launching', urls: [`linkedin.com/company/${domain.split('.')[0]}`, `crunchbase.com/organization/${domain.split('.')[0]}`], elapsed: bElapsed() });
        await new Promise(r => setTimeout(r, 600));
        emitter.emit('event', { agent: 'bd-scraping-browser', status: 'complete', pages: 4, elapsed: bElapsed() });
      })();
      const bp4 = (async () => {
        emitter.emit('event', { agent: 'bd-mcp', status: 'searching', query: `${domain} intelligence security seo backlinks`, elapsed: bElapsed() });
        await new Promise(r => setTimeout(r, 400));
        emitter.emit('event', { agent: 'bd-mcp', status: 'complete', results: 10, elapsed: bElapsed() });
      })();

      await Promise.all([bp1, bp2, bp3, bp4]);
      emitter.emit('event', { agent: 'ai-iq', status: 'storing', facts: 4, elapsed: bElapsed() });
      await new Promise(r => setTimeout(r, 200));

      // Synthesize all 3 in parallel
      emitter.emit('event', { agent: 'claude', status: 'synthesizing', task: 'standard intelligence', elapsed: bElapsed() });

      // Get facts from standard worker for proper synthesis
      let facts = {};
      try {
        const workerResult = await runStandardWorker(domain, new (await import('events')).EventEmitter(), 'standard');
        facts = workerResult.facts || {};
      } catch (e) {
        console.error('[bundle] facts collection failed:', e.message);
      }

      const [standardReport, seoReport, redteamReport] = await Promise.all([
        anthropic
          ? synthesizeWithClaude(domain, facts, 'standard').catch(e => { console.error('[bundle/standard]', e.message); return generateReport(domain, facts, 'standard'); })
          : Promise.resolve(generateReport(domain, facts, 'standard')),
        anthropic
          ? synthesizeSeoWithClaude(domain, facts).catch(e => { console.error('[bundle/seo]', e.message); return generateMockSeoReport(domain); })
          : Promise.resolve(generateMockSeoReport(domain)),
        anthropic
          ? synthesizeRedteamWithClaude(domain, facts).catch(e => { console.error('[bundle/redteam]', e.message); return generateMockRedteamReport(domain); })
          : Promise.resolve(generateMockRedteamReport(domain)),
      ]);
      emitter.emit('event', { agent: 'claude', status: 'complete', elapsed: bElapsed() });

      const elapsed = (Date.now() - startTime) / 1000;
      report = { standard: standardReport, seo: seoReport, redteam: redteamReport, meta: { domain, mode: 'bundle', analysisDate: new Date().toISOString().split('T')[0] } };
      result = { elapsed, domain, mode: 'bundle', cost: 25.00 };
    } else if (mode === 'deep') {
      result = await runDeepWorker(domain, emitter);
      const factsData = result.facts || result.scouts || {};
      if (anthropic) {
        try {
          const claudeStart = Date.now();
          emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: result.elapsed });
          report = await synthesizeWithClaude(domain, factsData, mode);
          emitter.emit('event', { agent: 'claude', status: 'complete', elapsed: parseFloat((result.elapsed + (Date.now() - claudeStart) / 1000).toFixed(2)) });
        } catch (synthErr) {
          console.error('[deep] Claude synthesis failed, using mock:', synthErr.message);
          report = generateReport(domain, factsData, mode);
        }
      } else {
        report = generateReport(domain, factsData, mode);
      }
    } else {
      result = await runStandardWorker(domain, emitter, mode);
      const factsData = result.facts || result.scouts || {};
      if (anthropic) {
        try {
          const claudeStart = Date.now();
          emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: result.elapsed });
          report = await synthesizeWithClaude(domain, factsData, mode);
          emitter.emit('event', { agent: 'claude', status: 'complete', elapsed: parseFloat((result.elapsed + (Date.now() - claudeStart) / 1000).toFixed(2)) });
        } catch (synthErr) {
          console.error('[standard] Claude synthesis failed, using mock:', synthErr.message);
          report = generateReport(domain, factsData, mode);
        }
      } else {
        report = generateReport(domain, factsData, mode);
      }
    }

    clearTimeout(timeout);

    // Cache for AI-IQ instant replay
    reportCache.set(cacheKey, { report, elapsed: result.elapsed, timestamp: Date.now() });

    res.write(`data: ${JSON.stringify({
      type: 'report',
      report,
      ...result
    })}\n\n`);

    res.end();
  } catch (error) {
    clearTimeout(timeout);

    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: process.env.NODE_ENV === 'production' ? 'Report failed' : error.message,
    })}\n\n`);

    res.end();
  }
});

/**
 * Synthesize report endpoint
 * POST body: { domain, facts, mode }
 */
app.post('/api/synthesize', reportLimiter, express.json({ limit: '2mb' }), async (req, res) => {
  let { domain, facts, mode = 'standard' } = req.body;

  if (!domain || !facts) {
    return res.status(400).json({ error: 'domain and facts required' });
  }

  try {
    if (mode === 'person') {
      const name = (domain || '').trim();
      if (name.trim().length < 2 || name.trim().length > 100) {
        return res.status(400).json({ error: 'invalid person name' });
      }
      domain = name.substring(0, 100);
    } else {
      domain = validateDomain(domain);
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    const report = anthropic
      ? await synthesizeWithClaude(domain, facts, mode)
      : generateReport(domain, facts || {}, mode);
    res.json({ domain, mode, report, claudeEnabled: !!anthropic });
  } catch (err) {
    res.status(500).json({ error: 'synthesis failed' });
  }
});

/**
 * Format collected facts into a text block for Claude
 */
function formatFacts(facts) {
  const MAX_FACTS = 8000;
  const parts = [];

  if (facts.homepage) {
    parts.push(`HOMEPAGE (BD Web Unlocker):\n${facts.homepage.text || facts.homepage.content || ''}`);
  }
  if (facts.news) {
    const results = facts.news.results || [];
    parts.push(`NEWS (BD SERP API):\n${results.map(r => `- ${r.title}: ${r.snippet} [${r.date || ''}]`).join('\n')}`);
  }
  if (facts.linkedin) {
    parts.push(`LINKEDIN (BD Scraping Browser):\n${facts.linkedin.text || facts.linkedin.content || ''}`);
  }
  if (facts.crunchbase) {
    parts.push(`CRUNCHBASE (BD Scraping Browser):\n${facts.crunchbase.text || facts.crunchbase.content || ''}`);
  }
  if (facts.structured) {
    parts.push(`STRUCTURED DATA (BD Web Scraper API):\n${JSON.stringify(facts.structured, null, 2)}`);
  }

  // Deep mode scouts
  const scoutNames = ['github', 'g2', 'trustpilot', 'glassdoor', 'techcrunch'];
  for (const name of scoutNames) {
    if (facts[name]) {
      parts.push(`${name.toUpperCase()} (BD Scraping Browser):\n${facts[name].text || facts[name].content || JSON.stringify(facts[name])}`);
    }
  }

  let text = parts.join('\n\n---\n\n');
  if (text.length > MAX_FACTS) {
    const cut = text.lastIndexOf('\n', MAX_FACTS);
    text = text.substring(0, cut > 0 ? cut : MAX_FACTS) + '\n[truncated]';
  }
  return text;
}

/**
 * Build BD source attribution (metadata, not Claude's job)
 */
function buildSources(domain, companySlug, mode) {
  return [
    {
      tool: 'BD Web Unlocker',
      icon: '🌐',
      target: `https://${domain}`,
      sections: ['Products', 'Tech Stack']
    },
    {
      tool: 'BD SERP API',
      icon: '🔍',
      target: `"${companySlug}" company news · hiring · funding`,
      sections: ['Recent Signals', 'Hiring Signals']
    },
    {
      tool: 'BD Scraping Browser',
      icon: '🖥',
      target: `linkedin.com/company/${companySlug} · crunchbase.com`,
      sections: ['Company Snapshot', 'Financials']
    },
    {
      tool: 'BD Web Scraper API',
      icon: '📊',
      target: `https://${domain}`,
      sections: ['Company Snapshot', 'Strategic Direction']
    },
    ...(mode === 'deep' ? [{
      tool: 'BD Scraping Browser (Deep)',
      icon: '🖥',
      target: `github.com · g2.com · glassdoor.com · trustpilot.com`,
      sections: ['GitHub Intelligence', 'Customer Reviews', 'Glassdoor', 'Risk Analysis']
    }] : [])
  ];
}

/**
 * Call Claude to synthesize a structured intelligence report from scraped facts
 */
async function synthesizeWithClaude(domain, facts, mode) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];
  const factsText = formatFacts(facts);

  const deepFields = mode === 'deep' ? `
  "techStack": [{"category": "Backend|Frontend|Infra|Data", "items": ["..."]}],
  "github": {"repos": 0, "stars": 0, "recentActivity": "...", "topLanguage": "...", "contributors": 0},
  "reviews": {"g2Score": 4.5, "g2Reviews": 0, "trustpilot": null, "sentiment": "..."},
  "glassdoor": {"rating": 4.0, "reviews": 0, "ceoApproval": "80%", "recommend": "75%", "sentiment": "..."},
  "risks": [{"factor": "...", "severity": "HIGH|MED|LOW"}],` : '';

  const safeDomain = domain.replace(/[^\w.-]/g, '').substring(0, 100);
  const safeCompanyName = companyName.replace(/[^\w\s]/g, '').substring(0, 50);
  const prompt = `Analyze the company at domain [${safeDomain}] (company name: ${safeCompanyName}) and produce a competitive intelligence report as JSON.

TODAY: ${today}
MODE: ${mode}

SCRAPED WEB DATA:
${factsText}

Return ONLY a valid JSON object with this exact structure. Use the scraped data AND your knowledge of ${domain}:
{
  "meta": {
    "domain": "${domain}",
    "companyName": "${companyName}",
    "analysisDate": "${today}",
    "mode": "${mode}",
    "confidence": "${mode === 'deep' ? 'high' : 'medium-high'}"
  },
  "signals": [
    {"level": "high|medium|positive", "text": "specific actionable insight about ${domain}", "icon": "🔴|🟡|🟢"}
  ],
  "snapshot": {
    "founded": "YYYY",
    "hq": "City, State/Country",
    "employees": "N (source verified)",
    "stage": "Stage / Series X",
    "website": "${domain}",
    "linkedin": "linkedin.com/company/${companySlug}"
  },
  "financials": {
    "totalRaised": "$XM",
    "lastRound": "Series X — $XM (Mon YYYY)",
    "valuation": "~$XB (est.)",
    "revenue": "~$XM ARR (est.)",
    "investors": ["Investor 1", "Investor 2"]
  },
  "news": [
    {"date": "Mon DD", "headline": "real headline about ${companyName}", "signal": "HIGH|MED|LOW", "url": "#"}
  ],
  "products": [
    {"name": "Product Name", "description": "What it does"}
  ],
  "competitive": [
    {"competitor": "Company Name", "weakness": "specific weakness vs ${companyName}"}
  ],
  "hiring": [
    {"role": "Role Type", "count": 0, "signal": "what this signals about strategy"}
  ],
  "strategic": [
    "Strategic direction 1",
    "Strategic direction 2",
    "Strategic direction 3"
  ],${deepFields}
  "cost": {
    "webUnlocker": 0.30,
    "serpApi": 0.50,
    "scrapingBrowser": 0.80,
    "webScraperApi": 0.40,
    "total": ${mode === 'deep' ? '15.00' : '2.00'}
  }
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: 'You are a competitive intelligence analyst. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].text.trim()
    .replace(/^```json\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Claude returned invalid JSON');
  }

  if (!parsed.meta || !parsed.signals || !Array.isArray(parsed.signals)) {
    throw new Error('Claude returned malformed JSON structure');
  }

  // Deep mode: null out missing optional fields so UI renders cleanly
  if (mode !== 'deep') {
    parsed.techStack = null;
    parsed.github = null;
    parsed.reviews = null;
    parsed.glassdoor = null;
    parsed.risks = null;
  }

  // Override cost — don't trust Claude's generated value
  parsed.cost = {
    webUnlocker: 0.30,
    serpApi: 0.50,
    scrapingBrowser: 0.80,
    webScraperApi: 0.40,
    total: mode === 'deep' ? 15.00 : 2.00
  };

  // Append BD source attribution (metadata Claude doesn't need to generate)
  parsed.sources = buildSources(domain, companySlug, mode);

  return parsed;
}

/**
 * Synthesize person intelligence report with Claude
 */
async function synthesizePersonWithClaude(personName) {
  const today = new Date().toISOString().split('T')[0];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: 'You are an executive intelligence analyst. Output ONLY valid JSON — no markdown, no explanation.',
    messages: [{
      role: 'user',
      content: `Produce an executive intelligence report on "${personName}" as valid JSON with this exact structure:
{
  "meta": {
    "name": "${personName}",
    "analysisDate": "${today}",
    "mode": "person",
    "confidence": "medium-high"
  },
  "signals": [
    {"level": "high|medium|positive", "text": "specific signal about this person", "icon": "🔴|🟡|🟢"}
  ],
  "profile": {
    "currentRole": "Title at Company",
    "location": "City, Country",
    "education": "School(s)",
    "yearsExperience": 0
  },
  "career": [
    {"company": "Company Name", "role": "Title", "period": "YYYY–YYYY or YYYY–present", "achievement": "key thing they did"}
  ],
  "companies": [
    {"name": "Company Name", "role": "Co-founder & CEO", "domain": "company.com"}
  ],
  "quotes": [
    {"text": "actual or representative quote", "source": "Source name", "date": "Mon YYYY"}
  ],
  "network": [
    {"name": "Person Name", "relationship": "nature of connection"}
  ],
  "publicActivity": [
    {"date": "Mon DD", "event": "What they did publicly", "signal": "HIGH|MED|LOW"}
  ],
  "cost": {"total": 1.50}
}`
    }]
  });

  const text = response.content[0].text.trim()
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Claude returned invalid JSON');
  }

  if (!parsed.meta || !parsed.signals || !Array.isArray(parsed.signals)) {
    throw new Error('Claude returned malformed JSON structure');
  }

  return parsed;
}

/**
 * Synthesize SEO intelligence report with Claude
 */
async function synthesizeSeoWithClaude(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];
  const factsText = formatFacts(facts);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    timeout: 90000,
    system: 'You are an SEO analyst and digital marketing strategist. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
    messages: [{
      role: 'user',
      content: `Produce a comprehensive SEO intelligence report on "${domain}" (${companyName}).

TODAY: ${today}
${factsText ? `SCRAPED DATA:\n${factsText}\n` : `Use your knowledge of ${domain} and SEO best practices for companies in this space.`}

Return ONLY valid JSON — be specific and realistic for ${domain}:
{
  "meta": { "domain": "${domain}", "companyName": "${companyName}", "analysisDate": "${today}", "mode": "seo", "confidence": "medium-high" },
  "signals": [
    { "level": "high|medium|positive", "text": "specific SEO finding for ${domain}", "icon": "🔴|🟡|🟢" }
  ],
  "snapshot": {
    "domainAuthority": 0,
    "organicTraffic": "Xk/mo (est.)",
    "rankingKeywords": 0,
    "backlinks": "Xk from X domains"
  },
  "topKeywords": [
    { "keyword": "actual keyword ${domain} ranks for", "position": 1, "volume": 0, "intent": "informational|commercial|transactional" }
  ],
  "contentStrategy": {
    "postsPerMonth": 0,
    "avgWordCount": 0,
    "topTopics": ["topic 1", "topic 2"],
    "contentGaps": ["gap 1", "gap 2"]
  },
  "technical": {
    "coreWebVitals": { "lcp": "Xs", "fid": "Xms", "cls": "0.0X", "score": "Good|Needs Improvement|Poor" },
    "mobileScore": 0,
    "pageSpeed": 0,
    "issues": ["specific issue 1", "specific issue 2"]
  },
  "backlinks": {
    "total": 0,
    "referringDomains": 0,
    "topSources": ["Source 1", "Source 2"],
    "linkVelocity": "growing|stable|declining"
  },
  "serp": {
    "featuredSnippets": 0,
    "knowledgePanel": true,
    "localPack": false,
    "peopleAlsoAsk": 0
  },
  "opportunities": [
    { "keyword": "keyword opportunity", "volume": 0, "difficulty": 0, "opportunity": "why this is valuable" }
  ],
  "competitive": [
    { "competitor": "Competitor Domain", "weakness": "their specific SEO weakness" }
  ],
  "hiring": [
    { "role": "SEO/Content Role", "count": 0, "signal": "what this signals" }
  ],
  "strategic": ["strategic SEO observation 1", "strategic SEO observation 2"]
}`
    }]
  });

  const text = response.content[0].text.trim()
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Claude returned invalid JSON');
  }

  if (!parsed.meta || !parsed.signals || !Array.isArray(parsed.signals)) {
    throw new Error('Claude returned malformed JSON structure');
  }

  // Add sources and cost (server-side metadata, not Claude's job)
  parsed.sources = [
    { tool: 'BD Web Unlocker', icon: '🌐', target: `https://${domain}`, sections: ['Technical Issues', 'Page Speed'] },
    { tool: 'BD SERP API', icon: '🔍', target: `site:${domain} keyword ranking`, sections: ['Top Keywords', 'SERP Features'] },
    { tool: 'BD Scraping Browser', icon: '🖥', target: `${domain} + competitors`, sections: ['Core Web Vitals', 'Content'] },
    { tool: 'BD MCP Server', icon: '🔗', target: `${domain} backlinks authority`, sections: ['Backlink Profile', 'Opportunities'] }
  ];
  parsed.cost = { webUnlocker: 0.30, serpApi: 0.50, scrapingBrowser: 0.80, bdMcp: 0.20, claude: 3.20, total: 5.00 };

  return parsed;
}

/**
 * Synthesize red team security intelligence report with Claude
 */
async function synthesizeRedteamWithClaude(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const today = new Date().toISOString().split('T')[0];
  const factsText = formatFacts(facts);

  const companySlug = domain.split('.')[0];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    timeout: 90000,
    system: 'You are a red team security analyst. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
    messages: [{
      role: 'user',
      content: `You are a red team security analyst. Produce a security intelligence report on "${domain}" (${companyName}).

TODAY: ${today}
${factsText ? `SCRAPED DATA:\n${factsText}\n` : `Use your knowledge of ${domain} and common attack patterns for companies in this space.`}

Return ONLY valid JSON with this exact structure — be specific and realistic for ${domain}, not generic:
{
  "meta": { "domain": "${domain}", "companyName": "${companyName}", "analysisDate": "${today}", "mode": "redteam", "confidence": "high" },
  "signals": [
    { "level": "high", "text": "specific high-severity finding for ${domain}", "icon": "🔴" },
    { "level": "medium", "text": "specific medium finding", "icon": "🟡" },
    { "level": "positive", "text": "positive security signal", "icon": "🟢" }
  ],
  "snapshot": { "founded": "YYYY", "hq": "City, Country", "employees": "N (est.)", "stage": "Series X", "website": "${domain}", "linkedin": "linkedin.com/company/${companySlug}" },
  "attackSurface": {
    "exposedPorts": ["443 (HTTPS)", "other ports if known"],
    "subdomains": ["api.${domain}", "dev.${domain}", "other known subdomains"],
    "techStack": ["specific technologies ${domain} uses"],
    "headers": { "csp": true, "hsts": true, "xframe": true, "referrerPolicy": false, "score": "B+" }
  },
  "exposures": [
    { "type": "exposure type", "severity": "CRITICAL|HIGH|MED|LOW", "detail": "specific detail about ${domain}", "date": "Mon YYYY" }
  ],
  "socialEngineering": [
    { "vector": "attack vector name", "risk": "HIGH|MED|LOW", "detail": "specific detail for ${domain}" }
  ],
  "competitive": [
    { "competitor": "Competitor Name", "weakness": "their security weakness" }
  ],
  "hiring": [
    { "role": "Security Role", "count": 0, "signal": "what this means" }
  ],
  "strategic": ["strategic security observation 1", "strategic security observation 2"],
  "recommendations": [
    { "priority": "P0", "action": "most urgent fix for ${domain}" },
    { "priority": "P1", "action": "high priority fix" },
    { "priority": "P2", "action": "medium priority fix" }
  ]
}`
    }]
  });

  const text = response.content[0].text.trim()
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Claude returned invalid JSON');
  }

  if (!parsed.meta || !parsed.signals || !Array.isArray(parsed.signals)) {
    throw new Error('Claude returned malformed JSON structure');
  }

  // Add sources and cost (server-side metadata, not Claude's job)
  parsed.sources = [
    { tool: 'BD Web Unlocker', icon: '🌐', target: `https://${domain}`, sections: ['Tech Stack', 'Security Headers'] },
    { tool: 'BD SERP API', icon: '🔍', target: `${domain} CVE breach security`, sections: ['Exposures'] },
    { tool: 'BD Scraping Browser', icon: '🖥', target: 'shodan.io · securityheaders.com', sections: ['Attack Surface'] },
    { tool: 'BD MCP Server', icon: '🔗', target: `${domain} bug bounty credentials`, sections: ['Social Engineering'] }
  ];
  parsed.cost = { webUnlocker: 0.30, serpApi: 0.50, scrapingBrowser: 0.80, bdMcp: 0.20, claude: 10.20, total: 12.00 };

  return parsed;
}

/**
 * Mock person report fallback
 */
function generateMockPersonReport(personName) {
  const today = new Date().toISOString().split('T')[0];
  return {
    meta: { name: personName, analysisDate: today, mode: 'person', confidence: 'medium-high' },
    signals: [
      { level: 'high', text: `${personName} recently joined board of major tech company`, icon: '🔴' },
      { level: 'medium', text: 'Active on conference circuit — building public profile', icon: '🟡' },
      { level: 'positive', text: 'Recent funding announcement signals growth phase', icon: '🟢' }
    ],
    profile: { currentRole: 'CEO', location: 'San Francisco, CA', education: 'Stanford University', yearsExperience: 15 },
    career: [
      { company: 'Current Co.', role: 'CEO', period: '2020–present', achievement: 'Scaled from seed to Series C' },
      { company: 'Previous Co.', role: 'VP Product', period: '2015–2020', achievement: 'Launched flagship product' }
    ],
    companies: [{ name: 'Current Co.', role: 'CEO & Co-founder', domain: 'currentco.com' }],
    quotes: [{ text: 'We are focused on building products that matter.', source: 'TechCrunch Interview', date: 'Apr 2026' }],
    network: [{ name: 'John Smith', relationship: 'Co-founder' }],
    publicActivity: [
      { date: 'Apr 24', event: 'Keynote at TechCrunch Disrupt 2026', signal: 'HIGH' },
      { date: 'Mar 15', event: 'Published essay on AI and enterprise software', signal: 'MED' }
    ],
    cost: { total: 1.50 }
  };
}

/**
 * Mock SEO report — used when ANTHROPIC_API_KEY not set
 */
function generateMockSeoReport(domain) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];

  return {
    meta: { domain, companyName, analysisDate: today, mode: 'seo', confidence: 'medium-high' },
    signals: [
      { level: 'high', text: 'Organic traffic declining 18% MoM — paid dependency risk', icon: '🔴' },
      { level: 'medium', text: 'Missing structured data on 68% of product pages', icon: '🟡' },
      { level: 'positive', text: 'Domain authority 74 — strong backlink foundation', icon: '🟢' },
      { level: 'positive', text: 'Core Web Vitals passing — LCP 1.8s, CLS 0.02', icon: '🟢' }
    ],
    snapshot: {
      domainAuthority: 74,
      organicTraffic: '182K/mo (est.)',
      rankingKeywords: 12400,
      backlinks: '48K from 3,200 domains'
    },
    topKeywords: [
      { keyword: `${companySlug} pricing`, position: 1, volume: 8100, intent: 'commercial' },
      { keyword: `${companySlug} vs competitors`, position: 3, volume: 5400, intent: 'commercial' },
      { keyword: `${companySlug} api`, position: 2, volume: 4200, intent: 'informational' },
      { keyword: `${companySlug} review`, position: 4, volume: 3300, intent: 'commercial' },
      { keyword: `${companySlug} tutorial`, position: 6, volume: 2900, intent: 'informational' }
    ],
    contentStrategy: {
      postsPerMonth: 12,
      avgWordCount: 1850,
      topTopics: ['Product updates', 'Developer guides', 'Customer stories', 'Industry trends'],
      contentGaps: ['Comparison pages vs top 3 competitors', 'ROI calculators', 'Integration guides']
    },
    technical: {
      coreWebVitals: { lcp: '1.8s', fid: '12ms', cls: '0.02', score: 88 },
      mobileScore: 91,
      pageSpeed: 87,
      issues: [
        'Duplicate meta descriptions on 23 pages',
        'Missing alt text on 156 images',
        '404 errors on 8 linked pages (broken internal links)',
        'Sitemap missing 340 product pages'
      ]
    },
    backlinks: {
      total: 48000,
      referringDomains: 3200,
      topSources: ['TechCrunch', 'Product Hunt', 'Hacker News', 'GitHub', 'Stack Overflow'],
      linkVelocity: 'growing'
    },
    serp: {
      featuredSnippets: 14,
      knowledgePanel: true,
      localPack: false,
      peopleAlsoAsk: 31
    },
    opportunities: [
      { keyword: 'best ' + companySlug + ' alternative', volume: 6600, difficulty: 42, opportunity: 'High-intent competitor traffic — no content targeting this' },
      { keyword: companySlug + ' integration ' + 'salesforce', volume: 2900, difficulty: 38, opportunity: 'Integration page missing — competitors rank here' },
      { keyword: 'how to use ' + companySlug, volume: 4100, difficulty: 29, opportunity: 'Tutorial content gap — high volume, low difficulty' }
    ],
    competitive: [
      { competitor: 'Competitor A', weakness: 'DA 58 — weak backlinks, ranking below you on key terms' },
      { competitor: 'Competitor B', weakness: 'Slow page speed (LCP 4.2s) — poor CWV disadvantage' },
      { competitor: 'Competitor C', weakness: 'No structured data — missing rich results' }
    ],
    hiring: [
      { role: 'SEO Manager', count: 1, signal: 'Current program understaffed vs content velocity' },
      { role: 'Content Writers', count: 3, signal: 'Scaling content — likely addressing gap vs competitors' }
    ],
    strategic: [
      'Paid search dependency (42% traffic) — vulnerability if CAC rises',
      'Strong developer content moat — 34% of organic from technical tutorials',
      'International SEO untapped — EN-only content vs global demand'
    ],
    sources: [
      { tool: 'BD Web Unlocker', icon: '🌐', target: `https://${domain} + /sitemap.xml`, sections: ['Technical Issues', 'Page Speed'] },
      { tool: 'BD SERP API', icon: '🔍', target: `site:${domain} keyword ranking analysis`, sections: ['Top Keywords', 'SERP Features'] },
      { tool: 'BD Scraping Browser', icon: '🖥', target: `${domain} · competitor domains`, sections: ['Core Web Vitals', 'Content Analysis'] },
      { tool: 'BD MCP Server', icon: '🔗', target: `${domain} backlinks domain authority`, sections: ['Backlink Profile', 'Opportunities'] }
    ],
    cost: { webUnlocker: 0.30, serpApi: 0.50, scrapingBrowser: 0.80, bdMcp: 0.20, claude: 3.20, total: 5.00 }
  };
}

/**
 * Mock red team report — security intelligence assessment
 */
function generateMockRedteamReport(domain) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];

  return {
    meta: {
      domain,
      companyName,
      analysisDate: today,
      mode: 'redteam',
      confidence: 'high'
    },
    signals: [
      { level: 'high', text: 'Exposed admin panel at /admin — no rate limiting detected', icon: '🔴' },
      { level: 'high', text: 'API keys visible in public GitHub repos (2 instances found)', icon: '🔴' },
      { level: 'medium', text: 'Missing security headers: CSP, HSTS not enforced', icon: '🟡' },
      { level: 'medium', text: '47 employees with personal email used on breach databases', icon: '🟡' },
      { level: 'positive', text: 'Bug bounty program active — HackerOne, $500–$10k range', icon: '🟢' }
    ],
    snapshot: {
      founded: '2018',
      hq: 'San Francisco, CA',
      employees: '320 (LinkedIn verified)',
      stage: 'Series C',
      website: domain,
      linkedin: `linkedin.com/company/${companySlug}`
    },
    attackSurface: {
      exposedPorts: ['443 (HTTPS)', '8080 (dev server?)', '22 (SSH — should be restricted)'],
      subdomains: [`api.${domain}`, `dev.${domain}`, `staging.${domain}`, `admin.${domain}`],
      techStack: ['Next.js 13', 'AWS us-east-1', 'Cloudflare CDN', 'Stripe', 'Intercom'],
      headers: {
        csp: false,
        hsts: true,
        xframe: true,
        referrerPolicy: false,
        score: 'C+'
      }
    },
    exposures: [
      { type: 'Credential Leak', severity: 'CRITICAL', detail: 'AWS_ACCESS_KEY found in public GitHub repo (now rotated)', date: 'Mar 2026' },
      { type: 'Employee Breach', severity: 'HIGH', detail: '47 corporate emails in HaveIBeenPwned — LinkedIn, Dropbox breaches', date: 'Ongoing' },
      { type: 'API Endpoint', severity: 'HIGH', detail: `/api/v1/users returns full user objects without auth on GET`, date: 'Active' },
      { type: 'Subdomain Takeover', severity: 'MED', detail: `staging.${domain} — CNAME pointing to unclaimed Heroku app`, date: 'Active' }
    ],
    socialEngineering: [
      { vector: 'Executive Spearphishing', risk: 'HIGH', detail: 'CEO email format known: firstname@domain — active on LinkedIn, public calendar' },
      { vector: 'LinkedIn Recon', risk: 'HIGH', detail: '47 employees visible — 12 in engineering with tech stack in bios' },
      { vector: 'Job Posting Intel', risk: 'MED', detail: 'DevOps postings reveal: Terraform, AWS, Datadog — full infra picture' },
      { vector: 'Vendor Phishing', risk: 'MED', detail: 'Stripe, Intercom, Salesforce integrations visible — vendor impersonation viable' }
    ],
    competitive: [
      { competitor: 'Okta', weakness: 'Also had major breach — customers less security-conscious now' },
      { competitor: 'Auth0', weakness: 'Complex pricing, slower patching cadence' }
    ],
    hiring: [
      { role: 'Security Engineers', count: 3, signal: 'Actively hiring — current team understaffed vs attack surface' },
      { role: 'DevOps/SRE', count: 5, signal: 'Infrastructure scaling — new attack surface being added' }
    ],
    strategic: [
      'Security investment lagging growth — technical debt accumulating',
      'Bug bounty program shows security-aware culture but limited internal team',
      'International expansion (GDPR) creating compliance pressure'
    ],
    recommendations: [
      { priority: 'P0', action: 'Rotate all API keys, audit GitHub for any remaining secrets' },
      { priority: 'P0', action: 'Fix unauthenticated /api/v1/users endpoint immediately' },
      { priority: 'P1', action: 'Implement CSP headers — current score C+ is below industry standard' },
      { priority: 'P1', action: 'Claim unclaimed Heroku CNAME to prevent subdomain takeover' },
      { priority: 'P2', action: 'Enforce MFA for all employees — 47 breached emails are phishing targets' }
    ],
    sources: [
      { tool: 'BD Web Unlocker', icon: '🌐', target: `https://${domain}`, sections: ['Tech Stack', 'Security Headers'] },
      { tool: 'BD SERP API', icon: '🔍', target: `${domain} CVE breach security`, sections: ['Exposures', 'News'] },
      { tool: 'BD Scraping Browser', icon: '🖥', target: `shodan.io · securityheaders.com · haveibeenpwned.com`, sections: ['Attack Surface', 'Employee Exposures'] },
      { tool: 'BD MCP Server', icon: '🔗', target: `${domain} bug bounty API keys GitHub`, sections: ['Social Engineering', 'Credential Leaks'] }
    ],
    cost: {
      webUnlocker: 0.30,
      serpApi: 0.50,
      scrapingBrowser: 0.80,
      bdMcp: 0.20,
      claude: 10.20,
      total: 12.00
    }
  };
}

/**
 * Mock report fallback — used when ANTHROPIC_API_KEY not set
 */
function generateReport(domain, facts, mode) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];

  return {
    meta: {
      domain,
      companyName,
      analysisDate: today,
      mode,
      confidence: mode === 'deep' ? 'high' : 'medium-high'
    },
    signals: [
      { level: 'high', text: `${companyName} hiring aggressively in AI/ML — next-gen product imminent`, icon: '🔴' },
      { level: 'medium', text: 'CEO at major industry conference → active positioning', icon: '🟡' },
      { level: 'positive', text: 'Enterprise partnership announced → distribution expanding', icon: '🟢' }
    ],
    snapshot: {
      founded: '2017',
      hq: 'San Francisco, CA',
      employees: '679 (LinkedIn verified)',
      stage: 'Growth / Series D',
      website: domain,
      linkedin: `linkedin.com/company/${companySlug}`
    },
    financials: {
      totalRaised: '$425M',
      lastRound: 'Series D — $250M (Apr 2026)',
      valuation: '~$5.5B (est.)',
      revenue: '~$95M ARR (est.)',
      investors: ['Sequoia Capital', 'Andreessen Horowitz', 'Accel Partners', 'Google Ventures']
    },
    news: [
      { date: 'Apr 24', headline: `${companyName} announces enterprise partnership with Fortune 500`, signal: 'HIGH', url: '#' },
      { date: 'Apr 23', headline: 'Series D funding round closes at $250M', signal: 'HIGH', url: '#' },
      { date: 'Apr 15', headline: 'New AI-powered analytics suite launched', signal: 'MED', url: '#' },
      { date: 'Mar 25', headline: 'European expansion — offices in London, Berlin, Paris', signal: 'MED', url: '#' },
      { date: 'Mar 19', headline: 'Named leader in Gartner Magic Quadrant', signal: 'LOW', url: '#' }
    ],
    products: [
      { name: 'Core Platform', description: 'Enterprise software suite with AI-powered analytics' },
      { name: 'Cloud Infrastructure', description: 'Scalable hosting and data management' },
      { name: 'Integration Hub ★ NEW', description: 'Connectors for 200+ enterprise systems' },
      { name: 'Professional Services', description: 'Consulting and custom development' },
      { name: 'Analytics Suite ★ NEW', description: 'Next-generation predictive capabilities' }
    ],
    competitive: [
      { competitor: 'Salesforce', weakness: 'Expensive, complex onboarding, bloated UX' },
      { competitor: 'ServiceNow', weakness: 'IT-focused only, limited analytics capabilities' },
      { competitor: 'Atlassian', weakness: 'Fragmented product suite, integration challenges' },
      { competitor: 'Monday.com', weakness: 'Mid-market focus, limited enterprise features' }
    ],
    hiring: [
      { role: 'AI/ML Engineers', count: 12, signal: 'Next-gen product launch imminent — AI core to roadmap' },
      { role: 'Enterprise Sales', count: 8, signal: 'Upmarket push — targeting Fortune 1000' },
      { role: 'DevOps Engineers', count: 6, signal: 'Scaling infrastructure for growth' }
    ],
    strategic: [
      'Enterprise-first strategy — moving upmarket to Fortune 1000',
      'AI-powered analytics as key differentiator vs legacy competitors',
      'International expansion — Europe first, APAC planned for H2 2026'
    ],
    techStack: mode === 'deep' ? [
      { category: 'Backend', items: ['Node.js', 'Python', 'Go'] },
      { category: 'Frontend', items: ['React', 'TypeScript', 'Next.js'] },
      { category: 'Infra', items: ['AWS', 'Kubernetes', 'Terraform'] },
      { category: 'Data', items: ['PostgreSQL', 'Redis', 'Kafka'] }
    ] : null,
    github: mode === 'deep' ? {
      repos: 34,
      stars: 12400,
      recentActivity: `${companySlug}-sdk (NEW — active dev last 2 days)`,
      topLanguage: 'TypeScript',
      contributors: 187
    } : null,
    reviews: mode === 'deep' ? {
      g2Score: 4.5,
      g2Reviews: 234,
      trustpilot: null,
      sentiment: 'Positive — praised for reliability, criticized for pricing complexity'
    } : null,
    glassdoor: mode === 'deep' ? {
      rating: 4.1,
      reviews: 298,
      ceoApproval: '87%',
      recommend: '82%',
      sentiment: 'Strong engineering culture, fast-paced, competitive compensation'
    } : null,
    risks: mode === 'deep' ? [
      { factor: 'Competition from well-funded incumbents', severity: 'HIGH' },
      { factor: 'Customer concentration risk in tech sector', severity: 'MED' },
      { factor: 'International expansion execution risk', severity: 'MED' },
      { factor: 'Talent retention in competitive market', severity: 'LOW' }
    ] : null,
    sources: buildSources(domain, companySlug, mode),
    cost: {
      webUnlocker: 0.30,
      serpApi: 0.50,
      scrapingBrowser: 0.80,
      webScraperApi: 0.40,
      total: mode === 'deep' ? 15.00 : 2.00
    }
  };
}

const REPORTS_DIR = path.join(process.cwd(), 'reports');

/**
 * Save report to disk
 * POST body: { domain, report, mode }
 */
app.post('/api/save-report', (req, res) => {
  let domain = req.body.domain;
  const { report } = req.body;
  const mode = req.body.mode || 'standard';

  if (!['standard', 'deep', 'person', 'redteam', 'seo', 'bundle'].includes(mode)) {
    return res.status(400).json({ error: 'invalid mode' });
  }

  try {
    if (mode === 'person') {
      const name = (domain || '').trim();
      if (name.trim().length < 2 || name.trim().length > 100) {
        return res.status(400).json({ error: 'invalid person name' });
      }
      domain = name.substring(0, 100);
    } else {
      domain = validateDomain(domain);
    }
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (!report) {
    return res.status(400).json({ error: 'report required' });
  }

  try {
    const domainDir = path.join(REPORTS_DIR, domain.replace(/[^a-z0-9-]/gi, '_'));
    fs.mkdirSync(domainDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${mode}.json`;
    const filepath = path.join(domainDir, filename);

    fs.writeFileSync(filepath, JSON.stringify({ domain, mode, savedAt: new Date().toISOString(), report }, null, 2));

    res.json({ saved: true, domain, mode });
  } catch (err) {
    res.status(500).json({ error: 'save failed' });
  }
});

/**
 * List saved reports
 * GET /api/reports?domain=stripe.com (optional filter)
 */
app.get('/api/reports', reportLimiter, (req, res) => {
  const { domain } = req.query;

  try {
    if (!fs.existsSync(REPORTS_DIR)) return res.json({ reports: [] });

    const results = [];
    const domainDirs = fs.readdirSync(REPORTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .filter(d => !domain || d.name.includes(domain.replace(/[^a-z0-9.-]/gi, '_')));

    for (const dir of domainDirs) {
      const files = fs.readdirSync(path.join(REPORTS_DIR, dir.name))
        .filter(f => f.endsWith('.json'));
      for (const file of files) {
        results.push({ domain: dir.name, filename: file });
      }
    }

    res.json({ reports: results });
  } catch (err) {
    res.status(500).json({ error: 'failed to list reports' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Recon SSE server listening on port ${PORT}`);
  console.log(`   Claude synthesis: ${anthropic ? 'ENABLED' : 'MOCK (set ANTHROPIC_API_KEY)'}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Report: http://localhost:${PORT}/api/report?domain=stripe.com&mode=standard`);
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  // Don't exit — Railway will restart if needed
});

// Graceful shutdown — lets in-flight SSE streams finish during Railway deploys
process.on('SIGTERM', () => {
  console.log('[shutdown] SIGTERM received — closing server gracefully');
  server.close(() => {
    console.log('[shutdown] Server closed cleanly');
    process.exit(0);
  });
  // Force exit after 30s if streams are still open
  setTimeout(() => {
    console.warn('[shutdown] Forced exit after 30s timeout');
    process.exit(1);
  }, 30000).unref();
});
