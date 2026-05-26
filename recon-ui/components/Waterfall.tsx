'use client';

import { useEffect, useRef, useMemo } from 'react';
import AgentCard from './AgentCard';

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

// Confidence scoring logic per agent type
function calculateConfidence(name: string, status: AgentStatus, extra?: Record<string, any>): number | undefined {
  if (status !== 'complete' || !extra) return undefined;

  const cleanName = name.includes(': ') ? name.split(': ')[1] : name;

  switch (cleanName) {
    case 'bd-web-unlocker':
      if (extra.chars) {
        return Math.min((extra.chars / 10000) * 100, 100);
      }
      return 0;

    case 'bd-serp':
      if (extra.results !== undefined) {
        return Math.min(extra.results * 10, 100);
      }
      return 0;

    case 'bd-serp-batch':
      if (extra.results !== undefined) {
        return Math.min(extra.results * 33, 100);
      }
      return 0;

    case 'bd-scraping-browser':
      if (extra.pages !== undefined) {
        return Math.min(extra.pages * 50, 100);
      }
      return 0;

    case 'bd-web-scraper':
      return 80; // Always succeeds on accepted domains

    case 'bd-mcp':
      if (extra.tools !== undefined) {
        return Math.min(extra.tools * 50, 100);
      }
      return 0;

    case 'bd-discover':
      if (extra.topScore !== undefined) {
        return extra.topScore * 100;
      }
      return 0;

    case 'bd-crawl':
      if (extra.chars) {
        return Math.min((extra.chars / 2000) * 100, 100);
      }
      return 0;

    case 'bd-assistant':
      if (extra.chars) {
        return Math.min((extra.chars / 2000) * 100, 100);
      }
      return 0;

    case 'bd-datasets':
    case 'mcp-browser':
    case 'mcp-geo':
      return 0; // unavailable

    default:
      // For scout agents and others, use generic heuristics
      if (extra.chars) {
        return Math.min((extra.chars / 1000) * 100, 100);
      }
      if (extra.results) {
        return Math.min(extra.results * 20, 100);
      }
      return 50; // Default moderate confidence
  }
}

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

  // Filter out special meta-agents that should not be shown as cards
  const agentCards = useMemo(() => {
    return agents.filter(agent => {
      const cleanName = agent.name.includes(': ') ? agent.name.split(': ')[1] : agent.name;
      // Exclude orchestration/synthesis agents that aren't data-fetching
      const excluded = ['007-bot', 'circus', 'claude', 'ai-iq'];
      return !excluded.includes(cleanName);
    });
  }, [agents]);

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

        {agentCards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
            {agentCards.map((agent, index) => {
              const icon = getAgentIcon(agent.name);
              const displayName = getDisplayName(agent.name);
              const bdBadge = getBDProductBadge(agent.name);
              const confidence = calculateConfidence(agent.name, agent.status, agent.extra);

              return (
                <AgentCard
                  key={`${agent.name}-${index}`}
                  name={agent.name}
                  displayName={displayName}
                  icon={icon}
                  status={agent.status}
                  elapsed={agent.elapsed}
                  message={agent.message}
                  extra={agent.extra}
                  confidence={confidence}
                  bdBadge={bdBadge}
                />
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
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
