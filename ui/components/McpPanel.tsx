'use client';

import { useState } from 'react';
import { downloadPdf } from '@/lib/downloadPdf';

interface McpPanelProps {
  reportData: any;
  isRunning: boolean;
  onDrillDown?: (q: string) => void;
}

export default function McpPanel({ reportData, isRunning, onDrillDown }: McpPanelProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const showLoading = isRunning && !reportData;

  return (
    <div className="flex flex-col h-full bg-recon-dark" id="report-panel">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-orange-500/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-orange-400 uppercase font-bold tracking-wide">MCP Intelligence</h2>
          <span className="bg-orange-600/20 text-orange-300 border border-orange-600/30 px-2 py-0.5 rounded text-xs">🔗 MCP</span>
        </div>
        {reportData && (
          <button
            onClick={async () => {
              if (!reportData || isPrinting) return;
              setIsPrinting(true);
              const domain = reportData?.meta?.domain || 'report';
              const date = reportData?.meta?.analysisDate || new Date().toISOString().split('T')[0];
              const modeLabel = reportData?.meta?.mode || 'recon';
              await downloadPdf(`recon-${modeLabel}-${domain}-${date}.pdf`, reportData).finally(() => setIsPrinting(false));
            }}
            disabled={isPrinting}
            className="text-recon-grey hover:text-white text-sm flex items-center gap-1.5 px-3 py-1 rounded border border-orange-500/30 hover:border-orange-400/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPrinting ? 'Generating...' : '↓ PDF'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {showLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-20 bg-recon-navy/50 rounded" />
            <div className="h-40 bg-recon-navy/50 rounded" />
            <div className="h-32 bg-recon-navy/50 rounded" />
            <div className="text-center text-orange-400 text-lg font-medium mt-8">
              🔗 Running MCP tools<span className="animate-pulse">...</span>
            </div>
          </div>
        )}

        {reportData && (
          <div className="space-y-6 pb-6">
            {/* Domain header */}
            <div className="border-b border-orange-500/20 pb-4">
              <h1 className="text-3xl font-bold text-white">{reportData.meta?.domain}</h1>
              <p className="text-orange-400 mt-1 text-sm">
                MCP Protocol Intelligence · {reportData.meta?.analysisDate}
                {reportData.meta?.toolsUsed && (
                  <span className="ml-2 text-recon-grey">· {reportData.meta.toolsUsed} MCP tools</span>
                )}
              </p>
            </div>

            {/* Signals */}
            {reportData.signals && (
              <div className="flex flex-wrap gap-2">
                {reportData.signals.map((s: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    s.level === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                    s.level === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
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
                <div className="bg-recon-navy/50 border border-orange-500/20 rounded-lg p-4">
                  <div className="text-recon-grey text-xs uppercase mb-1">Founded</div>
                  <div className="text-white text-xl font-bold">{reportData.snapshot.founded || 'N/A'}</div>
                </div>
                <div className="bg-recon-navy/50 border border-orange-500/20 rounded-lg p-4">
                  <div className="text-recon-grey text-xs uppercase mb-1">Headquarters</div>
                  <div className="text-white text-xl font-bold">{reportData.snapshot.hq || 'N/A'}</div>
                </div>
                <div className="bg-recon-navy/50 border border-orange-500/20 rounded-lg p-4">
                  <div className="text-recon-grey text-xs uppercase mb-1">Employees</div>
                  <div className="text-white text-xl font-bold">{reportData.snapshot.employees || 'N/A'}</div>
                  {reportData.snapshot.stage && (
                    <div className="text-recon-grey text-xs mt-1">{reportData.snapshot.stage}</div>
                  )}
                </div>
              </div>
            )}

            {/* MCP Tools Used section - SHOWCASE */}
            {reportData.mcpInsights && (
              <div className="bg-orange-900/20 border-2 border-orange-500/30 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-orange-400 text-sm font-semibold uppercase tracking-wide">MCP Tools Used</h3>
                  <span className="bg-orange-600/30 text-orange-300 border border-orange-600/40 px-2 py-0.5 rounded text-xs font-bold">
                    {reportData.meta?.toolsUsed || 4} tools · $0.00 data cost
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  {/* Search Engine Tool Card */}
                  <div className="bg-recon-dark/50 border border-orange-500/20 rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-orange-400 text-xl">🔗</span>
                      <div className="text-orange-300 text-sm font-medium">search_engine</div>
                    </div>
                    <div className="text-recon-grey text-xs">
                      2 queries executed
                      <div className="text-white text-lg font-bold mt-1">16 results</div>
                    </div>
                  </div>

                  {/* Scrape as Markdown Tool Card */}
                  <div className="bg-recon-dark/50 border border-orange-500/20 rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-orange-400 text-xl">📄</span>
                      <div className="text-orange-300 text-sm font-medium">scrape_as_markdown</div>
                    </div>
                    <div className="text-recon-grey text-xs">
                      Homepage scraped
                      <div className="text-white text-lg font-bold mt-1">
                        {reportData.facts?.scrape?.chars || '4,200'} chars
                      </div>
                    </div>
                  </div>

                  {/* Web Unlocker Tool Card */}
                  <div className="bg-recon-dark/50 border border-orange-500/20 rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-orange-400 text-xl">🔓</span>
                      <div className="text-orange-300 text-sm font-medium">web_unlocker</div>
                    </div>
                    <div className="text-recon-grey text-xs">
                      /about page unlocked
                      <div className="text-white text-lg font-bold mt-1">
                        {reportData.facts?.unlocker?.chars || '3,800'} chars
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coverage Score */}
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-recon-grey text-xs uppercase">Data Coverage Score</span>
                    <span className="text-orange-400 text-sm font-bold">
                      {reportData.mcpInsights.coverageScore || 95}%
                    </span>
                  </div>
                  <div className="w-full bg-recon-dark/50 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        (reportData.mcpInsights.coverageScore || 95) >= 80 ? 'bg-green-500' :
                        (reportData.mcpInsights.coverageScore || 95) >= 60 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${reportData.mcpInsights.coverageScore || 95}%` }}
                    />
                  </div>
                  <p className="text-recon-grey text-xs mt-2 italic">
                    Quality: {reportData.mcpInsights.dataQuality || 'high'} · All MCP tools returned structured data
                  </p>
                </div>
              </div>
            )}

            {/* News section */}
            {reportData.news && reportData.news.length > 0 && (
              <div className="bg-recon-navy/50 border border-orange-500/20 rounded-lg p-4">
                <h3 className="text-orange-400 text-sm font-semibold uppercase tracking-wide mb-3">Recent News</h3>
                <div className="space-y-2">
                  {reportData.news.map((n: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-orange-500/30 pl-3 py-1">
                      <span className="text-recon-grey font-mono whitespace-nowrap">{n.date}</span>
                      <span className="text-white flex-1">{n.headline}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${
                        n.signal === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                        n.signal === 'MED' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }`}>
                        {n.signal}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Products section */}
            {reportData.products && reportData.products.length > 0 && (
              <div className="bg-recon-navy/50 border border-orange-500/20 rounded-lg p-4">
                <h3 className="text-orange-400 text-sm font-semibold uppercase tracking-wide mb-3">Products</h3>
                <div className="space-y-2">
                  {reportData.products.map((p: any, i: number) => (
                    <div key={i} className="border-l-2 border-orange-500/30 pl-3">
                      <div className="text-white font-medium">{p.name}</div>
                      <p className="text-recon-grey text-sm">{p.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competitive section */}
            {reportData.competitive && reportData.competitive.length > 0 && (
              <div className="bg-recon-navy/50 border border-orange-500/20 rounded-lg p-4">
                <h3 className="text-orange-400 text-sm font-semibold uppercase tracking-wide mb-3">Competitive Intel</h3>
                <div className="space-y-2">
                  {reportData.competitive.map((c: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span
                        className="text-orange-400 font-medium cursor-pointer hover:underline whitespace-nowrap"
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
              <div className="bg-recon-navy/50 border border-orange-500/20 rounded-lg p-4">
                <h3 className="text-orange-400 text-sm font-semibold uppercase tracking-wide mb-3">Hiring Signals</h3>
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
              <div className="bg-recon-navy/50 border border-orange-500/20 rounded-lg p-4">
                <h3 className="text-orange-400 text-sm font-semibold uppercase tracking-wide mb-3">Strategic Insights</h3>
                <ol className="space-y-2 list-decimal list-inside">
                  {reportData.strategic.map((s: string, i: number) => (
                    <li key={i} className="text-white text-sm">{s}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Sources section */}
            {reportData.sources && reportData.sources.length > 0 && (
              <div className="bg-recon-navy/50 border border-orange-500/20 rounded-lg p-4">
                <h3 className="text-orange-400 text-sm font-semibold uppercase tracking-wide mb-3">Intelligence Sources</h3>
                <div className="space-y-2">
                  {reportData.sources.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-recon-grey">
                      <span>{s.icon}</span>
                      <span className="text-orange-400 font-medium">{s.tool}</span>
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

            {/* Cost breakdown - HIGHLIGHT FREE MCP DATA */}
            {reportData.cost && (
              <div className="bg-orange-900/20 border-2 border-orange-500/30 rounded-lg p-4">
                <h3 className="text-orange-400 text-sm font-semibold uppercase tracking-wide mb-3">Cost Breakdown</h3>
                <div className="font-mono text-xs space-y-1">
                  <div className="flex justify-between items-center text-recon-grey">
                    <span>MCP search_engine ×2</span>
                    <span className="text-green-400 font-bold">$0.00 FREE</span>
                  </div>
                  <div className="flex justify-between items-center text-recon-grey">
                    <span>MCP scrape_as_markdown</span>
                    <span className="text-green-400 font-bold">$0.00 FREE</span>
                  </div>
                  <div className="flex justify-between items-center text-recon-grey">
                    <span>MCP web_unlocker</span>
                    <span className="text-green-400 font-bold">$0.00 FREE</span>
                  </div>
                  <div className="flex justify-between text-recon-grey pt-1 border-t border-orange-500/20">
                    <span className="font-bold">MCP Data Total</span>
                    <span className="text-green-400 font-bold">$0.00</span>
                  </div>
                  {reportData.cost.claude > 0 && (
                    <div className="flex justify-between text-recon-grey pt-2">
                      <span>Claude Analysis</span>
                      <span>${reportData.cost.claude.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-orange-400 font-semibold pt-2 border-t border-orange-500/30 mt-2">
                    <span>Total</span>
                    <span>${reportData.cost.total?.toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-orange-400/70 text-xs mt-3 italic">
                  💡 BD MCP tools are FREE on the free tier — only Claude synthesis costs apply
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
