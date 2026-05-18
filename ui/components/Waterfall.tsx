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
  mode?: string;
}

const agentIcons: Record<string, string> = {
  '007-bot': '🕵',
  'circus': '⚡',
  'bd-web-unlocker': '🌐',
  'bd-serp': '🔍',
  'bd-scraping-browser': '🖥',
  'bd-web-scraper': '📊',
  'bd-mcp': '🔗',
  'ai-iq': '🧠',
  'claude': '✨',
};

const scoutIcons: Array<[string, string]> = [
  ['homepage', '🌐'],
  ['serp-news', '🔍'],
  ['serp-competitors', '🎯'],
  ['serp', '🔍'],
  ['linkedin', '💼'],
  ['crunchbase', '💰'],
  ['github', '🐙'],
  ['g2', '⭐'],
  ['trustpilot', '📊'],
  ['glassdoor', '👥'],
  ['techcrunch', '📰'],
];

function getAgentIcon(name: string): string {
  // In compare mode, agent names are prefixed with domain like "stripe.com: bd-serp"
  const cleanName = name.includes(': ') ? name.split(': ')[1] : name;

  if (agentIcons[cleanName]) return agentIcons[cleanName];
  if (cleanName.startsWith('scout-')) {
    const suffix = cleanName.slice('scout-'.length);
    const match = scoutIcons.find(([prefix]) => suffix.startsWith(prefix));
    if (match) return match[1];
    return '🔭';
  }
  return '📌';
}

const statusColors = {
  fetching: 'text-recon-amber',
  complete: 'text-recon-green',
  error: 'text-recon-red',
  routing: 'text-recon-cyan',
};

const statusPrefix = {
  fetching: '⋯',
  complete: '✓',
  error: '✗',
  routing: '⋯',
};

export default function Waterfall({ agents, totalElapsed, cacheHit, cacheTime, freshTime, isRunning, mode }: WaterfallProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agents]);

  const showPlaceholder = !isRunning && agents.length === 0;
  const showFooter = !isRunning && agents.length > 0;
  const isDeepMode = mode === 'deep';
  const isBundleMode = mode === 'bundle';
  const isRedteamMode = mode === 'redteam';
  const isSeoMode = mode === 'seo';
  const isPersonMode = mode === 'person';
  const shouldShowBotDetection = mode && mode !== 'person';

  return (
    <div className="flex flex-col h-full bg-recon-dark">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Intelligence Pipeline</h2>
          {isDeepMode && (
            <div className="text-indigo-400 text-xs mt-1 font-semibold">
              DEEP SEARCH MODE — 10 parallel scouts
            </div>
          )}
          {isBundleMode && (
            <div className="text-amber-400 text-xs mt-1 font-semibold">
              BUNDLE MODE — intelligence + SEO + security
            </div>
          )}
          {isRedteamMode && (
            <div className="text-red-400 text-xs mt-1 font-semibold">
              REDTEAM MODE — attack surface analysis
            </div>
          )}
          {isSeoMode && (
            <div className="text-green-400 text-xs mt-1 font-semibold">
              SEO MODE — search intelligence
            </div>
          )}
          {isPersonMode && (
            <div className="text-purple-400 text-xs mt-1 font-semibold">
              PERSON INTEL — executive profile
            </div>
          )}
        </div>
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
              const icon = getAgentIcon(agent.name);
              const colorClass = statusColors[agent.status] || 'text-recon-grey';
              const prefix = statusPrefix[agent.status] || '';

              return (
                <div key={`${agent.name}-${index}`} className="border-l-2 border-recon-blue/30 pl-4 py-2 relative">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-lg">{icon}</span>
                    <span className="text-recon-grey font-medium min-w-[120px]">{agent.name}</span>
                    <span className={`${colorClass} font-medium`}>{prefix} {agent.status}</span>
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
        <div className="sticky bottom-0 bg-recon-navy/50 px-6 py-3 border-t border-recon-blue/30 text-sm text-recon-grey">
          <div className="flex items-center gap-4">
            <span>Total time: {totalElapsed.toFixed(1)}s</span>
            {shouldShowBotDetection && (
              <>
                <span>•</span>
                <span>Bypassed bot detection</span>
              </>
            )}
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
