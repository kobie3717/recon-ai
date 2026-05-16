# Recon Usage Examples

## Starting the Server

```bash
cd /root/octo-workspace/recon
npm run dev
```

Server runs on port 3001 (configurable via PORT env var).

---

## API Examples

### 1. Health Check

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "agent": "recon-sse",
  "timestamp": "2026-05-16T20:17:21.602Z"
}
```

---

### 2. Standard Intelligence Report (SSE Stream)

```bash
curl "http://localhost:3001/api/report?domain=chain.link&mode=standard"
```

SSE Output (real-time events):
```
data: {"agent":"007-bot","status":"received","domain":"chain.link","elapsed":0}

data: {"agent":"circus","status":"routing","elapsed":0.06}

data: {"agent":"bd-web-unlocker","status":"fetching","url":"https://chain.link","elapsed":0.11}

data: {"agent":"bd-serp","status":"searching","query":"chain company news","elapsed":0.11}

data: {"agent":"bd-scraping-browser","status":"launching","urls":[...],"elapsed":0.11}

data: {"agent":"bd-web-scraper","status":"extracting","url":"https://chain.link","elapsed":0.11}

data: {"agent":"bd-web-scraper","status":"complete","company":"Chain Inc.","elapsed":0.83}

data: {"agent":"bd-serp","status":"complete","results":5,"elapsed":1.33}

data: {"agent":"bd-web-unlocker","status":"complete","chars":1122,"elapsed":1.72}

data: {"agent":"bd-scraping-browser","status":"complete","pages":2,"elapsed":2.45}

data: {"agent":"ai-iq","status":"storing","facts":5,"elapsed":2.45}

data: {"agent":"claude","status":"synthesizing","elapsed":2.6}

data: {"agent":"claude","status":"complete","elapsed":5.62}

data: {"agent":"007-bot","status":"complete","elapsed":5.62,"cost":2}

data: {"type":"report","domain":"chain.link","mode":"standard","facts":{...},"cost":2.00}
```

**Duration:** ~6 seconds  
**Cost:** $2.00

---

### 3. Deep Intelligence Report (10 Scouts)

```bash
curl "http://localhost:3001/api/report?domain=chain.link&mode=deep"
```

SSE Output includes:
- 10 parallel scout launches
- Independent completion events for each scout
- Extended Claude synthesis
- Comprehensive data from: homepage, LinkedIn, Crunchbase, GitHub, G2, TrustPilot, Glassdoor, TechCrunch, etc.

**Duration:** ~9 seconds  
**Cost:** $15.00

---

### 4. Synthesize Markdown Report

```bash
curl -X POST http://localhost:3001/api/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "chain.link",
    "mode": "standard",
    "facts": {
      "homepage": {...},
      "news": {...},
      "linkedin": {...},
      "crunchbase": {...},
      "structured": {...}
    }
  }'
```

Response:
```json
{
  "domain": "chain.link",
  "mode": "standard",
  "report": "# Competitive Intelligence Report: Chain\n\n...",
  "tokens": 2500,
  "cost": 0.05
}
```

---

## JavaScript/Node.js Client

```javascript
import { EventSource } from 'eventsource';

const domain = 'chain.link';
const mode = 'standard';
const url = `http://localhost:3001/api/report?domain=${domain}&mode=${mode}`;

const eventSource = new EventSource(url);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'report') {
    console.log('Final report received!');
    console.log(`Cost: $${data.cost}`);
    console.log(`Facts: ${Object.keys(data.facts).length}`);
    eventSource.close();
  } else {
    // Real-time event
    console.log(`[${data.agent}] ${data.status} @ ${data.elapsed}s`);
  }
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
  eventSource.close();
};
```

---

## Browser Fetch API

```javascript
const response = await fetch('http://localhost:3001/api/report?domain=chain.link&mode=standard');
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      console.log(data);
    }
  }
}
```

---

## Python Client

```python
import requests
import json

url = 'http://localhost:3001/api/report'
params = {'domain': 'chain.link', 'mode': 'standard'}

response = requests.get(url, params=params, stream=True)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = json.loads(line[6:])
            
            if data.get('type') == 'report':
                print(f"Report ready! Cost: ${data['cost']}")
                break
            else:
                print(f"[{data['agent']}] {data['status']} @ {data['elapsed']}s")
```

---

## cURL with Real-Time Display

```bash
curl -N "http://localhost:3001/api/report?domain=chain.link&mode=standard" | \
  while IFS= read -r line; do
    echo "$line" | sed 's/^data: //' | jq -r '. | "[" + .agent + "] " + .status'
  done
```

Output:
```
[007-bot] received
[circus] routing
[bd-web-unlocker] fetching
[bd-serp] searching
[bd-scraping-browser] launching
[bd-web-scraper] extracting
[bd-web-scraper] complete
[bd-serp] complete
[bd-web-unlocker] complete
[bd-scraping-browser] complete
[ai-iq] storing
[claude] synthesizing
[claude] complete
[007-bot] complete
```

---

## Event Types Reference

### Agent Events

| Agent | Statuses | Meaning |
|-------|----------|---------|
| `007-bot` | `received`, `complete` | Task receipt and final completion |
| `circus` | `routing` | Task routing via Circus mesh |
| `bd-web-unlocker` | `fetching`, `complete` | Homepage HTML extraction |
| `bd-serp` | `searching`, `complete` | Google search results |
| `bd-scraping-browser` | `launching`, `complete` | Headless browser for LinkedIn/Crunchbase |
| `bd-web-scraper` | `extracting`, `complete` | Structured data extraction |
| `ai-iq` | `storing` | Memory/fact storage |
| `claude` | `synthesizing`, `complete` | Report synthesis |

### Deep Mode Additional Scouts

- `scout-homepage`
- `scout-serp-news`
- `scout-serp-competitors`
- `scout-linkedin`
- `scout-crunchbase`
- `scout-github`
- `scout-g2`
- `scout-trustpilot`
- `scout-techcrunch`
- `scout-glassdoor`

---

## Frontend Integration Tips

1. **Progress Bar:** Use `elapsed` times to show progress
2. **Agent Status Grid:** Display all agents with their current status
3. **Waterfall Chart:** Visualize parallel execution timeline
4. **Cost Tracker:** Display running cost as events come in
5. **Fact Counter:** Show facts as they're collected
6. **Toast Notifications:** Flash completion events

---

## Error Handling

### Timeout (60s)
```json
{
  "type": "error",
  "message": "timeout",
  "elapsed": 60
}
```

### Missing Domain
```json
{
  "error": "domain parameter required"
}
```

### Invalid Mode
```json
{
  "error": "mode must be \"standard\" or \"deep\""
}
```

---

## Performance Notes

- **Standard Mode:** 4 parallel BD calls complete in ~6s (stub mode)
- **Deep Mode:** 10 parallel scouts complete in ~9s (stub mode)
- Real BD API timing will vary (expect 8-15s standard, 15-30s deep)
- SSE keeps connection open until final `type: 'report'` event
- No polling needed - events push automatically
- Timeout after 60s to prevent hung connections

---

## Testing Checklist

- [x] Worker smoke test (`npm test`)
- [x] SSE server starts successfully
- [x] Health endpoint responds
- [x] Standard mode SSE stream works
- [x] Deep mode SSE stream works
- [ ] Real BD API integration (May 25)
- [ ] Real Claude API synthesis (May 25)
- [ ] Frontend dashboard consumption
- [ ] Error recovery and retry logic
- [ ] Result caching in AI-IQ memory
