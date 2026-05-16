import { ReconEvent } from '../hooks/useReconSSE';

interface WaterfallEventProps {
  event: ReconEvent;
}

const agentIcons: Record<string, string> = {
  '007-bot': '🕵',
  'circus': '⚡',
  'bd-web-unlocker': '🌐',
  'bd-serp': '🔍',
  'bd-scraping-browser': '🖥',
  'bd-web-scraper': '📊',
  'ai-iq': '🧠',
  'claude': '✨',
};

const statusColors: Record<string, string> = {
  fetching: 'text-recon-amber',
  complete: 'text-recon-green',
  error: 'text-recon-red',
  routing: 'text-recon-cyan',
};

export default function WaterfallEvent({ event }: WaterfallEventProps) {
  const icon = agentIcons[event.agent] || '📌';
  const colorClass = statusColors[event.status] || 'text-recon-grey';

  const isCacheHit = event.type === 'cache-hit';

  return (
    <div className="border-l-2 border-recon-blue/30 pl-4 py-2 relative">
      {isCacheHit && (
        <div className="mb-2 bg-recon-cyan/10 border border-recon-cyan/30 rounded px-3 py-2 text-recon-cyan text-sm">
          ⚡ Loaded from AI-IQ memory — {event.elapsed?.toFixed(1) || '0.3'}s vs ~9s fresh
        </div>
      )}

      <div className="flex items-center gap-3 text-sm">
        <span className="text-lg">{icon}</span>
        <span className="text-recon-grey font-medium min-w-[120px]">{event.agent}</span>
        <span className={`${colorClass} font-medium`}>{event.status}</span>
        <span className="flex-1 text-recon-light">{event.message}</span>
        {event.elapsed !== undefined && (
          <span className="text-recon-grey text-xs">{event.elapsed.toFixed(1)}s</span>
        )}
      </div>

      {event.status === 'fetching' && (
        <div className="mt-2 h-1 bg-recon-navy rounded-full overflow-hidden">
          <div className="h-full bg-recon-amber animate-pulse w-2/3"></div>
        </div>
      )}

      {event.status === 'complete' && (
        <div className="mt-2 h-1 bg-recon-navy rounded-full overflow-hidden">
          <div className="h-full bg-recon-green w-full"></div>
        </div>
      )}
    </div>
  );
}
