'use client';

import { useState } from 'react';

interface ComparePanelProps {
  report1: any;
  report2: any;
  isLoading1: boolean;
  isLoading2: boolean;
  domain1?: string;
  domain2?: string;
}

async function downloadComparePdf(report1: any, report2: any) {
  const { jsPDF } = await import('jspdf');
  const c1 = report1?.meta?.companyName || report1?.meta?.domain || 'Company A';
  const c2 = report2?.meta?.companyName || report2?.meta?.domain || 'Company B';
  const date = new Date().toISOString().split('T')[0];

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageW = 210;
  const pageH = 297;
  const col1 = margin;
  const col2 = pageW / 2 + 5;
  const colW = pageW / 2 - margin - 5;
  let y = margin;

  const bg = () => { doc.setFillColor(10, 14, 26); doc.rect(0, 0, pageW, pageH, 'F'); };
  bg();

  // Title
  doc.setFontSize(16); doc.setTextColor(255, 255, 255);
  doc.text(`${c1}  vs  ${c2}`, margin, y + 5);
  y += 10;
  doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text(`Competitor Comparison · ${date}`, margin, y);
  y += 10;

  // Divider
  doc.setDrawColor(6, 182, 212); doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Column headers
  doc.setFontSize(11); doc.setTextColor(6, 182, 212);
  doc.text(c1, col1, y);
  doc.text(c2, col2, y);
  y += 8;

  const section = (title: string) => {
    if (y > pageH - 20) { doc.addPage(); bg(); y = margin; }
    doc.setFontSize(8); doc.setTextColor(6, 182, 212);
    doc.text(title.toUpperCase(), margin, y);
    y += 4;
    doc.setDrawColor(37, 99, 235); doc.line(margin, y, pageW - margin, y);
    y += 5;
  };

  const row = (label: string, v1: string, v2: string) => {
    if (y > pageH - 10) { doc.addPage(); bg(); y = margin; }
    doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
    doc.text(label, margin, y);
    doc.setTextColor(248, 250, 252);
    doc.text(doc.splitTextToSize(v1 || '—', colW), col1, y + 4);
    doc.text(doc.splitTextToSize(v2 || '—', colW), col2, y + 4);
    y += 10;
  };

  const bullets = (title: string, items1: string[], items2: string[]) => {
    section(title);
    const max = Math.max(items1.length, items2.length);
    for (let i = 0; i < max; i++) {
      if (y > pageH - 10) { doc.addPage(); bg(); y = margin; }
      doc.setFontSize(7.5); doc.setTextColor(248, 250, 252);
      if (items1[i]) doc.text(doc.splitTextToSize(`• ${items1[i]}`, colW), col1, y);
      if (items2[i]) doc.text(doc.splitTextToSize(`• ${items2[i]}`, colW), col2, y);
      y += 6;
    }
    y += 3;
  };

  // Snapshot
  section('Company Snapshot');
  row('Founded', report1?.snapshot?.founded, report2?.snapshot?.founded);
  row('HQ', report1?.snapshot?.hq, report2?.snapshot?.hq);
  row('Employees', report1?.snapshot?.employees, report2?.snapshot?.employees);
  row('Stage', report1?.snapshot?.stage, report2?.snapshot?.stage);
  y += 3;

  // Financials
  section('Financials');
  row('Total Raised', report1?.financials?.totalRaised, report2?.financials?.totalRaised);
  row('Last Round', report1?.financials?.lastRound, report2?.financials?.lastRound);
  row('Valuation', report1?.financials?.valuation, report2?.financials?.valuation);
  row('Revenue', report1?.financials?.revenue, report2?.financials?.revenue);
  y += 3;

  // Signals
  if (report1?.signals || report2?.signals) {
    bullets('Top Signals',
      (report1?.signals || []).map((s: any) => {
        const badge = s.level === 'high' ? '[HIGH]' : s.level === 'medium' ? '[MED]' : '[LOW]';
        return `${badge}  ${s.text}`;
      }),
      (report2?.signals || []).map((s: any) => {
        const badge = s.level === 'high' ? '[HIGH]' : s.level === 'medium' ? '[MED]' : '[LOW]';
        return `${badge}  ${s.text}`;
      }),
    );
  }

  // Strategic
  if (report1?.strategic || report2?.strategic) {
    bullets('Strategic Direction',
      report1?.strategic || [],
      report2?.strategic || [],
    );
  }

  // Hiring
  if (report1?.hiring || report2?.hiring) {
    bullets('Hiring Focus',
      (report1?.hiring || []).map((h: any) => `${h.role} (${h.count})`),
      (report2?.hiring || []).map((h: any) => `${h.role} (${h.count})`),
    );
  }

  // News / Recent Signals
  if (report1?.news?.length || report2?.news?.length) {
    bullets('Recent Signals',
      (report1?.news || []).map((n: any) => `[${n.signal}] ${n.date} ${n.headline}`),
      (report2?.news || []).map((n: any) => `[${n.signal}] ${n.date} ${n.headline}`),
    );
  }

  // Products
  if (report1?.products?.length || report2?.products?.length) {
    bullets('Products',
      (report1?.products || []).map((p: any) => `${p.name} — ${p.description}`),
      (report2?.products || []).map((p: any) => `${p.name} — ${p.description}`),
    );
  }

  // Competitive Position
  if (report1?.competitive?.length || report2?.competitive?.length) {
    bullets('Competitive Position',
      (report1?.competitive || []).map((c: any) => `${c.competitor}: ${c.weakness}`),
      (report2?.competitive || []).map((c: any) => `${c.competitor}: ${c.weakness}`),
    );
  }

  // Risk Factors
  if (report1?.risks?.length || report2?.risks?.length) {
    bullets('Risk Factors',
      (report1?.risks || []).map((r: any) => `[${r.severity}] ${r.factor}`),
      (report2?.risks || []).map((r: any) => `[${r.severity}] ${r.factor}`),
    );
  }

  // Tech Stack
  if (report1?.techStack?.length || report2?.techStack?.length) {
    bullets('Tech Stack',
      (report1?.techStack || []).map((t: any) => `${t.category}: ${t.items?.join(', ')}`),
      (report2?.techStack || []).map((t: any) => `${t.category}: ${t.items?.join(', ')}`),
    );
  }

  // GitHub
  if (report1?.github || report2?.github) {
    section('GitHub Intelligence');
    row('Repos', String(report1?.github?.repos ?? '—'), String(report2?.github?.repos ?? '—'));
    row('Stars', String(report1?.github?.stars ?? '—'), String(report2?.github?.stars ?? '—'));
    row('Top Language', report1?.github?.topLanguage || '—', report2?.github?.topLanguage || '—');
    y += 3;
  }

  // Reviews
  if (report1?.reviews || report2?.reviews) {
    section('Customer Reviews');
    row('G2 Score', report1?.reviews?.g2Score != null ? `${report1.reviews.g2Score}/5.0` : '—', report2?.reviews?.g2Score != null ? `${report2.reviews.g2Score}/5.0` : '—');
    row('Sentiment', report1?.reviews?.sentiment || '—', report2?.reviews?.sentiment || '—');
    y += 3;
  }

  // Glassdoor
  if (report1?.glassdoor || report2?.glassdoor) {
    section('Glassdoor');
    row('Rating', report1?.glassdoor?.rating != null ? `${report1.glassdoor.rating}/5.0` : '—', report2?.glassdoor?.rating != null ? `${report2.glassdoor.rating}/5.0` : '—');
    row('CEO Approval', report1?.glassdoor?.ceoApproval || '—', report2?.glassdoor?.ceoApproval || '—');
    y += 3;
  }

  // Footer
  const total = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(180, 180, 180);
    doc.text(`RECON COMPARE — ${c1} vs ${c2} — Page ${i} of ${total}`, margin, pageH - 5);
  }

  doc.save(`recon-compare-${report1?.meta?.domain || 'a'}-vs-${report2?.meta?.domain || 'b'}-${date}.pdf`);
}

export default function ComparePanel({ report1, report2, isLoading1, isLoading2, domain1, domain2 }: ComparePanelProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const company1 = report1?.meta?.companyName || report1?.meta?.domain || domain1 || 'Company A';
  const company2 = report2?.meta?.companyName || report2?.meta?.domain || domain2 || 'Company B';

  return (
    <div className="flex flex-col h-full bg-recon-dark" id="compare-panel">
      {/* Header */}
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Competitor Comparison</h2>
          <span className="bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full text-xs font-medium">
            COMPARE MODE
          </span>
        </div>
        {report1 && report2 && (
          <button
            onClick={() => { setIsPrinting(true); downloadComparePdf(report1, report2).finally(() => setIsPrinting(false)); }}
            disabled={isPrinting}
            className="text-recon-grey hover:text-white text-sm flex items-center gap-1.5 px-3 py-1 rounded border border-recon-blue/30 hover:border-recon-cyan/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPrinting ? <><span className="w-3 h-3 border-2 border-recon-grey border-t-white rounded-full animate-spin" /> Generating...</> : '↓ PDF'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {(isLoading1 || isLoading2) && (
          <div className="mb-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <div className="text-indigo-400 font-semibold text-sm">Generating comparative intelligence...</div>
              <div className="text-recon-grey text-xs mt-0.5">
                {isLoading1 && isLoading2 ? `Profiling ${domain1} and ${domain2} in parallel` :
                 isLoading1 ? `Still profiling ${domain1}...` : `Still profiling ${domain2}...`}
              </div>
            </div>
          </div>
        )}
        <div className="space-y-6 pb-6">
          {/* Company Headers */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              {isLoading1 ? (
                <div className="h-8 bg-recon-navy/50 rounded animate-pulse"></div>
              ) : (
                <h3 className="text-white text-2xl font-bold">{company1}</h3>
              )}
            </div>
            <div className="text-center">
              {isLoading2 ? (
                <div className="h-8 bg-recon-navy/50 rounded animate-pulse"></div>
              ) : (
                <h3 className="text-white text-2xl font-bold">{company2}</h3>
              )}
            </div>
          </div>

          {/* Top Signals */}
          {(report1?.signals || isLoading1 || report2?.signals || isLoading2) && (
            <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
              <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Top Signals</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {isLoading1 ? (
                    <div className="space-y-2">
                      <div className="h-8 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-8 bg-recon-navy/50 rounded animate-pulse"></div>
                    </div>
                  ) : report1?.signals ? (
                    <div className="flex flex-wrap gap-2">
                      {report1.signals.map((signal: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
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
                  ) : (
                    <div className="text-recon-grey text-sm">No signals data</div>
                  )}
                </div>
                <div>
                  {isLoading2 ? (
                    <div className="space-y-2">
                      <div className="h-8 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-8 bg-recon-navy/50 rounded animate-pulse"></div>
                    </div>
                  ) : report2?.signals ? (
                    <div className="flex flex-wrap gap-2">
                      {report2.signals.map((signal: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
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
                  ) : (
                    <div className="text-recon-grey text-sm">No signals data</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Company Snapshot */}
          {(report1?.snapshot || isLoading1 || report2?.snapshot || isLoading2) && (
            <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
              <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Company Snapshot</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-recon-blue/20">
                    <td className="py-2 text-recon-grey font-medium">Founded</td>
                    <td className="py-2 text-white">
                      {isLoading1 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-16"></div>
                      ) : (
                        report1?.snapshot?.founded || '-'
                      )}
                    </td>
                    <td className="py-2 text-white">
                      {isLoading2 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-16"></div>
                      ) : (
                        report2?.snapshot?.founded || '-'
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-recon-blue/20">
                    <td className="py-2 text-recon-grey font-medium">Headquarters</td>
                    <td className="py-2 text-white">
                      {isLoading1 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-24"></div>
                      ) : (
                        report1?.snapshot?.hq || '-'
                      )}
                    </td>
                    <td className="py-2 text-white">
                      {isLoading2 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-24"></div>
                      ) : (
                        report2?.snapshot?.hq || '-'
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-recon-blue/20">
                    <td className="py-2 text-recon-grey font-medium">Employees</td>
                    <td className="py-2 text-white">
                      {isLoading1 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-20"></div>
                      ) : (
                        report1?.snapshot?.employees || '-'
                      )}
                    </td>
                    <td className="py-2 text-white">
                      {isLoading2 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-20"></div>
                      ) : (
                        report2?.snapshot?.employees || '-'
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-recon-grey font-medium">Stage</td>
                    <td className="py-2 text-white">
                      {isLoading1 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-20"></div>
                      ) : (
                        report1?.snapshot?.stage || '-'
                      )}
                    </td>
                    <td className="py-2 text-white">
                      {isLoading2 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-20"></div>
                      ) : (
                        report2?.snapshot?.stage || '-'
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Financials */}
          {(report1?.financials || isLoading1 || report2?.financials || isLoading2) && (
            <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
              <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Financials</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-recon-blue/20">
                    <td className="py-2 text-recon-grey font-medium">Total Raised</td>
                    <td className="py-2 text-white font-semibold">
                      {isLoading1 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-24"></div>
                      ) : (
                        report1?.financials?.totalRaised || '-'
                      )}
                    </td>
                    <td className="py-2 text-white font-semibold">
                      {isLoading2 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-24"></div>
                      ) : (
                        report2?.financials?.totalRaised || '-'
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-recon-blue/20">
                    <td className="py-2 text-recon-grey font-medium">Last Round</td>
                    <td className="py-2 text-white">
                      {isLoading1 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-32"></div>
                      ) : (
                        report1?.financials?.lastRound || '-'
                      )}
                    </td>
                    <td className="py-2 text-white">
                      {isLoading2 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-32"></div>
                      ) : (
                        report2?.financials?.lastRound || '-'
                      )}
                    </td>
                  </tr>
                  <tr className="border-b border-recon-blue/20">
                    <td className="py-2 text-recon-grey font-medium">Valuation</td>
                    <td className="py-2 text-white">
                      {isLoading1 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-20"></div>
                      ) : (
                        report1?.financials?.valuation || '-'
                      )}
                    </td>
                    <td className="py-2 text-white">
                      {isLoading2 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-20"></div>
                      ) : (
                        report2?.financials?.valuation || '-'
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 text-recon-grey font-medium">Revenue</td>
                    <td className="py-2 text-white">
                      {isLoading1 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-20"></div>
                      ) : (
                        report1?.financials?.revenue || '-'
                      )}
                    </td>
                    <td className="py-2 text-white">
                      {isLoading2 ? (
                        <div className="h-5 bg-recon-navy/50 rounded animate-pulse w-20"></div>
                      ) : (
                        report2?.financials?.revenue || '-'
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Hiring Focus */}
          {(report1?.hiring || isLoading1 || report2?.hiring || isLoading2) && (
            <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
              <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Hiring Focus</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {isLoading1 ? (
                    <div className="space-y-2">
                      <div className="h-7 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-7 bg-recon-navy/50 rounded animate-pulse"></div>
                    </div>
                  ) : report1?.hiring ? (
                    <div className="flex flex-wrap gap-2">
                      {report1.hiring.map((hire: any, idx: number) => (
                        <span
                          key={idx}
                          className="bg-recon-blue/20 text-recon-cyan px-2 py-1 rounded text-xs font-semibold"
                        >
                          {hire.role} ({hire.count})
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-recon-grey text-sm">No hiring data</div>
                  )}
                </div>
                <div>
                  {isLoading2 ? (
                    <div className="space-y-2">
                      <div className="h-7 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-7 bg-recon-navy/50 rounded animate-pulse"></div>
                    </div>
                  ) : report2?.hiring ? (
                    <div className="flex flex-wrap gap-2">
                      {report2.hiring.map((hire: any, idx: number) => (
                        <span
                          key={idx}
                          className="bg-recon-blue/20 text-recon-cyan px-2 py-1 rounded text-xs font-semibold"
                        >
                          {hire.role} ({hire.count})
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-recon-grey text-sm">No hiring data</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Strategic Direction */}
          {(report1?.strategic || isLoading1 || report2?.strategic || isLoading2) && (
            <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
              <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Strategic Direction</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {isLoading1 ? (
                    <div className="space-y-2">
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                    </div>
                  ) : report1?.strategic ? (
                    <ol className="space-y-2 text-sm text-white list-decimal list-inside">
                      {report1.strategic.map((strategy: string, idx: number) => (
                        <li key={idx}>{strategy}</li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-recon-grey text-sm">No strategic data</div>
                  )}
                </div>
                <div>
                  {isLoading2 ? (
                    <div className="space-y-2">
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                    </div>
                  ) : report2?.strategic ? (
                    <ol className="space-y-2 text-sm text-white list-decimal list-inside">
                      {report2.strategic.map((strategy: string, idx: number) => (
                        <li key={idx}>{strategy}</li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-recon-grey text-sm">No strategic data</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Products */}
          {(report1?.products || isLoading1 || report2?.products || isLoading2) && (
            <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
              <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Products</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {isLoading1 ? (
                    <div className="space-y-2">
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                    </div>
                  ) : report1?.products ? (
                    <ul className="space-y-2 text-sm">
                      {report1.products.map((product: any, idx: number) => (
                        <li key={idx}>
                          <span className="text-white font-semibold">{product.name}</span>
                          {product.description && (
                            <span className="text-recon-grey text-xs block ml-2">
                              {product.description}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-recon-grey text-sm">No product data</div>
                  )}
                </div>
                <div>
                  {isLoading2 ? (
                    <div className="space-y-2">
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                      <div className="h-6 bg-recon-navy/50 rounded animate-pulse"></div>
                    </div>
                  ) : report2?.products ? (
                    <ul className="space-y-2 text-sm">
                      {report2.products.map((product: any, idx: number) => (
                        <li key={idx}>
                          <span className="text-white font-semibold">{product.name}</span>
                          {product.description && (
                            <span className="text-recon-grey text-xs block ml-2">
                              {product.description}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-recon-grey text-sm">No product data</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Competitive Overlap */}
          {!isLoading1 && !isLoading2 && report1?.competitive && report2?.competitive && (
            <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
              <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Competitive Overlap</h3>
              <div className="text-sm">
                {(() => {
                  const competitors1 = report1.competitive.map((c: any) => c.competitor);
                  const competitors2 = report2.competitive.map((c: any) => c.competitor);
                  const overlap = competitors1.filter((c: string) => competitors2.includes(c));

                  if (overlap.length === 0) {
                    return <div className="text-recon-grey">No shared competitors found</div>;
                  }

                  return (
                    <div className="flex flex-wrap gap-2">
                      {overlap.map((comp: string, idx: number) => (
                        <span
                          key={idx}
                          className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-medium"
                        >
                          {comp}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
