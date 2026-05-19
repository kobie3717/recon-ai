# Watch Mode Implementation

## Overview
Added a real-time "Watch Mode" to the Recon competitive intelligence app that streams live web mentions of a company as they're collected via Bright Data's Data Firehose API.

## Changes Made

### 1. Backend: bright-data-connector.mjs
**Added:** `dataFirehose(domain, onEvent, durationMs)` function

- **Mock Mode** (when `BD_API_KEY` not set):
  - Emits 8 simulated events over ~15 seconds
  - Events from Reddit, Twitter, News, and Blog sources
  - Each event includes: source, url, title, snippet, sentiment, timestamp
  - Events spaced ~1800ms apart
  
- **Real API Mode** (when `BD_API_KEY` is set):
  - POST to `https://api.brightdata.com/firehose/v1/stream`
  - Newline-delimited JSON streaming
  - Parses and normalizes events to consistent format
  
- Returns `stopFn` to cancel the stream

**Tested:** Mock mode working correctly (test-watch-mode.mjs validates 8 events received)

### 2. Backend: sse-server.mjs
**Added:** `/api/watch` SSE endpoint

- Accepts `domain` query parameter
- Streams real-time mentions via Server-Sent Events
- Sends initial `watch-start` event
- Each mention sent as `mention` event with type field
- Auto-stops after 5 minutes (300000ms)
- Cleans up on client disconnect

**Added:** Import for `dataFirehose` from bright-data-connector.mjs

### 3. Frontend: WatchPanel.tsx
**Created:** New React component for live watch interface

Features:
- Live/Stopped status badge (pulsing green dot when active)
- Domain monitoring display
- Real-time mention feed (newest first)
- Source icons: 🔴 Reddit, 🐦 Twitter, 📰 News, 📝 Blog
- Sentiment badges: green (positive), gray (neutral), red (negative)
- Relative timestamps ("just now", "Xs ago", etc.)
- Snippet truncation (120 chars)
- Clickable links to source URLs (opens new tab)
- Empty state: "Scanning the web for mentions..." with pulsing dots
- Auto-scroll to top when new mentions arrive
- Stop button in header

Styling: Matches dark theme of other panels (recon-dark, recon-navy, recon-cyan)

### 4. Frontend: UrlInput.tsx
**Modified:** Added Watch Mode to mode buttons

- Added `'watch'` to Mode type
- Added Watch Live button after Footprint mode
- Label: "Watch Live" | Cost: FREE | Color: green | Icon: ●
- Green button style with border and hover states
- Shows "FREE" instead of "$0.00" for zero-cost modes

### 5. Frontend: page.tsx
**Modified:** Wired up Watch Mode routing

- Added `'watch'` to Mode type
- Added `isWatching` state
- Imported WatchPanel component
- Special handling in `handleGenerate` for watch mode:
  - Sets `isWatching(true)` 
  - Sets mode to 'watch'
  - Skips SSE report pipeline entirely
  - No credit deduction (free mode)
- Added watch panel to render tree (between footprint and bundle)
- Passes `onStop` handler to reset state

## Architecture Notes

- **Separation of concerns:** Watch mode uses separate `/api/watch` endpoint, not `/api/report`
- **No credit charge:** Watch mode is free (cost: 0.0)
- **No report generation:** Doesn't save to history or use AI synthesis
- **Independent pipeline:** Doesn't interfere with standard report modes
- **Clean shutdown:** EventSource closes on stop button or component unmount

## Testing

1. **Mock mode validation:** test-watch-mode.mjs successfully receives 8 events
2. **Syntax validation:** All JS/MJS files pass node --check
3. **Type safety:** TypeScript imports resolve correctly
4. **Build validation:** Pre-existing jsPDF issue unrelated to Watch mode changes

## API Contracts

### dataFirehose Event Format
```javascript
{
  source: 'reddit' | 'twitter' | 'news' | 'blog' | 'unknown',
  url: string,
  title: string,
  snippet: string,
  sentiment: 'positive' | 'neutral' | 'negative',
  timestamp: ISO 8601 string
}
```

### /api/watch SSE Events
```javascript
// Start event
{ type: 'watch-start', domain: string, timestamp: ISO 8601 }

// Mention event
{ type: 'mention', source: string, url: string, title: string, snippet: string, sentiment: string, timestamp: ISO 8601 }
```

## Future Enhancements

- Export mentions to CSV
- Filter by sentiment
- Filter by source
- Search/highlight keywords
- Email/Slack alerts on negative mentions
- Historical mention replay
- Mention volume chart
- Custom duration selection
