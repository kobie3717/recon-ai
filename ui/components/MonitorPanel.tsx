'use client';

import { useEffect, useState, useRef } from 'react';

interface MonitoredDomain {
  domain: string;
  addedAt: string;
  slackWebhook: string | null;
  intervalHours: number;
  lastChecked: string | null;
  lastDiff: Change[] | null;
}

interface Change {
  type: string;
  icon: string;
  message: string;
  old?: any;
  new?: any;
  count?: number;
  headlines?: string[];
}

interface DiffEntry {
  domain: string;
  savedAt: string;
  diff: Change[];
}

export default function MonitorPanel() {
  const [domains, setDomains] = useState<MonitoredDomain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [newSlackWebhook, setNewSlackWebhook] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [diffHistory, setDiffHistory] = useState<DiffEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://recon.whatshubb.co.za';

  // Load monitored domains
  const loadDomains = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/monitor`);
      if (!response.ok) throw new Error('Failed to load domains');
      const data = await response.json();
      setDomains(data.domains || []);
    } catch (err) {
      console.error('Failed to load monitored domains:', err);
    }
  };

  // Load diff history for selected domain
  const loadDiffHistory = async (domain: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/monitor/diff?domain=${encodeURIComponent(domain)}`);
      if (!response.ok) throw new Error('Failed to load diff history');
      const data = await response.json();
      setDiffHistory(data.history || []);
    } catch (err) {
      console.error('Failed to load diff history:', err);
      setDiffHistory([]);
    }
  };

  useEffect(() => {
    loadDomains();
    // Refresh every 30 seconds
    intervalRef.current = setInterval(loadDomains, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (selectedDomain) {
      loadDiffHistory(selectedDomain);
    }
  }, [selectedDomain]);

  const handleAddDomain = async () => {
    if (!newDomain.trim()) {
      setError('Please enter a domain');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${backendUrl}/api/monitor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: newDomain.trim(),
          slackWebhook: newSlackWebhook.trim() || null,
          intervalHours: 24,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add domain');
      }

      setNewDomain('');
      setNewSlackWebhook('');
      await loadDomains();
    } catch (err: any) {
      setError(err.message || 'Failed to add domain');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    if (!confirm(`Remove ${domain} from monitoring?`)) return;

    try {
      const response = await fetch(`${backendUrl}/api/monitor`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove domain');
      }

      if (selectedDomain === domain) {
        setSelectedDomain(null);
        setDiffHistory([]);
      }

      await loadDomains();
    } catch (err: any) {
      setError(err.message || 'Failed to remove domain');
    }
  };

  const handleRunNow = async (domain: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/monitor/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to run check');
      }

      await loadDomains();
      if (selectedDomain === domain) {
        await loadDiffHistory(domain);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to run check');
    }
  };

  const getStatus = (domain: MonitoredDomain) => {
    if (!domain.lastChecked) return { label: 'never run', color: 'gray' };
    if (domain.lastDiff && domain.lastDiff.length > 0) {
      return { label: 'changes detected', color: 'yellow' };
    }
    return { label: 'no change', color: 'green' };
  };

  const getNextCheckCountdown = (domain: MonitoredDomain) => {
    if (!domain.lastChecked) return 'pending';
    const lastChecked = new Date(domain.lastChecked).getTime();
    const intervalMs = domain.intervalHours * 60 * 60 * 1000;
    const nextCheck = lastChecked + intervalMs;
    const now = Date.now();
    const remaining = nextCheck - now;

    if (remaining <= 0) return 'checking soon';

    const hours = Math.floor(remaining / 1000 / 60 / 60);
    const minutes = Math.floor((remaining / 1000 / 60) % 60);

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const relativeTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="flex h-full bg-recon-dark">
      {/* Left panel: domain list */}
      <div className="w-1/2 border-r border-recon-blue/30 flex flex-col">
        {/* Header */}
        <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Monitor</h2>
            <span className="flex items-center gap-2 bg-green-600/20 text-green-400 border border-green-600/30 px-3 py-1 rounded-full text-xs font-medium">
              <span className="animate-pulse">●</span> Always-On Intelligence
            </span>
          </div>
          <p className="text-recon-grey text-sm">Track competitor changes 24/7</p>
        </div>

        {/* Add domain */}
        <div className="bg-recon-navy/50 px-6 py-4 border-b border-recon-blue/20">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="Domain to monitor (e.g. stripe.com)"
            className="w-full px-3 py-2 bg-recon-dark border border-recon-grey/30 rounded text-white placeholder-recon-grey text-sm focus:outline-none focus:border-recon-cyan focus:ring-1 focus:ring-recon-cyan mb-2"
            disabled={loading}
          />
          <input
            type="text"
            value={newSlackWebhook}
            onChange={(e) => setNewSlackWebhook(e.target.value)}
            placeholder="Slack webhook URL (optional)"
            className="w-full px-3 py-2 bg-recon-dark border border-recon-grey/30 rounded text-white placeholder-recon-grey text-sm focus:outline-none focus:border-recon-cyan focus:ring-1 focus:ring-recon-cyan mb-3"
            disabled={loading}
          />
          <button
            onClick={handleAddDomain}
            disabled={loading || !newDomain.trim()}
            className="w-full px-4 py-2 bg-recon-blue text-white rounded font-medium text-sm hover:bg-recon-blue/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Adding...' : 'Add Domain'}
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-2 flex items-center justify-between">
            <span className="text-red-400 text-sm">⚠ {error}</span>
            <button onClick={() => setError('')} className="text-red-400/60 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Domain list */}
        <div className="flex-1 overflow-y-auto">
          {domains.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="text-recon-grey text-lg mb-2">No domains monitored yet</div>
              <div className="text-recon-grey/60 text-sm">Add a competitor domain above to start tracking</div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {domains.map((domain) => {
                const status = getStatus(domain);
                const isSelected = selectedDomain === domain.domain;
                return (
                  <div
                    key={domain.domain}
                    className={`bg-recon-navy/50 border rounded-lg p-4 hover:border-recon-cyan/30 transition-colors cursor-pointer ${
                      isSelected ? 'border-recon-cyan/50' : 'border-recon-blue/20'
                    }`}
                    onClick={() => setSelectedDomain(domain.domain)}
                  >
                    {/* Domain name + status */}
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white font-semibold">{domain.domain}</h3>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          status.color === 'yellow'
                            ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-600/30'
                            : status.color === 'green'
                            ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                            : 'bg-gray-600/20 text-gray-400 border border-gray-600/30'
                        }`}
                      >
                        {status.label}
                      </span>
                    </div>

                    {/* Last checked */}
                    <div className="flex items-center justify-between text-xs text-recon-grey mb-3">
                      <span>Last: {domain.lastChecked ? relativeTime(domain.lastChecked) : 'never'}</span>
                      <span>Next: {getNextCheckCountdown(domain)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunNow(domain.domain);
                        }}
                        className="flex-1 px-3 py-1.5 bg-recon-blue/50 text-recon-cyan border border-recon-blue/50 rounded text-xs font-medium hover:bg-recon-blue/70 transition-colors"
                      >
                        Run Now
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveDomain(domain.domain);
                        }}
                        className="px-3 py-1.5 bg-red-600/20 text-red-400 border border-red-600/30 rounded text-xs font-medium hover:bg-red-600/30 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: change log */}
      <div className="w-1/2 flex flex-col">
        {selectedDomain ? (
          <>
            {/* Header */}
            <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30">
              <h3 className="text-recon-cyan uppercase font-bold tracking-wide mb-1">Change Log</h3>
              <p className="text-white text-sm">{selectedDomain}</p>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto p-6">
              {diffHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="text-recon-grey text-lg mb-2">No changes detected yet</div>
                  <div className="text-recon-grey/60 text-sm">Changes will appear here after the first scan</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {diffHistory.map((entry, i) => (
                    <div key={i} className="relative">
                      {/* Timeline line */}
                      {i < diffHistory.length - 1 && (
                        <div className="absolute left-4 top-10 bottom-0 w-px bg-recon-blue/30" />
                      )}

                      {/* Entry */}
                      <div className="flex gap-4">
                        {/* Timeline dot */}
                        <div className="flex-shrink-0 w-8 h-8 bg-recon-cyan rounded-full flex items-center justify-center text-white font-bold text-xs relative z-10">
                          {entry.diff.length}
                        </div>

                        {/* Content */}
                        <div className="flex-1">
                          {/* Date */}
                          <div className="text-recon-grey text-xs mb-2">
                            {new Date(entry.savedAt).toLocaleString()}
                          </div>

                          {/* Changes */}
                          <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4 space-y-2">
                            {entry.diff.map((change, j) => (
                              <div key={j} className="flex items-start gap-2">
                                <span className="text-lg">{change.icon}</span>
                                <div className="flex-1">
                                  <p className="text-white text-sm">{change.message}</p>
                                  {change.headlines && change.headlines.length > 0 && (
                                    <ul className="mt-1 text-recon-grey text-xs list-disc list-inside">
                                      {change.headlines.map((headline, k) => (
                                        <li key={k}>{headline}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="text-recon-grey text-lg mb-2">Select a domain</div>
            <div className="text-recon-grey/60 text-sm">Click a domain on the left to view its change history</div>
          </div>
        )}
      </div>
    </div>
  );
}
