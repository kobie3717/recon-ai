'use client';

interface ComparePanelProps {
  report1: any;
  report2: any;
  isLoading1: boolean;
  isLoading2: boolean;
}

function handlePrint(report1: any, report2: any) {
  const company1 = report1?.meta?.companyName || report1?.meta?.domain || 'Company A';
  const company2 = report2?.meta?.companyName || report2?.meta?.domain || 'Company B';
  const date = new Date().toISOString().split('T')[0];
  const prev = document.title;
  document.title = `Recon Compare - ${company1} vs ${company2} - ${date}`;
  window.print();
  setTimeout(() => { document.title = prev; }, 1000);
}

export default function ComparePanel({ report1, report2, isLoading1, isLoading2 }: ComparePanelProps) {
  const company1 = report1?.meta?.companyName || report1?.meta?.domain || 'Company A';
  const company2 = report2?.meta?.companyName || report2?.meta?.domain || 'Company B';

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
            onClick={() => handlePrint(report1, report2)}
            className="text-recon-grey hover:text-white text-sm flex items-center gap-1.5 px-3 py-1 rounded border border-recon-blue/30 hover:border-recon-cyan/50 transition-colors"
          >
            ↓ PDF
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
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
