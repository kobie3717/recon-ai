# Recon — Observable AI Web Intelligence

![Recon Dashboard](./cover.jpg)

> **Bright Data AI Agents Web Data Hackathon** · May 2026
> Live demo: [recon.whatshubb.co.za](https://recon.whatshubb.co.za) · GitHub: [kobie3717/recon-ai](https://github.com/kobie3717/recon-ai)

RECON is **observable AI web intelligence** — a multi-agent system that researches companies live in front of you, powered by **9 Bright Data products** and Claude Sonnet 4.6. Every claim links to its source. Every confidence is shown. **No fake AI.**

---

## What it does

Type a company URL (or executive name) and Recon:

1. Classifies the company type and stage (Claude Haiku)
2. Dispatches 4–10 parallel Bright Data agents simultaneously
3. Streams live progress to the UI as each agent completes
4. Synthesizes all raw data with Claude into a structured intelligence report
5. Caches results in AI-IQ memory — second query returns in **0.3s**

**Modes:**

| Mode | UI Label | Time (fresh) | What |
|------|----------|--------------|------|
| standard | Business Intelligence | ~30-45s | Company snapshot, financials, hiring, competitors |
| mcp | MCP Lite | ~10s | BD's native MCP tools: search + scrape |
| person | Person Lookup | ~20s | Executive profile, career, network, public quotes |
| footprint | Digital Presence | ~25s | Subdomains, social accounts, web properties |
| seo | Search Visibility | ~30s | Keywords, backlinks, Core Web Vitals, competitor gaps |
| lookup | Deep Research | ~30s | 47+ web-scale sources, revenue and tech insights |
| redteam | Security Review | ~35s | Attack surface, CVEs, social engineering exposure |
| deep | Full Intelligence | ~45s | 10 parallel scouts: GitHub, Glassdoor, G2, Crunchbase, TechCrunch |
| bundle | Full Report Bundle | ~60s | Standard + SEO + Red Team in one pass |
| watch | Live Monitor | streaming | Real-time web mentions as they appear |

Cache hit time: **0.3s** (99% faster).

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

## Live Streaming UX

Backend streams SSE (Server-Sent Events) to the browser for every agent tick:

```javascript
{agent: 'FIELD-OPS', status: 'running', elapsed: 1200, message: 'Fetching homepage...', extra: {...}}
```

Claude synthesis streams **token-by-token** via SDK API (not CLI subprocess) for fast TTFT. **First synthesis token arrives ~10s after click** — was 60-80s before optimization.

Synthesis starts at `facts-partial` event when **6 of 9 BD agents complete** — does NOT wait for slow agents (`bd-assistant`, `bd-scraping-browser`). Agent cards auto-expand when each completes. Composite timer is monotonic — never rewinds even on out-of-order SSE events.

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
- Frontend: Next.js 16, TypeScript, Tailwind CSS, Server-Sent Events, react-markdown for synth rendering
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

## Trust Layer — Observable AI

Every report includes a **trust layer** to surface confidence and evidence grounding:

**Intelligence Score (0-100)**: Composite per-report score calculated from:
- Evidence coverage: 50% (X of Y claims have direct source URLs)
- Weighted confidence: 30% (HIGH=1.0, MED=0.6, LOW=0.3)
- Source diversity: 20% (more unique BD products = higher score)

Bands: **HIGH** (75-100, green) / **MEDIUM** (50-74, amber) / **LOW** (0-49, red).

**Confidence pills**: Every signal, competitive insight, and strategic item displays HIGH / MED / LOW confidence based on evidence strength.

**Source ↗ links**: Every claim links to the specific Bright Data result URL (`evidence_url`). Click opens the source in a new tab. Backend grounding validator strips synthetic output that lacks `evidence_url` before returning to user.

**Evidence coverage**: Report meta includes `"evidence_coverage": "14 of 18 claims have direct evidence"`.

**Cost transparency**: Per-report cost breakdown shown to user. Example:
```json
{
  "total": 2.20,
  "breakdown": {
    "Web Unlocker": 0.30,
    "SERP API": 0.50,
    "Scraping Browser": 0.80,
    "Web Scraper": 0.40,
    "MCP Server": 0.20
  }
}
```

---

## Running Locally

```bash
# Backend
cp .env.example .env
# Set BD_API_KEY, BD_CUSTOMER_ID, ANTHROPIC_API_KEY
npm install
npm start   # Express server on :3001

# Frontend
cd recon-ui
npm install
npm run dev  # Next.js on :3002
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

**Primary submission: Track 1 — GTM Intelligence** — sales/BD intelligence, account research, competitor monitoring. Observable AI surfaces funding signals, hiring trends, strategic moves, executive profiles, attack surface, SEO position. 10 report modes covering B2B SaaS, fintech, enterprise, consumer use cases.

**Also qualifies for: Scrape and Synthesize** — multi-source web data with grounded synthesis (general track). Parallel BD agents (Web Unlocker, SERP, Scraping Browser, Web Scraper, MCP) → Claude synth with confidence scores + source attribution per claim.

---

*Built for the Bright Data AI Agents Web Data Hackathon (May 25–31, 2026)*
