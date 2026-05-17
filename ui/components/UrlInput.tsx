'use client';

import { useState } from 'react';

type Mode = 'standard' | 'seo' | 'redteam' | 'deep' | 'bundle' | 'person';

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
  { mode: 'standard' as Mode, label: 'Generate Report', cost: 2.0, color: 'blue', icon: '' },
  { mode: 'person' as Mode, label: 'Person Intel', cost: 1.5, color: 'purple', icon: '👤' },
  { mode: 'seo' as Mode, label: 'SEO Analysis', cost: 5.0, color: 'yellow', icon: '📈' },
  { mode: 'redteam' as Mode, label: 'Red Team', cost: 12.0, color: 'red', icon: '⚔' },
  { mode: 'deep' as Mode, label: 'Deep Search', cost: 15.0, color: 'indigo', icon: '✦' },
  { mode: 'bundle' as Mode, label: 'Bundle All', cost: 25.0, color: 'black', icon: '★' },
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

  const buttonClasses = (color: string, isPulse = false) => {
    const base = "px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all disabled:opacity-50 disabled:cursor-not-allowed";
    const pulse = isPulse ? " ring-2 ring-purple-400 ring-offset-1 ring-offset-recon-dark" : "";
    switch (color) {
      case 'blue': return `${base} bg-recon-blue text-white hover:bg-recon-blue/80`;
      case 'purple': return `${base} bg-purple-700 text-white hover:bg-purple-600${pulse}`;
      case 'yellow': return `${base} bg-yellow-400 text-black hover:bg-yellow-300`;
      case 'red': return `${base} bg-red-600 text-white hover:bg-red-700`;
      case 'indigo': return `${base} bg-indigo-600 text-white hover:bg-indigo-700`;
      case 'black': return `${base} bg-gray-900 border border-gray-600 text-white hover:bg-black`;
      default: return `${base} bg-recon-navy border border-recon-grey/50 text-white hover:bg-recon-grey/20`;
    }
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
              placeholder="Enter company URL or person name — e.g. stripe.com or Elon Musk"
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
          <span>Looks like a person — try <strong>Person Intel</strong> for executive profile</span>
        </div>
      )}

      {/* Buttons Row */}
      <div className="bg-recon-navy/50 border-b border-recon-blue/20 px-4 py-2 flex items-center gap-3 overflow-x-auto">
        {!compareMode ? (
          reportModes.map(({ mode, label, cost, color, icon }) => (
            <button
              key={mode}
              onClick={() => onGenerate(url, mode, cost)}
              disabled={isRunning || !url.trim()}
              className={buttonClasses(color, mode === 'person' && isPerson)}
            >
              {icon && <span className="mr-1">{icon}</span>}
              {label} ${cost.toFixed(2)}
            </button>
          ))
        ) : (
          <>
            <button
              onClick={() => onCompare(url, url2, 'standard')}
              disabled={isRunning || !url.trim() || !url2.trim()}
              className={buttonClasses('blue')}
            >
              Compare Standard — $4.00
            </button>
            <button
              onClick={() => onCompare(url, url2, 'deep')}
              disabled={isRunning || !url.trim() || !url2.trim()}
              className={buttonClasses('indigo')}
            >
              Compare Deep — $30.00
            </button>
          </>
        )}
      </div>
    </div>
  );
}
