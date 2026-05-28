/**
 * Compute a composite "Intelligence Confidence Score" (0-100) for a Recon report.
 *
 * Combines three signals:
 *   1. Evidence coverage  (50 pts) — fraction of claims with direct source URL
 *   2. Weighted confidence (30 pts) — avg per-claim confidence (high=1.0, med=0.6, low=0.3)
 *   3. Source diversity   (20 pts) — number of unique sources, capped at 12
 *
 * Total 0-100. Used as a sticky headline number on every report.
 */

const CONFIDENCE_WEIGHT: Record<string, number> = {
  high: 1.0,
  'medium-high': 0.85,
  medium: 0.6,
  med: 0.6,
  'medium-low': 0.45,
  low: 0.3,
};

function confidenceToWeight(c: unknown): number {
  if (typeof c === 'number') {
    if (c > 1) return Math.min(c / 100, 1);
    return Math.min(Math.max(c, 0), 1);
  }
  if (typeof c === 'string') {
    return CONFIDENCE_WEIGHT[c.toLowerCase()] ?? 0.5;
  }
  return 0.5;
}

function collectFindings(report: any): Array<{ confidence?: string | number }> {
  const out: Array<{ confidence?: string | number }> = [];
  const arrays = ['signals', 'competitive', 'strategic', 'opportunities', 'exposures', 'recommendations', 'risks', 'socialEngineering'];
  for (const k of arrays) {
    const arr = report?.[k];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (item && typeof item === 'object' && 'confidence' in item) {
          out.push({ confidence: (item as any).confidence });
        }
      }
    }
  }
  return out;
}

export function computeIntelligenceScore(reportData: any): {
  score: number;
  band: 'high' | 'medium' | 'low';
  evidenceRatio: number;
  sourcesCount: number;
  claimsCount: number;
} {
  const meta = reportData?.meta || {};
  const findings = collectFindings(reportData);

  // 1. Evidence coverage
  let evRatio = 0;
  const evMatch = String(meta.evidence_coverage || '').match(/(\d+)\s*of\s*(\d+)/i);
  if (evMatch) {
    const have = Number(evMatch[1]);
    const total = Number(evMatch[2]);
    evRatio = total > 0 ? have / total : 0;
  }

  // 2. Weighted confidence
  const avgConf = findings.length
    ? findings.reduce((s, f) => s + confidenceToWeight(f.confidence), 0) / findings.length
    : (CONFIDENCE_WEIGHT[String(meta.confidence || '').toLowerCase()] ?? 0.6);

  // 3. Source diversity
  const sources = Number(meta.sources_count || 0);
  const srcScore = Math.min(sources, 12) / 12;

  const score = Math.round(evRatio * 50 + avgConf * 30 + srcScore * 20);
  const clamped = Math.max(0, Math.min(100, score));

  const band: 'high' | 'medium' | 'low' = clamped >= 75 ? 'high' : clamped >= 50 ? 'medium' : 'low';

  return {
    score: clamped,
    band,
    evidenceRatio: evRatio,
    sourcesCount: sources,
    claimsCount: findings.length,
  };
}
