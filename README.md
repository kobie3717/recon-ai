# Recon — Multi-Agent Competitive Intelligence

![Recon Dashboard](./cover.jpg)

> **Bright Data AI Agents Web Data Hackathon** · May 2026
> Live demo: [ui-beta-green.vercel.app](https://ui-beta-green.vercel.app) · GitHub: [kobie3717/recon-ai](https://github.com/kobie3717/recon-ai)

Recon is a real-time competitive intelligence platform that deploys a parallel fleet of AI agents to build comprehensive company intelligence reports in under 10 seconds.

---

## What it does

Type a company URL (or executive name) and Recon:

1. Dispatches 4–10 parallel Bright Data agents simultaneously
2. Streams live progress to the UI as each agent completes
3. Synthesizes all raw data with Claude Sonnet into a structured intelligence report
4. Caches results in AI-IQ memory — second query returns in 0.3s

**Modes:**
| Mode | Time | What |
|------|------|------|
| Standard Report | ~8s | Company snapshot, financials, hiring, competitors |
| Person Intel | ~6s | Executive profile, career, network, quotes |
| Compare | ~8s | Side-by-side analysis of two companies |
| Deep Search | ~15s | 10 parallel scouts, extended synthesis |

---

## Bright Data Integration

Four BD products used in parallel on every standard report:

| BD Product | Agent | Purpose |
|------------|-------|---------|
| **Web Unlocker** | `bd-web-unlocker` | Bypass anti-bot to fetch company homepage |
| **SERP API** | `bd-serp` | Real-time Google results: news, funding, press |
| **Scraping Browser** | `bd-scraping-browser` | Playwright CDP on LinkedIn + Crunchbase (JS-heavy SPAs) |
| **Web Unlocker (×2)** | `bd-web-scraper` | Homepage + /about structured extraction |

All BD calls fire in parallel via `Promise.all()` — wall-clock time = slowest single call, not sum.

```
request arrives
    │
    ├──► bd-web-unlocker    ──── 1.6s ──► homepage text
    ├──► bd-serp            ──── 1.1s ──► news headlines
    ├──► bd-scraping-browser ─── 2.3s ──► LinkedIn + Crunchbase
    └──► bd-web-scraper     ──── 0.7s ──► /about structured data
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

## Architecture

```
Browser (Next.js / Vercel)
    │  EventSource
    ▼
/api/proxy  (Next.js API route)
    │  SSE forward
    ▼
sse-server.mjs  (Express / Railway)
    │
    ├── AI-IQ cache check (Map, 1h TTL)
    │
    ├── runStandardWorker()
    │     └── Promise.all([webUnlocker, serpApi, scrapingBrowser, webScraperApi])
    │
    ├── synthesizeWithClaude()  — claude-sonnet-4-6
    │     └── structured JSON: 15+ report sections
    │
    └── SSE event stream → browser
          {agent, status, elapsed} per agent tick
          {type:'report', report:{...}} final event
```

**Stack:**
- Frontend: Next.js 14, TypeScript, Tailwind CSS — deployed on Vercel
- Backend: Node.js ES modules, Express, SSE — deployed on Railway
- AI: Anthropic Claude Sonnet (`claude-sonnet-4-6`)
- Data: Bright Data Web Unlocker, SERP API, Scraping Browser

---

## AI-IQ Cache

Every report is cached in-memory with a 1-hour TTL keyed by `domain:mode`. Cache hits return in ~0.3s and emit a `cache-hit` SSE event with timing comparison.

```javascript
// Cache hit — returns in 0.3s vs 8s fresh
{ type: 'cache-hit', cache_time: 0.3, fresh_time: 8.2 }
```

---

## Report Schema

Claude synthesizes raw BD data into a structured JSON report with 15+ typed sections:

```typescript
{
  meta: { domain, analysisDate, mode },
  signals: [{ level: 'high'|'medium'|'low', icon, text }],
  snapshot: { employees, founded, headquarters, funding, stage },
  financials: { arr, growth, runway, burnRate },
  hiring: [{ role, count, signal }],
  competitors: [{ competitor, threat: 'high'|'medium'|'low', why }],
  strategic: { initiatives, risks, opportunities },
  products: [{ name, description, differentiator }],
  customers: { segments, marquee, churnSignals },
  news: [{ date, headline, sentiment, signal }],
  techStack: [{ category, tools }],
  sources: [{ agent, tool, url, dataType }],  // BD attribution per section
  cost: { total, breakdown }
}
```

Person Intel mode produces a separate schema: `profile`, `career`, `companies`, `network`, `publicActivity`, `quotes`.

---

## Clickable Intelligence

Every competitor name and person name in a report is a clickable drill-down — clicking copies the entity to the search bar for immediate follow-on analysis.

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
npm start

# Frontend
cd ui
npm install
npm run dev
```

Without API keys, the server runs in mock mode with realistic synthetic data and artificial delays matching real API latency.

---

## Deployment

- **Backend**: Railway — `powerful-mindfulness` service
- **Frontend**: Vercel — `ui` project
- **Env vars**: `BD_API_KEY`, `BD_CUSTOMER_ID`, `ANTHROPIC_API_KEY`, `RECON_SERVER_URL`

---

## Hackathon Tracks

**Track 1: UNLOCKED-AGENT** — autonomous multi-agent pipeline dispatching parallel BD calls, streaming results in real time, caching intelligence for instant replay.

**Track 2: UNLOCKED-INTELLIGENCE** — sales and competitive intelligence tool surfacing real-time company data: funding signals, hiring trends, strategic moves, executive profiles.

---

*Built for the Bright Data AI Agents Web Data Hackathon (May 25–31, 2026)*
