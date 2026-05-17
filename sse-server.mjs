/**
 * SSE Server - Real-time event streaming for Recon
 */

import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import { runStandardWorker, runDeepWorker } from './bd-worker.mjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Claude client — real synthesis when key present, mock fallback otherwise
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

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
    claudeEnabled: !!anthropic,
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

  const emitter = new EventEmitter();

  emitter.on('event', (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  const timeout = setTimeout(() => {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: 'timeout',
      elapsed: 60
    })}\n\n`);
    res.end();
  }, 60000);

  try {
    let result;
    if (mode === 'deep') {
      result = await runDeepWorker(domain, emitter);
    } else {
      result = await runStandardWorker(domain, emitter);
    }

    clearTimeout(timeout);

    const factsData = result.facts || result.scouts || {};
    const report = anthropic
      ? await synthesizeWithClaude(domain, factsData, mode)
      : generateMockReport(domain, factsData, mode);

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
 * Synthesize report endpoint
 * POST body: { domain, facts, mode }
 */
app.post('/api/synthesize', async (req, res) => {
  const { domain, facts, mode = 'standard' } = req.body;

  if (!domain || !facts) {
    return res.status(400).json({ error: 'domain and facts required' });
  }

  const report = anthropic
    ? await synthesizeWithClaude(domain, facts, mode)
    : generateMockReport(domain, facts, mode);

  res.json({ domain, mode, report, claudeEnabled: !!anthropic });
});

/**
 * Format collected facts into a text block for Claude
 */
function formatFacts(facts) {
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

  return parts.join('\n\n---\n\n').substring(0, 8000);
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

  const prompt = `Analyze ${domain} (${companyName}) and produce a competitive intelligence report as JSON.

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
    max_tokens: 4096,
    system: 'You are a competitive intelligence analyst. Output ONLY valid JSON — no markdown, no explanation, no code blocks.',
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].text.trim()
    .replace(/^```json\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/\n?```$/, '');

  const parsed = JSON.parse(text);

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

  return parsed;
}

/**
 * Mock report fallback — used when ANTHROPIC_API_KEY not set
 */
function generateMockReport(domain, facts, mode) {
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
  const { domain, report, mode = 'standard' } = req.body;

  if (!domain || !report) {
    return res.status(400).json({ error: 'domain and report required' });
  }

  try {
    const domainDir = path.join(REPORTS_DIR, domain.replace(/[^a-z0-9.-]/gi, '_'));
    fs.mkdirSync(domainDir, { recursive: true });

    const date = new Date().toISOString().split('T')[0];
    const filename = `${date}-${mode}.json`;
    const filepath = path.join(domainDir, filename);

    fs.writeFileSync(filepath, JSON.stringify({ domain, mode, savedAt: new Date().toISOString(), report }, null, 2));

    res.json({ saved: true, path: filepath, domain, mode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * List saved reports
 * GET /api/reports?domain=stripe.com (optional filter)
 */
app.get('/api/reports', (req, res) => {
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
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Recon SSE server listening on port ${PORT}`);
  console.log(`   Claude synthesis: ${anthropic ? 'ENABLED' : 'MOCK (set ANTHROPIC_API_KEY)'}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Report: http://localhost:${PORT}/api/report?domain=stripe.com&mode=standard`);
});
