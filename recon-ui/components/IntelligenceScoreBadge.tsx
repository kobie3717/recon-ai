'use client';

import { computeIntelligenceScore } from '@/lib/intelligence-score';

export default function IntelligenceScoreBadge({ reportData }: { reportData: any }) {
  if (!reportData) return null;

  const { score, band, evidenceRatio, sourcesCount, claimsCount } = computeIntelligenceScore(reportData);

  const bandColors = {
    high: {
      bg: 'from-green-500/20 to-emerald-500/10',
      border: 'border-green-500/40',
      text: 'text-green-400',
      label: 'HIGH CONFIDENCE',
      bar: 'bg-green-500',
    },
    medium: {
      bg: 'from-amber-500/20 to-yellow-500/10',
      border: 'border-amber-500/40',
      text: 'text-amber-400',
      label: 'MEDIUM CONFIDENCE',
      bar: 'bg-amber-500',
    },
    low: {
      bg: 'from-red-500/20 to-orange-500/10',
      border: 'border-red-500/40',
      text: 'text-red-400',
      label: 'LOW CONFIDENCE',
      bar: 'bg-red-500',
    },
  }[band];

  return (
    <div className={`bg-gradient-to-br ${bandColors.bg} border ${bandColors.border} rounded-lg p-4 mb-4`}>
      <div className="flex items-start gap-4">
        {/* Big score */}
        <div className="flex-shrink-0">
          <div className={`text-5xl md:text-6xl font-bold font-mono ${bandColors.text} leading-none`}>
            {score}
          </div>
          <div className="text-recon-grey text-xs font-mono mt-1">/ 100</div>
        </div>

        {/* Label + breakdown */}
        <div className="flex-1 min-w-0">
          <div className={`${bandColors.text} text-xs font-mono uppercase tracking-widest font-bold`}>
            Intelligence Score
          </div>
          <div className="text-recon-light text-sm font-semibold mt-0.5">
            {bandColors.label}
          </div>

          {/* Score bar */}
          <div className="w-full h-1.5 bg-recon-dark rounded-full overflow-hidden mt-2">
            <div
              className={`h-full ${bandColors.bar} transition-all duration-700`}
              style={{ width: `${score}%` }}
            />
          </div>

          {/* Breakdown stats */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] font-mono text-recon-grey">
            <span>
              <span className="text-recon-cyan">{Math.round(evidenceRatio * 100)}%</span> evidenced
            </span>
            <span>
              <span className="text-recon-cyan">{sourcesCount}</span> sources
            </span>
            <span>
              <span className="text-recon-cyan">{claimsCount}</span> claims scored
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
