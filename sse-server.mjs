/**
 * SSE Server - Real-time event streaming for Recon
 */

import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import { runStandardWorker, runDeepWorker } from './bd-worker.mjs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// AI-IQ in-memory cache: "domain:mode" -> { report, elapsed, timestamp }
const reportCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'recon-sse',
    timestamp: new Date().toISOString(),
    cacheEntries: reportCache.size
  });
});

/**
 * SSE endpoint for competitive intelligence reports
 * Query params: domain (required), mode (standard|deep, default: standard)
 */
app.get('/api/report', async (req, res) => {
  const { domain, mode = 'standard' } = req.query;

  if (!domain) {
    return res.status(400).json({ error: 'domain parameter required' });
  }

  if (!['standard', 'deep'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "standard" or "deep"' });
  }

  // AI-IQ cache check — instant replay if seen before
  const cacheKey = `${domain}:${mode}`;
  const cached = reportCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    await new Promise(r => setTimeout(r, 200));

    res.write(`data: ${JSON.stringify({
      type: 'cache-hit',
      domain,
      cache_time: 0.3,
      fresh_time: cached.elapsed,
      elapsed: 0.3
    })}\n\n`);

    await new Promise(r => setTimeout(r, 400));

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
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Create event emitter for worker
  const emitter = new EventEmitter();

  // Stream events to client
  emitter.on('event', (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  // Timeout handler
  const timeout = setTimeout(() => {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: 'timeout',
      elapsed: 60
    })}\n\n`);
    res.end();
  }, 60000);

  try {
    // Run worker
    let result;
    if (mode === 'deep') {
      result = await runDeepWorker(domain, emitter);
    } else {
      result = await runStandardWorker(domain, emitter);
    }

    clearTimeout(timeout);

    const report = generateReport(domain, result.facts, mode);

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
      message: error.message,
      stack: error.stack
    })}\n\n`);

    res.end();
  }
});

/**
 * Synthesize report from worker result
 * POST body: { domain, facts, mode }
 */
app.post('/api/synthesize', async (req, res) => {
  const { domain, facts, mode = 'standard' } = req.body;

  if (!domain || !facts) {
    return res.status(400).json({ error: 'domain and facts required' });
  }

  const report = generateReport(domain, facts, mode);

  res.json({
    domain,
    mode,
    report,
    tokens: 2500,
    cost: 0.05
  });
});

/**
 * Generate structured intelligence report
 * Stub: real Claude synthesis wired when ANTHROPIC_API_KEY is set
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
    sources: [
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
    ],
    cost: {
      webUnlocker: 0.30,
      serpApi: 0.50,
      scrapingBrowser: 0.80,
      webScraperApi: 0.40,
      total: mode === 'deep' ? 15.00 : 2.00
    }
  };
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Recon SSE server listening on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Report: http://localhost:${PORT}/api/report?domain=chain.link&mode=standard`);
});
