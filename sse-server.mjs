/**
 * SSE Server - Real-time event streaming for Recon
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import { runStandardWorker, runDeepWorker, runFootprintWorker, runLookupWorker, runMcpWorker, runAgenticFollowups, runRedteamWorker, runSeoWorker } from './bd-worker.mjs';
import { dataFirehose, serpApi, scrapingBrowser } from './bright-data-connector.mjs';
import { startMonitorScheduler, getMonitorState, updateMonitorState, getDiffHistory, triggerDomainCheck } from './monitor-scheduler.mjs';
import { createClaudeClient, calculateClaudeCost as adapterCalculateClaudeCost } from './claude-adapter.mjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Warn on startup about missing optional env vars (fail fast on critical ones)
if (!process.env.ANTHROPIC_API_KEY && process.env.USE_CLAUDE_CLI !== 'on') {
  console.warn('[startup] ANTHROPIC_API_KEY not set — running in mock mode');
}
if (!process.env.BD_API_KEY) {
  console.warn('[startup] BD_API_KEY not set — Bright Data calls will fail');
}

// Log Claude backend mode at startup
const claudeBackend = process.env.USE_CLAUDE_CLI === 'on' ? 'CLI (Max OAuth)' : 'API (SDK)';
console.log(`[recon] Claude backend: ${claudeBackend}`);

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

// Claude client — adapter routes to CLI (USE_CLAUDE_CLI=on) or SDK (default)
const anthropic = createClaudeClient();

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

  // nocache=1 bypasses both in-memory and flagship caches (for testing grounding)
  const nocacheParam = req.query.nocache === '1';

  // AI-IQ cache check — instant replay if seen before
  const cacheKey = `${domain}:${mode}`;
  const cached = reportCache.get(cacheKey);
  if (!nocacheParam && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
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

  // PRE-RECORDED FLAGSHIP REPLAY — check if we have cached events
  const nocache = nocacheParam;
  if (!nocache) {
    const flagshipPath = path.join(process.cwd(), 'cache', 'flagship', `${domain}-${mode}.json`);
    if (fs.existsSync(flagshipPath)) {
      try {
        const recording = JSON.parse(fs.readFileSync(flagshipPath, 'utf-8'));
        console.log(`[replay] ${domain}/${mode}: serving from flagship cache (${recording.eventCount} events)`);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const SPEEDUP = 5;
        const replayStart = Date.now();
        const timeouts = [];

        // Emit replay header
        res.write(`data: ${JSON.stringify({
          type: 'cached-replay',
          speed: SPEEDUP,
          recorded: recording.recordedAt,
          domain,
          mode
        })}\n\n`);

        // Schedule all events
        recording.events.forEach((evt, idx) => {
          const delay = evt.ts / SPEEDUP;
          const tid = setTimeout(() => {
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify(evt.data)}\n\n`);

              // Close after last event
              if (idx === recording.events.length - 1) {
                setTimeout(() => res.end(), 50);
              }
            }
          }, delay);
          timeouts.push(tid);
        });

        // Keep ping alive during replay
        const ping = setInterval(() => {
          if (!res.writableEnded) res.write(': ping\n\n');
        }, 15000);
        timeouts.push(ping);

        // Clean up on client disconnect
        req.on('close', () => {
          timeouts.forEach(t => clearTimeout(t));
          clearInterval(ping);
        });

        return;
      } catch (replayErr) {
        console.error(`[replay] ${domain}/${mode}: failed to load cache:`, replayErr.message);
        // Fall through to live path
      }
    }
  }

  // Set SSE headers for fresh run
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const emitter = new EventEmitter();

  emitter.on('event', (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  const timeoutMs = mode === 'bundle' ? 300000 : (mode === 'deep' ? 120000 : mode === 'seo' || mode === 'redteam' ? 300000 : mode === 'agentic' ? 150000 : 240000);
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
      // Person search mode - REAL BD scrape
      const personName = domain; // domain param contains person name for person mode
      const startTime = Date.now();
      const personElapsed = () => parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

      emitter.emit('event', { agent: '007-bot', status: 'received', domain: personName, elapsed: 0 });
      await new Promise(r => setTimeout(r, 50));

      const facts = {};

      // REAL BD SERP search
      const serpQuery = `"${personName}" CEO OR founder OR executive`;
      emitter.emit('event', { agent: 'bd-serp', status: 'searching', query: serpQuery, elapsed: personElapsed() });
      let serpResults;
      try {
        serpResults = await serpApi(serpQuery);
        facts.search = serpResults;
        emitter.emit('event', { agent: 'bd-serp', status: 'complete', results: serpResults.results.length, elapsed: personElapsed() });
      } catch (err) {
        emitter.emit('event', { agent: 'bd-serp', status: 'error', reason: err.message.slice(0, 120), elapsed: personElapsed() });
        serpResults = { results: [] };
      }

      // REAL BD Scraping Browser - scrape top 3 SERP results (NOT LinkedIn - gated on trial)
      const topUrls = serpResults.results.slice(0, 3).map(r => r.link || r.url).filter(Boolean);
      if (topUrls.length > 0) {
        emitter.emit('event', { agent: 'bd-scraping-browser', status: 'launching', urls: topUrls, elapsed: personElapsed() });
        try {
          const scrapedPages = await scrapingBrowser(topUrls);
          facts.scraped = scrapedPages;
          emitter.emit('event', { agent: 'bd-scraping-browser', status: 'complete', pages: scrapedPages.length, elapsed: personElapsed() });
        } catch (err) {
          emitter.emit('event', { agent: 'bd-scraping-browser', status: 'partial', reason: err.message.slice(0, 120), elapsed: personElapsed() });
          facts.scraped = [];
        }
      } else {
        emitter.emit('event', { agent: 'bd-scraping-browser', status: 'skipped', reason: 'no SERP results to scrape', elapsed: personElapsed() });
        facts.scraped = [];
      }

      emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: personElapsed() });

      if (anthropic) {
        const synthResult = await synthesizePersonWithClaude(personName, facts);
        report = synthResult.report;
        const claudeCost = calculateClaudeCost(synthResult.usage, undefined, synthResult);
        report.cost = { serpApi: 0.50, scrapingBrowser: 0.80, claude: claudeCost, total: parseFloat((1.30 + claudeCost).toFixed(2)) };
      } else {
        throw new Error('ANTHROPIC_API_KEY not configured — synthesis unavailable');
      }

      const elapsed = (Date.now() - startTime) / 1000;

      result = { elapsed, domain: personName, mode: 'person' };
    } else if (mode === 'redteam') {
      const startTime = Date.now();
      emitter.emit('event', { agent: '007-bot', status: 'received', domain, elapsed: 0 });
      await new Promise(r => setTimeout(r, 50));
      emitter.emit('event', { agent: 'circus', status: 'routing', elapsed: 0.05 });

      const workerResult = await runRedteamWorker(domain, emitter, 'redteam');
      emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: workerResult.elapsed });

      if (anthropic) {
        const synthResult = await synthesizeRedteamWithClaude(domain, workerResult.facts);
        report = synthResult.report;
        const claudeCost = calculateClaudeCost(synthResult.usage, undefined, synthResult);
        const costBreakdown = { ...workerResult.costBreakdown, claude: claudeCost };
        const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);
        costBreakdown.total = parseFloat(totalCost.toFixed(2));
        report.cost = costBreakdown;
        result = { elapsed: (Date.now() - startTime) / 1000, domain, mode: 'redteam', cost: costBreakdown.total, costBreakdown };
      } else {
        throw new Error('ANTHROPIC_API_KEY not configured — synthesis unavailable');
      }

      emitter.emit('event', { agent: '007-bot', status: 'complete', elapsed: (Date.now() - startTime) / 1000, cost: result.cost });

      // Check BD health
      if (workerResult.bdHealth && workerResult.bdHealth.failed > 0) {
        report.meta = report.meta || {};
        report.meta.degraded = true;
        report.meta.bdStatus = workerResult.bdHealth.ok === 0 ? 'unavailable' : 'partial';
        report.meta.bdOk = workerResult.bdHealth.ok;
        report.meta.bdFailed = workerResult.bdHealth.failed;
        report.meta.bdErrors = workerResult.bdHealth.errors.slice(0, 5);
      }
    } else if (mode === 'seo') {
      const startTime = Date.now();
      emitter.emit('event', { agent: '007-bot', status: 'received', domain, elapsed: 0 });
      await new Promise(r => setTimeout(r, 50));
      emitter.emit('event', { agent: 'circus', status: 'routing', elapsed: 0.05 });

      const workerResult = await runSeoWorker(domain, emitter, 'seo');
      emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: workerResult.elapsed });

      if (anthropic) {
        const synthResult = await synthesizeSeoWithClaude(domain, workerResult.facts);
        report = synthResult.report;
        const claudeCost = calculateClaudeCost(synthResult.usage, undefined, synthResult);
        const costBreakdown = { ...workerResult.costBreakdown, claude: claudeCost };
        const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);
        costBreakdown.total = parseFloat(totalCost.toFixed(2));
        report.cost = costBreakdown;
        result = { elapsed: (Date.now() - startTime) / 1000, domain, mode: 'seo', cost: costBreakdown.total, costBreakdown };
      } else {
        throw new Error('ANTHROPIC_API_KEY not configured — synthesis unavailable');
      }

      emitter.emit('event', { agent: '007-bot', status: 'complete', elapsed: (Date.now() - startTime) / 1000, cost: result.cost });

      // Check BD health
      if (workerResult.bdHealth && workerResult.bdHealth.failed > 0) {
        report.meta = report.meta || {};
        report.meta.degraded = true;
        report.meta.bdStatus = workerResult.bdHealth.ok === 0 ? 'unavailable' : 'partial';
        report.meta.bdOk = workerResult.bdHealth.ok;
        report.meta.bdFailed = workerResult.bdHealth.failed;
        report.meta.bdErrors = workerResult.bdHealth.errors.slice(0, 5);
      }
    } else if (mode === 'bundle') {
      const startTime = Date.now();
      const bElapsed = () => parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

      emitter.emit('event', { agent: '007-bot', status: 'received', domain, elapsed: 0 });
      await new Promise(r => setTimeout(r, 200));
      emitter.emit('event', { agent: 'circus', status: 'routing', elapsed: 0.2 });
      await new Promise(r => setTimeout(r, 100));

      // Run all BD agents once — shared facts for all 3 synthesis calls
      // Get facts from standard worker with real event streaming
      // Use a filter emitter to suppress 007-bot/circus events (we handle those at bundle level)
      const { EventEmitter: EE } = await import('events');
      const filterEmitter = new EE();
      filterEmitter.on('event', (evt) => {
        // Pass through all BD agent events, but suppress 007-bot/circus events
        // (we emit those at bundle level with correct total cost)
        if (evt.agent !== '007-bot' && evt.agent !== 'circus') {
          emitter.emit('event', evt);
        }
      });

      let facts = {};
      try {
        const workerResult = await runStandardWorker(domain, filterEmitter, 'standard');
        facts = workerResult.facts || {};
      } catch (e) {
        console.error('[bundle] facts collection failed:', e.message);
      }

      emitter.emit('event', { agent: 'ai-iq', status: 'storing', facts: Object.keys(facts).length, elapsed: bElapsed() });
      await new Promise(r => setTimeout(r, 200));

      // Synthesize all 3 in parallel
      emitter.emit('event', { agent: 'claude', status: 'synthesizing', task: 'standard intelligence', elapsed: bElapsed() });

      if (!anthropic) {
        throw new Error('ANTHROPIC_API_KEY not configured — bundle mode requires synthesis');
      }

      const [standardResult, seoResult, redteamResult] = await Promise.all([
        synthesizeWithClaude(domain, facts, 'standard'),
        synthesizeSeoWithClaude(domain, facts),
        synthesizeRedteamWithClaude(domain, facts),
      ]);
      emitter.emit('event', { agent: 'claude', status: 'complete', elapsed: bElapsed() });

      // Calculate dynamic costs
      const standardClaudeCost = calculateClaudeCost(standardResult.usage);
      const seoClaudeCost = calculateClaudeCost(seoResult.usage);
      const redteamClaudeCost = calculateClaudeCost(redteamResult.usage);
      const totalClaudeCost = standardClaudeCost + seoClaudeCost + redteamClaudeCost;

      // BD agent costs (run once, shared across all 3 reports)
      const costBreakdown = {
        webUnlocker: 0.30,
        serpApi: 0.50,
        scrapingBrowser: 0.80,
        bdMcp: 0.20,
        claude: parseFloat(totalClaudeCost.toFixed(4))
      };
      const totalCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);
      costBreakdown.total = parseFloat(totalCost.toFixed(2));

      const elapsed = (Date.now() - startTime) / 1000;

      // Final completion event with total cost
      emitter.emit('event', { agent: '007-bot', status: 'complete', elapsed: bElapsed(), cost: costBreakdown.total });

      report = {
        standard: standardResult.report,
        seo: seoResult.report,
        redteam: redteamResult.report,
        meta: { domain, mode: 'bundle', analysisDate: new Date().toISOString().split('T')[0] }
      };
      result = { elapsed, domain, mode: 'bundle', cost: costBreakdown.total, costBreakdown };
    } else if (mode === 'footprint') {
      result = await runFootprintWorker(domain, emitter);
      const factsData = result.facts || {};
      if (anthropic) {
        const synthResult = await synthesizeFootprintWithClaude(domain, factsData);
        report = synthResult.report;
        const claudeCost = calculateClaudeCost(synthResult.usage, undefined, synthResult);
        report.cost = { ...result.costBreakdown, claude: claudeCost, total: parseFloat((result.cost - (result.costBreakdown?.claude || 0) + claudeCost).toFixed(2)) };
      } else {
        throw new Error('ANTHROPIC_API_KEY not configured — synthesis unavailable');
      }
      // Check BD health
      if (result.bdHealth && result.bdHealth.failed > 0) {
        report.meta = report.meta || {};
        report.meta.degraded = true;
        report.meta.bdStatus = result.bdHealth.ok === 0 ? 'unavailable' : 'partial';
        report.meta.bdOk = result.bdHealth.ok;
        report.meta.bdFailed = result.bdHealth.failed;
        report.meta.bdErrors = result.bdHealth.errors.slice(0, 5);
      }
    } else if (mode === 'lookup') {
      result = await runLookupWorker(domain, emitter);
      const factsData = result.facts || {};
      if (anthropic) {
        const synthResult = await synthesizeLookupWithClaude(domain, factsData);
        report = synthResult.report;
        const claudeCost = calculateClaudeCost(synthResult.usage, undefined, synthResult);
        report.cost = { ...result.costBreakdown, claude: claudeCost, total: parseFloat((result.cost - (result.costBreakdown?.claude || 0) + claudeCost).toFixed(2)) };
      } else {
        throw new Error('ANTHROPIC_API_KEY not configured — synthesis unavailable');
      }
      // Check BD health
      if (result.bdHealth && result.bdHealth.failed > 0) {
        report.meta = report.meta || {};
        report.meta.degraded = true;
        report.meta.bdStatus = result.bdHealth.ok === 0 ? 'unavailable' : 'partial';
        report.meta.bdOk = result.bdHealth.ok;
        report.meta.bdFailed = result.bdHealth.failed;
        report.meta.bdErrors = result.bdHealth.errors.slice(0, 5);
      }
    } else if (mode === 'mcp') {
      result = await runMcpWorker(domain, emitter);
      const factsData = result.facts || {};
      if (anthropic) {
        const synthResult = await synthesizeMcpWithClaude(domain, factsData);
        report = synthResult.report;
        const claudeCost = calculateClaudeCost(synthResult.usage, undefined, synthResult);
        report.cost = { bdMcp: 0.20, claude: claudeCost, total: parseFloat((0.20 + claudeCost).toFixed(2)) };
      } else {
        throw new Error('ANTHROPIC_API_KEY not configured — synthesis unavailable');
      }
      // Check BD health
      if (result.bdHealth && result.bdHealth.failed > 0) {
        report.meta = report.meta || {};
        report.meta.degraded = true;
        report.meta.bdStatus = result.bdHealth.ok === 0 ? 'unavailable' : 'partial';
        report.meta.bdOk = result.bdHealth.ok;
        report.meta.bdFailed = result.bdHealth.failed;
        report.meta.bdErrors = result.bdHealth.errors.slice(0, 5);
      }
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
        const claudeStart = Date.now();
        emitter.emit('event', { agent: 'claude', status: 'synthesizing', message: 'Final synthesis: R1 + R2 intelligence...', elapsed: result.elapsed });
        const synthResult = await synthesizeAgenticWithClaude(domain, mergedFacts, agenticSignals);
        report = synthResult.report;
        const claudeCost = calculateClaudeCost(synthResult.usage, undefined, synthResult);
        // Agentic mode uses Haiku for signal extraction (~$0.02) + Sonnet for synthesis
        const haikusCost = 0.02;
        report.cost = { ...result.costBreakdown, claudeHaiku: haikusCost, claudeSonnet: claudeCost, total: parseFloat((result.cost - (result.costBreakdown?.claude || 0) + haikusCost + claudeCost).toFixed(2)) };
        const totalElapsed = parseFloat((result.elapsed + (Date.now() - claudeStart) / 1000).toFixed(2));
        emitter.emit('event', { agent: 'claude', status: 'complete', elapsed: totalElapsed });
        result = { ...result, elapsed: totalElapsed, mode: 'agentic', rounds: 2, signalsFound: agenticSignals.length };
      } else {
        throw new Error('ANTHROPIC_API_KEY not configured — synthesis unavailable');
      }
      // Check BD health
      if (result.bdHealth && result.bdHealth.failed > 0) {
        report.meta = report.meta || {};
        report.meta.degraded = true;
        report.meta.bdStatus = result.bdHealth.ok === 0 ? 'unavailable' : 'partial';
        report.meta.bdOk = result.bdHealth.ok;
        report.meta.bdFailed = result.bdHealth.failed;
        report.meta.bdErrors = result.bdHealth.errors.slice(0, 5);
      }
    } else if (mode === 'deep') {
      result = await runDeepWorker(domain, emitter);
      const factsData = result.facts || result.scouts || {};
      if (anthropic) {
        const claudeStart = Date.now();
        emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: result.elapsed });
        const synthResult = await synthesizeWithClaude(domain, factsData, mode);
        report = synthResult.report;
        const claudeCost = calculateClaudeCost(synthResult.usage, undefined, synthResult);
        report.cost = { ...result.costBreakdown, claude: claudeCost, total: parseFloat((result.cost - (result.costBreakdown?.claude || 0) + claudeCost).toFixed(2)) };
        emitter.emit('event', { agent: 'claude', status: 'complete', elapsed: parseFloat((result.elapsed + (Date.now() - claudeStart) / 1000).toFixed(2)) });
      } else {
        throw new Error('ANTHROPIC_API_KEY not configured — synthesis unavailable');
      }
      // Check BD health
      if (result.bdHealth && result.bdHealth.failed > 0) {
        report.meta = report.meta || {};
        report.meta.degraded = true;
        report.meta.bdStatus = result.bdHealth.ok === 0 ? 'unavailable' : 'partial';
        report.meta.bdOk = result.bdHealth.ok;
        report.meta.bdFailed = result.bdHealth.failed;
        report.meta.bdErrors = result.bdHealth.errors.slice(0, 5);
      }
    } else {
      // PROGRESSIVE SYNTHESIS: Start synthesis when partial facts ready, not after all agents complete
      let synthResult = null;
      let synthPromise = null;
      const claudeStart = Date.now();

      // Start worker — it will return a promise and also populate facts object progressively
      const workerPromise = runStandardWorker(domain, emitter, mode);

      // Listen for partial facts signal from worker to start synthesis early
      const synthListener = (evt) => {
        if (evt.agent === 'orchestrator' && evt.status === 'facts-partial' && !synthPromise && anthropic) {
          emitter.emit('event', { agent: 'claude', status: 'synthesizing', message: 'Early-start synthesis on partial facts', elapsed: evt.elapsed });
          // Start synthesis NOW — facts object in worker is already populated with fast agent results
          // The worker result will have the facts object which is being mutated in real-time
          synthPromise = (async () => {
            // Wait for worker to complete so we have the facts reference
            const workerResult = await workerPromise;
            const factsData = workerResult.facts || {};
            return await synthesizeWithClaude(domain, factsData, mode, emitter);
          })();
        }
      };
      emitter.on('event', synthListener);

      // Wait for worker to complete
      result = await workerPromise;
      emitter.off('event', synthListener);

      const factsData = result.facts || result.scouts || {};

      if (anthropic) {
        // If synthesis didn't start early (orchestrator event missed), start it now
        if (!synthPromise) {
          emitter.emit('event', { agent: 'claude', status: 'synthesizing', elapsed: result.elapsed });
          synthPromise = synthesizeWithClaude(domain, factsData, mode, emitter);
        }

        synthResult = await synthPromise;
        report = synthResult.report;
        const claudeCost = calculateClaudeCost(synthResult.usage, undefined, synthResult);
        report.cost = { ...result.costBreakdown, claude: claudeCost, total: parseFloat((result.cost - (result.costBreakdown?.claude || 0) + claudeCost).toFixed(2)) };
        const totalElapsed = parseFloat((result.elapsed + (Date.now() - claudeStart) / 1000).toFixed(2));
        emitter.emit('event', { agent: 'claude', status: 'complete', elapsed: totalElapsed });
      } else {
        throw new Error('ANTHROPIC_API_KEY not configured — synthesis unavailable');
      }
      // Check BD health
      if (result.bdHealth && result.bdHealth.failed > 0) {
        report.meta = report.meta || {};
        report.meta.degraded = true;
        report.meta.bdStatus = result.bdHealth.ok === 0 ? 'unavailable' : 'partial';
        report.meta.bdOk = result.bdHealth.ok;
        report.meta.bdFailed = result.bdHealth.failed;
        report.meta.bdErrors = result.bdHealth.errors.slice(0, 5);
      }
    }

    clearTimeout(timeout);

    // Store screenshot if available (BD MCP browser capture)
    if (result.facts?.browserCapture?.screenshot_b64 && result.facts.browserCapture.screenshot_b64.length > 100) {
      try {
        const timestamp = Date.now();
        const screenshotDir = '/tmp/recon-screenshots';
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

        const safeDomain = domain.replace(/[^a-z0-9.-]/gi, '_');
        const filename = `${safeDomain}-${timestamp}.png`;
        const filepath = path.join(screenshotDir, filename);

        // Decode base64 to binary
        const buffer = Buffer.from(result.facts.browserCapture.screenshot_b64, 'base64');
        fs.writeFileSync(filepath, buffer);

        // Add relative URL to report
        if (report.pricingCapture) {
          report.pricingCapture.screenshot_url = `/screenshots/${filename}`;
          report.pricingCapture.screenshot_path = filepath;
        }

        console.log(`[screenshot] Saved ${filename} (${Math.round(buffer.length / 1024)}KB)`);
      } catch (screenshotErr) {
        console.error('[screenshot] Failed to save:', screenshotErr.message);
      }
    }

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
    clearInterval(ping);

    console.error(`[${mode}] Report generation failed for ${domain}:`, error.message);

    // Emit explicit error event - never return fake data
    emitter.emit('event', {
      type: 'synthesis-error',
      message: `Synthesis failed: ${error.message}`,
      domain,
      mode,
      elapsed: 0
    });

    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: process.env.NODE_ENV === 'production' ? 'Synthesis failed — please retry' : `Synthesis failed: ${error.message}`,
      domain,
      mode
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
    let report;
    if (anthropic) {
      const synthResult = await synthesizeWithClaude(domain, facts, mode);
      report = synthResult.report;
    } else {
      report = generateReport(domain, facts || {}, mode);
    }
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
  const sourceUrls = []; // Collect all URLs for evidence tracking

  if (facts.homepage) {
    const url = facts.homepage.url || `https://${facts.homepage.domain || 'unknown'}`;
    sourceUrls.push(url);
    parts.push(`HOMEPAGE (BD Web Unlocker):\nURL: ${url}\n${facts.homepage.text || facts.homepage.content || ''}`);
  }
  if (facts.news) {
    const results = facts.news.results || [];
    parts.push(`NEWS (BD SERP API):\n${results.map(r => {
      if (r.link) sourceUrls.push(r.link);
      return `- ${r.title}: ${r.snippet} [${r.date || ''}]\n  URL: ${r.link || 'N/A'}`;
    }).join('\n')}`);
  }
  if (facts.discover) {
    const results = facts.discover.results || [];
    const formatted = results.slice(0, 10).map((r, i) => {
      if (r.link) sourceUrls.push(r.link);
      const score = r.relevance_score ? `[score ${r.relevance_score.toFixed(2)}]` : '';
      const desc = (r.description || '').substring(0, 200);
      return `  ${i + 1}. ${score} ${r.title}\n     ${r.link}\n     ${desc}`;
    }).join('\n\n');
    parts.push(`DISCOVER API (intent-ranked sources, BD Discover):\n${formatted}`);
  }
  if (facts.crawl) {
    const pages = facts.crawl.pages || [];
    const formatted = pages.map((page, i) => {
      if (page.url) sourceUrls.push(page.url);
      const preview = (page.markdown || '').substring(0, 400).replace(/\n+/g, ' ');
      return `  ${i + 1}. ${page.url}\n     ${preview}${preview.length >= 400 ? '...' : ''}`;
    }).join('\n\n');
    parts.push(`CRAWLED SITE PAGES (via BD scrape_batch, multi-page harvest):\n${formatted}`);
  }
  if (facts.linkedin) {
    const url = facts.linkedin.url || 'https://linkedin.com';
    sourceUrls.push(url);
    parts.push(`LINKEDIN (BD Scraping Browser):\nURL: ${url}\n${facts.linkedin.text || facts.linkedin.content || ''}`);
  }
  if (facts.crunchbase) {
    const url = facts.crunchbase.url || 'https://crunchbase.com';
    sourceUrls.push(url);
    parts.push(`CRUNCHBASE (BD Scraping Browser):\nURL: ${url}\n${facts.crunchbase.text || facts.crunchbase.content || ''}`);
  }
  if (facts.structured) {
    parts.push(`STRUCTURED DATA (BD Web Scraper API):\n${JSON.stringify(facts.structured, null, 2)}`);
  }
  if (facts.datasets) {
    const linkedinData = facts.datasets.linkedin || [];
    if (linkedinData.length > 0) {
      const formatted = linkedinData.map(record => {
        return `Company: ${record.company_name || 'N/A'}
        Domain: ${record.company_url || record.domain || 'N/A'}
        Employees: ${record.employees || 'N/A'}
        Employee Growth: ${record.employee_growth || 'N/A'}
        Industry: ${record.industry || 'N/A'}
        Founded: ${record.founded || 'N/A'}
        Headquarters: ${record.headquarters || record.hq || 'N/A'}
        Funding: ${record.funding_total || record.total_funding_usd || 'N/A'}
        Revenue Range: ${record.revenue_range || 'N/A'}`;
      }).join('\n\n');
      parts.push(`PRE-COLLECTED DATASETS (BD Datasets API - LinkedIn Company):\n${formatted}`);
    }
  }
  if (facts.browserCapture) {
    const textPreview = (facts.browserCapture.dom_text || '').substring(0, 600);
    const hasScreenshot = facts.browserCapture.screenshot_b64 ? 'Yes' : 'No';
    parts.push(`PRICING PAGE CAPTURE (BD MCP Browser - ${facts.browserCapture.url}):\nScreenshot: ${hasScreenshot}\nVisible Text:\n${textPreview}${textPreview.length >= 600 ? '...' : ''}`);
  }
  if (facts.geoIntel) {
    const sections = [];
    if (facts.geoIntel.chatgpt) sections.push(`ChatGPT:\n${facts.geoIntel.chatgpt.substring(0, 600)}`);
    if (facts.geoIntel.grok) sections.push(`Grok:\n${facts.geoIntel.grok.substring(0, 600)}`);
    if (facts.geoIntel.perplexity) sections.push(`Perplexity:\n${facts.geoIntel.perplexity.substring(0, 600)}`);
    if (sections.length > 0) {
      parts.push(`AI PERCEPTION (BD MCP Geo - 3 LLM perspectives):\n${sections.join('\n\n')}`);
    }
  }

  // Deep mode scouts
  const scoutNames = ['github', 'g2', 'trustpilot', 'glassdoor', 'techcrunch'];
  for (const name of scoutNames) {
    if (facts[name]) {
      const url = facts[name].url || `https://${name}.com`;
      sourceUrls.push(url);
      parts.push(`${name.toUpperCase()} (BD Scraping Browser):\nURL: ${url}\n${facts[name].text || facts[name].content || JSON.stringify(facts[name])}`);
    }
  }

  // Redteam mode facts
  if (facts.cve) {
    const results = facts.cve.results || [];
    results.forEach(r => { if (r.link) sourceUrls.push(r.link); });
  }
  if (facts.breach) {
    const results = facts.breach.results || [];
    results.forEach(r => { if (r.link) sourceUrls.push(r.link); });
  }
  if (facts.githubLeaks) {
    const results = facts.githubLeaks.results || [];
    results.forEach(r => { if (r.link) sourceUrls.push(r.link); });
  }
  if (facts.securityPages && Array.isArray(facts.securityPages)) {
    facts.securityPages.forEach(p => { if (p.url) sourceUrls.push(p.url); });
  }

  // SEO mode facts
  if (facts.seoSerpRankings) {
    const results = facts.seoSerpRankings.results || [];
    results.forEach(r => { if (r.link) sourceUrls.push(r.link); });
  }
  if (facts.sitemapPages && Array.isArray(facts.sitemapPages)) {
    facts.sitemapPages.forEach(p => { if (p.url) sourceUrls.push(p.url); });
  }

  // Person mode facts
  if (facts.search) {
    const results = facts.search.results || [];
    results.forEach(r => { if (r.link) sourceUrls.push(r.link); });
  }
  if (facts.linkedinProfile) {
    const url = facts.linkedinProfile.url || 'https://linkedin.com';
    sourceUrls.push(url);
  }

  let text = parts.join('\n\n---\n\n');
  if (text.length > MAX_FACTS) {
    const cut = text.lastIndexOf('\n', MAX_FACTS);
    text = text.substring(0, cut > 0 ? cut : MAX_FACTS) + '\n[truncated]';
  }

  // Return both text and unique URLs
  const uniqueUrls = [...new Set(sourceUrls)];
  return { text, sourceUrls: uniqueUrls };
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
      tool: 'BD Discover API',
      icon: '✨',
      target: `${domain} company news products competitors (intent-ranked)`,
      sections: ['Recent Signals', 'Company Snapshot', 'News']
    },
    {
      tool: 'BD Crawl API',
      icon: '🕷️',
      target: `${domain} multi-page crawl (pricing · about · careers · blog · etc)`,
      sections: ['Pricing', 'Company Snapshot', 'Hiring Signals', 'Products']
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
    {
      tool: 'BD Datasets',
      icon: '📊',
      target: `LinkedIn Companies, Crunchbase (250+ pre-collected datasets)`,
      sections: ['Company Snapshot', 'Financials', 'Hiring Signals']
    },
    {
      tool: 'BD MCP Browser',
      icon: '📸',
      target: `${domain}/pricing (interactive capture + screenshot)`,
      sections: ['Pricing Tiers']
    },
    {
      tool: 'BD MCP Geo',
      icon: '🤖',
      target: `ChatGPT · Grok · Perplexity AI perception`,
      sections: ['AI Perception']
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
 * Calculate Claude API cost from usage object
 * Pricing as of 2024: Sonnet 4 input $3/MTok, output $15/MTok
 * Haiku input $0.25/MTok, output $1.25/MTok
 * Returns 0 when USE_CLAUDE_CLI=on (CLI uses Max OAuth, no API cost)
 */
function calculateClaudeCost(usage, model = 'claude-sonnet-4-6') {
  return adapterCalculateClaudeCost(usage, model);
}

/**
 * Call Claude to synthesize a structured intelligence report from scraped facts
 * Now uses streaming for progressive output
 * @param {EventEmitter} emitter - Optional emitter for streaming deltas to SSE
 */
async function synthesizeWithClaude(domain, facts, mode, emitter = null) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];
  const factsData = formatFacts(facts);
  const factsText = factsData.text;
  const sourceUrls = factsData.sourceUrls || [];
  const startTime = Date.now();

  const deepFields = mode === 'deep' ? `
  "techStack": [{"category": "Backend|Frontend|Infra|Data", "items": ["..."]}],
  "github": {"repos": 0, "stars": 0, "recentActivity": "...", "topLanguage": "...", "contributors": 0},
  "reviews": {"g2Score": 4.5, "g2Reviews": 0, "trustpilot": null, "sentiment": "..."},
  "glassdoor": {"rating": 4.0, "reviews": 0, "ceoApproval": "80%", "recommend": "75%", "sentiment": "..."},
  "risks": [{"factor": "...", "severity": "HIGH|MED|LOW"}],` : '';

  const hasGeo = facts.geoIntel && (facts.geoIntel.chatgpt || facts.geoIntel.grok || facts.geoIntel.perplexity);
  const hasBrowser = facts.browserCapture && facts.browserCapture.status === 'success';

  const newFields = `
  "aiPerception": ${hasGeo ? '{"chatgpt": "brief summary", "grok": "brief summary", "perplexity": "brief summary", "consensus": "1-2 sentence synthesis"}' : 'null'},
  "pricingCapture": ${hasBrowser ? '{"tiers": ["Tier name", "..."], "screenshot_available": true}' : 'null'},`;

  const safeDomain = domain.replace(/[^\w.-]/g, '').substring(0, 100);
  const safeCompanyName = companyName.replace(/[^\w\s]/g, '').substring(0, 50);

  // Standard mode uses markdown-first format; all other modes use pure JSON
  const prompt = mode === 'standard' ? `Analyze the company at domain [${safeDomain}] (company name: ${safeCompanyName}) and produce a competitive intelligence report.

TODAY: ${today}
MODE: ${mode}

SCRAPED WEB DATA:
${factsText}

GROUNDING RULES (CRITICAL — judges will fact-check):
- Use ONLY facts present in the SCRAPED WEB DATA above. Do NOT draw on training knowledge for dated events, product launches, headlines, funding rounds, or news.
- For "news" array: each item MUST be quoted/paraphrased from the scraped data. If the data contains no datable news for ${safeCompanyName}, return an empty array []. Do NOT invent dates, headlines, or signals.
- "financials" numbers: only include what the data states. Omit fields (set to "") if not present.
- Better to return an empty array or "" than to fabricate.
- Today is ${today}. Any "news" item with a date later than today, or a date you cannot point to in the scraped data, is a hallucination and must be omitted.
- The Executive Summary must paraphrase the scraped data only — do NOT add facts that aren't supported.

EVIDENCE REQUIREMENTS (P1 — traceability for hackathon judges):
- Every item in signals[], competitive[], strategic[] arrays MUST include:
  * evidence_url (string): the EXACT URL from SCRAPED WEB DATA that supports this claim (pick the most specific URL from the data above)
  * confidence (string): "high" if 2+ sources support it | "medium" if 1 source | "low" if inferred from sources
- If NO URL in the scraped data supports a claim, OMIT that claim entirely. Do not fabricate URLs.
- Add to meta object: sources_count (number of unique URLs cited), evidence_coverage (string like "X of Y claims have direct evidence")

Output format: Start with human-readable markdown executive summary, then emit structured JSON.

## Executive Summary

[Write 2-3 paragraphs for human readers. Include key findings, strategic positioning, and notable signals — ALL grounded in the scraped data above. Plain markdown, NO JSON in this section.]

## Key Signals

- 🟢 [High-priority signal/insight about ${domain}]
- 🟢 [Another high-priority signal]
- 🟡 [Medium-priority signal]

\`\`\`json
{
  "meta": {
    "domain": "${domain}",
    "companyName": "${companyName}",
    "analysisDate": "${today}",
    "mode": "${mode}",
    "confidence": "medium-high",
    "sources_count": 0,
    "evidence_coverage": "X of Y claims have direct evidence"
  },
  "signals": [
    {"level": "high|medium|positive", "text": "specific actionable insight about ${domain}", "icon": "🔴|🟡|🟢", "evidence_url": "https://...", "confidence": "high|medium|low"}
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
    {"competitor": "Company Name", "weakness": "specific weakness vs ${companyName}", "evidence_url": "https://...", "confidence": "high|medium|low"}
  ],
  "hiring": [
    {"role": "Role Type", "count": 0, "signal": "what this signals about strategy"}
  ],
  "strategic": [
    {"text": "Strategic direction 1", "evidence_url": "https://...", "confidence": "high|medium|low"}
  ],${newFields}
  "cost": {
    "webUnlocker": 0.30,
    "serpApi": 0.50,
    "scrapingBrowser": 0.80,
    "webScraperApi": 0.40,
    "total": 2.00
  }
}
\`\`\`
` : `Analyze the company at domain [${safeDomain}] (company name: ${safeCompanyName}) and produce a competitive intelligence report as JSON.

TODAY: ${today}
MODE: ${mode}

SCRAPED WEB DATA:
${factsText}

Return ONLY a valid JSON object with this exact structure.

GROUNDING RULES (CRITICAL — judges will fact-check):
- Use ONLY facts present in the SCRAPED WEB DATA above. Do NOT draw on training knowledge for dated events, product launches, headlines, funding rounds, or news.
- For "news" array: each item MUST be quoted/paraphrased from the scraped data. If the data contains no datable news for ${companyName}, return an empty array []. Do NOT invent dates, headlines, or signals.
- "financials" numbers: only include what the data states. Omit fields (set to "") if not present.
- Better to return an empty array or "" than to fabricate.
- Today is ${today}. Any "news" with a date later than today, or a date you cannot point to in the scraped data, is a hallucination and must be omitted.

Schema:
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
    {"competitor": "Company Name", "weakness": "specific weakness vs ${companyName}", "evidence_url": "https://...", "confidence": "high|medium|low"}
  ],
  "hiring": [
    {"role": "Role Type", "count": 0, "signal": "what this signals about strategy"}
  ],
  "strategic": [
    {"text": "Strategic direction 1", "evidence_url": "https://...", "confidence": "high|medium|low"}
  ],${newFields}${deepFields}
  "cost": {
    "webUnlocker": 0.30,
    "serpApi": 0.50,
    "scrapingBrowser": 0.80,
    "webScraperApi": 0.40,
    "total": ${mode === 'deep' ? '15.00' : '2.00'}
  }
}`;

  // Use streaming API
  const systemPrompt = mode === 'standard'
    ? 'You are a competitive intelligence analyst. First write a human-readable executive summary in markdown, then emit structured JSON inside a ```json fence. Be concise. GROUND every claim in the scraped data provided in the user message — do NOT invent dated news, headlines, funding rounds, or product launches from training memory. If the data does not support a field, leave it empty rather than fabricate.'
    : 'You are a competitive intelligence analyst. Output ONLY valid JSON — no markdown, no explanation, no code blocks. Be concise. GROUND every claim in the scraped data provided in the user message — do NOT invent dated news, headlines, funding rounds, or product launches from training memory. If the data does not support a field, leave it empty rather than fabricate.';

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }]
  });

  let accumulatedText = '';
  let tokenCount = 0;
  let jsonStartEmitted = false;

  // Stream deltas to SSE if emitter provided
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
      const delta = chunk.delta.text;
      accumulatedText += delta;
      tokenCount++;

      if (emitter) {
        const elapsed = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

        // Standard mode: detect JSON fence transition and emit json-start event once
        if (mode === 'standard' && !jsonStartEmitted && accumulatedText.includes('```json')) {
          emitter.emit('event', { agent: 'claude', status: 'json-start', elapsed });
          jsonStartEmitted = true;
        }

        emitter.emit('event', {
          agent: 'claude',
          status: 'streaming',
          delta,
          tokens: tokenCount,
          elapsed
        });
      }
    }
  }

  // Get final message with usage stats
  const finalMessage = await stream.finalMessage();
  const usage = finalMessage.usage;

  // Check if truncated and retry once with doubled token budget
  if (finalMessage.stop_reason === 'max_tokens') {
    console.warn(`[${mode}] Claude truncated at 8192 tokens for ${domain}, retrying with 16384 tokens`);

    const retryStream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    });

    accumulatedText = '';
    tokenCount = 0;
    jsonStartEmitted = false;

    for await (const chunk of retryStream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const delta = chunk.delta.text;
        accumulatedText += delta;
        tokenCount++;

        if (emitter) {
          const elapsed = parseFloat(((Date.now() - startTime) / 1000).toFixed(2));

          // Standard mode: detect JSON fence transition
          if (mode === 'standard' && !jsonStartEmitted && accumulatedText.includes('```json')) {
            emitter.emit('event', { agent: 'claude', status: 'json-start', elapsed });
            jsonStartEmitted = true;
          }

          emitter.emit('event', {
            agent: 'claude',
            status: 'streaming',
            delta,
            tokens: tokenCount,
            elapsed
          });
        }
      }
    }

    const retryFinalMessage = await retryStream.finalMessage();
    if (retryFinalMessage.stop_reason === 'max_tokens') {
      console.error(`[${mode}] Claude STILL truncated at 16384 tokens for ${domain} (${retryFinalMessage.usage?.output_tokens || 'unknown'} tokens used)`);
    }

    const retryResult = parseSynthesisResult(accumulatedText, domain, companySlug, mode, retryFinalMessage.usage);
    retryResult.report = groundReport(retryResult.report, factsText, today, domain, mode);
    return retryResult;
  }

  const result = parseSynthesisResult(accumulatedText, domain, companySlug, mode, usage);
  result.report = groundReport(result.report, factsText, today, domain, mode);
  return result;
}

/**
 * Parse accumulated synthesis text into structured report
 */
// Post-synthesis grounding validator — strips claims not supported by scraped data.
// Belt-and-suspenders defense against LLM hallucination of dated news / fake financials.
//
// Strategy: loose substring matching against factsText (lowercased, normalized).
//  - News: must have 2+ distinct 4+ char tokens overlapping with factsText, AND date <= today
//  - Investors: name must appear in factsText
//  - Financials: dollar/percent amounts must appear in factsText, else blank
function groundReport(parsed, factsText, today, domain, mode) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  if (!factsText || factsText.length < 200) {
    // No scraped data → can't validate. Force empty news to avoid fabrication leaking.
    if (Array.isArray(parsed.news)) parsed.news = [];
    return parsed;
  }
  const haystack = factsText.toLowerCase();
  const todayDate = new Date(today);
  const stripped = { news: 0, investors: 0, financials: 0 };

  // Token overlap check — at least N matching 4+ char tokens from claim appear in haystack
  const tokenOverlap = (claim, minMatches = 2) => {
    if (!claim || typeof claim !== 'string') return false;
    const tokens = claim.toLowerCase().match(/[a-z0-9]{4,}/g) || [];
    const unique = [...new Set(tokens)];
    let hits = 0;
    for (const t of unique) {
      if (haystack.includes(t)) hits++;
      if (hits >= minMatches) return true;
    }
    return false;
  };

  // News validator
  if (Array.isArray(parsed.news)) {
    const before = parsed.news.length;
    parsed.news = parsed.news.filter(item => {
      if (!item || typeof item !== 'object') return false;
      const headline = item.headline || item.text || '';
      // Future date check — strip anything dated past today
      const dateStr = item.date || '';
      const yearMatch = dateStr.match(/20\d{2}/);
      if (yearMatch) {
        const year = parseInt(yearMatch[0]);
        if (year > todayDate.getFullYear()) return false;
        if (year === todayDate.getFullYear()) {
          // month check — Jan=0
          const monthMatch = dateStr.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i);
          if (monthMatch) {
            const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
              .indexOf(monthMatch[0].toLowerCase().slice(0,3));
            if (monthIdx > todayDate.getMonth()) return false;
          }
        }
      }
      // Grounding check — headline must overlap with scraped data
      return tokenOverlap(headline, 2);
    });
    stripped.news = before - parsed.news.length;
  }

  // Investors — name must appear in scraped data
  if (parsed.financials && Array.isArray(parsed.financials.investors)) {
    const before = parsed.financials.investors.length;
    parsed.financials.investors = parsed.financials.investors.filter(name => {
      if (!name || typeof name !== 'string') return false;
      return haystack.includes(name.toLowerCase());
    });
    stripped.investors = before - parsed.financials.investors.length;
  }

  // Financials — strip dollar/percent values not present in scraped data
  if (parsed.financials && typeof parsed.financials === 'object') {
    for (const key of ['totalRaised', 'lastRound', 'valuation', 'revenue']) {
      const val = parsed.financials[key];
      if (!val || typeof val !== 'string') continue;
      // If contains template placeholder OR currency value not in haystack → blank
      if (/\$X|XM|XB|YYYY|Series X/i.test(val)) {
        parsed.financials[key] = '';
        stripped.financials++;
        continue;
      }
      const amounts = val.match(/\$[\d,.]+[BMK]?/gi) || [];
      const hasUngroundedAmount = amounts.some(a => !haystack.includes(a.toLowerCase()));
      if (hasUngroundedAmount && amounts.length > 0) {
        parsed.financials[key] = '';
        stripped.financials++;
      }
    }
  }

  if (stripped.news || stripped.investors || stripped.financials) {
    console.warn(`[grounding] ${domain} (${mode}): stripped ${stripped.news} news, ${stripped.investors} investors, ${stripped.financials} financials`);
  }
  return parsed;
}

function parseSynthesisResult(rawText, domain, companySlug, mode, usage) {
  let text = rawText;

  // Standard mode: extract JSON from markdown fence
  if (mode === 'standard') {
    const fenceMatch = rawText.match(/```json\s*([\s\S]*?)```/);
    if (fenceMatch) {
      text = fenceMatch[1];
    } else {
      console.warn(`[${mode}] No JSON fence found in standard mode output, falling back to full text parse`);
      // Fallback: try to extract first balanced JSON object
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      text = jsonMatch ? jsonMatch[0] : rawText;
    }
  } else {
    // Other modes: extract first balanced JSON object (handles truncation better)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    text = jsonMatch
      ? jsonMatch[0]
      : rawText.replace(/^```json\n?|^```\n?|\n?```$/g, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    // Log first 500 chars of failed output for debugging
    console.error(`[${mode}] JSON parse failed for ${domain}:`, parseErr.message);
    console.error(`[${mode}] output_tokens: ${usage?.output_tokens || 'unknown'}`);
    console.error(`[${mode}] Raw output (first 500 chars): ${rawText.substring(0, 500)}`);
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

  // Append BD source attribution (metadata Claude doesn't need to generate)
  parsed.sources = buildSources(domain, companySlug, mode);

  return { report: parsed, usage };
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
    system: 'Competitive intelligence analyst. Output ONLY valid JSON. GROUND every claim in the data provided in the user message — do NOT invent dated news, headlines, funding rounds, or product launches from training memory. Empty array beats fabrication.',
    messages: [{
      role: 'user',
      content: `Domain: ${domain}
Data quality: ${Math.round(qualityScore * 100)}%
R1 DATA: ${factsSnippet || 'none — use domain knowledge'}

Return ONLY this JSON:
{"type":"B2B SaaS|fintech|marketplace|enterprise|consumer|other","stage":"startup|growth|scale-up|public|unknown","scout_focus":"one-line focus","signals":[{"finding":"observation","reasoning":"chain","hypothesis":"hypothesis","followup_query":"google query","confidence":"high|medium|low"}]}`
    }]
  });

  // Detect truncation - this is a small helper so 450 should be enough, but check anyway
  if (response.stop_reason === 'max_tokens') {
    throw new Error(`Claude classify+extract truncated at max_tokens — increase budget`);
  }

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
  const r1Data = formatFacts(r1Facts);
  const r1Text = r1Data.text.substring(0, 3000);

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

GROUNDING RULES (CRITICAL — judges will fact-check):
- Use ONLY facts present in ROUND 1 and ROUND 2 data above. Do NOT draw on training knowledge for dated events, headlines, funding rounds, or product launches.
- "news" array: paraphrase from the data only. Empty array if no dated news in data. Never invent dates.
- "financials": only include what the data states; empty strings if missing.
- Today is ${today}. Any future-dated news is a hallucination — omit it.
- Better to return empty than fabricate.

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

  let response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    system: 'Competitive intelligence analyst. Output ONLY valid JSON. No markdown. Be very concise — short strings. GROUND every claim in the data provided in the user message — do NOT invent dated news, headlines, funding rounds, or product launches from training memory. Empty array beats fabrication.',
    messages: [{ role: 'user', content: prompt }]
  });

  // Retry once with doubled token budget if truncated
  if (response.stop_reason === 'max_tokens') {
    console.warn(`[agentic] Claude truncated at 8192 tokens for ${domain}, retrying with 16384 tokens`);
    response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16384,
      system: 'Competitive intelligence analyst. Output ONLY valid JSON. No markdown. Be very concise — short strings. GROUND every claim in the data provided in the user message — do NOT invent dated news, headlines, funding rounds, or product launches from training memory. Empty array beats fabrication.',
      messages: [{ role: 'user', content: prompt }]
    });

    if (response.stop_reason === 'max_tokens') {
      console.error(`[agentic] Claude STILL truncated at 16384 tokens for ${domain} (${response.usage?.output_tokens || 'unknown'} tokens used)`);
    }
  }

  const rawText = response.content[0].text.trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const text = jsonMatch ? jsonMatch[0] : rawText.replace(/^```json\n?|^```\n?|\n?```$/g, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    console.error(`[agentic] JSON parse failed for ${domain}:`, parseErr.message);
    console.error(`[agentic] stop_reason: ${response.stop_reason}, output_tokens: ${response.usage?.output_tokens || 'unknown'}`);
    console.error(`[agentic] Raw output (first 500 chars): ${rawText.substring(0, 500)}`);
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

  const companySlugFinal = domain.split('.')[0];
  parsed.sources = [
    ...buildSources(domain, companySlugFinal, 'standard'),
    { tool: 'Claude Haiku (Signal Extraction)', icon: '🧠', target: `${signals.length} signals detected → ${signals.length} follow-up queries dispatched`, sections: ['Agentic Insights'] },
    { tool: 'BD SERP API (Round 2)', icon: '🔍', target: signals.map(s => s.followup_query).join(' · '), sections: ['Agentic Insights'] }
  ];

  // Grounding validator — strip news/financials not supported by R1+R2 data
  const groundedHaystack = r1Text + '\n' + (r2Parts.join('\n') || '');
  parsed = groundReport(parsed, groundedHaystack, today, domain, 'agentic');

  return { report: parsed, usage: response.usage, backend: response._backend || 'unknown' };
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

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
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

  // Retry once with doubled token budget if truncated
  if (response.stop_reason === 'max_tokens') {
    console.warn(`[mcp] Claude truncated at 8192 tokens for ${domain}, retrying with 16384 tokens`);
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: 'You are a competitive intelligence analyst using Bright Data MCP protocol. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
      messages: [{
        role: 'user',
        content: `Analyze "${domain}" (${companyName}) using MCP protocol intelligence data.

TODAY: ${today}

MCP PROTOCOL DATA (4 tools used):
${factsContext.substring(0, 8000)}

Return ONLY valid JSON — see previous message for structure.`
      }]
    });

    if (response.stop_reason === 'max_tokens') {
      console.error(`[mcp] Claude STILL truncated at 16384 tokens for ${domain} (${response.usage?.output_tokens || 'unknown'} tokens used)`);
    }
  }

  const rawText = response.content[0].text.trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const text = jsonMatch ? jsonMatch[0] : rawText.replace(/^```json\n?|^```\n?|\n?```$/g, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    console.error(`[mcp] JSON parse failed for ${domain}:`, parseErr.message);
    console.error(`[mcp] stop_reason: ${response.stop_reason}, output_tokens: ${response.usage?.output_tokens || 'unknown'}`);
    console.error(`[mcp] Raw output (first 500 chars): ${rawText.substring(0, 500)}`);
    throw new Error('Claude returned invalid JSON');
  }

  // Grounding validator — strip news/financials not in MCP facts
  parsed = groundReport(parsed, factsContext, today, domain, 'mcp');

  return { report: parsed, usage: response.usage, backend: response._backend || 'unknown' };
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
async function synthesizePersonWithClaude(personName, facts = {}) {
  const today = new Date().toISOString().split('T')[0];
  const factsData = formatFacts(facts);
  const factsText = factsData.text;
  const sourceUrls = factsData.sourceUrls || [];

  const sourceUrlsList = sourceUrls.length > 0 ? `\n\nSOURCE URLs AVAILABLE (you may ONLY cite URLs from this list):\n${sourceUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}` : '';

  let response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    system: 'You are an executive intelligence analyst. Output ONLY valid JSON — no markdown, no explanation. Ground all claims in the provided scraped data. EVIDENCE: Every item in quotes, publicActivity, companies, network must cite source URL.',
    messages: [{
      role: 'user',
      content: `Produce an executive intelligence report on "${personName}".

TODAY: ${today}
${factsText ? `SCRAPED DATA:\n${factsText}${sourceUrlsList}\n\nUse ONLY facts from the scraped data above. Do not invent career history, companies, or dates.` : `Use your knowledge to produce a report.`}

EVIDENCE REQUIREMENTS:
- Every item in quotes[], publicActivity[], companies[], network[] MUST include:
  * evidence_url (string): EXACT URL from SOURCE URLs AVAILABLE
  * confidence (string): "high" (2+ sources) | "medium" (1 source) | "low" (inferred)
- Every signal[] item MUST include confidence
- If NO URL supports a claim, OMIT it.
- Add to meta: sources_count, evidence_coverage

Return valid JSON with this exact structure:
{
  "meta": {
    "name": "${personName}",
    "analysisDate": "${today}",
    "mode": "person",
    "confidence": "medium-high",
    "sources_count": 0,
    "evidence_coverage": "X of Y"
  },
  "signals": [
    {"level": "high|medium|positive", "text": "specific signal about this person", "icon": "🔴|🟡|🟢", "confidence": "high|medium|low"}
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
    {"name": "Company Name", "role": "Co-founder & CEO", "domain": "company.com", "evidence_url": "https://...", "confidence": "high|medium|low"}
  ],
  "quotes": [
    {"text": "actual or representative quote", "source": "Source name", "date": "Mon YYYY", "evidence_url": "https://...", "confidence": "high|medium|low"}
  ],
  "network": [
    {"name": "Person Name", "relationship": "nature of connection", "evidence_url": "https://...", "confidence": "high|medium|low"}
  ],
  "publicActivity": [
    {"date": "Mon DD", "event": "What they did publicly", "signal": "HIGH|MED|LOW", "evidence_url": "https://...", "confidence": "high|medium|low"}
  ],
  "cost": {"total": 1.50}
}`
    }]
  });

  // Retry once with doubled token budget if truncated
  if (response.stop_reason === 'max_tokens') {
    console.warn(`[person] Claude truncated at 8192 tokens for ${personName}, retrying with 16384 tokens`);
    response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16384,
      system: 'You are an executive intelligence analyst. Output ONLY valid JSON — no markdown, no explanation. Ground all claims in the provided scraped data.',
      messages: [{
        role: 'user',
        content: `Produce an executive intelligence report on "${personName}".

${factsText ? `SCRAPED DATA:\n${factsText}\n\nUse ONLY facts from the scraped data above. Do not invent career history, companies, or dates.` : `Use your knowledge to produce a report.`}

Return valid JSON — see previous message for structure.`
      }]
    });

    if (response.stop_reason === 'max_tokens') {
      console.error(`[person] Claude STILL truncated at 16384 tokens for ${personName} (${response.usage?.output_tokens || 'unknown'} tokens used)`);
    }
  }

  const rawText = response.content[0].text.trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const text = jsonMatch ? jsonMatch[0] : rawText.replace(/^```json\n?|^```\n?|\n?```$/g, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    console.error(`[person] JSON parse failed for ${personName}:`, parseErr.message);
    console.error(`[person] stop_reason: ${response.stop_reason}, output_tokens: ${response.usage?.output_tokens || 'unknown'}`);
    console.error(`[person] Raw output (first 500 chars): ${rawText.substring(0, 500)}`);
    throw new Error('Claude returned invalid JSON');
  }

  if (!parsed.meta || !parsed.signals || !Array.isArray(parsed.signals)) {
    throw new Error('Claude returned malformed JSON structure');
  }

  return { report: parsed, usage: response.usage, backend: response._backend || 'unknown' };
}

/**
 * Synthesize SEO intelligence report with Claude
 */
async function synthesizeSeoWithClaude(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const companySlug = domain.split('.')[0];
  const today = new Date().toISOString().split('T')[0];
  const factsData = formatFacts(facts);
  const factsText = factsData.text;
  const sourceUrls = factsData.sourceUrls || [];

  const sourceUrlsList = sourceUrls.length > 0 ? `\n\nSOURCE URLs AVAILABLE (you may ONLY cite URLs from this list):\n${sourceUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}` : '';

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: 'You are an SEO analyst and digital marketing strategist. Output ONLY valid JSON — no markdown, no explanation, no code blocks. EVIDENCE: Every claim in opportunities, competitive, strategic must cite a source URL.',
    messages: [{
      role: 'user',
      content: `Produce a comprehensive SEO intelligence report on "${domain}" (${companyName}).

TODAY: ${today}
${factsText ? `SCRAPED DATA:\n${factsText}${sourceUrlsList}\n` : `Use your knowledge of ${domain} and SEO best practices for companies in this space.`}

EVIDENCE REQUIREMENTS:
- Every item in opportunities[], competitive[], strategic[] arrays MUST include:
  * evidence_url (string): EXACT URL from SOURCE URLs AVAILABLE
  * confidence (string): "high" (2+ sources) | "medium" (1 source) | "low" (inferred)
- Every signal[] item MUST include confidence
- If NO URL supports a claim, OMIT it. Do not fabricate.
- Add to meta: sources_count, evidence_coverage

Return ONLY valid JSON — be specific and realistic for ${domain}:
{
  "meta": { "domain": "${domain}", "companyName": "${companyName}", "analysisDate": "${today}", "mode": "seo", "confidence": "medium-high", "sources_count": 0, "evidence_coverage": "X of Y" },
  "signals": [
    { "level": "high|medium|positive", "text": "specific SEO finding for ${domain}", "icon": "🔴|🟡|🟢", "confidence": "high|medium|low" }
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
    { "keyword": "keyword opportunity", "volume": 0, "difficulty": 0, "opportunity": "why this is valuable", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "competitive": [
    { "competitor": "Competitor Domain", "weakness": "their specific SEO weakness", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "hiring": [
    { "role": "SEO/Content Role", "count": 0, "signal": "what this signals" }
  ],
  "strategic": [
    { "text": "strategic SEO observation 1", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ]
}`
    }]
  });

  // Retry once with doubled token budget if truncated
  if (response.stop_reason === 'max_tokens') {
    console.warn(`[seo] Claude truncated at 8192 tokens for ${domain}, retrying with 16384 tokens`);
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: 'You are an SEO analyst and digital marketing strategist. Output ONLY valid JSON — no markdown, no explanation, no code blocks. EVIDENCE: Every claim in opportunities, competitive, strategic must cite a source URL.',
      messages: [{
        role: 'user',
        content: `Produce a comprehensive SEO intelligence report on "${domain}" (${companyName}).

TODAY: ${today}
${factsText ? `SCRAPED DATA:\n${factsText}${sourceUrlsList}\n` : `Use your knowledge of ${domain} and SEO best practices for companies in this space.`}

EVIDENCE REQUIREMENTS:
- Every item in opportunities[], competitive[], strategic[] must include evidence_url + confidence
- If NO URL supports a claim, OMIT it
- Add to meta: sources_count, evidence_coverage

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

    if (response.stop_reason === 'max_tokens') {
      console.error(`[seo] Claude STILL truncated at 16384 tokens for ${domain} (${response.usage?.output_tokens || 'unknown'} tokens used)`);
    }
  }

  const rawText = response.content[0].text.trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const text = jsonMatch ? jsonMatch[0] : rawText.replace(/^```json\n?|^```\n?|\n?```$/g, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    console.error(`[seo] JSON parse failed for ${domain}:`, parseErr.message);
    console.error(`[seo] stop_reason: ${response.stop_reason}, output_tokens: ${response.usage?.output_tokens || 'unknown'}`);
    console.error(`[seo] Raw output (first 500 chars): ${rawText.substring(0, 500)}`);
    throw new Error('Claude returned invalid JSON');
  }

  if (!parsed.meta || !parsed.signals || !Array.isArray(parsed.signals)) {
    throw new Error('Claude returned malformed JSON structure');
  }

  // Add sources (server-side metadata, not Claude's job)
  parsed.sources = [
    { tool: 'BD Web Unlocker', icon: '🌐', target: `https://${domain}`, sections: ['Technical Issues', 'Page Speed'] },
    { tool: 'BD SERP API', icon: '🔍', target: `site:${domain} keyword ranking`, sections: ['Top Keywords', 'SERP Features'] },
    { tool: 'BD Scraping Browser', icon: '🖥', target: `${domain} + competitors`, sections: ['Core Web Vitals', 'Content'] },
    { tool: 'BD MCP Server', icon: '🔗', target: `${domain} backlinks authority`, sections: ['Backlink Profile', 'Opportunities'] }
  ];

  return { report: parsed, usage: response.usage, backend: response._backend || 'unknown' };
}

/**
 * Synthesize red team security intelligence report with Claude
 */
async function synthesizeRedteamWithClaude(domain, facts) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
  const today = new Date().toISOString().split('T')[0];
  const factsData = formatFacts(facts);
  const factsText = factsData.text;
  const sourceUrls = factsData.sourceUrls || [];

  const companySlug = domain.split('.')[0];

  const sourceUrlsList = sourceUrls.length > 0 ? `\n\nSOURCE URLs AVAILABLE (you may ONLY cite URLs from this list):\n${sourceUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}` : '';

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: 'You are a red team security analyst. Output ONLY valid JSON — no markdown, no explanation, no code blocks. EVIDENCE RULE: Every finding in exposures, socialEngineering, and recommendations MUST cite a source URL from the provided facts. If no source supports a claim, OMIT IT. Do not fabricate.',
    messages: [{
      role: 'user',
      content: `You are a red team security analyst. Produce a security intelligence report on "${domain}" (${companyName}).

TODAY: ${today}
${factsText ? `SCRAPED DATA:\n${factsText}${sourceUrlsList}\n` : `Use your knowledge of ${domain} and common attack patterns for companies in this space.`}

EVIDENCE REQUIREMENTS (P1 — traceability for hackathon judges):
- Every item in exposures[], socialEngineering[], recommendations[] arrays MUST include:
  * evidence_url (string): the EXACT URL from SOURCE URLs AVAILABLE that supports this claim
  * confidence (string): "high" if 2+ sources support it | "medium" if 1 source | "low" if inferred
- Every signal[] item MUST include confidence (string)
- If NO URL supports a claim, OMIT that claim entirely. Do not fabricate URLs.
- Add to meta: sources_count (number of unique URLs cited), evidence_coverage (string like "X of Y claims have direct evidence")

Return ONLY valid JSON with this exact structure — be specific and realistic for ${domain}, not generic:
{
  "meta": { "domain": "${domain}", "companyName": "${companyName}", "analysisDate": "${today}", "mode": "redteam", "confidence": "high", "sources_count": 0, "evidence_coverage": "X of Y" },
  "signals": [
    { "level": "high", "text": "specific high-severity finding for ${domain}", "icon": "🔴", "confidence": "high|medium|low" }
  ],
  "snapshot": { "founded": "YYYY", "hq": "City, Country", "employees": "N (est.)", "stage": "Series X", "website": "${domain}", "linkedin": "linkedin.com/company/${companySlug}" },
  "attackSurface": {
    "exposedPorts": ["443 (HTTPS)", "other ports if known"],
    "subdomains": ["api.${domain}", "dev.${domain}", "other known subdomains"],
    "techStack": ["specific technologies ${domain} uses"],
    "headers": { "csp": true, "hsts": true, "xframe": true, "referrerPolicy": false, "score": "B+" }
  },
  "exposures": [
    { "type": "exposure type", "severity": "CRITICAL|HIGH|MED|LOW", "detail": "specific detail about ${domain}", "date": "Mon YYYY", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "socialEngineering": [
    { "vector": "attack vector name", "risk": "HIGH|MED|LOW", "detail": "specific detail for ${domain}", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "competitive": [
    { "competitor": "Competitor Name", "weakness": "their security weakness", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "hiring": [
    { "role": "Security Role", "count": 0, "signal": "what this means" }
  ],
  "strategic": [
    { "text": "strategic security observation 1", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "recommendations": [
    { "priority": "P0", "action": "most urgent fix for ${domain}", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ]
}`
    }]
  });

  // Retry once with doubled token budget if truncated
  if (response.stop_reason === 'max_tokens') {
    console.warn(`[redteam] Claude truncated at 8192 tokens for ${domain}, retrying with 16384 tokens`);
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: 'You are a red team security analyst. Output ONLY valid JSON — no markdown, no explanation, no code blocks. EVIDENCE RULE: Every finding in exposures, socialEngineering, and recommendations MUST cite a source URL from the provided facts. If no source supports a claim, OMIT IT. Do not fabricate.',
      messages: [{
        role: 'user',
        content: `You are a red team security analyst. Produce a security intelligence report on "${domain}" (${companyName}).

TODAY: ${today}
${factsText ? `SCRAPED DATA:\n${factsText}${sourceUrlsList}\n` : `Use your knowledge of ${domain} and common attack patterns for companies in this space.`}

EVIDENCE REQUIREMENTS (P1 — traceability for hackathon judges):
- Every item in exposures[], socialEngineering[], recommendations[] arrays MUST include:
  * evidence_url (string): the EXACT URL from SOURCE URLs AVAILABLE that supports this claim
  * confidence (string): "high" if 2+ sources support it | "medium" if 1 source | "low" if inferred
- Every signal[] item MUST include confidence (string)
- If NO URL supports a claim, OMIT that claim entirely. Do not fabricate URLs.
- Add to meta: sources_count (number of unique URLs cited), evidence_coverage (string like "X of Y claims have direct evidence")

Return ONLY valid JSON with this exact structure — be specific and realistic for ${domain}, not generic:
{
  "meta": { "domain": "${domain}", "companyName": "${companyName}", "analysisDate": "${today}", "mode": "redteam", "confidence": "high", "sources_count": 0, "evidence_coverage": "X of Y" },
  "signals": [
    { "level": "high", "text": "specific high-severity finding for ${domain}", "icon": "🔴", "confidence": "high|medium|low" }
  ],
  "snapshot": { "founded": "YYYY", "hq": "City, Country", "employees": "N (est.)", "stage": "Series X", "website": "${domain}", "linkedin": "linkedin.com/company/${companySlug}" },
  "attackSurface": {
    "exposedPorts": ["443 (HTTPS)", "other ports if known"],
    "subdomains": ["api.${domain}", "dev.${domain}", "other known subdomains"],
    "techStack": ["specific technologies ${domain} uses"],
    "headers": { "csp": true, "hsts": true, "xframe": true, "referrerPolicy": false, "score": "B+" }
  },
  "exposures": [
    { "type": "exposure type", "severity": "CRITICAL|HIGH|MED|LOW", "detail": "specific detail about ${domain}", "date": "Mon YYYY", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "socialEngineering": [
    { "vector": "attack vector name", "risk": "HIGH|MED|LOW", "detail": "specific detail for ${domain}", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "competitive": [
    { "competitor": "Competitor Name", "weakness": "their security weakness", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "hiring": [
    { "role": "Security Role", "count": 0, "signal": "what this means" }
  ],
  "strategic": [
    { "text": "strategic security observation 1", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ],
  "recommendations": [
    { "priority": "P0", "action": "most urgent fix for ${domain}", "evidence_url": "https://...", "confidence": "high|medium|low" }
  ]
}`
      }]
    });

    if (response.stop_reason === 'max_tokens') {
      console.error(`[redteam] Claude STILL truncated at 16384 tokens for ${domain} (${response.usage?.output_tokens || 'unknown'} tokens used)`);
    }
  }

  const rawText = response.content[0].text.trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const text = jsonMatch ? jsonMatch[0] : rawText.replace(/^```json\n?|^```\n?|\n?```$/g, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    console.error(`[redteam] JSON parse failed for ${domain}:`, parseErr.message);
    console.error(`[redteam] stop_reason: ${response.stop_reason}, output_tokens: ${response.usage?.output_tokens || 'unknown'}`);
    console.error(`[redteam] Raw output (first 500 chars): ${rawText.substring(0, 500)}`);
    throw new Error('Claude returned invalid JSON');
  }

  if (!parsed.meta || !parsed.signals || !Array.isArray(parsed.signals)) {
    throw new Error('Claude returned malformed JSON structure');
  }

  // Add sources (server-side metadata, not Claude's job)
  parsed.sources = [
    { tool: 'BD Web Unlocker', icon: '🌐', target: `https://${domain}`, sections: ['Tech Stack', 'Security Headers'] },
    { tool: 'BD SERP API', icon: '🔍', target: `${domain} CVE breach security`, sections: ['Exposures'] },
    { tool: 'BD Scraping Browser', icon: '🖥', target: 'shodan.io · securityheaders.com', sections: ['Attack Surface'] },
    { tool: 'BD MCP Server', icon: '🔗', target: `${domain} bug bounty credentials`, sections: ['Social Engineering'] }
  ];

  return { report: parsed, usage: response.usage, backend: response._backend || 'unknown' };
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

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
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

  // Retry once with doubled token budget if truncated
  if (response.stop_reason === 'max_tokens') {
    console.warn(`[footprint] Claude truncated at 8192 tokens for ${domain}, retrying with 16384 tokens`);
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: 'You are a digital intelligence analyst. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
      messages: [{
        role: 'user',
        content: `Analyze the digital footprint of "${domain}" (${companyName}) and produce a comprehensive footprint intelligence report.

TODAY: ${today}

COLLECTED DATA:
${factsContext.substring(0, 6000)}

Return ONLY valid JSON — see previous message for structure.`
      }]
    });

    if (response.stop_reason === 'max_tokens') {
      console.error(`[footprint] Claude STILL truncated at 16384 tokens for ${domain} (${response.usage?.output_tokens || 'unknown'} tokens used)`);
    }
  }

  const rawText = response.content[0].text.trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const text = jsonMatch ? jsonMatch[0] : rawText.replace(/^```json\n?|^```\n?|\n?```$/g, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    console.error(`[footprint] JSON parse failed for ${domain}:`, parseErr.message);
    console.error(`[footprint] stop_reason: ${response.stop_reason}, output_tokens: ${response.usage?.output_tokens || 'unknown'}`);
    console.error(`[footprint] Raw output (first 500 chars): ${rawText.substring(0, 500)}`);
    throw new Error('Claude returned invalid JSON');
  }

  return { report: parsed, usage: response.usage, backend: response._backend || 'unknown' };
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

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
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

  // Retry once with doubled token budget if truncated
  if (response.stop_reason === 'max_tokens') {
    console.warn(`[lookup] Claude truncated at 8192 tokens for ${domain}, retrying with 16384 tokens`);
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: 'You are a competitive intelligence analyst with access to web-scale indexed data. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
      messages: [{
        role: 'user',
        content: `Analyze "${domain}" (${companyName}) using Deep Lookup intelligence — this is web-scale indexed data, not just scraped pages.

TODAY: ${today}

COLLECTED INTELLIGENCE:
${factsContext.substring(0, 8000)}

Return ONLY valid JSON — see previous message for structure.`
      }]
    });

    if (response.stop_reason === 'max_tokens') {
      console.error(`[lookup] Claude STILL truncated at 16384 tokens for ${domain} (${response.usage?.output_tokens || 'unknown'} tokens used)`);
    }
  }

  const rawText = response.content[0].text.trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  const text = jsonMatch ? jsonMatch[0] : rawText.replace(/^```json\n?|^```\n?|\n?```$/g, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (parseErr) {
    console.error(`[lookup] JSON parse failed for ${domain}:`, parseErr.message);
    console.error(`[lookup] stop_reason: ${response.stop_reason}, output_tokens: ${response.usage?.output_tokens || 'unknown'}`);
    console.error(`[lookup] Raw output (first 500 chars): ${rawText.substring(0, 500)}`);
    throw new Error('Claude returned invalid JSON');
  }

  return { report: parsed, usage: response.usage, backend: response._backend || 'unknown' };
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
 * Serve screenshot files
 * GET /screenshots/:filename
 */
app.get('/screenshots/:filename', (req, res) => {
  const { filename } = req.params;
  const safeName = filename.replace(/[^a-z0-9._-]/gi, '');
  const filepath = path.join('/tmp/recon-screenshots', safeName);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'screenshot not found' });
  }

  res.sendFile(filepath);
});

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
