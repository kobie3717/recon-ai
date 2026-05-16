'use client';

import { useState } from 'react';

type Mode = 'standard' | 'seo' | 'redteam' | 'deep' | 'bundle';

interface UrlInputProps {
  onGenerate: (url: string, mode: Mode, cost: number) => void;
  isRunning: boolean;
  url: string;
  onUrlChange: (url: string) => void;
}

const reportModes = [
  { mode: 'standard' as Mode, label: 'Generate Report', cost: 2.0, color: 'blue', icon: '' },
  { mode: 'seo' as Mode, label: 'SEO Analysis', cost: 5.0, color: 'outline', icon: '' },
  { mode: 'redteam' as Mode, label: 'Red Team', cost: 12.0, color: 'outline', icon: '⚔' },
  { mode: 'deep' as Mode, label: 'Deep Search', cost: 15.0, color: 'purple', icon: '✦' },
  { mode: 'bundle' as Mode, label: 'Bundle All', cost: 25.0, color: 'outline', icon: '★' },
];

export default function UrlInput({ onGenerate, isRunning, url, onUrlChange }: UrlInputProps) {
  return (
    <div className="flex flex-col">
      {/* URL Input Row */}
      <div className="bg-recon-navy border-b border-recon-blue/30 px-6 py-4 flex items-center gap-6">
        <input
          type="text"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={isRunning}
          placeholder="Enter company URL — e.g. https://chain.link"
          className="flex-1 px-4 py-2 bg-recon-dark border border-recon-grey/30 rounded-lg text-white placeholder-recon-grey focus:outline-none focus:border-recon-cyan focus:ring-1 focus:ring-recon-cyan disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Report Buttons Row */}
      <div className="bg-recon-navy/50 border-b border-recon-blue/20 px-4 py-2 flex items-center gap-3 overflow-x-auto">
        {reportModes.map(({ mode, label, cost, color, icon }) => {
          const baseClasses = "px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all disabled:opacity-50 disabled:cursor-not-allowed";

          let colorClasses = "";
          if (color === 'blue') {
            colorClasses = "bg-recon-blue text-white hover:bg-recon-blue/80";
          } else if (color === 'purple') {
            colorClasses = "bg-indigo-600 text-white hover:bg-indigo-700";
          } else {
            colorClasses = "bg-recon-navy border border-recon-grey/50 text-white hover:bg-recon-grey/20";
          }

          return (
            <button
              key={mode}
              onClick={() => onGenerate(url, mode, cost)}
              disabled={isRunning || !url.trim()}
              className={`${baseClasses} ${colorClasses}`}
            >
              {label} ${cost.toFixed(2)} {icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
