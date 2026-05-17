'use client';

interface RedteamPanelProps {
  reportData: any;
  isRunning: boolean;
  onDrillDown?: (query: string) => void;
}

function handlePrint(reportData: any) {
  const domain = reportData?.meta?.domain || 'redteam';
  const date = reportData?.meta?.analysisDate || new Date().toISOString().split('T')[0];
  const prev = document.title;
  document.title = `Recon RedTeam - ${domain} - ${date}`;
  window.print();
  setTimeout(() => { document.title = prev; }, 1000);
}

const severityClasses: Record<string, string> = {
  CRITICAL: 'bg-red-600/20 text-red-300 border border-red-600/40',
  HIGH: 'bg-red-500/20 text-red-400 border border-red-500/30',
  MED: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  LOW: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
};

const priorityClasses: Record<string, string> = {
  P0: 'bg-red-600/20 text-red-300 border border-red-600/40',
  P1: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  P2: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
};

export default function RedteamPanel({ reportData, isRunning, onDrillDown }: RedteamPanelProps) {
  const showLoading = isRunning && !reportData;

  return (
    <div className="flex flex-col h-full bg-recon-dark" id="report-panel">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Red Team Analysis</h2>
          <span className="bg-red-600/20 text-red-300 border border-red-600/30 px-2 py-0.5 rounded text-xs">⚔ SECURITY</span>
        </div>
        {reportData && (
          <button
            onClick={() => handlePrint(reportData)}
            className="text-recon-grey hover:text-white text-sm flex items-center gap-1.5 px-3 py-1 rounded border border-recon-blue/30 hover:border-recon-cyan/50 transition-colors"
          >
            ↓ PDF
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {showLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-20 bg-recon-navy/50 rounded" />
            <div className="h-40 bg-recon-navy/50 rounded" />
            <div className="h-32 bg-recon-navy/50 rounded" />
            <div className="text-center text-red-400 text-lg font-medium mt-8">
              Running security assessment<span className="animate-pulse">...</span>
            </div>
          </div>
        )}

        {reportData && (
          <div className="space-y-6 pb-6">
            {/* Domain header */}
            <div className="border-b border-recon-blue/20 pb-4">
              <h1 className="text-3xl font-bold text-white">{reportData.meta?.domain}</h1>
              <p className="text-red-400 mt-1 text-sm">Security assessment · {reportData.meta?.analysisDate}</p>
            </div>

            {/* Signals */}
            {reportData.signals && (
              <div className="flex flex-wrap gap-2">
                {reportData.signals.map((s: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    s.level === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    s.level === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-green-500/20 text-green-400 border border-green-500/30'
                  }`}>
                    <span>{s.icon}</span><span>{s.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recommendations — P0 first */}
            {reportData.recommendations && reportData.recommendations.length > 0 && (
              <div className="bg-recon-navy/40 border border-red-500/20 rounded-lg p-4">
                <h3 className="text-red-400 font-bold text-sm uppercase mb-3">Remediation Priorities</h3>
                <div className="space-y-2">
                  {reportData.recommendations.map((r: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${priorityClasses[r.priority] || priorityClasses.P2}`}>
                        {r.priority}
                      </span>
                      <span className="text-white">{r.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attack Surface */}
            {reportData.attackSurface && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Attack Surface</h3>
                <div className="space-y-3 text-sm">
                  {reportData.attackSurface.subdomains?.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-1">Exposed Subdomains</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.attackSurface.subdomains.map((s: string, i: number) => (
                          <span key={i} className="bg-red-500/10 border border-red-500/20 text-red-300 px-2 py-0.5 rounded text-xs font-mono">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {reportData.attackSurface.techStack?.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-1">Identified Tech Stack</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.attackSurface.techStack.map((t: string, i: number) => (
                          <span key={i} className="bg-recon-blue/20 border border-recon-blue/30 text-recon-cyan px-2 py-0.5 rounded text-xs">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {reportData.attackSurface.headers && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-1">Security Headers</span>
                      <div className="flex items-center gap-4">
                        <span className={`text-2xl font-bold ${
                          reportData.attackSurface.headers.score?.startsWith('A') ? 'text-green-400' :
                          reportData.attackSurface.headers.score?.startsWith('B') ? 'text-amber-400' : 'text-red-400'
                        }`}>{reportData.attackSurface.headers.score}</span>
                        <div className="flex gap-2 flex-wrap">
                          {[['CSP', reportData.attackSurface.headers.csp], ['HSTS', reportData.attackSurface.headers.hsts], ['X-Frame', reportData.attackSurface.headers.xframe], ['Referrer', reportData.attackSurface.headers.referrerPolicy]].map(([label, ok]) => (
                            <span key={label as string} className={`px-2 py-0.5 rounded text-xs ${ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400 line-through'}`}>
                              {label as string}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Known Exposures */}
            {reportData.exposures && reportData.exposures.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Known Exposures</h3>
                <div className="space-y-3">
                  {reportData.exposures.map((e: any, i: number) => (
                    <div key={i} className="border-l-2 border-red-500/30 pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${severityClasses[e.severity] || severityClasses.LOW}`}>{e.severity}</span>
                        <span className="text-white text-sm font-medium">{e.type}</span>
                        <span className="text-recon-grey text-xs ml-auto">{e.date}</span>
                      </div>
                      <p className="text-recon-grey text-sm">{e.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Social Engineering */}
            {reportData.socialEngineering && reportData.socialEngineering.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Social Engineering Vectors</h3>
                <div className="space-y-3">
                  {reportData.socialEngineering.map((v: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${severityClasses[v.risk] || severityClasses.LOW}`}>{v.risk}</span>
                      <div>
                        <div className="text-white font-medium">{v.vector}</div>
                        <div className="text-recon-grey text-xs mt-0.5">{v.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competitors */}
            {reportData.competitive && reportData.competitive.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Security Landscape</h3>
                <div className="space-y-2">
                  {reportData.competitive.map((c: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span
                        className="text-recon-cyan font-medium cursor-pointer hover:underline whitespace-nowrap"
                        onClick={() => onDrillDown?.(c.competitor.toLowerCase().replace(/\s+/g, '') + '.com')}
                      >{c.competitor}</span>
                      <span className="text-recon-grey">{c.weakness}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sources */}
            {reportData.sources && reportData.sources.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Intelligence Sources</h3>
                <div className="space-y-2">
                  {reportData.sources.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-recon-grey">
                      <span>{s.icon}</span>
                      <span className="text-white font-medium">{s.tool}</span>
                      <span>→</span>
                      <span className="font-mono">{s.target}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost */}
            {reportData.cost && (
              <div className="bg-recon-navy/80 border border-recon-blue/30 rounded-lg p-4 font-mono text-sm">
                <div className="flex justify-between text-white font-semibold">
                  <span>Total cost</span>
                  <span>${reportData.cost.total?.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
