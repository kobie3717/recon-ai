'use client';

import { useEffect, useState, useRef } from 'react';

interface WatchPanelProps {
  domain: string;
  isWatching: boolean;
  onStop: () => void;
}

interface Mention {
  source: string;
  url: string;
  title: string;
  snippet: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  timestamp: string;
}

const sourceIcons: Record<string, string> = {
  reddit: '🔴',
  twitter: '🐦',
  news: '📰',
  blog: '📝',
  unknown: '🌐'
};

const sourceNames: Record<string, string> = {
  reddit: 'Reddit',
  twitter: 'Twitter',
  news: 'News',
  blog: 'Blog',
  unknown: 'Web'
};

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 10000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function WatchPanel({ domain, isWatching, onStop }: WatchPanelProps) {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isWatching) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    // Start EventSource
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://powerful-mindfulness-production-56ff.up.railway.app';
    const evtSource = new EventSource(
      `${backendUrl}/api/watch?domain=${encodeURIComponent(domain)}`
    );

    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === 'mention') {
          setMentions((prev) => [event, ...prev]);
        }
      } catch (err) {
        console.error('Failed to parse watch event:', err);
      }
    };

    evtSource.onerror = () => {
      console.error('Watch stream error');
      evtSource.close();
    };

    eventSourceRef.current = evtSource;

    return () => {
      evtSource.close();
    };
  }, [domain, isWatching]);

  // Auto-scroll to top when new mention arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [mentions.length]);

  return (
    <div className="flex flex-col h-full bg-recon-dark">
      {/* Header */}
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Live Watch</h2>
          {isWatching ? (
            <span className="flex items-center gap-2 bg-green-600/20 text-green-400 border border-green-600/30 px-3 py-1 rounded-full text-xs font-medium">
              <span className="animate-pulse">●</span> LIVE
            </span>
          ) : (
            <span className="flex items-center gap-2 bg-gray-600/20 text-gray-400 border border-gray-600/30 px-3 py-1 rounded-full text-xs font-medium">
              ● STOPPED
            </span>
          )}
        </div>
        <button
          onClick={onStop}
          className="text-recon-grey hover:text-red-400 text-sm flex items-center gap-1.5 px-3 py-1 rounded border border-recon-blue/30 hover:border-red-500/50 transition-colors"
        >
          ■ Stop
        </button>
      </div>

      {/* Domain display */}
      <div className="bg-recon-navy/50 px-6 py-3 border-b border-recon-blue/20">
        <div className="text-recon-grey text-xs uppercase mb-1">Monitoring</div>
        <div className="text-white text-lg font-semibold">{domain}</div>
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {mentions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-recon-grey text-lg mb-4">
              Scanning the web for mentions
              <span className="animate-pulse">...</span>
            </div>
            <div className="flex gap-2">
              <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
              <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" style={{ animationDelay: '400ms' }} />
            </div>
          </div>
        ) : (
          <div className="space-y-4 pb-6">
            {mentions.map((mention, i) => (
              <div
                key={i}
                className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4 hover:border-recon-cyan/30 transition-colors"
              >
                {/* Source + time */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{sourceIcons[mention.source] || sourceIcons.unknown}</span>
                    <span className="text-recon-cyan text-sm font-medium">
                      {sourceNames[mention.source] || sourceNames.unknown}
                    </span>
                  </div>
                  <span className="text-recon-grey text-xs">{relativeTime(mention.timestamp)}</span>
                </div>

                {/* Title */}
                <h4 className="text-white font-bold mb-2">{mention.title}</h4>

                {/* Snippet */}
                <p className="text-recon-grey text-sm mb-3">
                  {mention.snippet.length > 120 ? mention.snippet.substring(0, 120) + '...' : mention.snippet}
                </p>

                {/* Footer: sentiment + link */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded ${
                      mention.sentiment === 'positive'
                        ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                        : mention.sentiment === 'negative'
                        ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                        : 'bg-gray-600/20 text-gray-400 border border-gray-600/30'
                    }`}
                  >
                    {mention.sentiment}
                  </span>
                  <a
                    href={mention.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-recon-cyan hover:text-teal-400 text-xs flex items-center gap-1 transition-colors"
                  >
                    View source ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
