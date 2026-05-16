'use client';

import { useEffect, useRef } from 'react';

export type AgentStatus = 'fetching' | 'complete' | 'error' | 'routing';

export interface AgentState {
  name: string;
  status: AgentStatus;
  elapsed: number;
  message?: string;
}

interface WaterfallProps {
  agents: AgentState[];
  totalElapsed: number;
  cacheHit?: boolean;
  cacheTime?: number;
  freshTime?: number;
  isRunning: boolean;
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

const statusColors = {
  fetching: 'text-recon-amber',
  complete: 'text-recon-green',
  error: 'text-recon-red',
  routing: 'text-recon-cyan',
};

export default function Waterfall({ agents, totalElapsed, cacheHit, cacheTime, freshTime, isRunning }: WaterfallProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agents]);

  const showPlaceholder = !isRunning && agents.length === 0;
  const showFooter = !isRunning && agents.length > 0;

  return (
    <div className="flex flex-col h-full bg-recon-dark">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Intelligence Pipeline</h2>
        {isRunning && (
          <div className="text-recon-amber font-mono text-sm">
            {totalElapsed.toFixed(1)}s
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

        {cacheHit && (
          <div className="mb-4 bg-recon-cyan/10 border border-recon-cyan/30 rounded px-3 py-2 text-recon-cyan text-sm">
            ⚡ Loaded from AI-IQ memory — {cacheTime?.toFixed(1) || '0.3'}s vs {freshTime?.toFixed(1) || '9.0'}s fresh
          </div>
        )}

        {agents.length > 0 && (
          <div className="space-y-1">
            {agents.map((agent, index) => {
              const icon = agentIcons[agent.name] || '📌';
              const colorClass = statusColors[agent.status] || 'text-recon-grey';

              return (
                <div key={`${agent.name}-${index}`} className="border-l-2 border-recon-blue/30 pl-4 py-2 relative">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-lg">{icon}</span>
                    <span className="text-recon-grey font-medium min-w-[120px]">{agent.name}</span>
                    <span className={`${colorClass} font-medium`}>{agent.status}</span>
                    {agent.message && <span className="flex-1 text-recon-light">{agent.message}</span>}
                    <span className="text-recon-grey text-xs">{agent.elapsed.toFixed(1)}s</span>
                  </div>

                  {agent.status === 'fetching' && (
                    <div className="mt-2 h-1 bg-recon-navy rounded-full overflow-hidden">
                      <div className="h-full bg-recon-amber animate-pulse w-2/3"></div>
                    </div>
                  )}

                  {agent.status === 'complete' && (
                    <div className="mt-2 h-1 bg-recon-navy rounded-full overflow-hidden">
                      <div className="h-full bg-recon-green w-full"></div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {showFooter && (
        <div className="bg-recon-navy/50 px-6 py-3 border-t border-recon-blue/30 text-sm text-recon-grey">
          <div className="flex items-center gap-4">
            <span>Total time: {totalElapsed.toFixed(1)}s</span>
            <span>•</span>
            <span>Bypassed bot detection</span>
            <span>•</span>
            <span>{agents.length} events logged</span>
            <span>•</span>
            <span>AI-IQ memory updated</span>
          </div>
        </div>
      )}
    </div>
  );
}
