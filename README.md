# Recon — Multi-Agent Competitive Intelligence

![Recon Dashboard](./cover.jpg)

> **Bright Data AI Agents Web Data Hackathon** · May 2026
> Live demo: [recon.whatshubb.co.za](https://recon.whatshubb.co.za) · GitHub: [kobie3717/recon-ai](https://github.com/kobie3717/recon-ai)

Recon deploys a parallel fleet of AI agents powered by **9 Bright Data products** to build comprehensive competitive intelligence reports in real time — streamed live to the UI as each agent completes.

---

## What it does

Type a company URL (or executive name) and Recon:

1. Classifies the company type and stage (Claude Haiku)
2. Dispatches 4–10 parallel Bright Data agents simultaneously
3. Streams live progress to the UI as each agent completes
4. Synthesizes all raw data with Claude into a structured intelligence report
5. Caches results in AI-IQ memory — second query returns in **0.3s**

**Modes:**

| Mode | Time | Agents | What |
|------|------|--------|------|
| Standard | ~8s | 4 BD parallel | Company snapshot, financials, hiring, competitors |
| Agentic | ~15s | 4 + 2 round | Self-directing: classify → scout → reason → follow-up |
| Person Intel | ~6s | 3 BD parallel | Executive profile, career, network, public quotes |
| Deep Search | ~20s | 10 parallel | GitHub, Glassdoor, G2, Crunchbase, TechCrunch + more |
| Red Team | ~25s | 6 parallel | Attack surface, CVEs, social engineering exposure |
| SEO Analysis | ~20s | 5 parallel | Keywords, backlinks, Core Web Vitals, competitor gaps |
| Footprint | ~15s | 4 parallel | Subdomains, social accounts, web properties |
| MCP Intel | ~10s | BD MCP Server | BD's native MCP tools: search + scrape |
| Bundle All | ~45s | 15+ parallel | Standard + SEO + Red Team in one pass |
| Watch Live | live | streaming | Real-time web mentions as they appear |

---

## Bright Data Integration — 9 Products

Every mode uses BD products. Core stack:

| BD Product | Agent | Purpose |
|------------|-------|---------|
| **Web Unlocker** | `FIELD-OPS` | Bypass anti-bot, fetch company homepage |
| **SERP API** | `SIGINT` | Real-time Google: news, funding, press releases |
| **Scraping Browser** | `DEEP-COVER` | Playwright CDP on LinkedIn + Crunchbase (JS SPAs) |
| **Web Scraper API** | `EXTRACTOR` | Structured homepage + /about extraction |
| **MCP Server** | `SOURCE-NET` | BD's MCP tools for search + scrape in one call |
| **Crawl API** | `CRAWLER` | Site-wide crawl for footprint mapping |
| **SERP API (×N)** | `scout-r2-*` | Agentic Round 2 targeted follow-up queries |
| **Scraping Browser** | `scout-linkedin` | Deep LinkedIn profile extraction |
| **SERP API** | `scout-*` | Deep Search: 10 parallel scouts across sources |

All BD calls fire in parallel via `Promise.all()` — wall-clock = slowest single call, not sum.

```
request arrives
    │
    ├──► FIELD-OPS   (Web Unlocker)      ──── 1.6s ──► homepage text
    ├──► SIGINT      (SERP API)          ──── 1.1s ──► news + press
    ├──► DEEP-COVER  (Scraping Browser)  ──── 2.3s ──► LinkedIn + Crunchbase
    └──► EXTRACTOR   (Web Scraper API)   ──── 0.7s ──► /about structured data
                                                   │
                                   all done at ~2.3s
                                                   │
                                           Claude synthesis
                                                   │
                                            ~8s total
```

### Scraping Browser — Playwright CDP

```javascript
const { chromium } = await import('playwright-core');
const wsEndpoint = `wss://brd-customer-${BD_CUSTOMER_ID}:${BD_API_KEY}@brd.superproxy.io:9222`;
const browser = await chromium.connectOverCDP(wsEndpoint);
// Scrape LinkedIn + Crunchbase — JS-heavy SPAs that block normal fetch
```

---

## Agentic Loop

The flagship mode — Claude acts as the agent, deciding what to research next:

```
Round 1: 4 BD agents fire in parallel
    │
Quality Gate: score R1 data (0-100%), detect gaps
    │
Claude Haiku: classifies company + extracts strategic signals
    │  "Revenue signals weak → search for funding news"
    │  "Hiring patterns suggest AI push → search for job postings"
    │
Round 2: 2 targeted SERP queries based on agent decision
    │
Claude Haiku: final synthesis with R1 + R2 + reasoning chain
    │
Report: includes agenticInsights section showing full reasoning
```

The waterfall UI streams every step live — classify → quality gate → agent decision → R2 scouts → synthesis.

```javascript
// Agent decision event (streamed live)
{
  agent: 'claude',
  status: 'agent-decided',
  findings: ['Revenue signals weak in R1 data', 'LinkedIn shows rapid hiring'],
  reasoning: ['→ implies funding event likely', '→ implies new product area'],
  followups: ['stripe funding round 2025 2026', 'stripe AI jobs engineering linkedin']
}
```

---

## Architecture

```
Browser (Next.js)
    │  EventSource (SSE)
    ▼
sse-server.mjs  (Express / Node.js)
    │
    ├── AI-IQ cache check (Map, 1h TTL) → 0.3s hit
    │
    ├── classifyAndExtract()  ← Claude Haiku: type + signals in 1 call
    │
    ├── runStandardWorker()
    │     └── Promise.all([webUnlocker, serpApi, scrapingBrowser, webScraperApi])
    │
    ├── assessDataQuality()   ← pure JS, scores 5 dimensions (0-100%)
    │
    ├── runAgenticFollowups() ← parallel SERP per signal
    │
    ├── synthesizeWithClaude() ← Claude Haiku/Sonnet → structured JSON
    │     └── 15+ typed report sections
    │
    └── SSE event stream → browser
          {agent, status, elapsed, extra} per agent tick
          {type:'report', report:{...}} final event
```

**Stack:**
- Frontend: Next.js 14, TypeScript, Tailwind CSS
- Backend: Node.js ES modules, Express, SSE — PM2 on VPS
- AI: Anthropic Claude Sonnet (`claude-sonnet-4-6`) + Haiku (`claude-haiku-4-5`)
- Data: Bright Data — Web Unlocker, SERP API, Scraping Browser, Web Scraper API, MCP Server

---

## AI-IQ Cache

Every report cached in-memory, 1-hour TTL, keyed `domain:mode`. Cache hit returns in ~0.3s and emits a timing comparison:

```javascript
{ type: 'cache-hit', cache_time: 0.3, fresh_time: 15.2 }
// UI shows: ⚡ 98% faster via AI-IQ
```

---

## Report Schema

Claude synthesizes raw BD data into a structured JSON report with 15+ typed sections:

```typescript
{
  meta: { domain, analysisDate, mode, confidence, rounds },
  signals: [{ level: 'high'|'medium'|'low', icon, text }],
  snapshot: { employees, founded, hq, stage, website, linkedin },
  financials: { totalRaised, lastRound, valuation, revenue, investors },
  hiring: [{ role, count, signal }],
  competitive: [{ competitor, weakness }],
  strategic: ['direction 1', 'direction 2'],
  products: [{ name, description }],
  news: [{ date, headline, signal: 'HIGH'|'MED'|'LOW', url }],
  techStack: [{ category, items }],
  agenticInsights: {           // agentic mode only
    roundsRun: 2,
    signalsDetected: 3,
    agentReasoning: [{ signal, reasoning, followupQuery, discovered }],
    intelligenceUpgrade: 'What R2 revealed that R1 missed'
  },
  sources: [{ agent, tool, url, dataType }],  // BD attribution per fact
  cost: { total, breakdown }
}
```

Person Intel mode: `profile`, `career`, `companies`, `network`, `publicActivity`, `quotes`.

---

## Clickable Intelligence

Every competitor and person name in a report is a clickable drill-down:

- Competitor "Salesforce" → click → searches `salesforce.com`
- Network contact "Jane Smith" → click → Person Intel on Jane Smith
- Career company → click → searches that company

---

## Running Locally

```bash
# Backend
cp .env.example .env
# Set BD_API_KEY, BD_CUSTOMER_ID, ANTHROPIC_API_KEY
npm install
npm start   # Express server on :3001

# Frontend
cd ui
npm install
npm run dev  # Next.js on :3000
```

Without API keys, server runs in **mock mode** — realistic synthetic data with artificial delays matching real BD latency. All UI features work, agentic loop runs, reports generate.

```bash
# Test agentic mode
curl "http://localhost:3001/api/report?domain=stripe.com&mode=agentic"
```

---

## Deployment

- **Backend**: VPS (PM2) — `recon-server` process on port 3001
- **Frontend**: nginx reverse proxy → Next.js on port 3002
- **Domain**: recon.whatshubb.co.za
- **Env vars**: `BD_API_KEY`, `BD_CUSTOMER_ID`, `ANTHROPIC_API_KEY`

---

## Hackathon Tracks

**Track 1: UNLOCKED-AGENT** — autonomous multi-agent pipeline with classify→scout→reason→follow-up loop. Claude Haiku acts as the decision-making agent between rounds. Every BD call is parallelized. Waterfall UI streams every agent tick in real time.

**Track 2: UNLOCKED-INTELLIGENCE** — sales and competitive intelligence platform surfacing real-time company data: funding signals, hiring trends, strategic moves, executive profiles, attack surface, SEO position. Covers B2B SaaS, fintech, enterprise, consumer — 10 report modes.

---

*Built for the Bright Data AI Agents Web Data Hackathon (May 25–31, 2026)*
