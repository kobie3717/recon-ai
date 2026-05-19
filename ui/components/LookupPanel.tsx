'use client';

interface LookupPanelProps {
  reportData: any;
  isRunning: boolean;
  onDrillDown?: (q: string) => void;
}

function handlePrint(reportData: any) {
  const domain = reportData?.meta?.domain || 'lookup';
  const date = reportData?.meta?.analysisDate || new Date().toISOString().split('T')[0];
  const prev = document.title;
  document.title = `Recon Deep Lookup - ${domain} - ${date}`;
  window.print();
  setTimeout(() => { document.title = prev; }, 1000);
}

export default function LookupPanel({ reportData, isRunning, onDrillDown }: LookupPanelProps) {
  const showLoading = isRunning && !reportData;

  return (
    <div className="flex flex-col h-full bg-recon-dark" id="report-panel">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Deep Lookup</h2>
          <span className="bg-violet-600/20 text-violet-300 border border-violet-600/30 px-2 py-0.5 rounded text-xs">🔬 BETA</span>
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
            <div className="text-center text-violet-400 text-lg font-medium mt-8">
              🔬 Running deep web analysis<span className="animate-pulse">...</span>
            </div>
          </div>
        )}

        {reportData && (
          <div className="space-y-6 pb-6">
            {/* Domain header */}
            <div className="border-b border-recon-blue/20 pb-4">
              <h1 className="text-3xl font-bold text-white">{reportData.meta?.domain}</h1>
              <p className="text-violet-400 mt-1 text-sm">
                Deep Lookup analysis · {reportData.meta?.analysisDate}
                {reportData.meta?.sourcesAnalyzed && (
                  <span className="ml-2 text-recon-grey">· {reportData.meta.sourcesAnalyzed} web sources</span>
                )}
              </p>
            </div>

            {/* Signals */}
            {reportData.signals && (
              <div className="flex flex-wrap gap-2">
                {reportData.signals.map((s: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    s.level === 'high' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' :
                    s.level === 'medium' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                    'bg-green-500/20 text-green-400 border border-green-500/30'
                  }`}>
                    <span>{s.icon}</span><span>{s.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Snapshot row */}
            {reportData.snapshot && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                  <div className="text-recon-grey text-xs uppercase mb-1">Founded</div>
                  <div className="text-white text-xl font-bold">{reportData.snapshot.founded || 'N/A'}</div>
                </div>
                <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                  <div className="text-recon-grey text-xs uppercase mb-1">Headquarters</div>
                  <div className="text-white text-xl font-bold">{reportData.snapshot.hq || 'N/A'}</div>
                </div>
                <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                  <div className="text-recon-grey text-xs uppercase mb-1">Employees</div>
                  <div className="text-white text-xl font-bold">{reportData.snapshot.employees || 'N/A'}</div>
                  {reportData.snapshot.stage && (
                    <div className="text-recon-grey text-xs mt-1">{reportData.snapshot.stage}</div>
                  )}
                </div>
              </div>
            )}

            {/* Deep Insights section */}
            {reportData.deepInsights && (
              <div className="bg-recon-navy/50 border border-violet-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-violet-400 text-sm font-semibold uppercase tracking-wide">Deep Insights</h3>
                  <span className="bg-violet-600/20 text-violet-300 border border-violet-600/30 px-2 py-0.5 rounded text-xs">Web-Scale Data</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {/* Revenue Streams */}
                  {reportData.deepInsights.revenueStreams && reportData.deepInsights.revenueStreams.length > 0 && (
                    <div className="bg-recon-dark/50 border border-recon-blue/20 rounded p-3">
                      <div className="text-recon-grey text-xs uppercase mb-2">Revenue Streams</div>
                      <div className="space-y-2">
                        {reportData.deepInsights.revenueStreams.map((rev: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                              rev.confidence === 'high' ? 'bg-green-400' :
                              rev.confidence === 'medium' ? 'bg-yellow-400' :
                              'bg-red-400'
                            }`} />
                            <div className="flex-1">
                              <div className="text-white font-medium">{rev.stream}</div>
                              <div className="text-recon-grey text-xs">{rev.estimate}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Customers */}
                  {reportData.deepInsights.keyCustomers && reportData.deepInsights.keyCustomers.length > 0 && (
                    <div className="bg-recon-dark/50 border border-recon-blue/20 rounded p-3">
                      <div className="text-recon-grey text-xs uppercase mb-2">Key Customers</div>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.deepInsights.keyCustomers.map((customer: string, i: number) => (
                          <span key={i} className="bg-blue-500/20 border border-blue-500/30 text-blue-400 px-2 py-0.5 rounded text-xs">
                            {customer}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tech Stack */}
                  {reportData.deepInsights.techStack && reportData.deepInsights.techStack.length > 0 && (
                    <div className="bg-recon-dark/50 border border-recon-blue/20 rounded p-3">
                      <div className="text-recon-grey text-xs uppercase mb-2">Tech Stack</div>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.deepInsights.techStack.map((tech: string, i: number) => (
                          <span key={i} className="bg-recon-grey/20 border border-recon-grey/30 text-white px-2 py-0.5 rounded text-xs font-mono">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Competitive Weaknesses */}
                  {reportData.deepInsights.competitiveWeaknesses && reportData.deepInsights.competitiveWeaknesses.length > 0 && (
                    <div className="bg-recon-dark/50 border border-recon-blue/20 rounded p-3">
                      <div className="text-recon-grey text-xs uppercase mb-2">Competitive Weaknesses</div>
                      <div className="space-y-2">
                        {reportData.deepInsights.competitiveWeaknesses.map((weak: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0 ${
                              weak.severity === 'HIGH' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                              weak.severity === 'MED' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                              'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                            }`}>
                              {weak.severity}
                            </span>
                            <span className="text-white">{weak.weakness}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Strategic Moves section */}
            {reportData.strategicMoves && reportData.strategicMoves.length > 0 && (
              <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide mb-3">Strategic Moves</h3>
                <div className="space-y-2">
                  {reportData.strategicMoves.map((move: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-violet-500/30 pl-3 py-1">
                      <span className="text-recon-grey font-mono whitespace-nowrap">{move.date}</span>
                      <span className="text-white flex-1">{move.move}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${
                        move.signal === 'HIGH' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                        move.signal === 'MED' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                        'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}>
                        {move.signal}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competitive section */}
            {reportData.competitive && reportData.competitive.length > 0 && (
              <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide mb-3">Competitive Intel</h3>
                <div className="space-y-2">
                  {reportData.competitive.map((c: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span
                        className="text-violet-400 font-medium cursor-pointer hover:underline whitespace-nowrap"
                        onClick={() => onDrillDown?.(c.competitor.toLowerCase().replace(/\s+/g, '') + '.com')}
                      >{c.competitor}</span>
                      <span className="text-recon-grey">{c.weakness}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hiring section */}
            {reportData.hiring && reportData.hiring.length > 0 && (
              <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide mb-3">Hiring Signals</h3>
                <div className="space-y-3">
                  {reportData.hiring.map((h: any, i: number) => (
                    <div key={i} className="border-l-2 border-amber-500/30 pl-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium">{h.role}</span>
                        {h.count > 0 && (
                          <span className="bg-amber-500/20 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded text-xs font-bold">
                            {h.count} open
                          </span>
                        )}
                      </div>
                      <p className="text-recon-grey text-sm">{h.signal}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Strategic section */}
            {reportData.strategic && reportData.strategic.length > 0 && (
              <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide mb-3">Strategic Insights</h3>
                <ol className="space-y-2 list-decimal list-inside">
                  {reportData.strategic.map((s: string, i: number) => (
                    <li key={i} className="text-white text-sm">{s}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Sources section */}
            {reportData.sources && reportData.sources.length > 0 && (
              <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide mb-3">Intelligence Sources</h3>
                <div className="space-y-2">
                  {reportData.sources.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-recon-grey">
                      <span>{s.icon}</span>
                      <span className="text-white font-medium">{s.tool}</span>
                      <span>→</span>
                      <span className="font-mono">{s.target}</span>
                      {s.sections && (
                        <span className="text-recon-grey">({Array.isArray(s.sections) ? s.sections.join(', ') : s.sections})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost breakdown */}
            {reportData.cost && (
              <div className="bg-recon-navy/80 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide mb-3">Cost Breakdown</h3>
                <div className="font-mono text-xs space-y-1">
                  {reportData.cost.deepLookup > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>Deep Lookup API</span>
                      <span>${reportData.cost.deepLookup.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.serpApi > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>SERP API</span>
                      <span>${reportData.cost.serpApi.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.webUnlocker > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>Web Unlocker</span>
                      <span>${reportData.cost.webUnlocker.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.claude > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>Claude Analysis</span>
                      <span>${reportData.cost.claude.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white font-semibold pt-2 border-t border-recon-blue/30 mt-2">
                    <span>Total</span>
                    <span>${reportData.cost.total?.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
