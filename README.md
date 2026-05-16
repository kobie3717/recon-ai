# Recon - Multi-Agent Competitive Intelligence Platform

Real-time intelligence gathering system powered by Bright Data APIs and Claude synthesis.

## Status

**Skeleton Complete** - Mock/stub mode active until May 25 when BD API key is wired.

## Architecture

```
┌─────────────────┐
│  SSE Server     │  Express server with real-time event streaming
│  (port 3001)    │
└────────┬────────┘
         │
         ├─── GET /api/report?domain=X&mode=standard
         ├─── GET /api/report?domain=X&mode=deep
         ├─── POST /api/synthesize
         └─── GET /health
         │
         ▼
┌─────────────────┐
│  BD Worker      │  Parallel execution engine
│                 │
│  Standard Mode  │  4 parallel BD calls (~6-7s)
│  Deep Mode      │  10 parallel scouts (~8-9s)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  BD Connector   │  Bright Data API integrations
│                 │
│  • webUnlocker  │  Raw HTML/text extraction
│  • serpApi      │  Google search results
│  • scrapingBrowser │  Headless browser for SPAs
│  • webScraperApi  │  Structured data extraction
└─────────────────┘
```

## Files

- **bright-data-connector.mjs** - BD API wrapper with mock/stub fallbacks
- **bd-worker.mjs** - Parallel execution engine (standard + deep modes)
- **sse-server.mjs** - Express SSE server for real-time streaming
- **test-worker.mjs** - Smoke test with formatted console output
- **package.json** - Dependencies and scripts
- **.env** - Configuration (BD_API_KEY=STUB until May 25)

## Quick Start

```bash
# Install dependencies
npm install

# Test worker (smoke test)
npm test

# Start SSE server
npm run dev
```

## Testing

### Worker Test
```bash
node test-worker.mjs
```

Expected output: Real-time event waterfall completing in 5-7 seconds with all agents reporting.

### SSE Server Test
```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Test with curl
curl "http://localhost:3001/api/report?domain=chain.link&mode=standard"
```

Expected: SSE stream with `data:` events, final report, connection close.

## Mock Data

All BD functions return realistic mock data when `BD_API_KEY=STUB`:

- **webUnlocker**: 800+ char company homepage
- **serpApi**: 5 news headlines with dates
- **scrapingBrowser**: LinkedIn + Crunchbase profiles
- **webScraperApi**: Structured company data (funding, employees, etc.)

Artificial delays simulate real API latency:
- webUnlocker: 1600ms
- serpApi: 1100ms
- scrapingBrowser: 2300ms
- webScraperApi: 700ms

## Cost Model

### Standard Mode ($2.00)
- webUnlocker: $0.30
- serpApi: $0.50
- scrapingBrowser: $0.80
- webScraperApi: $0.40

### Deep Mode ($15.00)
- 10 parallel scouts
- Extended Claude synthesis
- Comprehensive data collection

## Event Stream

Real-time events emitted during execution:

```javascript
{ agent: '007-bot', status: 'received', domain: 'X', elapsed: 0 }
{ agent: 'circus', status: 'routing', elapsed: 0.1 }
{ agent: 'bd-web-unlocker', status: 'fetching', url: '...', elapsed: 0.12 }
{ agent: 'bd-web-unlocker', status: 'complete', chars: 1122, elapsed: 1.73 }
{ agent: 'ai-iq', status: 'storing', facts: 5, elapsed: 2.48 }
{ agent: 'claude', status: 'synthesizing', elapsed: 2.58 }
{ agent: 'claude', status: 'complete', elapsed: 5.49 }
{ agent: '007-bot', status: 'complete', cost: 2.00, elapsed: 5.49 }
```

## Integration Checklist (May 25)

- [ ] Wire real `BD_API_KEY` in .env
- [ ] Add `BD_CUSTOMER_ID` for Scraping Browser
- [ ] Implement Playwright + BD proxy for scrapingBrowser
- [ ] Wire Web Scraper API dataset trigger
- [ ] Add `ANTHROPIC_API_KEY` for synthesis
- [ ] Implement real Claude API call in `/api/synthesize`
- [ ] Test with real domains (not just mocks)
- [ ] Add error handling for BD rate limits
- [ ] Implement result caching (AI-IQ memory)

## Next Steps

1. **Frontend Dashboard** - Real-time SSE consumption with Svelte/React
2. **Circus Integration** - Route tasks to Octo via localhost:6200
3. **Memory Layer** - Store reports in AI-IQ with `memory-tool`
4. **Cost Tracking** - Log BD usage and optimize parallel execution
5. **Report Templates** - Customize output format per industry/use-case

## Notes

- Parallel execution minimizes wall-clock time (critical for SSE UX)
- Each BD call emits start + complete events independently
- Mock delays simulate real-world timing patterns
- Total runtime: ~6s standard, ~9s deep (with mocks)
- Production timing will vary based on BD API latency

---

**Built by Octo** | Agent ID: octo-7aea1b | Workspace: /root/octo-workspace/recon
