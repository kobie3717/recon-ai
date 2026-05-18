'use client';

import { useState } from 'react';

interface BundlePanelProps {
  reportData: any;
  isRunning: boolean;
  onDrillDown?: (query: string) => void;
}

type Tab = 'intelligence' | 'seo' | 'security';

export default function BundlePanel({ reportData, isRunning, onDrillDown }: BundlePanelProps) {
  const [tab, setTab] = useState<Tab>('intelligence');
  const [isPrinting, setIsPrinting] = useState(false);
  const showLoading = isRunning && !reportData;

  const onPrint = () => {
    if (isPrinting || !reportData) return;
    setIsPrinting(true);
    const domain = reportData?.meta?.domain || 'bundle';
    const date = reportData?.meta?.analysisDate || new Date().toISOString().split('T')[0];
    const prev = document.title;
    document.title = `Recon Bundle - ${domain} - ${date}`;
    setTimeout(() => {
      window.print();
      document.title = prev;
      setTimeout(() => setIsPrinting(false), 500);
    }, 80);
  };

  const standard = reportData?.standard;
  const seo = reportData?.seo;
  const redteam = reportData?.redteam;

  const tabs: { id: Tab; label: string; icon: string; color: string }[] = [
    { id: 'intelligence', label: 'Intelligence', icon: '🕵', color: 'text-recon-cyan' },
    { id: 'seo', label: 'SEO', icon: '📈', color: 'text-green-400' },
    { id: 'security', label: 'Security', icon: '⚔', color: 'text-red-400' },
  ];

  return (
    <div className="flex flex-col h-full bg-recon-dark" id="report-panel">
      {/* Header */}
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Bundle Report</h2>
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-xs">★ ALL MODES</span>
        </div>
        {reportData && (
          <button
            onClick={onPrint}
            disabled={isPrinting}
            className="text-recon-grey hover:text-white text-sm flex items-center gap-1.5 px-3 py-1 rounded border border-recon-blue/30 hover:border-recon-cyan/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPrinting ? (
              <><span className="w-3 h-3 border-2 border-recon-grey border-t-white rounded-full animate-spin" /> Printing...</>
            ) : '↓ PDF'}
          </button>
        )}
      </div>

      {/* Tabs */}
      {!showLoading && (
        <div className="bg-recon-navy/60 border-b border-recon-blue/20 flex">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-6 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${
                tab === t.id
                  ? `border-recon-cyan ${t.color}`
                  : 'border-transparent text-recon-grey hover:text-white'
              }`}
            >
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {showLoading && (
          <div className="flex flex-col items-center justify-center gap-6 pt-16">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-2xl">★</div>
            </div>
            <div className="text-center">
              <div className="text-amber-400 font-semibold text-lg mb-3">Running All Modes in Parallel</div>
              <div className="flex justify-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
            <div className="w-full max-w-lg space-y-3 opacity-20 animate-pulse">
              <div className="h-8 bg-recon-navy/80 rounded w-2/3 mx-auto" />
              <div className="h-20 bg-recon-navy/80 rounded" />
              <div className="h-12 bg-recon-navy/80 rounded" />
            </div>
          </div>
        )}

        {reportData && tab === 'intelligence' && standard && (
          <div className="space-y-4 pb-6">
            <div className="border-b border-recon-blue/20 pb-3">
              <h1 className="text-2xl font-bold text-white">{standard.meta?.companyName || standard.meta?.domain}</h1>
              <p className="text-recon-grey text-sm">{standard.meta?.analysisDate}</p>
            </div>
            {standard.signals?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {standard.signals.map((s: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    s.level === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    s.level === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-green-500/20 text-green-400 border border-green-500/30'
                  }`}><span>{s.icon}</span><span>{s.text}</span></div>
                ))}
              </div>
            )}
            {standard?.snapshot && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Snapshot</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(standard.snapshot).filter(([k]) => k !== 'linkedin' && k !== 'website').map(([k, v]) => (
                    <div key={k}><span className="text-recon-grey text-xs capitalize block">{k}</span><span className="text-white">{String(v)}</span></div>
                  ))}
                </div>
              </div>
            )}
            {standard.competitive?.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Competitive Intel</h3>
                {standard.competitive.map((c: any, i: number) => (
                  <div key={i} className="flex gap-3 text-sm mb-2">
                    <span className="text-recon-cyan font-medium cursor-pointer hover:underline" onClick={() => {
                      const d = c.competitor?.toLowerCase().replace(/\s+/g,'') || '';
                      onDrillDown?.(d.includes('.') ? d : `${d}.com`);
                    }}>{c.competitor}</span>
                    <span className="text-recon-grey">{c.weakness}</span>
                  </div>
                ))}
              </div>
            )}
            {standard.strategic?.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Strategic Direction</h3>
                <ul className="space-y-1">{standard.strategic.map((s: string, i: number) => <li key={i} className="text-white text-sm flex gap-2"><span className="text-recon-cyan">→</span>{s}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {reportData && tab === 'seo' && seo && (
          <div className="space-y-4 pb-6">
            <div className="border-b border-green-500/20 pb-3">
              <h1 className="text-2xl font-bold text-white">SEO Analysis</h1>
              <p className="text-green-400 text-sm">Domain Authority {seo.snapshot?.domainAuthority} · {seo.snapshot?.organicTraffic} organic</p>
            </div>
            {seo.signals?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {seo.signals.map((s: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    s.level === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    s.level === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-green-500/20 text-green-400 border border-green-500/30'
                  }`}><span>{s.icon}</span><span>{s.text}</span></div>
                ))}
              </div>
            )}
            {seo.topKeywords?.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-green-400 font-bold text-sm uppercase mb-3">Top Keywords</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-recon-grey text-xs"><th className="text-left pb-2">Keyword</th><th className="text-right pb-2">Pos</th><th className="text-right pb-2">Vol</th></tr></thead>
                  <tbody>{seo.topKeywords.slice(0, 5).map((k: any, i: number) => (
                    <tr key={i} className="border-t border-recon-blue/10">
                      <td className="py-1.5 text-white">{k.keyword}</td>
                      <td className="py-1.5 text-right text-green-400">#{k.position}</td>
                      <td className="py-1.5 text-right text-recon-grey">{k.volume?.toLocaleString()}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {seo.opportunities?.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-green-400 font-bold text-sm uppercase mb-3">Opportunities</h3>
                {seo.opportunities.map((o: any, i: number) => (
                  <div key={i} className="mb-2 text-sm"><span className="text-white font-medium">{o.keyword}</span><span className="text-recon-grey ml-2">{o.opportunity}</span></div>
                ))}
              </div>
            )}
          </div>
        )}

        {reportData && tab === 'security' && redteam && (
          <div className="space-y-4 pb-6">
            <div className="border-b border-red-500/20 pb-3">
              <h1 className="text-2xl font-bold text-white">Security Assessment</h1>
              <p className="text-red-400 text-sm">Red team analysis · {redteam.meta?.analysisDate}</p>
            </div>
            {redteam.recommendations?.length > 0 && (
              <div className="bg-recon-navy/40 border border-red-500/20 rounded-lg p-4">
                <h3 className="text-red-400 font-bold text-sm uppercase mb-3">Priorities</h3>
                {redteam.recommendations.map((r: any, i: number) => (
                  <div key={i} className="flex gap-3 text-sm mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${r.priority === 'P0' ? 'bg-red-600/20 text-red-300 border border-red-600/40' : r.priority === 'P1' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>{r.priority}</span>
                    <span className="text-white">{r.action}</span>
                  </div>
                ))}
              </div>
            )}
            {redteam.exposures?.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-red-400 font-bold text-sm uppercase mb-3">Exposures</h3>
                {redteam.exposures.map((e: any, i: number) => (
                  <div key={i} className="mb-3 border-l-2 border-red-500/30 pl-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${e.severity === 'CRITICAL' ? 'bg-red-600/20 text-red-300' : e.severity === 'HIGH' ? 'bg-red-500/20 text-red-400' : e.severity === 'MED' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'}`}>{e.severity}</span>
                      <span className="text-white text-sm font-medium">{e.type}</span>
                    </div>
                    <p className="text-recon-grey text-xs">{e.detail}</p>
                  </div>
                ))}
              </div>
            )}
            {redteam.attackSurface && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-red-400 font-bold text-sm uppercase mb-3">Attack Surface</h3>
                {redteam.attackSurface?.techStack?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {redteam.attackSurface.techStack.map((t: string, i: number) => (
                      <span key={i} className="bg-recon-blue/20 border border-recon-blue/30 text-recon-cyan px-2 py-0.5 rounded text-xs">{t}</span>
                    ))}
                  </div>
                )}
                {redteam.attackSurface.headers && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xl font-bold ${String(redteam.attackSurface.headers.score || 'F').startsWith('A') ? 'text-green-400' : String(redteam.attackSurface.headers.score || 'F').startsWith('B') ? 'text-amber-400' : 'text-red-400'}`}>{redteam.attackSurface.headers.score}</span>
                    <span className="text-recon-grey text-xs">security headers</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
