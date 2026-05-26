'use client';

import { useMemo } from 'react';
import { AgentState } from './Waterfall';

interface TimelineViewProps {
  agents: AgentState[];
  agentTimings: Record<string, { start: number; end?: number }>;
  totalElapsed: number;
}

const statusColors = {
  complete: 'bg-recon-green',
  error: 'bg-recon-red',
  unavailable: 'bg-amber-400/60',
  fetching: 'bg-recon-cyan',
  searching: 'bg-recon-cyan',
  launching: 'bg-recon-cyan',
  querying: 'bg-recon-cyan',
  routing: 'bg-recon-cyan',
  asking: 'bg-violet-400',
  'analyzing-signals': 'bg-purple-400',
  'agent-decided': 'bg-purple-300',
  'agentic-start': 'bg-purple-400',
  'agentic-round-2': 'bg-indigo-400',
  synthesizing: 'bg-recon-cyan',
  storing: 'bg-recon-cyan',
  classifying: 'bg-violet-400',
  classified: 'bg-violet-300',
  'quality-gate': 'bg-teal-400',
  retrying: 'bg-amber-400',
  extracting: 'bg-recon-amber',
};

function getStatusColor(status: string): string {
  return statusColors[status as keyof typeof statusColors] || 'bg-recon-cyan';
}

function getAgentDisplayName(name: string): string {
  const cleanName = name.includes(': ') ? name.split(': ')[1] : name;
  return cleanName;
}

export default function TimelineView({ agents, agentTimings, totalElapsed }: TimelineViewProps) {
  // Calculate max elapsed time for scaling
  const maxElapsed = useMemo(() => {
    return Math.max(
      totalElapsed,
      ...Object.values(agentTimings).map(t => t.end || totalElapsed)
    );
  }, [agentTimings, totalElapsed]);

  // Build timeline data from agents + timings
  const timelineData = useMemo(() => {
    return agents
      .filter(agent => {
        const cleanName = agent.name.includes(': ') ? agent.name.split(': ')[1] : agent.name;
        // Exclude orchestration/synthesis agents that aren't data-fetching
        const excluded = ['007-bot', 'circus', 'claude', 'ai-iq'];
        return !excluded.includes(cleanName);
      })
      .map(agent => {
        const timing = agentTimings[agent.name] || { start: 0, end: undefined };
        const startTime = timing.start;
        const endTime = timing.end || totalElapsed;
        const duration = endTime - startTime;

        return {
          name: agent.name,
          displayName: getAgentDisplayName(agent.name),
          status: agent.status,
          startTime,
          endTime,
          duration,
          startPercent: maxElapsed > 0 ? (startTime / maxElapsed) * 100 : 0,
          widthPercent: maxElapsed > 0 ? (duration / maxElapsed) * 100 : 0,
        };
      })
      .sort((a, b) => a.startTime - b.startTime); // Sort by start time
  }, [agents, agentTimings, totalElapsed, maxElapsed]);

  // Generate time scale tick marks
  const timeScaleTicks = useMemo(() => {
    if (maxElapsed === 0) {
      return [{ label: '0s', position: 0 }];
    }
    return [0, 0.25, 0.5, 0.75, 1].map(pct => ({
      label: (maxElapsed * pct).toFixed(1) + 's',
      position: pct * 100,
    }));
  }, [maxElapsed]);

  if (timelineData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-recon-grey">
        <p>No agent data available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full px-6 py-4 overflow-y-auto">
      <div className="mb-6">
        <h3 className="text-recon-cyan font-bold tracking-widest uppercase text-sm mb-1">
          TIMELINE — {maxElapsed.toFixed(1)}s total
        </h3>
        <p className="text-recon-grey text-xs">
          Horizontal bars show parallel agent execution
        </p>
      </div>

      <div className="flex-1 space-y-3">
        {timelineData.map((item, index) => {
          const colorClass = getStatusColor(item.status);

          return (
            <div key={`${item.name}-${index}`} className="flex items-center gap-3">
              {/* Agent name label */}
              <div className="w-48 flex-shrink-0 text-recon-grey text-sm font-mono truncate" title={item.displayName}>
                {item.displayName}
              </div>

              {/* Timeline bar container */}
              <div className="flex-1 relative h-6 bg-recon-dark/50 rounded border border-recon-blue/20">
                {/* The actual bar */}
                <div
                  className={`absolute h-full ${colorClass} rounded transition-all duration-300`}
                  style={{
                    left: `${item.startPercent}%`,
                    width: `${item.widthPercent}%`,
                    minWidth: '2px', // Ensure very short bars are visible
                  }}
                  title={`${item.displayName}: ${item.startTime.toFixed(1)}s - ${item.endTime.toFixed(1)}s`}
                />
              </div>

              {/* Duration label */}
              <div className="w-16 flex-shrink-0 text-recon-grey text-xs font-mono text-right">
                {item.duration.toFixed(1)}s
              </div>
            </div>
          );
        })}
      </div>

      {/* Time scale at bottom */}
      <div className="mt-6 relative">
        <div className="relative h-8 border-t border-recon-blue/30">
          {timeScaleTicks.map((tick, i) => (
            <div
              key={i}
              className="absolute top-0 flex flex-col items-center"
              style={{ left: `${tick.position}%`, transform: 'translateX(-50%)' }}
            >
              <div className="w-px h-2 bg-recon-blue/40" />
              <span className="text-recon-grey text-xs font-mono mt-1">{tick.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
