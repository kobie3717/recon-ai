# Recon — Build Plan
**Hackathon:** Bright Data AI Agents | May 25-31, 2026
**Stack:** Next.js + Node.js + Circus mesh + Claude API + Bright Data

---

## Timeline

### Now → May 24 (skeleton, no BD APIs yet)
Build everything with mock/stub responses. Wire BD on May 25.

### May 25 (Day 1)
- Get $250 BD credits from kickoff stream
- Swap stubs → real BD API calls
- Test end-to-end, record timing
- Lock marketing copy based on real numbers

### May 26-30
- Polish UI
- Record demo video
- Prep slide deck submission

### May 31
- Demo + awards

---

## Report Tiers

| Mode | Scouts | Time | Cost |
|------|--------|------|------|
| Standard | 4 BD products, parallel | ~7-25s | $2.00 |
| SEO | 6 scouts, parallel | ~18s | $5.00 |
| Red Team (OSINT) | 8 scouts, parallel | ~30s | $12.00 |
| Deep Search | 10 scouts, parallel | ~24s | $15.00 |
| Bundle | All of above | ~45s | $25.00 |

---

## Architecture

```
User → Next.js UI
         ↓ SSE stream
      007-bot (Circus agent)
         ↓ Circus task dispatch
      BD Worker (parallel Promise.all)
         ├── Web Unlocker      ← homepage scrape
         ├── SERP API          ← news + competitors
         ├── Scraping Browser  ← LinkedIn, Crunchbase (JS-heavy)
         └── Web Scraper API   ← structured extraction
         ↓
      AI-IQ (memory layer)
         ↓ cache check first, store after
      Claude API (synthesis)
         ↓
      Circus shared pool → all agents can access
         ↓
      007-bot → SSE → UI (report + cost breakdown)
```

---

## Speed Optimizations (IN SCOPE)

### 1. Parallel execution — Priority 1
All BD calls fire simultaneously via `Promise.all()`. Total scraping time = slowest single step, not sum of all.

```javascript
// BD Worker core pattern
const [homepage, serp, jsPages, structured] = await Promise.all([
  webUnlocker(url),
  serpApi(`${companyName} news`),
  scrapingBrowser([linkedinUrl, crunchbaseUrl]),
  webScraperApi(url)
]);
// Emit SSE events as each resolves
```

**Expected gain: ~75% reduction in scraping time**

### 2. SSE streaming waterfall — Priority 1
Don't wait for full report. Stream each pipeline event to UI as it happens. User sees live progress from 0.1s.

```javascript
// Each step emits immediately on completion
res.write(`data: ${JSON.stringify({ agent: 'web-unlocker', status: 'complete', elapsed: 1.4 })}\n\n`);
```

**Expected gain: 0s real, 100% perceived speed improvement**

### 3. AI-IQ cache check before BD calls — Priority 1
Before any BD call, check if domain was researched recently (<7 days). Cache hit = skip all scraping, straight to Claude.

```javascript
const cached = await memoryTool.search(domain, { project: 'Recon', maxAge: '7d' });
if (cached.facts.length > 10) {
  // Skip BD entirely, synthesize from cache
  emit({ agent: 'ai-iq', status: 'cache-hit', facts: cached.facts.length });
  return synthesize(cached.facts);
}
```

**Expected gain: 100% scraping cost eliminated on cache hits (~3s total)**

### 4. domcontentloaded + short wait — Priority 2
For Scraping Browser steps: use `domcontentloaded` + 800ms wait instead of `networkidle`. 2-3× faster on JS-heavy pages.

```javascript
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(800);
```

**Expected gain: 3-8s per browser step**

### 5. HTTP-first check — Priority 2
Before launching Scraping Browser (expensive), try plain HTTP fetch. If response has enough text (>2000 chars) → skip browser. Only use Scraping Browser when truly needed.

```javascript
const quickFetch = await webUnlocker(url); // fast, no JS
if (quickFetch.text.length > 2000) {
  // Static page, no browser needed
  return quickFetch;
}
// Fallback to Scraping Browser
return scrapingBrowser(url);
```

**Expected gain: ~3-4s saved on ~50% of targets**

### 6. Aggressive timeouts — Priority 2
Fail fast on slow targets. Partial data > no data.

```javascript
const BD_TIMEOUT = 8000; // 8s max per BD call
// If timeout: return partial data, mark in waterfall as ⚠️
```

**Expected gain: prevents worst-case 60s+ scenarios**

---

## UI Components (to build)

### Standard UI (both panels)
```
LEFT PANEL: Intelligence Pipeline (SSE waterfall)
  - Real-time progress bars per agent
  - Elapsed time per step
  - ✓ / ✗ / ⚠️ status per step
  - Total elapsed at bottom

RIGHT PANEL: Report
  - Markdown-rendered report
  - Streams in as Claude generates
  - Cost breakdown footer
  - Download PDF / Share buttons
```

### Deep Search UI addition
- 10 parallel lanes instead of sequential steps
- All fire simultaneously at 0.2s
- Lanes complete independently (longest = 12s, others finish earlier)

### Report buttons
```
[Generate Report $2]  [Deep Search $15 ✦]  [SEO $5]  [Red Team $12]  [Bundle $25]
```

### Credits display
- Top right: `Credits: $198.00`
- Deducts in real-time after each report
- Color: green → amber → red as balance drops

### Cache indicator
```
⚡ Domain researched 3× before. Loading from AI-IQ memory...
   Report ready in 0.3s (vs 9s fresh)
```

---

## Bright Data Integration (stub now, swap May 25)

| BD Product | Purpose | Track Relevance |
|------------|---------|----------------|
| Web Unlocker | Homepage scrape | Track 3 (Infrastructure) |
| SERP API | News & competitors | Track 2 (Intelligence) |
| Scraping Browser | JS-heavy pages | Track 3 (Infrastructure) |
| Web Scraper API | Structured extraction | Track 2 (Intelligence) |
| MCP Server | Native Claude tools | Track 1 (Agent) |

```javascript
// bright-data-connector.mjs
const BD_API_KEY = process.env.BD_API_KEY || 'STUB';

export async function webUnlocker(url) {
  if (BD_API_KEY === 'STUB') return mockHomepage(url);
  return fetch('https://api.brightdata.com/unlocker', {
    method: 'POST',
    body: JSON.stringify({ url }),
    headers: { Authorization: `Bearer ${BD_API_KEY}` }
  }).then(r => r.json());
}

export async function serpApi(query) {
  if (BD_API_KEY === 'STUB') return mockSerp(query);
  return fetch('https://api.brightdata.com/serp/google', {
    method: 'POST',
    body: JSON.stringify({ q: query, num: 14 }),
    headers: { Authorization: `Bearer ${BD_API_KEY}` }
  }).then(r => r.json());
}

export async function scrapingBrowser(url) {
  if (BD_API_KEY === 'STUB') return mockBrowser(url);
  return fetch('https://api.brightdata.com/scraping-browser', {
    method: 'POST',
    body: JSON.stringify({ url, render_js: true }),
    headers: { Authorization: `Bearer ${BD_API_KEY}` }
  }).then(r => r.json());
}

export async function webScraperApi(url) {
  if (BD_API_KEY === 'STUB') return mockScraper(url);
  return fetch('https://api.brightdata.com/web-scraper', {
    method: 'POST',
    body: JSON.stringify({ url, schema: 'company' }),
    headers: { Authorization: `Bearer ${BD_API_KEY}` }
  }).then(r => r.json());
}

// MCP Server integration (Track 1 requirement)
// Connect Claude directly to BD via MCP protocol
// Use BD's MCP server for native tool calls during synthesis
import { BrightDataMCPClient } from '@brightdata/mcp';
const mcp = new BrightDataMCPClient({ apiKey: BD_API_KEY });
// Claude can then call BD tools natively during report generation
```

---

## Performance Targets

| Scenario | Target |
|----------|--------|
| Standard (BD, parallel) | < 10s |
| Standard (cache hit) | < 3s |
| Deep Search (BD, parallel) | < 30s |
| SEO report | < 15s |
| Red Team OSINT | < 25s |
| Worst case (slow target, no cache) | < 60s |

**Marketing copy:** *"Analyst-grade report in under 60 seconds. Typically under 30. Cache hits: under 3 seconds."*
Lock exact number after May 25 real BD test.

---

## Track Strategy — Enter All 3

| Track | How Recon qualifies |
|-------|-------------------|
| Track 1: AGENT | 007-bot + 10 scouts, multi-agent research pipeline, BD MCP Server |
| Track 2: INTELLIGENCE | AI-IQ memory backbone, always-on B2B intelligence, structured JSON output |
| Track 3: INFRASTRUCTURE | Parallel pipelines, auto-retry, clean JSON for LLMs, no maintenance scraping |

Entering all 3 tracks = 3 shots at Startup Program ($20K credits each track).
Grand Prize ($5K cash) awarded to best single project across all tracks.

---

## Submission Checklist

- [ ] Public GitHub repo
- [ ] MIT LICENSE file in GitHub repo
- [ ] Cover image (1200x630px, dark branded)
- [ ] Live demo URL (deployed, judges can hit)
- [ ] Demo video (< 4 min, tight narrative)
- [ ] Slide deck (`recon-pitch-deck.pdf`)
- [ ] Credits system visible in UI
- [ ] All 5 BD products firing (visible in waterfall)
- [ ] Cost breakdown shown per report
- [ ] Cache hit demo (second query on same domain)
- [ ] Deep Search with 10 parallel scouts
- [ ] lablab.ai submission form filled (title, short desc, long desc, tags)
- [ ] Discord joined for extra credits request

---

## Files (current)

| File | Status |
|------|--------|
| `recon-pitch-deck.pdf` | Done — 17 slides |
| `chainlink-intelligence-report.pdf` | Done — Standard demo |
| `chainlink-deep-intelligence-report.pdf` | Done — Deep Search demo |
| `pitch-deck.md` | Done — source |
| `bright-data-connector.mjs` | TODO — build now with stubs |
| `bd-worker.mjs` | TODO — parallel Promise.all |
| `sse-server.mjs` | TODO — streaming waterfall |
| `ui/` | TODO — Next.js app |
