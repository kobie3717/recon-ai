'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface ReportPanelProps {
  content?: string;
  reportData?: any;
  costBreakdown?: {
    webUnlocker?: number;
    serp?: number;
    scrapingBrowser?: number;
    webScraper?: number;
    total?: number;
  };
  isRunning: boolean;
  onDrillDown?: (domain: string) => void;
}

export default function ReportPanel({ content, reportData, costBreakdown, isRunning, onDrillDown }: ReportPanelProps) {
  const showPlaceholder = !isRunning && !content && !reportData;
  const showLoading = isRunning && !content && !reportData;
  const [isPrinting, setIsPrinting] = useState(false);

  const onPrint = () => {
    if (isPrinting || !reportData) return;
    setIsPrinting(true);
    const domain = reportData?.meta?.domain || 'report';
    const mode = reportData?.meta?.mode || 'standard';
    const date = reportData?.meta?.analysisDate || new Date().toISOString().split('T')[0];
    fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, report: reportData, mode }),
    }).catch(() => {});
    const prevTitle = document.title;
    document.title = `Recon - ${domain} - ${date}`;
    setTimeout(() => {
      window.print();
      document.title = prevTitle;
      setTimeout(() => setIsPrinting(false), 500);
    }, 80);
  };

  // Old-style markdown content fallback
  if (content && !reportData) {
    return (
      <div className="flex flex-col h-full bg-recon-dark" id="report-panel">
        <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Report</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="prose prose-invert prose-headings:text-white prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-4 prose-h2:text-recon-blue prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-6 prose-h2:mb-3 prose-p:text-recon-light prose-p:leading-relaxed prose-ul:text-recon-light prose-li:text-recon-light prose-strong:text-white prose-code:bg-recon-navy prose-code:text-recon-green prose-code:px-2 prose-code:py-1 prose-code:rounded prose-pre:bg-recon-navy prose-pre:border prose-pre:border-recon-blue/30 prose-table:border prose-table:border-recon-blue/30 prose-th:bg-recon-navy prose-th:text-recon-cyan prose-th:font-semibold prose-th:px-4 prose-th:py-2 prose-td:text-recon-light prose-td:px-4 prose-td:py-2 prose-td:border-t prose-td:border-recon-blue/20 max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>


        {costBreakdown?.total !== undefined && (
          <div className="bg-recon-navy/50 px-6 py-3 border-t border-recon-blue/30">
            <div className="flex items-center justify-between text-sm">
              <div className="text-recon-grey">Report generated successfully</div>
              <div className="flex items-center gap-4">
                <span className="text-recon-grey">Cost: <span className="text-recon-green font-semibold">${costBreakdown.total.toFixed(2)}</span></span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-recon-dark" id="report-panel">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Report</h2>
        {reportData && (
          <button
            onClick={onPrint}
            disabled={isPrinting}
            className="text-recon-grey hover:text-white text-sm flex items-center gap-1.5 px-3 py-1 rounded border border-recon-blue/30 hover:border-recon-cyan/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download as PDF"
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
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold text-white mb-2">RECON</h3>
            <p className="text-recon-cyan">Competitive Intelligence Platform</p>
            <p className="text-recon-grey text-sm mt-4 max-w-md">
              AI-powered competitive analysis that bypasses bot detection and delivers actionable insights in seconds.
            </p>
          </div>
        )}

        {showLoading && (
          <div className="flex flex-col items-center justify-center gap-6 pt-16">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-recon-cyan/20" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-recon-cyan animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-2xl">🔍</div>
            </div>
            <div className="text-center">
              <div className="text-recon-cyan font-semibold text-lg mb-3">Generating Report</div>
              <div className="flex justify-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-recon-cyan animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-recon-cyan animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-recon-cyan animate-bounce" style={{ animationDelay: '300ms' }} />
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
            {/* Signal Banner */}
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
                  </div>
                ))}
              </div>
            )}

            {/* Snapshot + Financials Grid */}
            <div className="grid grid-cols-2 gap-4">
              {reportData.snapshot && (
                <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                  <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Company Snapshot</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Founded</span>
                      <span className="text-white">{reportData.snapshot.founded}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Headquarters</span>
                      <span className="text-white">{reportData.snapshot.hq}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Employees</span>
                      <span className="text-white">{reportData.snapshot.employees}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Stage</span>
                      <span className="text-white">{reportData.snapshot.stage}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Website</span>
                      <span className="text-recon-cyan">{reportData.snapshot.website}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-recon-grey">LinkedIn</span>
                      <span className="text-recon-cyan text-xs">{reportData.snapshot.linkedin}</span>
                    </div>
                  </div>
                </div>
              )}

              {reportData.financials && (
                <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                  <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Financials</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Total Raised</span>
                      <span className="text-white font-semibold">{reportData.financials.totalRaised}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Last Round</span>
                      <span className="text-white">{reportData.financials.lastRound}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Valuation</span>
                      <span className="text-white">{reportData.financials.valuation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-recon-grey">Revenue</span>
                      <span className="text-white">{reportData.financials.revenue}</span>
                    </div>
                    {reportData.financials.investors?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-recon-blue/20">
                        <div className="text-recon-grey text-xs mb-1">Key Investors</div>
                        <div className="text-white text-xs space-y-1">
                          {reportData.financials.investors.map((inv: string, idx: number) => (
                            <div key={idx}>• {inv}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Recent Signals */}
            {reportData.news && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Recent Signals</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-recon-blue/20">
                        <th className="text-left text-recon-cyan font-semibold pb-2">Date</th>
                        <th className="text-left text-recon-cyan font-semibold pb-2">Headline</th>
                        <th className="text-left text-recon-cyan font-semibold pb-2">Signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.news.map((item: any, idx: number) => (
                        <tr key={idx} className="border-b border-recon-blue/10">
                          <td className="py-2 text-recon-grey whitespace-nowrap">{item.date}</td>
                          <td className="py-2 text-white">{item.headline}</td>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              item.signal === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                              item.signal === 'MED' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {item.signal}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Products */}
            {reportData.products && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Products</h3>
                <div className="space-y-2">
                  {reportData.products.map((product: any, idx: number) => (
                    <div key={idx} className="text-sm">
                      <span className="text-white font-semibold">{product.name}</span>
                      <span className="text-recon-grey"> — {product.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competitive Position */}
            {reportData.competitive && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Competitive Position</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-recon-blue/20">
                        <th className="text-left text-recon-cyan font-semibold pb-2">Competitor</th>
                        <th className="text-left text-recon-cyan font-semibold pb-2">Weakness</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.competitive.map((comp: any, idx: number) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-recon-navy/20' : ''}>
                          <td className="py-2">
                            {onDrillDown ? (
                              <button
                                onClick={() => {
                                  const d = comp.competitor.toLowerCase().replace(/\s+/g, '');
                                  onDrillDown(d.includes('.') ? d : `${d}.com`);
                                }}
                                className="text-recon-cyan hover:text-white font-medium underline-offset-2 hover:underline transition-colors cursor-pointer"
                              >
                                {comp.competitor}
                              </button>
                            ) : (
                              <span className="text-white font-medium">{comp.competitor}</span>
                            )}
                          </td>
                          <td className="py-2 text-recon-grey">{comp.weakness}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Hiring Signals */}
            {reportData.hiring && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Hiring Signals</h3>
                <div className="space-y-3">
                  {reportData.hiring.map((hire: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-3">
                      <span className="bg-recon-blue/20 text-recon-cyan px-2 py-1 rounded text-xs font-semibold whitespace-nowrap">
                        {hire.role} ({hire.count})
                      </span>
                      <span className="text-recon-grey text-sm">→ {hire.signal}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Strategic Direction */}
            {reportData.strategic && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Strategic Direction</h3>
                <div className="space-y-3">
                  {reportData.strategic.map((strategy: string, idx: number) => (
                    <div key={idx} className="flex gap-3 text-sm">
                      <span className="text-recon-cyan font-bold text-lg leading-none">{idx + 1}</span>
                      <span className="text-white">{strategy}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deep Search Extras */}
            {reportData.techStack && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Tech Stack</h3>
                <div className="space-y-3">
                  {reportData.techStack.map((stack: any, idx: number) => (
                    <div key={idx}>
                      <div className="text-recon-grey text-xs mb-1">{stack.category}</div>
                      <div className="flex flex-wrap gap-2">
                        {stack.items.map((item: string, itemIdx: number) => (
                          <span key={itemIdx} className="bg-recon-blue/20 text-recon-cyan px-2 py-1 rounded text-xs">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reportData.github && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">GitHub Intelligence</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-recon-grey">Repos:</span>
                    <span className="text-white ml-2">{reportData.github.repos}</span>
                  </div>
                  <div>
                    <span className="text-recon-grey">Stars:</span>
                    <span className="text-white ml-2">{reportData.github.stars.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-recon-grey">Contributors:</span>
                    <span className="text-white ml-2">{reportData.github.contributors}</span>
                  </div>
                  <div>
                    <span className="text-recon-grey">Top Language:</span>
                    <span className="text-white ml-2">{reportData.github.topLanguage}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-recon-grey">Recent Activity:</span>
                    <span className="text-recon-green ml-2">{reportData.github.recentActivity}</span>
                  </div>
                </div>
              </div>
            )}

            {reportData.reviews && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Customer Reviews</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-recon-grey">G2 Score</span>
                    <span className="text-white font-semibold">{reportData.reviews.g2Score} / 5.0 ({reportData.reviews.g2Reviews} reviews)</span>
                  </div>
                  <div className="text-recon-grey mt-2">{reportData.reviews.sentiment}</div>
                </div>
              </div>
            )}

            {reportData.glassdoor && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Glassdoor</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-recon-grey">Rating</span>
                    <span className="text-white font-semibold">{reportData.glassdoor.rating} / 5.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-recon-grey">Reviews</span>
                    <span className="text-white">{reportData.glassdoor.reviews}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-recon-grey">CEO Approval</span>
                    <span className="text-white">{reportData.glassdoor.ceoApproval}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-recon-grey">Recommend</span>
                    <span className="text-white">{reportData.glassdoor.recommend}</span>
                  </div>
                  <div className="col-span-2 text-recon-grey mt-2">{reportData.glassdoor.sentiment}</div>
                </div>
              </div>
            )}

            {reportData.risks && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Risk Factors</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-recon-blue/20">
                        <th className="text-left text-recon-cyan font-semibold pb-2">Risk</th>
                        <th className="text-left text-recon-cyan font-semibold pb-2">Severity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.risks.map((risk: any, idx: number) => (
                        <tr key={idx} className="border-b border-recon-blue/10">
                          <td className="py-2 text-white">{risk.factor}</td>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              risk.severity === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                              risk.severity === 'MED' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-gray-500/20 text-gray-400'
                            }`}>
                              {risk.severity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Intelligence Sources — shows judges exactly which BD product found each section */}
            {reportData.sources && Array.isArray(reportData.sources) && (
              <div className="bg-recon-navy/60 border border-recon-blue/40 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Intelligence Sources</h3>
                <div className="space-y-3">
                  {reportData.sources.map((src: any, idx: number) => (
                    <div key={idx} className="text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{src.icon}</span>
                        <span className="text-white font-semibold">{src.tool}</span>
                      </div>
                      <div className="pl-6 text-xs text-recon-grey mb-1 font-mono">
                        → {src.target}
                      </div>
                      <div className="pl-6 flex flex-wrap gap-1">
                        {src.sections.map((section: string, sIdx: number) => (
                          <span key={sIdx} className="bg-recon-blue/15 text-recon-cyan/80 px-2 py-0.5 rounded text-xs border border-recon-blue/20">
                            {section}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost Breakdown */}
            {reportData.cost && (
              <div className="bg-recon-navy/80 border border-recon-blue/30 rounded-lg p-4 font-mono text-sm">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3 font-sans">Cost Breakdown</h3>
                <div className="space-y-1 text-recon-grey">
                  {reportData.cost.webUnlocker != null && typeof reportData.cost.webUnlocker === 'number' && Number(reportData.cost.webUnlocker) > 0 && (
                    <div className="flex justify-between">
                      <span>Web Unlocker</span>
                      <span>${reportData.cost.webUnlocker.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.serpApi != null && typeof reportData.cost.serpApi === 'number' && Number(reportData.cost.serpApi) > 0 && (
                    <div className="flex justify-between">
                      <span>SERP API</span>
                      <span>${reportData.cost.serpApi.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.scrapingBrowser != null && typeof reportData.cost.scrapingBrowser === 'number' && Number(reportData.cost.scrapingBrowser) > 0 && (
                    <div className="flex justify-between">
                      <span>Scraping Browser</span>
                      <span>${reportData.cost.scrapingBrowser.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.webScraperApi != null && typeof reportData.cost.webScraperApi === 'number' && Number(reportData.cost.webScraperApi) > 0 && (
                    <div className="flex justify-between">
                      <span>Web Scraper API</span>
                      <span>${reportData.cost.webScraperApi.toFixed(2)}</span>
                    </div>
                  )}
                  {reportData.cost.claude != null && typeof reportData.cost.claude === 'number' && Number(reportData.cost.claude) > 0 && (
                    <div className="flex justify-between">
                      <span>Claude Synthesis</span>
                      <span>${reportData.cost.claude.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-recon-blue/30 my-2"></div>
                  <div className="flex justify-between text-white font-semibold">
                    <span>Total</span>
                    <span>${typeof reportData.cost.total === 'number' ? reportData.cost.total.toFixed(2) : (reportData.cost.total ?? 0)}</span>
                  </div>
                  <div className="text-recon-cyan text-xs mt-3">
                    Intelligence stored in AI-IQ memory. Next query instant. ⚡
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
