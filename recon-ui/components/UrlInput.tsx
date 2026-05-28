'use client';

import { useState } from 'react';

type Mode = 'standard' | 'seo' | 'redteam' | 'deep' | 'bundle' | 'person' | 'footprint' | 'watch' | 'lookup' | 'mcp' | 'agentic';

// Customer price markup — must match backend SERVICE_FEE_MULTIPLIER (default 1.5 = 50%)
const SERVICE_FEE_MULT = 1.5;

interface UrlInputProps {
  onGenerate: (url: string, mode: Mode, cost: number) => void;
  onCompare: (url1: string, url2: string, mode: 'standard' | 'deep') => void;
  isRunning: boolean;
  url: string;
  onUrlChange: (url: string) => void;
  url2?: string;
  onUrl2Change?: (url: string) => void;
  onCompareToggle?: (open: boolean) => void;
}

const reportModes = [
  // Verified modes (ship visible)
  { mode: 'standard' as Mode, label: 'Business Intelligence', cost: 2.0, color: 'blue', icon: '', description: 'Company snapshot: funding, hiring, products, competitors', verified: true },
  { mode: 'agentic' as Mode, label: 'AI Auto-Recon', cost: 2.5, color: 'purple-glow', icon: '🧠', description: '2-round self-directing intelligence: AI agent decides follow-up queries', verified: true },
  { mode: 'footprint' as Mode, label: 'Digital Presence', cost: 3.0, color: 'teal', icon: '🔭', description: 'Digital footprint: subdomains, social accounts, web properties', verified: true },
  // Verified via smoke test 2026-05-27 (USE_CLAUDE_CLI=on + token queue)
  { mode: 'person' as Mode, label: 'Person Lookup', cost: 1.5, color: 'purple', icon: '👤', description: 'Executive profile: career history, network, public quotes', verified: true },
  { mode: 'seo' as Mode, label: 'Search Visibility', cost: 5.0, color: 'yellow', icon: '📈', description: 'SEO analysis: keywords, backlinks, Core Web Vitals', verified: true },
  { mode: 'lookup' as Mode, label: 'Deep Research', cost: 8.0, color: 'violet', icon: '🔬', description: 'Deep Lookup: 47+ web-scale sources, revenue & tech insights', verified: true },
  { mode: 'redteam' as Mode, label: 'Security Review', cost: 12.0, color: 'red', icon: '⚔', description: 'Security audit: attack surface, CVEs, social engineering risks', verified: true },
  { mode: 'deep' as Mode, label: 'Full Intelligence', cost: 15.0, color: 'indigo', icon: '✦', description: '10 parallel scouts: GitHub, Glassdoor, G2, Crunchbase and more', verified: true },
  { mode: 'bundle' as Mode, label: 'Full Report Bundle', cost: 25.0, color: 'black', icon: '★', description: 'All three: Standard + SEO + Red Team in one report', verified: true },
  // Unverified — known issues
  { mode: 'mcp' as Mode, label: 'MCP Lite', cost: 2.0, color: 'orange', icon: '🔗', description: 'BD MCP tools: search + scrape in parallel, $0 data cost', verified: false },
  { mode: 'watch' as Mode, label: 'Live Monitor', cost: 0.0, color: 'green', icon: '●', description: 'Live stream: real-time web mentions as they appear', verified: false },
];

function looksLikePerson(input: string): boolean {
  const t = input.trim();
  if (t.length < 2 || t.length > 100 || t.includes('/') || t.includes('@')) return false;
  // Support Unicode names (e.g., José, François, 李明)
  return /^[\p{L}'\s-]+$/u.test(t) && t.includes(' ');
}

export default function UrlInput({ onGenerate, onCompare, isRunning, url, onUrlChange, url2: externalUrl2, onUrl2Change, onCompareToggle }: UrlInputProps) {
  const [compareMode, setCompareMode] = useState(false);
  const url2 = externalUrl2 ?? '';

  const isPerson = looksLikePerson(url);
  const hasInput = !!url.trim();
  const hasDot = url.includes('.');

  const buttonClasses = (color: string, isActive = false, isPulse = false) => {
    const base = "px-2 py-1.5 md:px-4 md:py-2 rounded-lg font-medium text-xs md:text-sm md:whitespace-nowrap transition-all disabled:opacity-50 disabled:cursor-not-allowed";
    const pulse = isPulse ? " ring-2 ring-purple-400 ring-offset-1 ring-offset-recon-dark" : "";
    // Normalized color scheme: all dark bg, active gets cyan accent
    if (isActive) {
      return `${base} bg-recon-dark border-2 border-cyan-500 text-white shadow-lg shadow-cyan-500/30 hover:bg-recon-dark${pulse}`;
    }
    return `${base} bg-recon-dark border border-recon-grey/40 text-recon-grey hover:bg-recon-grey/10 hover:text-white hover:border-recon-grey/60${pulse}`;
  };

  return (
    <div className="flex flex-col">
      {/* URL Input Row */}
      <div className="bg-recon-navy border-b border-recon-blue/30 px-6 py-4 flex items-center gap-3">
        {!compareMode ? (
          <>
            <input
              type="text"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              disabled={isRunning}
              placeholder="Company URL or person name (e.g. stripe.com, Elon Musk)"
              className="flex-1 px-4 py-2 bg-recon-dark border border-recon-grey/30 rounded-lg text-white placeholder-recon-grey focus:outline-none focus:border-recon-cyan focus:ring-1 focus:ring-recon-cyan disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => { setCompareMode(true); onCompareToggle?.(true); }}
              disabled={isRunning}
              className="border border-recon-blue/50 text-recon-cyan px-3 py-2 rounded-lg text-sm hover:border-recon-cyan hover:bg-recon-cyan/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              ⊕ Compare
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              disabled={isRunning}
              placeholder="Company 1 URL"
              className="flex-1 px-4 py-2 bg-recon-dark border border-recon-grey/30 rounded-lg text-white placeholder-recon-grey focus:outline-none focus:border-recon-cyan focus:ring-1 focus:ring-recon-cyan disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-recon-cyan font-bold">vs</span>
            <input
              type="text"
              value={url2}
              onChange={(e) => onUrl2Change?.(e.target.value)}
              disabled={isRunning}
              placeholder="Company 2 URL"
              className="flex-1 px-4 py-2 bg-recon-dark border border-recon-grey/30 rounded-lg text-white placeholder-recon-grey focus:outline-none focus:border-recon-cyan focus:ring-1 focus:ring-recon-cyan disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={() => { setCompareMode(false); onUrl2Change?.(''); onCompareToggle?.(false); }}
              disabled={isRunning}
              className="border border-recon-blue/50 text-recon-grey px-3 py-2 rounded-lg text-sm hover:border-red-500 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✕
            </button>
          </>
        )}
      </div>

      {/* Person hint */}
      {isPerson && !compareMode && (
        <div className="bg-purple-600/10 border-b border-purple-500/20 px-6 py-1.5 flex items-center gap-2 text-xs text-purple-300">
          <span>👤</span>
          <span>Looks like a person — try <strong>Executive Profile</strong> for executive profile</span>
        </div>
      )}

      {/* Buttons Row */}
      <div className="relative">
        <div className="bg-recon-navy/50 border-b border-recon-blue/20 px-2 py-2 md:px-4 grid grid-cols-2 gap-1.5 md:flex md:items-center md:gap-3 md:overflow-x-auto" style={{ touchAction: 'manipulation' }}>
          {!compareMode ? (
            reportModes.map(({ mode, label, cost, color, icon, description, verified }) => {
              const isPersonMode = mode === 'person';
              const disabledByContext = hasInput && (isPersonMode ? hasDot : !hasDot);
              const isDisabled = isRunning || !hasInput || disabledByContext || !verified;
              const isActive = false; // Can add current mode highlighting later if needed
              return (
                <button
                  key={mode}
                  onClick={() => onGenerate(url, mode, cost)}
                  disabled={isDisabled}
                  className={buttonClasses(color, isActive, isPersonMode && isPerson)}
                  title={description}
                >
                  {icon && <span className="mr-1">{icon}</span>}
                  {label} {!verified ? 'Coming soon' : (cost > 0 ? `~$${(cost * SERVICE_FEE_MULT).toFixed(2)}` : 'FREE')}
                </button>
              );
            })
          ) : (
            <>
              <button
                onClick={() => onCompare(url, url2, 'standard')}
                disabled={isRunning || !url.trim() || !url2.trim()}
                className={buttonClasses('blue', false)}
              >
                Compare Standard — $4.00
              </button>
              <button
                onClick={() => onCompare(url, url2, 'deep')}
                disabled={isRunning || !url.trim() || !url2.trim()}
                className={buttonClasses('indigo', false)}
              >
                Compare Deep — $30.00
              </button>
            </>
          )}
        </div>
        <div className="hidden md:block absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-recon-navy/80 to-transparent pointer-events-none" />
      </div>

      {/* BD Product visibility strip */}
      {!compareMode && (
        <div className="bg-recon-dark/60 border-b border-recon-blue/10 px-4 py-1.5 text-center">
          <div className="text-recon-grey/80 text-xs">
            Powered by: <span className="text-cyan-400/70">Web Unlocker</span> · <span className="text-cyan-400/70">SERP API</span> · <span className="text-cyan-400/70">Scraping Browser</span> · <span className="text-cyan-400/70">Discover</span> · <span className="text-cyan-400/70">Crawl</span> · <span className="text-cyan-400/70">Web Scraper</span> · <span className="text-cyan-400/70">Datasets</span> · <span className="text-cyan-400/70">MCP</span>
          </div>
        </div>
      )}
    </div>
  );
}
