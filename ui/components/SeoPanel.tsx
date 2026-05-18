'use client';

import { useState } from 'react';
import { downloadPdf } from '@/lib/downloadPdf';

interface SeoPanelProps {
  reportData: any;
  isRunning: boolean;
  onDrillDown?: (query: string) => void;
}

const intentClasses: Record<string, string> = {
  commercial: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  transactional: 'bg-green-500/20 text-green-400 border border-green-500/30',
  informational: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  navigational: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
};

export default function SeoPanel({ reportData, isRunning, onDrillDown }: SeoPanelProps) {
  const showLoading = isRunning && !reportData;
  const [isPrinting, setIsPrinting] = useState(false);

  const onPrint = () => {
    if (isPrinting || !reportData) return;
    setIsPrinting(true);
    const domain = reportData?.meta?.domain || 'seo';
    const date = reportData?.meta?.analysisDate || new Date().toISOString().split('T')[0];
    downloadPdf(`recon-seo-${domain}-${date}.pdf`).finally(() => setIsPrinting(false));
  };

  return (
    <div className="flex flex-col h-full bg-recon-dark" id="report-panel">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">SEO Analysis</h2>
          <span className="bg-green-600/20 text-green-300 border border-green-600/30 px-2 py-0.5 rounded text-xs">📈 ORGANIC</span>
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

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {showLoading && (
          <div className="flex flex-col items-center justify-center gap-6 pt-16">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-green-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-green-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-2xl">📈</div>
            </div>
            <div className="text-center">
              <div className="text-green-400 font-semibold text-lg mb-3">Running SEO Analysis</div>
              <div className="flex justify-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
            <div className="w-full max-w-lg space-y-3 opacity-20 animate-pulse">
              <div className="h-8 bg-recon-navy/80 rounded w-2/3 mx-auto" />
              <div className="h-20 bg-recon-navy/80 rounded" />
              <div className="h-12 bg-recon-navy/80 rounded" />
            </div>
          </div>
        )}

        {reportData && (
          <div className="space-y-6 pb-6">
            {/* Domain header */}
            <div className="border-b border-recon-blue/20 pb-4">
              <h1 className="text-3xl font-bold text-white">{reportData.meta?.domain}</h1>
              <p className="text-green-400 mt-1 text-sm">
                {reportData.meta?.companyName && <span>{reportData.meta.companyName} · </span>}
                SEO analysis · {reportData.meta?.analysisDate}
              </p>
            </div>

            {/* Signals */}
            {reportData.signals && (
              <div className="flex flex-wrap gap-2">
                {reportData.signals.map((s: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    s.level === 'high' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    s.level === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                  }`}>
                    <span>{s.icon}</span><span>{s.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Snapshot */}
            {reportData.snapshot && (
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Domain Authority', value: reportData.snapshot?.domainAuthority ?? '-', suffix: reportData.snapshot?.domainAuthority != null ? '/100' : '' },
                  { label: 'Organic Traffic', value: reportData.snapshot?.organicTraffic?.toLocaleString?.() ?? '-', suffix: '' },
                  { label: 'Ranking Keywords', value: reportData.snapshot?.rankingKeywords?.toLocaleString?.() ?? '-', suffix: '' },
                  { label: 'Backlinks', value: reportData.snapshot?.backlinks?.toLocaleString?.() ?? '-', suffix: '' },
                ].map((metric, i) => (
                  <div key={i} className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                    <div className="text-recon-grey text-xs mb-1">{metric.label}</div>
                    <div className="text-green-400 text-2xl font-bold">
                      {metric.value}<span className="text-lg text-recon-grey">{metric.suffix}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Top Keywords */}
            {reportData.topKeywords && reportData.topKeywords.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Top Ranking Keywords</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-recon-blue/20">
                        <th className="text-left text-recon-grey font-medium py-2">Keyword</th>
                        <th className="text-center text-recon-grey font-medium py-2">Position</th>
                        <th className="text-right text-recon-grey font-medium py-2">Volume</th>
                        <th className="text-right text-recon-grey font-medium py-2">Intent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.topKeywords.map((kw: any, i: number) => (
                        <tr key={i} className="border-b border-recon-blue/10">
                          <td className="py-2 text-white">{kw.keyword}</td>
                          <td className="py-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              kw.position <= 3 ? 'bg-green-500/20 text-green-400' :
                              kw.position <= 10 ? 'bg-blue-500/20 text-blue-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>#{kw.position}</span>
                          </td>
                          <td className="py-2 text-right text-recon-grey">{kw.volume?.toLocaleString()}</td>
                          <td className="py-2 text-right">
                            <span className={`px-2 py-0.5 rounded text-xs ${intentClasses[kw.intent] || intentClasses.informational}`}>
                              {kw.intent}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Technical Health */}
            {reportData.technical && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Technical Health</h3>
                <div className="space-y-3">
                  {reportData.technical.coreWebVitals && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Core Web Vitals</span>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="text-xs text-recon-grey mb-1">LCP</div>
                          <div className="text-white font-mono">{reportData.technical.coreWebVitals.lcp}</div>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-recon-grey mb-1">FID</div>
                          <div className="text-white font-mono">{reportData.technical.coreWebVitals.fid}</div>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-recon-grey mb-1">CLS</div>
                          <div className="text-white font-mono">{reportData.technical.coreWebVitals.cls}</div>
                        </div>
                        <div className="flex-1">
                          <div className="text-xs text-recon-grey mb-1">Score</div>
                          <div className={`text-2xl font-bold ${
                            typeof reportData.technical.coreWebVitals.score === 'number'
                              ? (reportData.technical.coreWebVitals.score >= 90 ? 'text-green-400' :
                                 reportData.technical.coreWebVitals.score >= 70 ? 'text-amber-400' :
                                 'text-red-400')
                              : 'text-white'
                          }`}>{reportData.technical.coreWebVitals.score}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    {reportData.technical.mobileScore !== undefined && (
                      <div>
                        <span className="text-recon-grey block text-xs mb-1">Mobile Score</span>
                        <span className="text-white font-bold">{reportData.technical.mobileScore}/100</span>
                      </div>
                    )}
                    {reportData.technical.pageSpeed !== undefined && (
                      <div>
                        <span className="text-recon-grey block text-xs mb-1">Page Speed</span>
                        <span className="text-white font-bold">{reportData.technical.pageSpeed}/100</span>
                      </div>
                    )}
                  </div>
                  {reportData.technical.issues && reportData.technical.issues.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Issues</span>
                      <ul className="space-y-1">
                        {reportData.technical.issues.map((issue: string, i: number) => (
                          <li key={i} className="text-sm text-red-400 flex items-start gap-2">
                            <span className="text-red-500 mt-0.5">•</span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SERP Features */}
            {reportData.serp && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">SERP Features</h3>
                <div className="flex flex-wrap gap-3">
                  {reportData.serp.featuredSnippets !== undefined && (
                    <div className="bg-recon-dark border border-green-500/20 rounded px-3 py-2">
                      <div className="text-recon-grey text-xs">Featured Snippets</div>
                      <div className="text-green-400 text-xl font-bold">{reportData.serp.featuredSnippets}</div>
                    </div>
                  )}
                  {reportData.serp.knowledgePanel && (
                    <div className="bg-recon-dark border border-green-500/20 rounded px-3 py-2">
                      <div className="text-green-400 text-sm font-medium">✓ Knowledge Panel</div>
                    </div>
                  )}
                  {reportData.serp.localPack && (
                    <div className="bg-recon-dark border border-green-500/20 rounded px-3 py-2">
                      <div className="text-green-400 text-sm font-medium">✓ Local Pack</div>
                    </div>
                  )}
                  {reportData.serp.peopleAlsoAsk !== undefined && (
                    <div className="bg-recon-dark border border-green-500/20 rounded px-3 py-2">
                      <div className="text-recon-grey text-xs">People Also Ask</div>
                      <div className="text-green-400 text-xl font-bold">{reportData.serp.peopleAlsoAsk}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Content Strategy */}
            {reportData.contentStrategy && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Content Strategy</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {reportData.contentStrategy.postsPerMonth !== undefined && (
                      <div>
                        <span className="text-recon-grey block text-xs mb-1">Posts per Month</span>
                        <span className="text-white font-bold text-lg">{reportData.contentStrategy.postsPerMonth}</span>
                      </div>
                    )}
                    {reportData.contentStrategy.avgWordCount !== undefined && (
                      <div>
                        <span className="text-recon-grey block text-xs mb-1">Avg Word Count</span>
                        <span className="text-white font-bold text-lg">{reportData.contentStrategy.avgWordCount?.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  {reportData.contentStrategy.topTopics && reportData.contentStrategy.topTopics.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Top Topics</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.contentStrategy.topTopics.map((topic: string, i: number) => (
                          <span key={i} className="bg-green-500/10 border border-green-500/20 text-green-300 px-2 py-0.5 rounded text-xs">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {reportData.contentStrategy.contentGaps && reportData.contentStrategy.contentGaps.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Content Gaps</span>
                      <ul className="space-y-1">
                        {reportData.contentStrategy.contentGaps.map((gap: string, i: number) => (
                          <li key={i} className="text-sm text-amber-400 flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">→</span>
                            <span>{gap}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Backlink Profile */}
            {reportData.backlinks && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Backlink Profile</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    {reportData.backlinks.total !== undefined && (
                      <div>
                        <span className="text-recon-grey block text-xs mb-1">Total Backlinks</span>
                        <span className="text-white font-bold text-lg">{reportData.backlinks.total?.toLocaleString()}</span>
                      </div>
                    )}
                    {reportData.backlinks.referringDomains !== undefined && (
                      <div>
                        <span className="text-recon-grey block text-xs mb-1">Referring Domains</span>
                        <span className="text-white font-bold text-lg">{reportData.backlinks.referringDomains?.toLocaleString()}</span>
                      </div>
                    )}
                    {reportData.backlinks.linkVelocity && (
                      <div>
                        <span className="text-recon-grey block text-xs mb-1">Link Velocity</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          reportData.backlinks.linkVelocity === 'growing' ? 'bg-green-500/20 text-green-400' :
                          reportData.backlinks.linkVelocity === 'declining' ? 'bg-red-500/20 text-red-400' :
                          reportData.backlinks.linkVelocity === 'stable' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>{
                          reportData.backlinks.linkVelocity === 'growing' ? '↑' :
                          reportData.backlinks.linkVelocity === 'declining' ? '↓' :
                          reportData.backlinks.linkVelocity === 'stable' ? '→' :
                          '→'
                        }</span>
                      </div>
                    )}
                  </div>
                  {reportData.backlinks.topSources && reportData.backlinks.topSources.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Top Sources</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.backlinks.topSources.map((source: string, i: number) => (
                          <span key={i} className="bg-recon-blue/20 border border-recon-blue/30 text-recon-cyan px-2 py-0.5 rounded text-xs font-mono">
                            {source}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Opportunities */}
            {reportData.opportunities && reportData.opportunities.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">SEO Opportunities</h3>
                <div className="grid grid-cols-1 gap-3">
                  {reportData.opportunities.map((opp: any, i: number) => (
                    <div key={i} className="bg-recon-dark border border-green-500/20 rounded p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-white font-medium">{opp.keyword}</div>
                        <div className="text-green-400 text-sm">{opp.volume?.toLocaleString()} vol</div>
                      </div>
                      {opp.difficulty !== undefined && (
                        <div className="mb-2">
                          <div className="text-recon-grey text-xs mb-1">Difficulty</div>
                          <div className="w-full bg-recon-navy rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                opp.difficulty <= 30 ? 'bg-green-500' :
                                opp.difficulty <= 60 ? 'bg-amber-500' :
                                'bg-red-500'
                              }`}
                              style={{ width: `${opp.difficulty}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="text-recon-grey text-sm">{opp.opportunity}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competitors */}
            {reportData.competitive && reportData.competitive.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Competitive Landscape</h3>
                <div className="space-y-2">
                  {reportData.competitive.map((c: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <span
                        className="text-recon-cyan font-medium cursor-pointer hover:underline whitespace-nowrap"
                        onClick={() => {
                          const d = c.competitor.toLowerCase().replace(/\s+/g, '');
                          onDrillDown?.(d.includes('.') ? d : `${d}.com`);
                        }}
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
                      {s.sections && s.sections.length > 0 && (
                        <span className="text-recon-grey">({s.sections.join(', ')})</span>
                      )}
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
