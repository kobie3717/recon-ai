import { useEffect, useRef } from 'react';
import { ReconEvent } from '../hooks/useReconSSE';
import WaterfallEvent from './WaterfallEvent';

interface PipelinePanelProps {
  events: ReconEvent[];
  running: boolean;
  elapsed: number;
  error: string | null;
}

export default function PipelinePanel({ events, running, elapsed, error }: PipelinePanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const showPlaceholder = !running && events.length === 0 && !error;
  const showFooter = !running && events.length > 0;

  return (
    <div className="flex flex-col h-full bg-recon-dark border-r border-recon-blue/20">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Intelligence Pipeline</h2>
        {running && (
          <div className="text-recon-amber font-mono text-sm">
            {elapsed.toFixed(1)}s
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {showPlaceholder && (
          <div className="flex items-center justify-center h-full">
            <p className="text-recon-grey text-center max-w-md">
              Enter a company URL and select a report mode to begin.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-recon-red/10 border border-recon-red/30 rounded-lg px-4 py-3 text-recon-red">
            Error: {error}
          </div>
        )}

        {events.length > 0 && (
          <div className="space-y-1">
            {events.map((event) => (
              <WaterfallEvent key={event.id} event={event} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {showFooter && (
        <div className="bg-recon-navy/50 px-6 py-3 border-t border-recon-blue/30 text-sm text-recon-grey">
          <div className="flex items-center gap-4">
            <span>Total time: {elapsed.toFixed(1)}s</span>
            <span>•</span>
            <span>Bypassed bot detection</span>
            <span>•</span>
            <span>{events.length} events logged</span>
            <span>•</span>
            <span>AI-IQ memory updated</span>
          </div>
        </div>
      )}
    </div>
  );
}
