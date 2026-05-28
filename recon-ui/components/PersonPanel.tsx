'use client';

import { useState } from 'react';
import { downloadPdf } from '@/lib/downloadPdf';
import { S } from '@/lib/safe-render';

interface PersonPanelProps {
  reportData: any;
  isRunning: boolean;
  onDrillDown: (q: string) => void;
}

const confidenceColors: Record<string, string> = {
  high: 'bg-green-500',
  medium: 'bg-amber-500',
  low: 'bg-gray-500',
};

function EvidencePill({ url, confidence }: { url?: string; confidence?: string }) {
  if (!url && !confidence) return null;
  return (
    <span className="inline-flex items-center gap-1.5 ml-2">
      {confidence && (
        <span className={`w-2 h-2 rounded-full ${confidenceColors[confidence] || confidenceColors.low}`} title={`Confidence: ${confidence}`} />
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-recon-cyan hover:text-recon-blue text-xs font-mono px-1.5 py-0.5 bg-recon-navy/60 rounded border border-recon-cyan/20 hover:border-recon-cyan/50 transition-colors"
          title={`Evidence: ${url}`}
        >
          🔗 source
        </a>
      )}
    </span>
  );
}

export default function PersonPanel({ reportData, isRunning, onDrillDown }: PersonPanelProps) {
  const showPlaceholder = !isRunning && !reportData;
  const showLoading = isRunning && !reportData;
  const [isPrinting, setIsPrinting] = useState(false);

  const onPrint = () => {
    if (isPrinting || !reportData) return;
    setIsPrinting(true);
    const name = (reportData?.meta?.name || reportData?.profile?.name || 'person').replace(/\s+/g, '-').toLowerCase();
    const date = reportData?.meta?.analysisDate || new Date().toISOString().split('T')[0];
    downloadPdf(`recon-person-${name}-${date}.pdf`, reportData).finally(() => setIsPrinting(false));
  };

  return (
    <div className="flex flex-col h-full bg-recon-dark">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">
            👤 Executive Profile
          </h2>
          {reportData?.meta?.name && (
            <span className="text-white text-sm font-semibold">{reportData.meta.name}</span>
          )}
          {reportData?.meta?.sources_count > 0 && (
            <span className="text-recon-grey text-xs px-2 py-0.5 bg-recon-navy/60 border border-recon-blue/20 rounded">
              Sources: {reportData.meta.sources_count} URLs · {reportData.meta.evidence_coverage || 'N/A'}
            </span>
          )}
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
        {showPlaceholder && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-6xl mb-4">👤</div>
            <h3 className="text-2xl font-bold text-white mb-2">Executive Profile</h3>
            <p className="text-recon-grey text-sm mt-2 max-w-md">
              Enter a person's full name and click <strong className="text-purple-400">Executive Profile</strong> to generate an executive profile.
            </p>
          </div>
        )}

        {showLoading && (
          <div className="flex flex-col items-center justify-center gap-6 pt-16">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-purple-500/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-2xl">👤</div>
            </div>
            <div className="text-center">
              <div className="text-purple-400 font-semibold text-lg mb-3">Profiling Executive</div>
              <div className="flex justify-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
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
            {/* Signals */}
            {reportData.signals && (
              <div className="flex flex-wrap gap-2">
                {reportData.signals.map((signal: any, idx: number) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                      signal.level === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      signal.level === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      'bg-green-500/20 text-green-400 border border-green-500/30'
                    }`}
                  >
                    <span>{signal.icon}</span>
                    <span>{signal.text}</span>
                    {signal.confidence && (
                      <span className={`w-2 h-2 rounded-full ${confidenceColors[signal.confidence] || confidenceColors.low}`} title={`Confidence: ${signal.confidence}`} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Profile + Current Role */}
            {reportData.profile && (
              <div className="bg-recon-navy/40 border border-purple-500/30 rounded-lg p-4">
                <h3 className="text-purple-400 font-bold text-sm uppercase mb-3">Profile</h3>
                <div className="space-y-2 text-sm">
                  {reportData.profile.currentRole && (
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Current Role</span>
                      <span className="text-white font-semibold">{reportData.profile.currentRole}</span>
                    </div>
                  )}
                  {reportData.profile.location && (
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Location</span>
                      <span className="text-white">{reportData.profile.location}</span>
                    </div>
                  )}
                  {reportData.profile.education && (
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Education</span>
                      <span className="text-white">{reportData.profile.education}</span>
                    </div>
                  )}
                  {reportData.profile.yearsExperience !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Experience</span>
                      <span className="text-white">{reportData.profile.yearsExperience} years</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Career History */}
            {reportData.career && reportData.career.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Career History</h3>
                <div className="space-y-3">
                  {reportData.career.map((job: any, idx: number) => (
                    <div key={idx} className="border-l-2 border-recon-blue/40 pl-3">
                      <div className="text-white font-semibold text-sm"><S v={job.role} /> — <S v={job.company} /></div>
                      <div className="text-recon-grey text-xs mb-1"><S v={job.period} /></div>
                      {job.achievement && (
                        <div className="text-recon-light text-sm"><S v={job.achievement} /></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Companies */}
            {reportData.companies && reportData.companies.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Companies</h3>
                <div className="space-y-2">
                  {reportData.companies.map((co: any, idx: number) => {
                    const target = co.domain || `${co.name.toLowerCase().replace(/\s+/g, '')}.com`;
                    return (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <div className="flex-1">
                          <button
                            onClick={() => onDrillDown(target)}
                            className="text-recon-cyan font-semibold hover:text-white hover:underline underline-offset-2 transition-colors cursor-pointer"
                          >
                            {co.name}
                          </button>
                          <span className="text-recon-grey ml-2">— <S v={co.role} /></span>
                          <EvidencePill url={co.evidence_url} confidence={co.confidence} />
                        </div>
                        {co.domain && (
                          <span className="text-recon-grey/60 text-xs">{co.domain}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Public Activity */}
            {reportData.publicActivity && reportData.publicActivity.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Public Activity</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-recon-blue/20">
                      <th className="text-left text-recon-cyan font-semibold pb-2">Date</th>
                      <th className="text-left text-recon-cyan font-semibold pb-2">Event</th>
                      <th className="text-left text-recon-cyan font-semibold pb-2">Signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.publicActivity.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b border-recon-blue/10">
                        <td className="py-2 text-recon-grey whitespace-nowrap"><S v={item.date} /></td>
                        <td className="py-2 text-white">
                          <S v={item.event} />
                          <EvidencePill url={item.evidence_url} confidence={item.confidence} />
                        </td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            item.signal === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                            item.signal === 'MED' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            <S v={item.signal} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Quotes */}
            {reportData.quotes && reportData.quotes.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Notable Quotes</h3>
                <div className="space-y-3">
                  {reportData.quotes.map((q: any, idx: number) => (
                    <div key={idx} className="border-l-2 border-purple-500/50 pl-3">
                      <p className="text-white text-sm italic">"<S v={q.text} />"</p>
                      <p className="text-recon-grey text-xs mt-1">
                        <S v={q.source} /> · <S v={q.date} />
                        <EvidencePill url={q.evidence_url} confidence={q.confidence} />
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Network */}
            {reportData.network && reportData.network.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Network</h3>
                <div className="space-y-3">
                  {reportData.network.map((n: any, idx: number) => (
                    <div key={idx} className="text-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <button
                            onClick={() => onDrillDown(n.name)}
                            className="text-purple-400 font-semibold hover:text-white hover:underline underline-offset-2 transition-colors cursor-pointer text-left"
                          >
                            👤 {n.name}
                          </button>
                          <EvidencePill url={n.evidence_url} confidence={n.confidence} />
                        </div>
                      </div>
                      {n.relationship && (
                        <div className="text-recon-grey text-xs mt-0.5 pl-5"><S v={n.relationship} /></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Methodology Footer */}
            {reportData.meta?.sources_count > 0 && (
              <details className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <summary className="text-recon-cyan font-bold text-sm uppercase cursor-pointer hover:text-recon-blue transition-colors">
                  Methodology · {reportData.meta.sources_count} URLs fetched
                </summary>
                <div className="mt-3 text-xs text-recon-grey">
                  Evidence sources collected from public records and web searches.
                </div>
              </details>
            )}

            {/* Cost */}
            {reportData.cost?.total && (
              <div className="text-right text-xs text-recon-grey">
                {reportData.cost.customerPrice !== undefined ? (
                  <>
                    <div>Customer Price: <span className="text-recon-green font-semibold">${reportData.cost.customerPrice.toFixed(2)}</span></div>
                    <div className="text-recon-grey/70 mt-0.5">
                      Our cost: ${reportData.cost.rawCost?.toFixed(2) ?? reportData.cost.total?.toFixed(2)} · Service fee: ${reportData.cost.serviceFee?.toFixed(2) ?? '0.00'}
                    </div>
                  </>
                ) : (
                  <>Cost: <span className="text-recon-green font-semibold">${reportData.cost.total.toFixed(2)}</span></>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
