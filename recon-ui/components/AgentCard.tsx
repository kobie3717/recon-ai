'use client';

import { useState } from 'react';
import { AgentStatus } from './Waterfall';

interface AgentCardProps {
  name: string;
  displayName: string;
  icon: string;
  status: AgentStatus;
  elapsed: number;
  message?: string;
  extra?: Record<string, any>;
  confidence?: number;
  bdBadge?: { label: string; color: string } | null;
}

function getStatusIcon(status: AgentStatus): string {
  if (status === 'complete') return '✅';
  if (status === 'unavailable') return '⚠️';
  if (status === 'error') return '❌';
  return '🔄';
}

function getStatusColor(status: AgentStatus): string {
  if (status === 'complete') return 'text-recon-green';
  if (status === 'unavailable') return 'text-amber-400';
  if (status === 'error') return 'text-recon-red';
  return 'text-recon-amber';
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 70) return 'bg-recon-green';
  if (confidence >= 30) return 'bg-recon-amber';
  return 'bg-recon-red';
}

// Per-agent cost map (matches sse-server.mjs cost breakdown)
const agentCostMap: Record<string, number> = {
  'bd-web-unlocker': 0.30,
  'bd-serp': 0.50,
  'bd-serp-batch': 0.50,
  'bd-scraping-browser': 0.80,
  'bd-web-scraper': 0.40,
  'bd-mcp': 0.20,
  'bd-discover': 0.00,
  'bd-crawl': 0.00,
  'bd-assistant': 0.00,
  'bd-datasets': 0.00,
  'bd-mcp-browser': 0.00,
  'bd-mcp-geo': 0.00,
};

function getAgentCost(name: string): number | null {
  const cleanName = name.includes(': ') ? name.split(': ')[1] : name;
  if (cleanName in agentCostMap) return agentCostMap[cleanName];
  return null;
}

export default function AgentCard({
  name,
  displayName,
  icon,
  status,
  elapsed,
  message,
  extra,
  confidence,
  bdBadge,
}: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusIcon = getStatusIcon(status);
  const statusColor = getStatusColor(status);
  const showConfidence = status === 'complete' && confidence !== undefined;
  const isInProgress = status === 'fetching' || status === 'searching' || status === 'launching' || status === 'querying';

  return (
    <div
      className={`bg-recon-navy/80 border rounded-lg overflow-hidden transition-all duration-200 hover:border-recon-cyan/50 ${
        status === 'complete' ? 'border-recon-green/30' :
        status === 'unavailable' ? 'border-amber-500/30' :
        status === 'error' ? 'border-recon-red/30' :
        'border-recon-blue/30'
      } ${isInProgress ? 'animate-pulse' : ''}`}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex flex-col gap-2 text-left hover:bg-recon-blue/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">{statusIcon}</span>
          <span className="text-2xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-recon-grey font-mono text-xs tracking-wider truncate">
              {displayName}
            </div>
            {bdBadge && (
              <div className={`text-[9px] px-1.5 py-0.5 rounded inline-block mt-0.5 font-semibold tracking-wide ${
                bdBadge.color === 'cyan' ? 'bg-recon-cyan/10 text-recon-cyan/80 border border-recon-cyan/30' :
                bdBadge.color === 'purple' ? 'bg-purple-500/10 text-purple-400/80 border border-purple-500/30' :
                bdBadge.color === 'violet' ? 'bg-violet-500/10 text-violet-400/80 border border-violet-500/30' :
                'bg-amber-500/10 text-amber-400/80 border border-amber-500/30'
              }`}>
                {bdBadge.label}
              </div>
            )}
          </div>
          <span className="text-recon-grey text-xs font-mono whitespace-nowrap">
            {elapsed.toFixed(2)}s
          </span>
        </div>

        {/* Confidence bar */}
        {showConfidence ? (
          <div className="w-full h-2 bg-recon-dark rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getConfidenceColor(confidence)}`}
              style={{ width: `${Math.min(confidence, 100)}%` }}
            />
          </div>
        ) : isInProgress ? (
          <div className="w-full h-2 bg-recon-dark rounded-full overflow-hidden">
            <div className="h-full bg-recon-amber animate-pulse w-2/3" />
          </div>
        ) : status === 'unavailable' ? (
          <div className="w-full h-2 bg-recon-dark rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 w-full opacity-50" />
          </div>
        ) : (
          <div className="w-full h-2 bg-recon-dark rounded-full" />
        )}

        {/* Expand indicator */}
        <div className="text-recon-grey/50 text-xs text-center">
          {isExpanded ? '▲' : '▼'}
        </div>
      </button>

      {/* Expandable details */}
      {isExpanded && (
        <div className="px-4 py-3 bg-recon-dark/50 border-t border-recon-blue/20 text-xs space-y-2">
          {/* Agent identifier */}
          <div className="text-recon-grey/60 font-mono text-[10px]">
            agent: <span className="text-recon-cyan/80">{name}</span>
          </div>
          {/* Status line */}
          <div className="text-recon-grey">
            status: <span className={statusColor}>{status}</span>
            <span className="text-recon-grey/50 ml-2">@ {elapsed.toFixed(2)}s</span>
          </div>
          {/* Status reason for unavailable */}
          {status === 'unavailable' && extra?.reason && (
            <div className="flex items-start gap-2 text-amber-400">
              <span>ℹ</span>
              <span>{extra.reason}</span>
            </div>
          )}

          {/* Message for complete */}
          {status === 'complete' && message && (
            <div className="text-recon-light border-l-2 border-recon-cyan/30 pl-3">
              {message}
            </div>
          )}

          {/* Data returned snippet */}
          {status === 'complete' && extra && (
            <div className="space-y-1">
              {extra.chars !== undefined && (
                <div className="text-recon-grey">
                  <span className="text-recon-cyan">chars:</span> {extra.chars.toLocaleString()}
                </div>
              )}
              {extra.results !== undefined && (
                <div className="text-recon-grey">
                  <span className="text-recon-cyan">results:</span> {extra.results}
                </div>
              )}
              {extra.pages !== undefined && (
                <div className="text-recon-grey">
                  <span className="text-recon-cyan">pages:</span> {extra.pages}
                </div>
              )}
              {extra.tools !== undefined && (
                <div className="text-recon-grey">
                  <span className="text-recon-cyan">tools:</span> {extra.tools}
                </div>
              )}
              {extra.topScore !== undefined && (
                <div className="text-recon-grey">
                  <span className="text-recon-cyan">score:</span> {(extra.topScore * 100).toFixed(1)}%
                </div>
              )}
              {extra.content && (
                <div className="text-recon-grey/70 mt-2 text-[10px] font-mono max-h-20 overflow-y-auto">
                  {extra.content.substring(0, 200)}...
                </div>
              )}
            </div>
          )}

          {/* Cost contribution (from per-agent rate map) */}
          {(() => {
            const cost = getAgentCost(name);
            if (cost === null) return null;
            return (
              <div className="text-recon-amber font-mono">
                Cost: {cost === 0 ? 'FREE' : `$${cost.toFixed(2)}`}
              </div>
            );
          })()}

          {/* Confidence score display */}
          {showConfidence && (
            <div className={`font-mono font-bold ${
              confidence >= 70 ? 'text-recon-green' :
              confidence >= 30 ? 'text-recon-amber' :
              'text-recon-red'
            }`}>
              Confidence: {confidence.toFixed(0)}%
            </div>
          )}

          {/* Classified info */}
          {status === 'classified' && extra && (
            <div className="flex flex-wrap gap-2">
              {extra.type && (
                <span className="px-2 py-0.5 bg-violet-900/40 border border-violet-500/30 rounded text-violet-300 font-mono">
                  {extra.type}
                </span>
              )}
              {extra.stage && (
                <span className="px-2 py-0.5 bg-violet-900/30 border border-violet-500/20 rounded text-violet-400 font-mono">
                  {extra.stage}
                </span>
              )}
              {extra.focus && (
                <span className="text-violet-300/70 ml-1">→ {extra.focus}</span>
              )}
            </div>
          )}

          {/* Quality gate */}
          {status === 'quality-gate' && extra && (
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex-1 h-1.5 bg-recon-navy rounded-full overflow-hidden max-w-[120px]">
                  <div
                    className={`h-full rounded-full ${
                      (extra.quality || 0) >= 60 ? 'bg-teal-500' :
                      (extra.quality || 0) >= 30 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${extra.quality || 0}%` }}
                  />
                </div>
                <span className={`font-mono ${
                  (extra.quality || 0) >= 60 ? 'text-teal-400' :
                  (extra.quality || 0) >= 30 ? 'text-amber-400' : 'text-red-400'
                }`}>{extra.quality || 0}%</span>
              </div>
              {extra.issues?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {extra.issues.slice(0, 3).map((issue: string, i: number) => (
                    <span key={i} className="text-recon-grey/60 font-mono">· {issue}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Agent decisions */}
          {status === 'agent-decided' && extra?.findings && (
            <div className="space-y-1.5">
              {extra.findings.map((finding: string, i: number) => (
                <div key={i}>
                  <div className="flex items-start gap-1">
                    <span className="text-purple-400">→</span>
                    <span className="text-recon-light flex-1">{finding}</span>
                  </div>
                  {extra.reasoning?.[i] && (
                    <div className="ml-3 mt-0.5 text-purple-300/50 italic text-[10px]">
                      {extra.reasoning[i]}
                    </div>
                  )}
                  {extra.followups?.[i] && (
                    <div className="ml-3 mt-0.5 text-[10px]">
                      <span className="text-recon-grey">query: </span>
                      <span className="text-recon-cyan/70 font-mono">"{extra.followups[i]}"</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
