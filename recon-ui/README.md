# Recon UI

Next.js frontend for the Recon competitive intelligence platform.

## Structure

```
recon-ui/
  app/
    page.tsx          # Main page with SSE integration
    layout.tsx        # Root layout
    globals.css       # Global styles and markdown styling
    api/
      proxy/
        route.ts      # SSE proxy to localhost:3001
  components/
    Header.tsx        # Top header with credits
    UrlInput.tsx      # URL input + report mode buttons
    Waterfall.tsx     # Intelligence pipeline event waterfall
    ReportPanel.tsx   # Markdown report display
```

## Development

```bash
npm run dev         # Start dev server on http://localhost:3000
npm run build       # Build for production
npm run start       # Start production server
```

## Backend Integration

The UI expects a backend server running on `http://localhost:3001` with the endpoint:

```
GET /api/report?domain=<domain>&mode=<mode>
```

Returns SSE events:
- `agent_update` - Agent status updates
- `cache_hit` - Cache hit notification
- `report` - Final markdown report
- `cost` - Cost breakdown
- `complete` - Report generation complete
- `error` - Error occurred

## Color Scheme

Uses the `recon` color palette:
- dark: #0A0E1A (background)
- navy: #0F172A (panels)
- blue: #2563EB (primary actions)
- cyan: #06B6D4 (highlights)
- green: #10B981 (success)
- amber: #F59E0B (active/fetching)
- red: #EF4444 (errors)
- grey: #64748B (secondary text)
- light: #F8FAFC (primary text)
