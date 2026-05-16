# Recon Deployment Plan

## Current Status

**Phase 1 Complete:** Skeleton with stub/mock data operational.

- Working SSE server on port 3001
- Parallel BD worker with standard + deep modes
- Mock data for all 4 BD API functions
- Real-time event streaming tested
- ~2400 lines of code
- All smoke tests passing

---

## May 25 Integration Checklist

### 1. Bright Data API Setup

#### Environment Variables
```bash
# Add to .env
BD_API_KEY=<actual-key>
BD_CUSTOMER_ID=<customer-id>
```

#### API Endpoints to Wire

**Web Unlocker**
```javascript
POST https://api.brightdata.com/request
Headers: Authorization: Bearer ${BD_API_KEY}
Body: {
  zone: "unlocker",
  url: "https://target.com",
  format: "raw"
}
```

**SERP API**
```javascript
POST https://api.brightdata.com/serp
Headers: Authorization: Bearer ${BD_API_KEY}
Body: {
  engine: "google",
  q: "search query",
  num: 10
}
```

**Scraping Browser**
```javascript
// Install playwright first
npm install playwright

// Connect to BD proxy
import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP(
  `wss://brd-customer-${BD_CUSTOMER_ID}:${BD_API_KEY}@brd.superproxy.io:9222`
);
const page = await browser.newPage();
await page.goto(url);
const text = await page.evaluate(() => document.body.innerText);
```

**Web Scraper API**
```javascript
POST https://api.brightdata.com/datasets/v3/trigger
Headers: Authorization: Bearer ${BD_API_KEY}
Body: {
  dataset_id: "<company-profile-dataset>",
  url: "https://target.com"
}
```

#### Update Files
- [x] `bright-data-connector.mjs` - Remove stub mode, wire real APIs
- [ ] Test with real domains (start with well-known companies)
- [ ] Add rate limit handling (BD has per-second/per-minute limits)
- [ ] Add retry logic with exponential backoff

---

### 2. Claude Synthesis Integration

#### Environment Variables
```bash
# Add to .env
ANTHROPIC_API_KEY=<actual-key>
```

#### Implementation
```javascript
// In sse-server.mjs synthesize route
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const message = await anthropic.messages.create({
  model: 'claude-3-5-sonnet-20250219',
  max_tokens: 4000,
  messages: [{
    role: 'user',
    content: `Generate competitive intelligence report for ${domain}.\n\nData: ${JSON.stringify(facts)}`
  }]
});

const report = message.content[0].text;
```

#### Update Files
- [ ] `sse-server.mjs` - Replace mock report with real Claude call
- [ ] Add streaming support for live report generation
- [ ] Implement prompt templates per industry/use-case
- [ ] Add cost tracking per synthesis

---

### 3. Memory Layer Integration

#### AI-IQ Storage
```bash
# Store reports in memory system
memory-tool add competitive-intel \
  "Report for ${domain}: ${summary}" \
  --project Octo \
  --tags recon,${domain},${mode}
```

#### Caching Strategy
```javascript
// Before running BD worker, check cache
const cached = await memoryTool.search(domain);
if (cached && isFresh(cached.timestamp, 30 * 24 * 60 * 60 * 1000)) {
  return cached.report; // Return if < 30 days old
}

// After synthesis, store in memory
await memoryTool.add('competitive-intel', {
  domain,
  mode,
  report,
  facts,
  cost,
  timestamp: Date.now()
});
```

#### Update Files
- [ ] `bd-worker.mjs` - Add memory cache check before BD calls
- [ ] `sse-server.mjs` - Store synthesized reports in AI-IQ
- [ ] Add `GET /api/cache?domain=X` to check for cached reports
- [ ] Implement cache invalidation strategy

---

### 4. Circus Integration

#### Register Recon Task Handler
```javascript
// Register with local Circus at http://localhost:6200
POST http://localhost:6200/api/tasks
Headers: Authorization: Bearer <ring-token>
Body: {
  agent_id: "octo-7aea1b",
  task_type: "competitive-intel",
  handler_url: "http://localhost:3001/api/report"
}
```

#### Task Routing
- Circus receives `competitive-intel` task
- Routes to Octo agent (octo-7aea1b)
- Octo's Recon SSE server handles execution
- Results streamed back via SSE
- Final report stored in AI-IQ

#### Update Files
- [ ] Create `circus-handler.mjs` - Task listener and SSE proxy
- [ ] Add Circus task registration on server startup
- [ ] Implement SSE-to-Circus event forwarding
- [ ] Add task completion callback to Circus

---

### 5. Frontend Dashboard

#### Technology Stack
- **Framework:** Svelte or React
- **SSE Client:** EventSource API
- **UI Components:** Real-time event timeline, progress bars, cost tracker

#### Features
- Domain input field
- Mode selector (standard/deep)
- Real-time event waterfall visualization
- Agent status grid (all agents + their states)
- Cost tracker (running total)
- Fact collector (show facts as they arrive)
- Final report viewer (markdown renderer)
- Export options (PDF, JSON, markdown)

#### File Structure
```
/root/octo-workspace/recon-dashboard/
  ├── src/
  │   ├── App.svelte
  │   ├── components/
  │   │   ├── DomainInput.svelte
  │   │   ├── EventTimeline.svelte
  │   │   ├── AgentGrid.svelte
  │   │   ├── CostTracker.svelte
  │   │   ├── ReportViewer.svelte
  │   └── lib/
  │       └── sse-client.js
  └── package.json
```

---

### 6. Production Deployment

#### Server Setup
```bash
# Install PM2 for process management
npm install -g pm2

# Start server with PM2
cd /root/octo-workspace/recon
pm2 start sse-server.mjs --name recon-sse

# Configure auto-restart
pm2 startup
pm2 save
```

#### Nginx Reverse Proxy
```nginx
# Add to WhatsHub VPS nginx config
location /api/recon/ {
  proxy_pass http://localhost:3001/api/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_cache_bypass $http_upgrade;
  proxy_read_timeout 65s;
}
```

#### Monitoring
```bash
# PM2 monitoring
pm2 monit

# Check logs
pm2 logs recon-sse

# Restart if needed
pm2 restart recon-sse
```

---

### 7. Cost Optimization

#### BD API Cost Tracking
```javascript
// Track actual BD costs per call
const costLog = {
  webUnlocker: 0.005 * chars / 1000,  // Example: $0.005 per 1K chars
  serpApi: 0.10 per query,
  scrapingBrowser: 0.025 per page,
  webScraperApi: 0.15 per extraction
};

// Store in database for analytics
await db.costs.insert({
  domain,
  timestamp: Date.now(),
  breakdown: costLog,
  total: sum(costLog)
});
```

#### Caching to Reduce Costs
- Cache homepage HTML for 7 days
- Cache SERP results for 24 hours
- Cache LinkedIn/Crunchbase for 30 days
- Cache structured data for 30 days
- Only re-run expired data sources

#### Parallel Execution Optimization
- Standard mode: 4 parallel calls = 1× BD concurrency cost
- Deep mode: 10 parallel scouts = 2.5× BD concurrency cost
- Consider rate limits and optimize batch sizes

---

### 8. Error Handling & Resilience

#### BD API Failures
```javascript
// Retry with exponential backoff
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000 * Math.pow(2, i)); // 1s, 2s, 4s
    }
  }
}
```

#### Partial Results
```javascript
// If some BD calls fail, continue with partial data
const results = await Promise.allSettled([
  webUnlocker(url),
  serpApi(query),
  scrapingBrowser(urls),
  webScraperApi(url)
]);

const facts = results
  .filter(r => r.status === 'fulfilled')
  .map(r => r.value);
```

#### Circuit Breaker
```javascript
// Disable BD endpoints temporarily if failure rate > 50%
const circuitBreaker = {
  failures: 0,
  threshold: 5,
  isOpen: false,
  async call(fn) {
    if (this.isOpen) throw new Error('Circuit breaker open');
    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures++;
      if (this.failures >= this.threshold) {
        this.isOpen = true;
        setTimeout(() => this.isOpen = false, 60000); // Reset after 1 min
      }
      throw error;
    }
  }
};
```

---

## Timeline

**May 16 (Today):** Skeleton complete, all mocks working ✓

**May 17-24:** Frontend dashboard development (optional, can defer)

**May 25:**
- Wire Bright Data API (2 hours)
- Wire Claude API synthesis (1 hour)
- Test with 5-10 real domains (1 hour)
- Deploy to production with PM2 (30 min)
- Document actual costs and timing (30 min)

**May 26-31:** Memory layer, Circus integration, cost optimization

**June 1+:** Production rollout, customer testing

---

## Testing Strategy

### Unit Tests
```bash
# Test each BD connector function independently
node test-bd-connector.mjs
```

### Integration Tests
```bash
# Test full worker with real APIs
node test-worker-real.mjs chain.link
```

### Load Tests
```bash
# Concurrent requests
for i in {1..10}; do
  curl "http://localhost:3001/api/report?domain=example-$i.com&mode=standard" &
done
```

### Cost Tests
```bash
# Track actual costs for 100 domains
node cost-analysis.mjs --domains 100 --mode standard
```

---

## Success Metrics

- **Latency:** Standard mode < 15s, Deep mode < 30s
- **Reliability:** 99%+ success rate
- **Cost:** Standard < $3.00, Deep < $20.00 per report
- **Cache Hit Rate:** > 60% for repeat domains
- **Synthesis Quality:** 90%+ user satisfaction
- **Concurrency:** Support 10+ parallel requests

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| BD API rate limits | High | Implement rate limiter, queue system |
| BD API costs exceed budget | High | Aggressive caching, cost alerts |
| Claude synthesis fails | Medium | Fallback to template-based reports |
| SSE connection drops | Medium | Auto-reconnect with resume support |
| Scout timeout in deep mode | Low | Individual timeouts per scout |
| Scraping Browser instability | Medium | Retry + fallback to webUnlocker |

---

## Future Enhancements

- **Multi-domain batch processing** - Analyze 10 competitors simultaneously
- **Scheduled refreshes** - Auto-update reports every 30 days
- **Diff reports** - Show changes since last analysis
- **Alert system** - Notify when competitors make major moves
- **Export formats** - PDF, PowerPoint, Excel
- **API rate limiting** - Prevent abuse
- **User authentication** - JWT-based access control
- **Webhook callbacks** - Notify external systems when reports complete

---

**Deployment Owner:** Octo (octo-7aea1b)  
**Workspace:** /root/octo-workspace/recon  
**Status:** Phase 1 Complete, Ready for May 25 BD Integration
