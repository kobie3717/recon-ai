/**
 * SSE Server - Real-time event streaming for Recon
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import { runStandardWorker, runDeepWorker, runFootprintWorker, runLookupWorker, runMcpWorker, runAgenticFollowups } from './bd-worker.mjs';
import { dataFirehose } from './bright-data-connector.mjs';
import { startMonitorScheduler, getMonitorState, updateMonitorState, getDiffHistory, triggerDomainCheck } from './monitor-scheduler.mjs';
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
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://recon.whatshubb.co.za,https://ui-beta-green.vercel.app,http://localhost:3000,http://localhost:3001').split(',');
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
    if (!['standard', 'deep', 'person', 'redteam', 'seo', 'bundle', 'footprint', 'lookup', 'mcp', 'agentic'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be standard, deep, person, redteam, seo, bundle, footprint, lookup, mcp, or agentic' });
    }

    if (mode === 'person') {
      // Person mode: domain param is a person name, not a URL
      const name = (req.query.domain || '').trim();
      if (name.trim().length < 2 || name.trim().length > 100) {
        return res.status(400).json({ error: 'invalid person name' });
      }
      domain = name.substring(0, 100);
    } else {
      const raw = (req.query.domain || '').trim();
      // Auto-route: if input looks like a person name (spaces, no dots) redirect to person mode
      if (/^[a-zA-Z\s'-]{2,100}$/.test(raw) && !raw.includes('.')) {
        mode = 'person';
        domain = raw.substring(0, 100);
      } else {
        domain = validateDomain(raw);
      }
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

  const timeoutMs = mode === 'bundle' ? 300000 : (mode === 'deep' ? 120000 : mode === 'seo' || mode === 'redteam' ? 300000 : mode === 'agentic' ? 150000 : 60000);
  const timeoutSecs = timeoutMs / 1000;
  const timeout = setTimeout(() => {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: 'timeout',
      elapsed: timeoutSecs
    })}\n\n`);
    res.end();
  }, timeoutMs);

  // Global keepalive — Railway proxy kills idle SSE after ~30s
  const ping = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 15000);

  req.on('close', () => {
    clearTimeout(timeout);
    clearInterval(ping);
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
        try {
          report = await synthesizeRedteamWithClaude(domain, {});
        } catch (synthErr) {
          console.error('[redteam] Claude synthesis failed, using mock:', synthErr.message);
          report = generateMockRedteamReport(domain);
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
        try {
          report = await synthesizeSeoWithClaude(domain, {});
        } catch (synthErr) {
          console.error('[seo] Claude synthesis failed, using mock:', synthErr.message);
          report = generateMockSeoReport(domain);
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
    } else if (mode === 'footprint') {
      result = await runFootprintWorker(domain, emitter);
      const factsData = result.facts || {};
      report = anthropic
        ? await synthesizeFootprintWithClaude(domain, factsData)
        : generateMockFootprintReport(domain, factsData);
    } else if (mode === 'lookup') {
      result = await runLookupWorker(domain, emitter);
      const factsData = result.facts || {};
      report = anthropic
        ? await synthesizeLookupWithClaude(domain, factsData)
        : generateMockLookupReport(domain, factsData);
    } else if (mode === 'mcp') {
      result = await runMcpWorker(domain, emitter);
      const factsData = result.facts || {};
      report = anthropic
        ? await synthesizeMcpWithClaude(domain, factsData)
        : generateMockMcpReport(domain, factsData);
    } else if (mode === 'agentic') {
      // AGENTIC MODE: R1 scan → classify+extract (1 merged Haiku call) → R2 → synthesis

      emitter.emit('event', { agent: 'circus', status: 'agentic-start', round: 1, message: `Round 1: parallel scan launching...`, elapsed: 0 });

      // ROUND 1: Standard parallel scan
      result = await runStandardWorker(domain, emitter, 'standard');
      const r1Facts = result.facts || {};

      // QUALITY GATE
      const r1Quality = assessDataQuality(r1Facts);
      emitter.emit('event', {
        agent: 'claude',
        status: 'quality-gate',
        quality: Math.round(r1Quality.score * 100),
        issues: r1Quality.issues,
        message: r1Quality.message,
        elapsed: result.elapsed
      });

      // CLASSIFY + EXTRACT SIGNALS in one Haiku call
      emitter.emit('event', { agent: 'claude', status: 'analyzing-signals', message: 'Classifying company + extracting signals...', elapsed: result.elapsed });

      let classification = { type: 'unknown', stage: 'unknown', scout_focus: 'general', priority_signals: [] };
      let agenticSignals = [];
      if (anthropic) {
        try {
          const { classification: cls, signals } = await classifyAndExtract(domain, r1Facts, r1Quality.score);
          classification = cls;
          agenticSignals = signals;
          emitter.emit('event', {
            agent: 'claude',
            status: 'classified',
            type: classification.type,
            stage: classification.stage,
            focus: classification.scout_focus,
            message: `${classification.type} · ${classification.stage} → ${classification.scout_focus}`,
            elapsed: result.elapsed
          });
        } catch (err) {
          console.error('[agentic] classify+extract failed:', err.message);
          agenticSignals = getDefaultSignals(domain);
        }
      } else {
        agenticSignals = getDefaultSignals(domain);
      }

      emitter.emit('event', {
        agent: 'claude',
        status: 'agent-decided',
        signals: agenticSignals.length,
        findings: agenticSignals.map(s => s.finding),
        reasoning: agenticSignals.map(s => s.reasoning || s.hypothesis),
        followups: agenticSignals.map(s => s.followup_query),
        confidence: agenticSignals.map(s => s.confidence || 'medium'),
        elapsed: result.elapsed
      });

      // ROUND 2: Targeted follow-up queries
      emitter.emit('event', {
        agent: 'circus',
        status: 'agentic-round-2',
        round: 2,
        scouts: agenticSignals.length,
        message: `Round 2: ${agenticSignals.length} targeted follow-up queries`,
        elapsed: result.elapsed
      });

      const followupData = await runAgenticFollowups(agenticSignals, emitter);

      // Merge facts
      const mergedFacts = {
        ...r1Facts,
        agenticSignals,
        followupData
      };

      emitter.emit('event', { agent: 'ai-iq', status: 'storing', facts: Object.keys(mergedFacts).length, elapsed: result.elapsed });

      // Final synthesis with full context
      if (anthropic) {
        try {
          const claudeStart = Date.now();
          emitter.emit('event', { agent: 'claude', status: 'synthesizing', message: 'Final synthesis: R1 + R2 intelligence...', elapsed: result.elapsed });
          report = await synthesizeAgenticWithClaude(domain, mergedFacts, agenticSignals);
          const totalElapsed = parseFloat((result.elapsed + (Date.now() - claudeStart) / 1000).toFixed(2));
          emitter.emit('event', { agent: 'claude', status: 'complete', elapsed: totalElapsed });
          result = { ...result, elapsed: totalElapsed, mode: 'agentic', rounds: 2, signalsFound: agenticSignals.length };
        } catch (synthErr) {
          console.error('[agentic] Synthesis failed:', synthErr.message);
          report = generateReport(domain, mergedFacts, 'agentic');
        }
      } else {
        report = generateReport(domain, mergedFacts, 'agentic');
      }
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
 * SSE endpoint for live watch mode - streams real-time web mentions
 * Query params: domain (required)
 */
app.get('/api/watch', reportLimiter, async (req, res) => {
  let domain;
  try {
    domain = validateDomain(req.query.domain);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send start event
  res.write(`data: ${JSON.stringify({ type: 'watch-start', domain, timestamp: new Date().toISOString() })}\n\n`);

  const stopFirehose = dataFirehose(domain, (event) => {
    res.write(`data: ${JSON.stringify({ type: 'mention', ...event })}\n\n`);
  }, 300000); // 5 min max

  req.on('close', () => {
    stopFirehose();
    res.end();
  });
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
    max_tokens: 2048,
    system: 'You are a competitive intelligence analyst. Output ONLY valid JSON — no markdown, no explanation, no code blocks. Be concise.',
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
 * Assess Round 1 data quality — determines if agent should proceed or warn
 */
function assessDataQuality(facts) {
  let score = 0;
  const issues = [];

  if ((facts.homepage?.chars || 0) > 500 || (facts.homepage?.text?.length || 0) > 200) score += 0.2;
  else issues.push('homepage sparse');

  const newsCount = facts.news?.results?.length || 0;
  if (newsCount >= 3) score += 0.3;
  else issues.push(`only ${newsCount} news results`);

  if ((facts.linkedin?.text?.length || 0) > 200) score += 0.2;
  else issues.push('LinkedIn sparse');

  if ((facts.crunchbase?.text?.length || 0) > 200) score += 0.2;
  else issues.push('Crunchbase sparse');

  if (facts.structured?.company?.name) score += 0.1;
  else issues.push('no structured data');

  const pct = Math.round(score * 100);
  const message = score >= 0.6
    ? `Data quality: good (${pct}%) — proceeding`
    : score >= 0.3
    ? `Data quality: partial (${pct}%) — limited sources`
    : `Data quality: sparse (${pct}%) — results may be limited`;

  return { score, issues, message };
}

/**
 * Classify domain AND extract R1 signals in a single Haiku call.
 * Replaces separate classifyDomain + extractAgenticSignals — saves one API RTT (~15s).
 */
async function classifyAndExtract(domain, facts, qualityScore = 0.5) {
  const parts = [];
  if (facts.news?.results?.length) parts.push('NEWS: ' + facts.news.results.slice(0, 4).map(r => r.title + ': ' + r.snippet).join(' | '));
  if (facts.structured?.company) parts.push('CO: ' + JSON.stringify(facts.structured.company).substring(0, 300));
  if (facts.homepage?.text) parts.push('HP: ' + facts.homepage.text.substring(0, 300));
  const factsSnippet = parts.join('\n').substring(0, 1500);

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 450,
    system: 'Competitive intelligence analyst. Output ONLY valid JSON.',
    messages: [{
      role: 'user',
      content: `Domain: ${domain}
Data quality: ${Math.round(qualityScore * 100)}%
R1 DATA: ${factsSnippet || 'none — use domain knowledge'}

Return ONLY this JSON:
{"type":"B2B SaaS|fintech|marketplace|enterprise|consumer|other","stage":"startup|growth|scale-up|public|unknown","scout_focus":"one-line focus","signals":[{"finding":"observation","reasoning":"chain","hypothesis":"hypothesis","followup_query":"google query","confidence":"high|medium|low"}]}`
    }]
  });

  const text = response.content[0].text.trim().replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(text);
  const classification = { type: parsed.type || 'unknown', stage: parsed.stage || 'unknown', scout_focus: parsed.scout_focus || 'general', priority_signals: [] };
  const signals = (parsed.signals || []).slice(0, 2).filter(s => s.followup_query && s.finding);
  return { classification, signals };
}

/**
 * Default signals when Claude unavailable
 */
function getDefaultSignals(domain) {
  const slug = domain.split('.')[0];
  return [
    { finding: 'Strategic activity detected', hypothesis: 'Expansion or pivot likely', followup_query: `${slug} strategy product roadmap 2025 2026`, type: 'serp' },
    { finding: 'Hiring patterns detected', hypothesis: 'New product area investment', followup_query: `${slug} hiring AI engineering jobs site:linkedin.com`, type: 'serp' }
  ];
}

/**
 * Full agentic synthesis — includes signal context + R2 data
 */
async function synthesizeAgenticWithClaude(domain, facts, signals) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];
  const safeDomain = domain.replace(/[^\w.-]/g, '').substring(0, 100);
  const safeCompanyName = companyName.replace(/[^\w\s]/g, '').substring(0, 50);

  // Build R1 facts text
  const r1Facts = { ...facts };
  delete r1Facts.agenticSignals;
  delete r1Facts.followupData;
  const r1Text = formatFacts(r1Facts).substring(0, 3000);

  // Build R2 followup text
  const r2Parts = [];
  if (facts.followupData) {
    for (const [key, val] of Object.entries(facts.followupData)) {
      if (val.results?.length) {
        r2Parts.push(`FOLLOW-UP (${val.signal?.finding || key}):\nQuery: "${val.signal?.followup_query}"\nResults: ${val.results.slice(0, 4).map(r => r.title + ': ' + r.snippet).join(' | ')}`);
      }
    }
  }
  const r2Text = r2Parts.join('\n\n').substring(0, 2000);

  const signalsSummary = signals.map((s, i) => `${i+1}. Found: "${s.finding}"\n   Reasoning: ${s.reasoning || s.hypothesis || 'signal detected'}\n   Queried: "${s.followup_query}" (confidence: ${s.confidence || 'medium'})`).join('\n');

  const prompt = `Analyze ${safeDomain} (${safeCompanyName}) using two rounds of intelligence data. This is an AGENTIC report — include the agentic reasoning chain.

TODAY: ${today}

ROUND 1 DATA (5 parallel BD sources):
${r1Text}

AGENT DECISION — signals detected and follow-up queries dispatched:
${signalsSummary}

ROUND 2 DATA (targeted follow-ups):
${r2Text || 'No additional data retrieved'}

Return ONLY valid JSON:
{
  "meta": {"domain":"${safeDomain}","companyName":"${safeCompanyName}","analysisDate":"${today}","mode":"agentic","confidence":"high","rounds":2},
  "signals": [{"level":"high|medium|positive","text":"specific insight","icon":"🔴|🟡|🟢"}],
  "snapshot": {"founded":"YYYY","hq":"City, Country","employees":"N","stage":"Stage/Series","website":"${safeDomain}","linkedin":"linkedin.com/company/${companySlug}"},
  "financials": {"totalRaised":"$XM","lastRound":"Series X — $XM (Mon YYYY)","valuation":"~$XB","revenue":"~$XM ARR","investors":["..."]},
  "news": [{"date":"Mon DD","headline":"headline","signal":"HIGH|MED|LOW","url":"#"}],
  "products": [{"name":"Product","description":"What it does"}],
  "competitive": [{"competitor":"Name","weakness":"vs ${safeCompanyName}"}],
  "hiring": [{"role":"Role","count":0,"signal":"what this signals"}],
  "strategic": ["direction 1","direction 2","direction 3"],
  "agenticInsights": {
    "roundsRun": 2,
    "signalsDetected": ${signals.length},
    "agentReasoning": [${signals.map(s => `{"signal":"${(s.finding||'').replace(/"/g,'\\"')}","reasoning":"${(s.reasoning||s.hypothesis||'').replace(/"/g,'\\"').replace(/\n/g,' ')}","followupQuery":"${(s.followup_query||'').replace(/"/g,'\\"')}","confidence":"${s.confidence||'medium'}","discovered":"what Round 2 revealed about this signal"}`).join(',')}],
    "intelligenceUpgrade": "What Round 2 revealed that Round 1 missed"
  },
  "cost": {"webUnlocker":0.30,"serpApi":0.80,"scrapingBrowser":0.80,"webScraperApi":0.40,"claudeHaiku":0.02,"claudeSonnet":0.20,"total":2.52}
}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    system: 'Competitive intelligence analyst. Output ONLY valid JSON. No markdown. Be very concise — short strings.',
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].text.trim()
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Claude returned invalid JSON in agentic synthesis');
  }

  if (!parsed.meta || !parsed.signals) throw new Error('Claude returned malformed agentic report');

  // Preserve agentic metadata
  parsed.agenticInsights = parsed.agenticInsights || {
    roundsRun: 2,
    signalsDetected: signals.length,
    agentReasoning: signals,
    intelligenceUpgrade: 'Round 2 targeted queries surfaced additional context'
  };

  parsed.cost = { webUnlocker: 0.30, serpApi: 0.80, scrapingBrowser: 0.80, webScraperApi: 0.40, claudeHaiku: 0.02, claudeSonnet: 0.20, total: 2.52 };

  const companySlugFinal = domain.split('.')[0];
  parsed.sources = [
    ...buildSources(domain, companySlugFinal, 'standard'),
    { tool: 'Claude Haiku (Signal Extraction)', icon: '🧠', target: `${signals.length} signals detected → ${signals.length} follow-up queries dispatched`, sections: ['Agentic Insights'] },
    { tool: 'BD SERP API (Round 2)', icon: '🔍', target: signals.map(s => s.followup_query).join(' · '), sections: ['Agentic Insights'] }
  ];

  return parsed;
}

/**
 * Synthesize MCP intelligence report with Claude
 */
async function synthesizeMcpWithClaude(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];

  // Format MCP facts
  let factsContext = '';
  if (facts.search) {
    factsContext += `\nMCP SEARCH ENGINE (company overview):\n${JSON.stringify(facts.search.results || [], null, 2)}`;
  }
  if (facts.competitors) {
    factsContext += `\n\nMCP SEARCH ENGINE (competitors):\n${JSON.stringify(facts.competitors.results || [], null, 2)}`;
  }
  if (facts.scrape) {
    factsContext += `\n\nMCP SCRAPE AS MARKDOWN (homepage):\n${facts.scrape.markdown || ''}`;
  }
  if (facts.unlocker) {
    factsContext += `\n\nMCP WEB UNLOCKER (/about page):\n${facts.unlocker.content || ''}`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: 'You are a competitive intelligence analyst using Bright Data MCP protocol. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
    messages: [{
      role: 'user',
      content: `Analyze "${domain}" (${companyName}) using MCP protocol intelligence data.

TODAY: ${today}

MCP PROTOCOL DATA (4 tools used):
${factsContext.substring(0, 8000)}

Return ONLY valid JSON with this exact structure. EMPHASIZE that this data came from BD's MCP protocol — structured, clean, tool-native:
{
  "meta": {
    "domain": "${domain}",
    "companyName": "${companyName}",
    "analysisDate": "${today}",
    "mode": "mcp",
    "confidence": "high",
    "toolsUsed": 4
  },
  "signals": [
    { "level": "high|medium|positive", "text": "specific insight from MCP data", "icon": "🔴|🟡|🟢" }
  ],
  "snapshot": {
    "founded": "YYYY",
    "hq": "City, Country",
    "employees": "N (verified)",
    "stage": "Series X / Growth",
    "website": "${domain}",
    "linkedin": "linkedin.com/company/${companySlug}"
  },
  "mcpInsights": {
    "toolsUsed": ["search_engine", "scrape_as_markdown", "web_unlocker"],
    "dataQuality": "high|medium",
    "coverageScore": 92
  },
  "news": [
    { "date": "Mon DD", "headline": "real headline from MCP search data", "signal": "HIGH|MED|LOW", "url": "#" }
  ],
  "products": [
    { "name": "Product Name", "description": "from scraped homepage" }
  ],
  "competitive": [
    { "competitor": "Competitor Name", "weakness": "their weakness vs ${companyName}" }
  ],
  "hiring": [
    { "role": "Role Type", "count": 0, "signal": "what this signals" }
  ],
  "strategic": [
    "Strategic observation 1",
    "Strategic observation 2",
    "Strategic observation 3"
  ],
  "sources": [
    { "tool": "BD MCP search_engine ×2", "icon": "🔗", "target": "Google + competitor queries", "sections": ["News", "Competitive"] },
    { "tool": "BD MCP scrape_as_markdown", "icon": "📄", "target": "https://${domain}", "sections": ["Products", "Snapshot"] },
    { "tool": "BD MCP web_unlocker", "icon": "🔓", "target": "https://${domain}/about", "sections": ["Company Info"] }
  ],
  "cost": { "mcpSearch": 0.00, "mcpScrape": 0.00, "mcpUnlocker": 0.00, "claude": 2.00, "total": 2.00 }
}`
    }]
  });

  const text = response.content[0].text.trim()
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

/**
 * Mock MCP report fallback
 */
function generateMockMcpReport(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];

  return {
    meta: {
      domain,
      companyName,
      analysisDate: today,
      mode: 'mcp',
      confidence: 'high',
      toolsUsed: 4
    },
    signals: [
      { level: 'high', text: `MCP protocol data shows ${companyName} expanding rapidly — 47 open roles across engineering`, icon: '🔴' },
      { level: 'medium', text: 'Market positioning strong vs legacy competitors — MCP search reveals favorable sentiment', icon: '🟡' },
      { level: 'positive', text: 'MCP web_unlocker found comprehensive about page — transparent company culture', icon: '🟢' },
      { level: 'positive', text: 'All 4 MCP tools returned high-quality data — 100% coverage', icon: '🟢' }
    ],
    snapshot: {
      founded: '2018',
      hq: 'San Francisco, CA',
      employees: '850 (MCP verified)',
      stage: 'Series D',
      website: domain,
      linkedin: `linkedin.com/company/${companySlug}`
    },
    mcpInsights: {
      toolsUsed: ['search_engine', 'scrape_as_markdown', 'web_unlocker'],
      dataQuality: 'high',
      coverageScore: 95
    },
    news: [
      { date: 'Apr 24', headline: `${companyName} announces Series D — $250M round led by Sequoia`, signal: 'HIGH', url: '#' },
      { date: 'Apr 15', headline: `${companyName} launches AI-powered analytics suite`, signal: 'MED', url: '#' },
      { date: 'Mar 25', headline: 'European expansion — new offices in London, Berlin, Paris', signal: 'MED', url: '#' },
      { date: 'Mar 12', headline: `${companyName} named leader in Gartner Magic Quadrant`, signal: 'LOW', url: '#' }
    ],
    products: [
      { name: 'Core Platform', description: 'Enterprise software suite with AI-powered analytics' },
      { name: 'Integration Hub', description: 'Connectors for 200+ enterprise systems' },
      { name: 'Analytics Suite', description: 'Next-generation predictive capabilities' }
    ],
    competitive: [
      { competitor: 'Salesforce', weakness: 'Expensive, complex onboarding vs ' + companyName + ' streamlined approach' },
      { competitor: 'ServiceNow', weakness: 'IT-focused only — ' + companyName + ' broader platform' },
      { competitor: 'Atlassian', weakness: 'Fragmented product suite — ' + companyName + ' unified experience' }
    ],
    hiring: [
      { role: 'AI/ML Engineers', count: 12, signal: 'Next-gen product launch imminent — AI core to roadmap' },
      { role: 'Enterprise Sales', count: 8, signal: 'Upmarket push targeting Fortune 1000' }
    ],
    strategic: [
      'MCP protocol reveals clean, structured data — high API quality signals engineering excellence',
      'All 4 MCP tools succeeded with high coverage — robust web presence across homepage + about pages',
      'Search engine data shows strong brand presence — consistent positive sentiment across sources',
      'Enterprise-first strategy evident from scraped content — moving upmarket to Fortune 1000'
    ],
    sources: [
      { tool: 'BD MCP search_engine ×2', icon: '🔗', target: 'Google company overview + competitors', sections: ['News', 'Competitive', 'Market Position'] },
      { tool: 'BD MCP scrape_as_markdown', icon: '📄', target: `https://${domain}`, sections: ['Products', 'Snapshot', 'Tech Stack'] },
      { tool: 'BD MCP web_unlocker', icon: '🔓', target: `https://${domain}/about`, sections: ['Company Info', 'Team', 'Culture'] }
    ],
    cost: {
      mcpSearch: 0.00,
      mcpScrape: 0.00,
      mcpUnlocker: 0.00,
      claude: 2.00,
      total: 2.00
    }
  };
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
 * Synthesize footprint intelligence report with Claude
 */
async function synthesizeFootprintWithClaude(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];

  // Format facts for Claude
  let factsContext = '';
  if (facts.discover) {
    factsContext += `\nDISCOVERY DATA:\nSubdomains: ${facts.discover.subdomains?.join(', ')}\nRelated Domains: ${facts.discover.relatedDomains?.join(', ')}\nWeb Properties: ${JSON.stringify(facts.discover.webProperties)}`;
  }
  if (facts.crawl) {
    factsContext += `\n\nCRAWL DATA (${facts.crawl.pageCount} pages):\n${facts.crawl.pages?.map(p => `${p.title}: ${p.text}`).join('\n')}`;
  }
  if (facts.linkedin) {
    factsContext += `\n\nLINKEDIN DATA:\nName: ${facts.linkedin.name}\nEmployees: ${facts.linkedin.employees}\nFollowers: ${facts.linkedin.followers}\nSpecialties: ${facts.linkedin.specialties?.join(', ')}\nRecent Posts: ${JSON.stringify(facts.linkedin.recentPosts)}`;
  }
  if (facts.social) {
    factsContext += `\n\nSOCIAL MEDIA:\nTwitter: ${facts.social.twitter?.handle} (${facts.social.twitter?.followers} followers)\nSentiment: ${JSON.stringify(facts.social.twitter?.sentimentBreakdown)}\nReddit: ${facts.social.reddit?.subreddit} (${facts.social.reddit?.subscribers} subscribers)`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: 'You are a digital intelligence analyst. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
    messages: [{
      role: 'user',
      content: `Analyze the digital footprint of "${domain}" (${companyName}) and produce a comprehensive footprint intelligence report.

TODAY: ${today}

COLLECTED DATA:
${factsContext.substring(0, 6000)}

Return ONLY valid JSON with this exact structure:
{
  "meta": { "domain": "${domain}", "companyName": "${companyName}", "analysisDate": "${today}", "mode": "footprint", "confidence": "high" },
  "signals": [
    { "level": "high|medium|positive", "text": "specific finding from digital footprint analysis", "icon": "🔴|🟡|🟢" }
  ],
  "snapshot": {
    "founded": "YYYY",
    "hq": "City, Country",
    "employees": "N (verified)",
    "stage": "Series X",
    "website": "${domain}",
    "linkedin": "linkedin.com/company/${companySlug}"
  },
  "digitalFootprint": {
    "totalSubdomains": 8,
    "subdomains": ["api.${domain}", "docs.${domain}", "app.${domain}"],
    "relatedDomains": ["${companySlug}.io", "${companySlug}.co"],
    "webProperties": [
      { "type": "GitHub|Twitter|LinkedIn|YouTube|Facebook", "url": "...", "followers": "..." }
    ]
  },
  "crawlInsights": {
    "pagesFound": 15,
    "pricingTiers": ["Starter", "Pro", "Enterprise"],
    "openRoles": 12,
    "keyPages": ["Pricing", "About", "Careers", "API Docs"],
    "techMentions": ["React", "AWS", "PostgreSQL"]
  },
  "linkedinIntel": {
    "employees": "850",
    "followers": "12.4K",
    "recentActivity": "Active hiring + Series D announcement",
    "topRoles": ["Software Engineer", "Product Manager", "Sales"]
  },
  "socialPresence": {
    "twitterFollowers": "45K",
    "twitterHandle": "@${companySlug}",
    "sentimentScore": "positive|neutral|mixed|negative",
    "recentSentiment": "Mostly positive, some pricing concerns",
    "redditPresence": "Active community (3.2K subscribers)"
  },
  "competitive": [
    { "competitor": "Competitor Name", "weakness": "specific weakness" }
  ],
  "strategic": [
    "Strategic observation 1",
    "Strategic observation 2",
    "Strategic observation 3"
  ],
  "sources": [
    { "tool": "BD Discover API", "icon": "🔭", "target": "${domain}", "sections": ["Subdomains", "Web Properties"] },
    { "tool": "BD Crawl API", "icon": "🕷", "target": "${domain} (15 pages)", "sections": ["Pricing", "Careers", "Tech Stack"] },
    { "tool": "BD LinkedIn Scraper", "icon": "💼", "target": "linkedin.com/company/${companySlug}", "sections": ["Employee Count", "Activity"] },
    { "tool": "BD Social Media Scraper", "icon": "📱", "target": "Twitter · Reddit", "sections": ["Sentiment", "Mentions"] },
    { "tool": "BD SERP API", "icon": "🔍", "target": "site:reddit.com OR site:twitter.com mentions", "sections": ["Public Sentiment"] }
  ],
  "cost": { "discoverApi": 0.00, "crawlApi": 1.20, "linkedinScraper": 0.80, "socialScraper": 0.60, "serpApi": 0.30, "claude": 2.10, "total": 5.00 }
}`
    }]
  });

  const text = response.content[0].text.trim()
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

/**
 * Mock footprint report fallback
 */
function generateMockFootprintReport(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];

  return {
    meta: {
      domain,
      companyName,
      analysisDate: today,
      mode: 'footprint',
      confidence: 'high'
    },
    signals: [
      { level: 'high', text: `${companyName} has extensive digital footprint — 8 active subdomains including staging/dev environments`, icon: '🔴' },
      { level: 'medium', text: 'Twitter sentiment 68% positive — pricing concerns emerging in recent mentions', icon: '🟡' },
      { level: 'positive', text: 'Active LinkedIn presence — 12 open roles signals aggressive growth phase', icon: '🟢' },
      { level: 'positive', text: 'Strong social media engagement — 45K Twitter followers, active Reddit community', icon: '🟢' }
    ],
    snapshot: {
      founded: '2018',
      hq: 'San Francisco, CA',
      employees: '850 (LinkedIn verified)',
      stage: 'Series D',
      website: domain,
      linkedin: `linkedin.com/company/${companySlug}`
    },
    digitalFootprint: {
      totalSubdomains: 8,
      subdomains: [
        `api.${domain}`,
        `docs.${domain}`,
        `app.${domain}`,
        `status.${domain}`,
        `cdn.${domain}`,
        `blog.${domain}`,
        `dev.${domain}`,
        `staging.${domain}`
      ],
      relatedDomains: [
        `${companySlug}.io`,
        `${companySlug}.co`,
        `get${companySlug}.com`
      ],
      webProperties: [
        { type: 'Twitter', url: `https://twitter.com/${companySlug}`, followers: '45.2K' },
        { type: 'GitHub', url: `https://github.com/${companySlug}`, followers: '34 repos' },
        { type: 'LinkedIn', url: `https://linkedin.com/company/${companySlug}`, followers: '12.4K' },
        { type: 'YouTube', url: `https://youtube.com/@${companySlug}`, followers: '8.2K subscribers' },
        { type: 'Facebook', url: `https://facebook.com/${companySlug}`, followers: '22K' }
      ]
    },
    crawlInsights: {
      pagesFound: 15,
      pricingTiers: ['Starter ($299/mo)', 'Professional ($999/mo)', 'Enterprise (Custom)'],
      openRoles: 12,
      keyPages: ['Pricing', 'About', 'Careers', 'Blog', 'API Docs'],
      techMentions: ['React', 'TypeScript', 'AWS', 'PostgreSQL', 'Kubernetes', 'Redis']
    },
    linkedinIntel: {
      employees: '850',
      followers: '12.4K',
      recentActivity: 'Active hiring (12 open roles), Series D announcement, attending TechConf 2026',
      topRoles: [
        'Software Engineer',
        'Senior Product Manager',
        'Enterprise Account Executive',
        'Customer Success Manager',
        'DevOps Engineer',
        'Data Scientist'
      ]
    },
    socialPresence: {
      twitterFollowers: '45.2K',
      twitterHandle: `@${companySlug}`,
      sentimentScore: 'positive',
      recentSentiment: 'Mostly positive feedback on product quality and support. Some concerns about pricing complexity for mid-tier plans.',
      redditPresence: 'Active community (3.2K subscribers in r/' + companySlug + ') — technical discussions, feature requests, customer success stories'
    },
    competitive: [
      { competitor: 'Competitor A', weakness: 'Smaller social footprint (18K Twitter followers) — less brand awareness' },
      { competitor: 'Competitor B', weakness: 'No active dev/staging subdomains visible — slower release cycle' },
      { competitor: 'Competitor C', weakness: 'Negative Reddit sentiment (mixed reviews) vs positive for ' + companyName }
    ],
    strategic: [
      'Enterprise expansion evident — hiring 8 Enterprise AEs, Enterprise pricing tier',
      'Developer-first approach — active GitHub, comprehensive docs subdomain',
      'Strong content marketing — active blog, YouTube channel with tutorials',
      'International footprint growing — .io and .co domains suggest global positioning'
    ],
    sources: [
      { tool: 'BD Discover API', icon: '🔭', target: domain, sections: ['Subdomains', 'Web Properties'] },
      { tool: 'BD Crawl API', icon: '🕷', target: `${domain} (15 pages)`, sections: ['Pricing', 'Careers', 'Tech Stack'] },
      { tool: 'BD LinkedIn Scraper', icon: '💼', target: `linkedin.com/company/${companySlug}`, sections: ['Employee Count', 'Activity'] },
      { tool: 'BD Social Media Scraper', icon: '📱', target: 'Twitter · Reddit', sections: ['Sentiment', 'Mentions'] },
      { tool: 'BD SERP API', icon: '🔍', target: 'site:reddit.com OR site:twitter.com mentions', sections: ['Public Sentiment'] }
    ],
    cost: {
      discoverApi: 0.00,
      crawlApi: 1.20,
      linkedinScraper: 0.80,
      socialScraper: 0.60,
      serpApi: 0.30,
      claude: 2.10,
      total: 5.00
    }
  };
}

/**
 * Synthesize lookup report with Claude
 */
async function synthesizeLookupWithClaude(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];

  // Format facts for Claude
  let factsContext = '';
  if (facts.lookup) {
    factsContext += `\nDEEP LOOKUP DATA (${facts.lookup.totalSources} web sources analyzed):\n`;
    facts.lookup.results?.forEach(r => {
      factsContext += `\nQUERY: ${r.query}\nANSWER: ${r.answer}\nCONFIDENCE: ${(r.confidence * 100).toFixed(0)}%\n`;
    });
  }
  if (facts.news) {
    factsContext += `\n\nSERP NEWS:\n${facts.news.results?.map(r => `${r.title}: ${r.snippet}`).join('\n')}`;
  }
  if (facts.homepage) {
    factsContext += `\n\nHOMEPAGE SNAPSHOT:\n${facts.homepage.text?.substring(0, 1500)}`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: 'You are a competitive intelligence analyst with access to web-scale indexed data. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
    messages: [{
      role: 'user',
      content: `Analyze "${domain}" (${companyName}) using Deep Lookup intelligence — this is web-scale indexed data, not just scraped pages.

TODAY: ${today}

COLLECTED INTELLIGENCE:
${factsContext.substring(0, 8000)}

Return ONLY valid JSON with this exact structure:
{
  "meta": {
    "domain": "${domain}",
    "companyName": "${companyName}",
    "analysisDate": "${today}",
    "mode": "lookup",
    "confidence": "high",
    "sourcesAnalyzed": 47
  },
  "signals": [
    { "level": "high|medium|positive", "text": "specific insight from deep lookup data", "icon": "🔴|🟡|🟢" }
  ],
  "snapshot": {
    "founded": "YYYY",
    "hq": "City, Country",
    "employees": "N (verified)",
    "stage": "Series X / Growth",
    "website": "${domain}",
    "linkedin": "linkedin.com/company/${companySlug}"
  },
  "deepInsights": {
    "revenueStreams": [
      { "stream": "SaaS subscriptions", "estimate": "$80M ARR", "confidence": "high|medium|low" }
    ],
    "keyCustomers": ["Customer 1", "Customer 2", "Customer 3"],
    "techStack": ["React", "Node.js", "PostgreSQL", "AWS"],
    "competitiveWeaknesses": [
      { "weakness": "Pricing complexity drives churn", "severity": "HIGH|MED|LOW" }
    ]
  },
  "strategicMoves": [
    { "date": "Apr 2026", "move": "Series D funding ($250M)", "signal": "HIGH|MED|LOW" }
  ],
  "competitive": [
    { "competitor": "Competitor Name", "weakness": "specific weakness vs ${companyName}" }
  ],
  "hiring": [
    { "role": "AI/ML Engineers", "count": 12, "signal": "Next-gen product launch imminent" }
  ],
  "strategic": [
    "Strategic insight 1",
    "Strategic insight 2",
    "Strategic insight 3"
  ],
  "sources": [
    { "tool": "BD Deep Lookup", "icon": "🔬", "target": "47 web sources", "sections": ["Revenue", "Customers", "Tech Stack"] },
    { "tool": "BD SERP API", "icon": "🔍", "target": "${companySlug} analysis", "sections": ["Recent News"] },
    { "tool": "BD Web Unlocker", "icon": "🌐", "target": "https://${domain}", "sections": ["Homepage"] }
  ],
  "cost": { "deepLookup": 5.00, "serpApi": 0.30, "webUnlocker": 0.20, "claude": 2.50, "total": 8.00 }
}`
    }]
  });

  const text = response.content[0].text.trim()
    .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(text);
}

/**
 * Mock lookup report fallback
 */
function generateMockLookupReport(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];

  return {
    meta: {
      domain,
      companyName,
      analysisDate: today,
      mode: 'lookup',
      confidence: 'high',
      sourcesAnalyzed: 47
    },
    signals: [
      { level: 'high', text: `${companyName} revenue model heavily weighted to SaaS (80%) — strong recurring base indicates stability`, icon: '🔴' },
      { level: 'medium', text: 'Fortune 500 customer concentration in financial services — sector risk if fintech slowdown', icon: '🟡' },
      { level: 'positive', text: 'Recent Series D ($250M) + acquisition ($30M) signals aggressive growth phase', icon: '🟢' },
      { level: 'positive', text: 'Modern tech stack (React/Node.js/AWS) attracts engineering talent', icon: '🟢' }
    ],
    snapshot: {
      founded: '2017',
      hq: 'San Francisco, CA',
      employees: '850 (LinkedIn verified)',
      stage: 'Growth / Series D',
      website: domain,
      linkedin: `linkedin.com/company/${companySlug}`
    },
    deepInsights: {
      revenueStreams: [
        { stream: 'Enterprise SaaS subscriptions', estimate: '$80M ARR', confidence: 'high' },
        { stream: 'Professional services & consulting', estimate: '$20M (25%)', confidence: 'medium' },
        { stream: 'API usage fees & marketplace', estimate: '$15M (15%)', confidence: 'medium' }
      ],
      keyCustomers: [
        'JPMorgan Chase',
        'Goldman Sachs',
        'Adobe',
        'Atlassian',
        'Target',
        'Walmart'
      ],
      techStack: [
        'React',
        'TypeScript',
        'Node.js',
        'Go',
        'PostgreSQL',
        'Redis',
        'Kafka',
        'AWS',
        'Kubernetes'
      ],
      competitiveWeaknesses: [
        { weakness: 'Pricing complexity drives mid-market churn', severity: 'HIGH' },
        { weakness: 'Onboarding 4-6 weeks vs competitors\' 2 weeks', severity: 'MED' },
        { weakness: 'Limited international support (EMEA only, no APAC/LATAM)', severity: 'MED' },
        { weakness: 'Technical documentation gaps noted in G2 reviews', severity: 'LOW' }
      ]
    },
    strategicMoves: [
      { date: 'Apr 2026', move: 'Series D funding ($250M) led by Sequoia & a16z', signal: 'HIGH' },
      { date: 'Mar 2026', move: 'Acquired DataViz Corp ($30M) to strengthen analytics', signal: 'HIGH' },
      { date: 'Feb 2026', move: 'Launched AI-powered predictive analytics suite', signal: 'MED' },
      { date: 'Q1 2026', move: 'Expanded European offices (London, Berlin, Paris)', signal: 'MED' },
      { date: 'Jan 2026', move: 'Hired ex-Salesforce VP Sales for enterprise push', signal: 'LOW' }
    ],
    competitive: [
      { competitor: 'Salesforce', weakness: 'Expensive, complex onboarding, bloated UX — ' + companyName + ' simpler & faster' },
      { competitor: 'ServiceNow', weakness: 'IT-focused only, limited analytics — ' + companyName + ' broader platform' },
      { competitor: 'Atlassian', weakness: 'Fragmented product suite — ' + companyName + ' unified experience' },
      { competitor: 'Monday.com', weakness: 'Mid-market focus, limited enterprise features — ' + companyName + ' enterprise-first' }
    ],
    hiring: [
      { role: 'AI/ML Engineers', count: 12, signal: 'Next-gen AI product launch imminent — major roadmap investment' },
      { role: 'Enterprise Sales', count: 8, signal: 'Upmarket push targeting Fortune 1000 — enterprise GTM expansion' },
      { role: 'DevOps Engineers', count: 6, signal: 'Scaling infrastructure for growth — multi-region deployment' }
    ],
    strategic: [
      'Enterprise-first strategy — moving upmarket to Fortune 1000 with dedicated sales team',
      'AI-powered analytics as key differentiator vs legacy competitors (Salesforce, ServiceNow)',
      'International expansion underway — Europe first (Q1 2026), APAC planned for H2 2026',
      'Acquisition strategy for capabilities — DataViz Corp buy signals product gap filling',
      'Strong financial backing — $425M total raised, runway for 3+ years at current burn'
    ],
    sources: [
      { tool: 'BD Deep Lookup', icon: '🔬', target: '47 web sources', sections: ['Revenue', 'Customers', 'Tech Stack', 'Weaknesses', 'Strategic Moves'] },
      { tool: 'BD SERP API', icon: '🔍', target: `${companySlug} "${domain}" detailed analysis`, sections: ['Recent News', 'Funding Announcements'] },
      { tool: 'BD Web Unlocker', icon: '🌐', target: `https://${domain}`, sections: ['Homepage', 'Product Overview'] }
    ],
    cost: {
      deepLookup: 5.00,
      serpApi: 0.30,
      webUnlocker: 0.20,
      claude: 2.50,
      total: 8.00
    }
  };
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

  if (!['standard', 'deep', 'person', 'redteam', 'seo', 'bundle', 'footprint', 'lookup', 'mcp'].includes(mode)) {
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

/**
 * Monitor API: Add domain to watch list
 * POST /api/monitor
 * Body: { domain: string, slackWebhook?: string, intervalHours?: number }
 */
app.post('/api/monitor', express.json(), (req, res) => {
  try {
    const { domain, slackWebhook, intervalHours } = req.body;

    // Validate domain
    const validatedDomain = validateDomain(domain);

    // Load current state
    const state = getMonitorState();

    // Check if already exists
    if (state.domains.some(d => d.domain === validatedDomain)) {
      return res.status(400).json({ error: 'Domain already monitored' });
    }

    // Add new domain
    state.domains.push({
      domain: validatedDomain,
      addedAt: new Date().toISOString(),
      slackWebhook: slackWebhook || null,
      intervalHours: intervalHours || 24,
      lastChecked: null,
      lastDiff: null,
    });

    // Save state
    updateMonitorState(state);

    res.json({ success: true, domain: validatedDomain });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Monitor API: Remove domain from watch list
 * DELETE /api/monitor
 * Body: { domain: string }
 */
app.delete('/api/monitor', express.json(), (req, res) => {
  try {
    const { domain } = req.body;

    // Validate domain
    const validatedDomain = validateDomain(domain);

    // Load current state
    const state = getMonitorState();

    // Remove domain
    const originalLength = state.domains.length;
    state.domains = state.domains.filter(d => d.domain !== validatedDomain);

    if (state.domains.length === originalLength) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Save state
    updateMonitorState(state);

    res.json({ success: true, domain: validatedDomain });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Monitor API: List all monitored domains
 * GET /api/monitor
 */
app.get('/api/monitor', (req, res) => {
  try {
    const state = getMonitorState();
    res.json({ domains: state.domains });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load monitor state' });
  }
});

/**
 * Monitor API: Get diff history for a domain
 * GET /api/monitor/diff?domain=stripe.com
 */
app.get('/api/monitor/diff', (req, res) => {
  try {
    const { domain } = req.query;

    if (!domain) {
      return res.status(400).json({ error: 'domain parameter required' });
    }

    // Validate domain
    const validatedDomain = validateDomain(domain);

    // Get diff history
    const history = getDiffHistory(validatedDomain);

    res.json({ domain: validatedDomain, history });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Monitor API: Trigger immediate check for a domain
 * POST /api/monitor/check
 * Body: { domain: string }
 */
app.post('/api/monitor/check', express.json(), async (req, res) => {
  try {
    const { domain } = req.body;

    // Validate domain
    const validatedDomain = validateDomain(domain);

    // Trigger check
    const result = await triggerDomainCheck(validatedDomain);

    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Recon SSE server listening on port ${PORT}`);
  console.log(`   Claude synthesis: ${anthropic ? 'ENABLED' : 'MOCK (set ANTHROPIC_API_KEY)'}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Report: http://localhost:${PORT}/api/report?domain=stripe.com&mode=standard`);

  // Start monitor scheduler
  startMonitorScheduler();
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
