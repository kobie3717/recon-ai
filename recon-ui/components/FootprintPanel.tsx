'use client';

import { useState } from 'react';
import { downloadPdf } from '@/lib/downloadPdf';
import { S } from '@/lib/safe-render';

interface FootprintPanelProps {
  reportData: any;
  isRunning: boolean;
  onDrillDown?: (query: string) => void;
}

function ConfidencePill({ confidence }: { confidence?: string | number }) {
  if (!confidence) return null;
  const val = typeof confidence === 'string' ? confidence.toLowerCase() : confidence;
  const isHigh = val === 'high' || (typeof val === 'number' && val >= 80);
  const isLow = val === 'low' || (typeof val === 'number' && val < 50);
  const color = isHigh ? 'green' : isLow ? 'red' : 'yellow';
  const label = typeof confidence === 'number' ? `${confidence}%` : String(confidence).toUpperCase();
  const classes = {
    green: 'bg-green-500/10 text-green-400 border-green-500/30',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    red: 'bg-red-500/10 text-red-400 border-red-500/30',
  }[color];
  return <span className={`inline-block ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono border ${classes}`}>{label}</span>;
}

export default function FootprintPanel({ reportData, isRunning, onDrillDown }: FootprintPanelProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const showLoading = isRunning && !reportData;

  return (
    <div className="flex flex-col h-full bg-recon-dark" id="report-panel">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Brand Footprint</h2>
          <span className="bg-teal-600/20 text-teal-300 border border-teal-600/30 px-2 py-0.5 rounded text-xs">🔭 OSINT</span>
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
            className="text-recon-grey hover:text-white text-sm flex items-center gap-1.5 px-3 py-1 rounded border border-recon-blue/30 hover:border-recon-cyan/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="text-center text-teal-400 text-lg font-medium mt-8">
              Mapping digital footprint<span className="animate-pulse">...</span>
            </div>
          </div>
        )}

        {reportData && (
          <div className="space-y-6 pb-6">
            {/* Domain header */}
            <div className="border-b border-recon-blue/20 pb-4">
              <h1 className="text-3xl font-bold text-white">{reportData.meta?.domain}</h1>
              <p className="text-teal-400 mt-1 text-sm">Digital footprint analysis · {reportData.meta?.analysisDate}</p>
            </div>

            {/* Signals */}
            {reportData.signals && (
              <div className="flex flex-wrap gap-2">
                {reportData.signals.map((s: any, i: number) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                    s.level === 'high' ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' :
                    s.level === 'medium' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                    'bg-green-500/20 text-green-400 border border-green-500/30'
                  }`}>
                    <span>{s.icon}</span>
                    <span>{s.text}</span>
                    <ConfidencePill confidence={s.confidence} />
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

            {/* Digital Footprint section */}
            {reportData.digitalFootprint && (
              <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide mb-3">Digital Footprint</h3>
                <div className="space-y-3">
                  {reportData.digitalFootprint.totalSubdomains > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Subdomains ({reportData.digitalFootprint.totalSubdomains})</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.digitalFootprint.subdomains?.map((s: string, i: number) => (
                          <span key={i} className="bg-recon-dark border border-recon-grey/30 text-recon-grey px-2 py-0.5 rounded text-xs font-mono">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {reportData.digitalFootprint.relatedDomains?.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Related Domains</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.digitalFootprint.relatedDomains.map((d: string, i: number) => (
                          <span key={i} className="bg-recon-dark border border-teal-500/30 text-teal-300 px-2 py-0.5 rounded text-xs font-mono">{d}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {reportData.digitalFootprint.webProperties?.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Web Properties</span>
                      <div className="grid grid-cols-2 gap-2">
                        {reportData.digitalFootprint.webProperties.map((p: any, i: number) => (
                          <div key={i} className="bg-recon-dark border border-recon-blue/20 rounded px-3 py-2 flex items-center gap-2 text-xs">
                            <span className="text-recon-cyan"><S v={p.type} /></span>
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-white hover:text-teal-400 transition-colors truncate flex-1">{p.url}</a>
                            {p.followers && <span className="text-recon-grey">{p.followers}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Crawl Insights section */}
            {reportData.crawlInsights && (
              <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide">Crawl Intel</h3>
                  <span className="bg-recon-blue/20 text-recon-cyan border border-recon-blue/30 px-2 py-0.5 rounded text-xs">(BD Crawl API)</span>
                </div>
                <div className="space-y-3">
                  {reportData.crawlInsights.pagesFound > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-4xl font-bold text-teal-400">{reportData.crawlInsights.pagesFound}</span>
                      <span className="text-recon-grey text-sm">pages indexed</span>
                    </div>
                  )}
                  {reportData.crawlInsights.keyPages?.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Key Pages</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.crawlInsights.keyPages.map((p: string, i: number) => (
                          <span key={i} className="bg-recon-blue/20 border border-recon-blue/30 text-recon-cyan px-2 py-0.5 rounded text-xs">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {reportData.crawlInsights.pricingTiers?.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Pricing Tiers</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.crawlInsights.pricingTiers.map((t: string, i: number) => (
                          <span key={i} className="bg-green-500/20 border border-green-500/30 text-green-400 px-2 py-0.5 rounded text-xs">💲 {t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {reportData.crawlInsights.techMentions?.length > 0 && (
                    <div>
                      <span className="text-recon-grey block text-xs mb-2">Tech Mentions</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.crawlInsights.techMentions.map((t: string, i: number) => (
                          <span key={i} className="bg-recon-dark border border-recon-grey/30 text-white px-2 py-0.5 rounded text-xs font-mono">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {reportData.crawlInsights.openRoles > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-recon-grey text-xs">Open Roles:</span>
                      <span className="bg-amber-500/20 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded text-xs font-bold">{reportData.crawlInsights.openRoles}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LinkedIn Intel section */}
            {reportData.linkedinIntel && (
              <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide mb-3">LinkedIn Intel</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {reportData.linkedinIntel.employees && (
                      <div>
                        <span className="text-recon-grey text-xs block mb-1">Employees</span>
                        <span className="text-white text-lg font-bold">{reportData.linkedinIntel.employees}</span>
                      </div>
                    )}
                    {reportData.linkedinIntel.followers && (
                      <div>
                        <span className="text-recon-grey text-xs block mb-1">Followers</span>
                        <span className="text-white text-lg font-bold">{reportData.linkedinIntel.followers}</span>
                      </div>
                    )}
                  </div>
                  {reportData.linkedinIntel.recentActivity && (
                    <div>
                      <span className="text-recon-grey text-xs block mb-1">Recent Activity</span>
                      <p className="text-white text-sm">{reportData.linkedinIntel.recentActivity}</p>
                    </div>
                  )}
                  {reportData.linkedinIntel.topRoles?.length > 0 && (
                    <div>
                      <span className="text-recon-grey text-xs block mb-2">Top Roles</span>
                      <div className="flex flex-wrap gap-1.5">
                        {reportData.linkedinIntel.topRoles.map((r: string, i: number) => (
                          <span key={i} className="bg-blue-500/20 border border-blue-500/30 text-blue-400 px-2 py-0.5 rounded text-xs">{r}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Social Presence section */}
            {reportData.socialPresence && (
              <div className="bg-recon-navy/50 border border-recon-blue/20 rounded-lg p-4">
                <h3 className="text-recon-cyan text-sm font-semibold uppercase tracking-wide mb-3">Social Presence</h3>
                <div className="space-y-3">
                  {reportData.socialPresence.twitterHandle && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-white font-medium">@{reportData.socialPresence.twitterHandle}</span>
                      {reportData.socialPresence.twitterFollowers && (
                        <span className="text-recon-grey text-sm">{reportData.socialPresence.twitterFollowers} followers</span>
                      )}
                      {reportData.socialPresence.sentimentScore && (
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          reportData.socialPresence.sentimentScore === 'positive' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                          reportData.socialPresence.sentimentScore === 'negative' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          reportData.socialPresence.sentimentScore === 'mixed' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {reportData.socialPresence.sentimentScore}
                        </span>
                      )}
                    </div>
                  )}
                  {reportData.socialPresence.recentSentiment && (
                    <div>
                      <span className="text-recon-grey text-xs block mb-1">Recent Sentiment</span>
                      <p className="text-white text-sm">{reportData.socialPresence.recentSentiment}</p>
                    </div>
                  )}
                  {reportData.socialPresence.redditPresence && (
                    <div>
                      <span className="text-recon-grey text-xs block mb-1">Reddit Presence</span>
                      <p className="text-white text-sm">{reportData.socialPresence.redditPresence}</p>
                    </div>
                  )}
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
                        className="text-teal-400 font-medium cursor-pointer hover:underline whitespace-nowrap"
                        onClick={() => onDrillDown?.(c.competitor.toLowerCase().replace(/\s+/g, '') + '.com')}
                      >{c.competitor}</span>
                      <span className="text-recon-grey">
                        <S v={c.weakness} />
                        <ConfidencePill confidence={c.confidence} />
                      </span>
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
                  {reportData.strategic.map((s: any, i: number) => (
                    <li key={i} className="text-white text-sm">
                      {typeof s === 'string' ? s : s.text || s}
                      <ConfidencePill confidence={typeof s === 'object' ? s.confidence : undefined} />
                    </li>
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
                        <span className="text-recon-grey">({s.sections})</span>
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
                  {reportData.cost.discoverApi > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>Discover API</span>
                      <span>${reportData.cost.discoverApi.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.crawlApi > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>Crawl API</span>
                      <span>${reportData.cost.crawlApi.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.linkedinScraper > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>LinkedIn Scraper</span>
                      <span>${reportData.cost.linkedinScraper.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.socialScraper > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>Social Scraper</span>
                      <span>${reportData.cost.socialScraper.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.serpApi > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>SERP API</span>
                      <span>${reportData.cost.serpApi.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.claude > 0 && (
                    <div className="flex justify-between text-recon-grey">
                      <span>Claude Analysis</span>
                      <span>${reportData.cost.claude.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-recon-blue/30 mt-2">
                    {reportData.cost.customerPrice !== undefined ? (
                      <>
                        <div className="flex justify-between text-white font-semibold">
                          <span>Customer Price</span>
                          <span className="text-recon-green">${reportData.cost.customerPrice.toFixed(2)}</span>
                        </div>
                        <div className="text-xs text-recon-grey/70 mt-1">
                          Our cost: ${reportData.cost.rawCost?.toFixed(2) ?? reportData.cost.total?.toFixed(2)} · Service fee: ${reportData.cost.serviceFee?.toFixed(2) ?? '0.00'}
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-white font-semibold">
                        <span>Total</span>
                        <span>${reportData.cost.total?.toFixed(2)}</span>
                      </div>
                    )}
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
