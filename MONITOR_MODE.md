# Monitor Mode Implementation

Monitor mode provides always-on competitive intelligence tracking for Recon. Users can add competitor domains to a watch list, and the system automatically runs Standard reports every 24 hours, detecting and notifying on significant changes.

## Features

### Core Functionality
- **24/7 Automated Monitoring**: Runs Standard reports on configured domains every 24 hours
- **Change Detection**: Compares new reports vs previous snapshots and generates diffs
- **Slack Notifications**: Sends alerts when significant changes are detected
- **Change History Timeline**: UI shows full history of detected changes per domain
- **Manual Triggers**: "Run Now" button for immediate checks

### Detected Changes
The system monitors and alerts on:
- 💰 **Funding changes**: New rounds, total raised amounts
- 👥 **Headcount changes**: Employee count increases/decreases
- 💼 **Hiring activity**: New job roles posted
- 📰 **News mentions**: New headlines not seen in previous scan
- 🎯 **Strategic shifts**: New strategic directions

## File Structure

### Backend Files

#### `/root/octo-workspace/monitor-scheduler.mjs`
Standalone scheduler module that:
- Reads monitored domains from `monitor-state.json`
- Runs checks every hour (skips domains not due for next check)
- Fetches Standard reports via SSE from local server
- Compares reports and generates diffs
- Sends Slack notifications on significant changes
- Saves snapshots and diffs to `/root/octo-workspace/reports/{domain}/snapshots/`

**Exported functions**:
- `startMonitorScheduler()` - Start the scheduler (called at server startup)
- `getMonitorState()` - Get current monitor state
- `updateMonitorState(state)` - Save monitor state
- `getDiffHistory(domain)` - Get diff history for a domain
- `triggerDomainCheck(domain)` - Trigger immediate check

#### `/root/octo-workspace/sse-server.mjs` (modified)
Added 4 new API endpoints:
- `POST /api/monitor` - Add domain to watch list
- `DELETE /api/monitor` - Remove domain from watch list
- `GET /api/monitor` - List all monitored domains
- `GET /api/monitor/diff?domain=X` - Get diff history for domain
- `POST /api/monitor/check` - Trigger immediate check for domain

Calls `startMonitorScheduler()` at server startup.

#### `/root/octo-workspace/monitor-state.json`
State file storing monitored domains:
```json
{
  "domains": [
    {
      "domain": "stripe.com",
      "addedAt": "2026-05-24T00:00:00Z",
      "slackWebhook": "https://hooks.slack.com/...",
      "intervalHours": 24,
      "lastChecked": "2026-05-24T12:00:00Z",
      "lastDiff": [...]
    }
  ]
}
```

#### `/root/octo-workspace/reports/{domain}/snapshots/`
Directory structure for storing snapshots and diffs:
- `{timestamp}.json` - Full report snapshot
- `{timestamp}-diff.json` - Detected changes diff

### Frontend Files

#### `/root/octo-workspace/ui/components/MonitorPanel.tsx`
React component with two-panel layout:
- **Left panel**: Domain list with add/remove controls, status badges, last checked time, next check countdown
- **Right panel**: Change log timeline for selected domain

Uses dark terminal aesthetic matching WatchPanel.tsx (recon-dark, recon-navy, recon-cyan colors).

#### `/root/octo-workspace/ui/components/UrlInput.tsx` (modified)
Added Monitor mode to `reportModes` array:
```typescript
{ 
  mode: 'monitor' as Mode, 
  label: 'Monitor', 
  cost: 0.0, 
  color: 'green', 
  icon: '📡', 
  description: 'Always-on monitoring: detect funding, pricing, hiring changes 24/7' 
}
```

#### `/root/octo-workspace/ui/app/page.tsx` (modified)
- Added `'monitor'` to Mode type
- Imported `MonitorPanel`
- Added monitor mode handling (doesn't trigger SSE, just shows panel)
- Added conditional render: `{currentMode === 'monitor' && <MonitorPanel />}`

## Usage

### Adding a Domain to Monitor
1. Click "📡Monitor FREE" button
2. Enter competitor domain (e.g., `stripe.com`)
3. Optionally add Slack webhook URL for notifications
4. Click "Add Domain"

### Viewing Change History
1. Click on a monitored domain in the left panel
2. Right panel shows timeline of detected changes
3. Each entry shows date, change count, and detailed changes with icons

### Manual Check
Click "Run Now" button on any domain to trigger immediate check (bypasses 24h interval).

### Slack Notifications
When significant changes are detected, a message is sent:
```
🔍 *Recon Alert: stripe.com*
Changes detected since last scan (May 23, 2026):

• 💰 Funding: raised Series B ($50M)
• 👥 Headcount: 450 → 520 (+15%)
• 📰 New news: "Stripe launches new API"
• 💼 New roles: +3 engineering roles

_View full report: https://recon.whatshubb.co.za_
```

## Scheduler Behavior

- **Check interval**: Every 1 hour (60 minutes)
- **Domain scan frequency**: Every 24 hours per domain (configurable via `intervalHours`)
- **Startup delay**: 30 seconds after server start
- **Skip logic**: Domains not due for next check are skipped
- **Error handling**: Failed checks are logged, don't block other domains

## Change Detection Logic

### Funding Changes
Compares `financials.lastRound` and `financials.totalRaised` between old and new reports.

### Headcount Changes
Compares `snapshot.employees` and calculates percentage change.

### Hiring Changes
Compares `hiring` array length (new roles added).

### News Changes
Creates a Set of old headlines, filters new headlines not in that set, shows top 2.

### Strategic Changes
Compares `strategic` array (deep equality check).

## API Reference

### POST /api/monitor
Add domain to monitor.

**Request**:
```json
{
  "domain": "stripe.com",
  "slackWebhook": "https://hooks.slack.com/...",
  "intervalHours": 24
}
```

**Response**:
```json
{
  "success": true,
  "domain": "stripe.com"
}
```

### DELETE /api/monitor
Remove domain from monitor.

**Request**:
```json
{
  "domain": "stripe.com"
}
```

**Response**:
```json
{
  "success": true,
  "domain": "stripe.com"
}
```

### GET /api/monitor
List all monitored domains.

**Response**:
```json
{
  "domains": [
    {
      "domain": "stripe.com",
      "addedAt": "2026-05-24T00:00:00Z",
      "slackWebhook": "https://hooks.slack.com/...",
      "intervalHours": 24,
      "lastChecked": "2026-05-24T12:00:00Z",
      "lastDiff": [...]
    }
  ]
}
```

### GET /api/monitor/diff?domain=stripe.com
Get diff history for domain.

**Response**:
```json
{
  "domain": "stripe.com",
  "history": [
    {
      "domain": "stripe.com",
      "savedAt": "2026-05-24T12:00:00Z",
      "diff": [
        {
          "type": "funding",
          "icon": "💰",
          "message": "Funding: Series B",
          "old": "Series A",
          "new": "Series B"
        }
      ]
    }
  ]
}
```

### POST /api/monitor/check
Trigger immediate check for domain.

**Request**:
```json
{
  "domain": "stripe.com"
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "success": true,
    "changes": [...],
    "timestamp": "2026-05-24T12:00:00Z"
  }
}
```

## Testing

### Backend Syntax Check
```bash
node --check /root/octo-workspace/monitor-scheduler.mjs
node --check /root/octo-workspace/sse-server.mjs
```

### Frontend TypeScript Check
```bash
cd /root/octo-workspace/ui && npx tsc --noEmit --skipLibCheck
```

### Module Import Test
```bash
cd /root/octo-workspace
node -e "import('./monitor-scheduler.mjs').then(m => console.log('✓ Loaded:', Object.keys(m)))"
```

### Manual Test Flow
1. Start server: `cd /root/octo-workspace && node sse-server.mjs`
2. Add domain via API: `curl -X POST http://localhost:3001/api/monitor -H "Content-Type: application/json" -d '{"domain":"stripe.com"}'`
3. Trigger check: `curl -X POST http://localhost:3001/api/monitor/check -H "Content-Type: application/json" -d '{"domain":"stripe.com"}'`
4. View diffs: `curl http://localhost:3001/api/monitor/diff?domain=stripe.com`

## Deployment Notes

- Monitor scheduler starts automatically when sse-server.mjs starts
- State persists in `monitor-state.json` (survives server restarts)
- Snapshots stored in `reports/{domain}/snapshots/` directory
- Frontend auto-refreshes domain list every 30 seconds
- No new npm dependencies required (uses built-in Node.js http module for SSE consumption)

## Hackathon Integration

For Bright Data hackathon (May 25-31):
- **Zero data cost**: Uses Standard mode reports (already optimized for BD API)
- **Real-time alerts**: Slack notifications for competitive intelligence
- **Scalable**: Can monitor unlimited competitors
- **Production-ready**: Error handling, graceful shutdown, state persistence

## Future Enhancements

Potential improvements (post-hackathon):
- Custom check intervals per domain
- Email notifications (in addition to Slack)
- Advanced diff filters (only notify on specific change types)
- Diff comparison view (side-by-side old vs new)
- Export change history to CSV/PDF
- Trend charts (headcount growth over time)
- Multi-user support (per-user monitor lists)
