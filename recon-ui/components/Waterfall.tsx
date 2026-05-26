'use client';

import { useEffect, useRef } from 'react';

export type AgentStatus = 'fetching' | 'complete' | 'error' | 'unavailable' | 'routing' | 'launching' | 'searching' | 'analyzing-signals' | 'agent-decided' | 'agentic-start' | 'agentic-round-2' | 'synthesizing' | 'storing' | 'classifying' | 'classified' | 'quality-gate' | 'retrying' | 'extracting' | 'querying' | 'asking';

export interface AgentState {
  name: string;
  status: AgentStatus;
  elapsed: number;
  message?: string;
  extra?: Record<string, any>;
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
  'bd-serp-batch': '🔍',
  'bd-scraping-browser': '🖥',
  'bd-web-scraper': '📊',
  'bd-mcp': '🔗',
  'bd-datasets': '📊',
  'bd-discover': '✨',
  'bd-crawl': '🕷️',
  'bd-assistant': '🤖',
  'ai-iq': '🧠',
  'claude': '✨',
};

const agentDisplayNames: Record<string, string> = {
  '007-bot': 'PHANTOM',
  'circus': 'DISPATCH',
  'bd-web-unlocker': 'FIELD-OPS',
  'bd-serp': 'SIGINT',
  'bd-serp-batch': 'MULTI-SIGINT',
  'bd-scraping-browser': 'DEEP-COVER',
  'bd-web-scraper': 'EXTRACTOR',
  'bd-mcp': 'SOURCE-NET',
  'bd-datasets': 'DATASETS',
  'bd-discover': 'DISCOVER',
  'bd-crawl': 'CRAWL',
  'bd-assistant': 'META-INTEL',
  'ai-iq': 'VAULT',
  'claude': 'ANALYST',
  'scout-homepage': 'TARGET-RECON',
  'scout-serp-news': 'PRESS-INTEL',
  'scout-serp-competitors': 'COMPET-INTEL',
  'scout-linkedin': 'IDENTITY-TRACE',
  'scout-crunchbase': 'FINANCIAL-INTEL',
  'scout-github': 'TECH-FOOTPRINT',
  'scout-g2': 'SENTIMENT-INTEL',
  'scout-trustpilot': 'PUBLIC-SENTIMENT',
  'scout-glassdoor': 'HUMINT',
  'scout-techcrunch': 'PRESS-SIGNAL',
};

const scoutIcons: Array<[string, string]> = [
  ['homepage', '🌐'],
  ['serp-news', '🔍'],
  ['serp-competitors', '🎯'],
  ['serp', '🔍'],
  ['r2-', '🎯'],
  ['linkedin', '💼'],
  ['crunchbase', '💰'],
  ['github', '🐙'],
  ['g2', '⭐'],
  ['trustpilot', '📊'],
  ['glassdoor', '👥'],
  ['techcrunch', '📰'],
];

function getAgentIcon(name: string): string {
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

function getDisplayName(name: string): string {
  if (name.includes(': ')) {
    const [prefix, agentPart] = name.split(': ');
    return `${prefix}: ${agentDisplayNames[agentPart] || agentPart.toUpperCase()}`;
  }
  return agentDisplayNames[name] || name.toUpperCase();
}

function getBDProductBadge(name: string): { label: string; color: string } | null {
  const cleanName = name.includes(': ') ? name.split(': ')[1] : name;

  if (cleanName === 'bd-web-unlocker') return { label: 'BD Web Unlocker', color: 'cyan' };
  if (cleanName === 'bd-serp') return { label: 'BD SERP API', color: 'cyan' };
  if (cleanName === 'bd-serp-batch') return { label: 'BD Batch Search', color: 'cyan' };
  if (cleanName === 'bd-scraping-browser') return { label: 'BD Scraping Browser', color: 'cyan' };
  if (cleanName === 'bd-web-scraper') return { label: 'BD Web Scraper API', color: 'cyan' };
  if (cleanName === 'bd-mcp') return { label: 'BD MCP Server', color: 'cyan' };
  if (cleanName === 'bd-datasets') return { label: 'BD Datasets', color: 'cyan' };
  if (cleanName === 'bd-discover') return { label: 'BD Discover API', color: 'cyan' };
  if (cleanName === 'bd-crawl') return { label: 'BD Crawl API', color: 'cyan' };
  if (cleanName === 'bd-assistant') return { label: 'BD Assistant (Sophie)', color: 'violet' };
  if (cleanName === 'claude') return { label: 'Claude Sonnet', color: 'purple' };
  if (cleanName === 'ai-iq') return { label: 'AI-IQ Cache', color: 'amber' };
  if (cleanName.startsWith('scout-')) return { label: 'BD SERP API', color: 'cyan' };

  return null;
}

const statusColors = {
  fetching: 'text-recon-amber',
  complete: 'text-recon-green',
  error: 'text-recon-red',
  unavailable: 'text-amber-400',
  routing: 'text-recon-cyan',
  launching: 'text-recon-amber',
  searching: 'text-recon-amber',
  querying: 'text-recon-amber',
  asking: 'text-violet-400',
  'analyzing-signals': 'text-purple-400',
  'agent-decided': 'text-purple-300',
  'agentic-start': 'text-purple-400',
  'agentic-round-2': 'text-indigo-400',
  synthesizing: 'text-recon-cyan',
  storing: 'text-recon-cyan',
  classifying: 'text-violet-400',
  classified: 'text-violet-300',
  'quality-gate': 'text-teal-400',
  retrying: 'text-amber-400',
  extracting: 'text-recon-amber',
};

const statusPrefix = {
  fetching: '⋯',
  complete: '✓',
  error: '✗',
  unavailable: 'ℹ',
  routing: '⋯',
  launching: '⋯',
  searching: '⋯',
  querying: '⋯',
  asking: '⋯',
  'analyzing-signals': '🧠',
  'agent-decided': '✓',
  'agentic-start': '▶',
  'agentic-round-2': '▶',
  synthesizing: '⋯',
  storing: '⋯',
  classifying: '◌',
  classified: '◉',
  'quality-gate': '◈',
  retrying: '↺',
  extracting: '⋯',
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
  const isAgenticMode = mode === 'agentic';
  const shouldShowBotDetection = mode && mode !== 'person';

  return (
    <div className="flex flex-col h-full bg-recon-dark">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-recon-cyan uppercase font-bold tracking-widest">OPERATIVE FEED</h2>
          {isDeepMode && (
            <div className="text-indigo-400 text-xs mt-1 font-semibold tracking-widest">
              DEEP RECON — 10 PARALLEL FIELD OPERATIVES
            </div>
          )}
          {isBundleMode && (
            <div className="text-amber-400 text-xs mt-1 font-semibold tracking-widest">
              FULL SPECTRUM — INTELLIGENCE + SEO + SECURITY
            </div>
          )}
          {isRedteamMode && (
            <div className="text-red-400 text-xs mt-1 font-semibold tracking-widest">
              REDTEAM OPS — ATTACK SURFACE ASSESSMENT
            </div>
          )}
          {isSeoMode && (
            <div className="text-green-400 text-xs mt-1 font-semibold tracking-widest">
              SIGINT OPS — SEARCH INTELLIGENCE
            </div>
          )}
          {isAgenticMode && (
            <div className="text-purple-400 text-xs mt-1 font-semibold tracking-widest">
              AGENTIC RECON — 2-ROUND SELF-DIRECTING INTELLIGENCE
            </div>
          )}
          {isPersonMode && (
            <div className="text-purple-400 text-xs mt-1 font-semibold tracking-widest">
              HUMINT — EXECUTIVE PROFILE
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {isRunning && (
            <>
              <div className="text-recon-amber font-mono text-sm">
                {totalElapsed.toFixed(1)}s
              </div>
              {agents.length > 1 && (() => {
                const activeCount = agents.filter(a =>
                  a.status === 'fetching' || a.status === 'searching' || a.status === 'launching'
                ).length;
                return activeCount > 0 ? (
                  <div className="text-recon-cyan text-xs font-semibold tracking-wider">
                    ⚡ {activeCount} AGENTS ACTIVE
                  </div>
                ) : null;
              })()}
            </>
          )}
        </div>
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
          <div className="mb-4 bg-gradient-to-r from-recon-cyan/20 to-blue-500/10 border border-recon-cyan/40 rounded-lg px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl animate-bounce">⚡</span>
                <div>
                  <div className="text-recon-cyan font-bold text-sm">AI-IQ Cache Hit</div>
                  <div className="text-recon-grey text-xs">Intelligence retrieved from memory vault</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-recon-cyan font-mono font-bold text-lg">{cacheTime?.toFixed(1) || '0.3'}s</div>
                <div className="text-recon-grey text-xs line-through">{freshTime?.toFixed(1) || '9.0'}s fresh</div>
                <div className="text-green-400 text-xs font-semibold">
                  {freshTime && cacheTime ? Math.round((1 - cacheTime/freshTime) * 100) : 97}% faster
                </div>
              </div>
            </div>
          </div>
        )}

        {agents.length > 0 && (
          <div className="space-y-1">
            {agents.map((agent, index) => {
              const icon = getAgentIcon(agent.name);
              const colorClass = statusColors[agent.status] || 'text-recon-grey';
              const prefix = statusPrefix[agent.status] || '';

              const bdBadge = getBDProductBadge(agent.name);

              return (
                <div key={`${agent.name}-${index}`} className={`border-l-2 pl-4 py-2 relative ${
                  agent.status === 'classified' ? 'border-violet-500/50' :
                  agent.status === 'quality-gate' ? 'border-teal-500/50' :
                  agent.status === 'agent-decided' ? 'border-purple-500/50' :
                  'border-recon-blue/30'
                }`}>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-lg">{icon}</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-recon-grey font-medium font-mono tracking-wider">{getDisplayName(agent.name)}</span>
                      {bdBadge && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded inline-block w-fit font-semibold tracking-wide ${
                          bdBadge.color === 'cyan' ? 'bg-recon-cyan/10 text-recon-cyan border border-recon-cyan/30' :
                          bdBadge.color === 'purple' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {bdBadge.label}
                        </span>
                      )}
                    </div>
                    <span className={`${colorClass} font-medium`}>{prefix} {agent.status}</span>
                    <span className="text-recon-grey text-xs ml-auto">{agent.elapsed.toFixed(1)}s</span>
                  </div>

                  {agent.message && agent.status === 'complete' && (
                    <div className="mt-2 ml-10 text-recon-light text-xs pl-3 border-l border-recon-blue/20">
                      {agent.message}
                    </div>
                  )}

                  {/* UNAVAILABLE: show reason badge (yellow info for feature gating) */}
                  {agent.status === 'unavailable' && agent.extra?.reason && (
                    <div className="mt-2 ml-10">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 text-xs">
                        <span>ℹ</span>
                        <span>{agent.extra.reason}</span>
                      </div>
                    </div>
                  )}

                  {/* CLASSIFIED: show type badge + focus */}
                  {agent.status === 'classified' && agent.extra && (
                    <div className="mt-2 flex flex-wrap gap-2 ml-10">
                      {agent.extra.type && (
                        <span className="px-2 py-0.5 bg-violet-900/40 border border-violet-500/30 rounded text-violet-300 text-xs font-mono">
                          {agent.extra.type}
                        </span>
                      )}
                      {agent.extra.stage && (
                        <span className="px-2 py-0.5 bg-violet-900/30 border border-violet-500/20 rounded text-violet-400 text-xs font-mono">
                          {agent.extra.stage}
                        </span>
                      )}
                      {agent.extra.focus && (
                        <span className="text-violet-300/70 text-xs ml-1 self-center">→ {agent.extra.focus}</span>
                      )}
                    </div>
                  )}

                  {/* QUALITY GATE: show score bar + issues */}
                  {agent.status === 'quality-gate' && agent.extra && (
                    <div className="mt-2 ml-10">
                      <div className="flex items-center gap-3 mb-1">
                        <div className="flex-1 h-1.5 bg-recon-navy rounded-full overflow-hidden max-w-[120px]">
                          <div
                            className={`h-full rounded-full ${
                              (agent.extra.quality || 0) >= 60 ? 'bg-teal-500' :
                              (agent.extra.quality || 0) >= 30 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${agent.extra.quality || 0}%` }}
                          />
                        </div>
                        <span className={`text-xs font-mono ${
                          (agent.extra.quality || 0) >= 60 ? 'text-teal-400' :
                          (agent.extra.quality || 0) >= 30 ? 'text-amber-400' : 'text-red-400'
                        }`}>{agent.extra.quality || 0}%</span>
                      </div>
                      {agent.extra.issues?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {agent.extra.issues.slice(0, 3).map((issue: string, i: number) => (
                            <span key={i} className="text-xs text-recon-grey/60 font-mono">· {issue}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* AGENT-DECIDED: show reasoning chains */}
                  {agent.status === 'agent-decided' && agent.extra && (
                    <div className="mt-2 ml-10 space-y-1.5">
                      {agent.extra.findings?.map((finding: string, i: number) => (
                        <div key={i} className="text-xs">
                          <span className="text-purple-400 font-mono">→ </span>
                          <span className="text-recon-light">{finding}</span>
                          {agent.extra?.reasoning?.[i] && (
                            <div className="ml-3 mt-0.5 text-purple-300/50 italic">{agent.extra.reasoning[i]}</div>
                          )}
                          {agent.extra?.followups?.[i] && (
                            <div className="ml-3 mt-0.5">
                              <span className="text-recon-grey text-xs">query: </span>
                              <span className="text-recon-cyan/70 font-mono text-xs">"{agent.extra.followups[i]}"</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

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

                  {agent.status === 'unavailable' && (
                    <div className="mt-2 h-1 bg-recon-navy rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 w-full"></div>
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
                <span>Cover maintained</span>
              </>
            )}
            <span>•</span>
            <span>{agents.length} transmissions logged</span>
            <span>•</span>
            <span>VAULT updated</span>
            <span>•</span>
            <span className="text-recon-cyan/60">Powered by Bright Data</span>
          </div>
        </div>
      )}
    </div>
  );
}
