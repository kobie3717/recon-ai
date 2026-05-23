# Testing Watch Mode

## Quick Test: Mock Data (No API Key Required)

### 1. Test the dataFirehose function directly
```bash
cd /root/octo-workspace/recon
node test-watch-mode.mjs
```

Expected output:
- 8 events over ~15 seconds
- Events from Reddit, Twitter, News, Blog
- Each event has source, title, snippet, sentiment, timestamp
- Auto-stops after 20 seconds

### 2. Test the SSE endpoint (requires running server)

**Terminal 1: Start server**
```bash
cd /root/octo-workspace/recon
node sse-server.mjs
```

**Terminal 2: Test endpoint**
```bash
cd /root/octo-workspace/recon
npm install eventsource  # if not already installed
node test-watch-sse.mjs stripe.com
```

Expected output:
- SSE connection established
- Watch started event
- 8 mention events over ~15 seconds
- Auto-stops after 20 seconds

### 3. Test the UI (requires UI build)

**Start backend:**
```bash
cd /root/octo-workspace/recon
node sse-server.mjs
```

**Start frontend:**
```bash
cd /root/octo-workspace/recon/ui
npm run dev
```

**Visit:** http://localhost:3000

**Steps:**
1. Enter a domain (e.g., "stripe.com")
2. Click "Watch Live FREE" button (green, 4th button)
3. Watch live mentions appear in real-time
4. Verify:
   - Live badge is pulsing green
   - Mentions appear every ~2 seconds
   - Source icons show: 🔴 Reddit, 🐦 Twitter, 📰 News, 📝 Blog
   - Sentiment badges are colored (green/gray/red)
   - Timestamps show relative time ("Xs ago")
   - Links open in new tab
5. Click "Stop" button to end the stream

## Production Test: Real Bright Data API

### Prerequisites
- Set `BD_API_KEY` in `.env` file
- Valid Bright Data account with Firehose access

### Test Flow
Same as mock tests above, but:
- Real API calls to `https://api.brightdata.com/firehose/v1/stream`
- Real-time mentions from actual web sources
- Stream runs for up to 5 minutes (configurable via `durationMs` param)

## Integration Tests

### Backend Tests
```bash
# Syntax validation
node --check bright-data-connector.mjs
node --check sse-server.mjs

# Function test
node test-watch-mode.mjs

# SSE endpoint test (requires running server)
node test-watch-sse.mjs
```

### Frontend Tests
```bash
cd ui

# Type check (will show pre-existing jsPDF errors, ignore those)
npx tsc --noEmit --skipLibCheck

# Build test
npm run build  # May fail on jsPDF issue, but Watch mode code is valid

# Dev mode (recommended)
npm run dev
```

## Troubleshooting

### "Module not found: dataFirehose"
- Verify export exists: `grep "export function dataFirehose" bright-data-connector.mjs`
- Verify import exists: `grep "import.*dataFirehose" sse-server.mjs`

### SSE connection fails
- Ensure backend is running on port 3001
- Check CORS headers in `/api/watch` endpoint
- Verify domain validation passes

### No events appearing in UI
- Check browser console for errors
- Verify EventSource is connecting to correct backend URL
- Check `NEXT_PUBLIC_BACKEND_URL` env var in UI

### Events not stopping
- Verify `stopFirehose()` is called on component unmount
- Check EventSource is closed in cleanup
- Verify request 'close' handler is registered

## Performance Notes

- Mock mode: Low CPU, ~8 events in 15s
- Real API mode: Network-bound, varies by actual mentions found
- SSE connection: Lightweight, minimal overhead
- Auto-stops after 5 minutes to prevent runaway streams
- Clean shutdown on client disconnect
