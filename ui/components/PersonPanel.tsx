'use client';

interface PersonPanelProps {
  reportData: any;
  isRunning: boolean;
  onDrillDown: (q: string) => void;
}

export default function PersonPanel({ reportData, isRunning }: PersonPanelProps) {
  const showPlaceholder = !isRunning && !reportData;
  const showLoading = isRunning && !reportData;

  return (
    <div className="flex flex-col h-full bg-recon-dark">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30 flex items-center justify-between">
        <h2 className="text-recon-cyan uppercase font-bold tracking-wide">
          👤 Person Intel
        </h2>
        {reportData?.meta?.name && (
          <span className="text-white text-sm font-semibold">{reportData.meta.name}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {showPlaceholder && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-6xl mb-4">👤</div>
            <h3 className="text-2xl font-bold text-white mb-2">Person Intel</h3>
            <p className="text-recon-grey text-sm mt-2 max-w-md">
              Enter a person's full name and click <strong className="text-purple-400">Person Intel</strong> to generate an executive profile.
            </p>
          </div>
        )}

        {showLoading && (
          <div className="space-y-4 animate-pulse">
            <div className="h-16 bg-recon-navy/50 rounded" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-40 bg-recon-navy/50 rounded" />
              <div className="h-40 bg-recon-navy/50 rounded" />
            </div>
            <div className="h-64 bg-recon-navy/50 rounded" />
            <div className="text-center text-purple-400 text-lg font-medium mt-8">
              Profiling executive<span className="animate-pulse">...</span>
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
                      <div className="text-white font-semibold text-sm">{job.role} — {job.company}</div>
                      <div className="text-recon-grey text-xs mb-1">{job.period}</div>
                      {job.achievement && (
                        <div className="text-recon-light text-sm">{job.achievement}</div>
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
                  {reportData.companies.map((co: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-white font-semibold">{co.name}</span>
                        <span className="text-recon-grey ml-2">— {co.role}</span>
                      </div>
                      {co.domain && (
                        <span className="text-recon-cyan text-xs">{co.domain}</span>
                      )}
                    </div>
                  ))}
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
                        <td className="py-2 text-recon-grey whitespace-nowrap">{item.date}</td>
                        <td className="py-2 text-white">{item.event}</td>
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
            )}

            {/* Quotes */}
            {reportData.quotes && reportData.quotes.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Notable Quotes</h3>
                <div className="space-y-3">
                  {reportData.quotes.map((q: any, idx: number) => (
                    <div key={idx} className="border-l-2 border-purple-500/50 pl-3">
                      <p className="text-white text-sm italic">"{q.text}"</p>
                      <p className="text-recon-grey text-xs mt-1">{q.source} · {q.date}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Network */}
            {reportData.network && reportData.network.length > 0 && (
              <div className="bg-recon-navy/40 border border-recon-blue/30 rounded-lg p-4">
                <h3 className="text-recon-cyan font-bold text-sm uppercase mb-3">Network</h3>
                <div className="space-y-2">
                  {reportData.network.map((n: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-white">{n.name}</span>
                      <span className="text-recon-grey">{n.relationship}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost */}
            {reportData.cost?.total && (
              <div className="text-right text-xs text-recon-grey">
                Cost: <span className="text-recon-green font-semibold">${reportData.cost.total.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
