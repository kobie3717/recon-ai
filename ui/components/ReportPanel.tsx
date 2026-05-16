'use client';

import ReactMarkdown from 'react-markdown';

interface ReportPanelProps {
  content: string;
  costBreakdown?: {
    webUnlocker?: number;
    serp?: number;
    scrapingBrowser?: number;
    webScraper?: number;
    total?: number;
  };
  isRunning: boolean;
}

export default function ReportPanel({ content, costBreakdown, isRunning }: ReportPanelProps) {
  const showPlaceholder = !isRunning && !content;
  const showLoading = isRunning && !content;

  return (
    <div className="flex flex-col h-full bg-recon-dark">
      <div className="bg-recon-navy/80 px-6 py-4 border-b border-recon-blue/30">
        <h2 className="text-recon-cyan uppercase font-bold tracking-wide">Report</h2>
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
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-4xl mb-4">✨</div>
              <p className="text-recon-cyan text-lg font-medium">
                Claude is synthesizing your report
                <span className="animate-pulse">...</span>
              </p>
            </div>
          </div>
        )}

        {content && (
          <div className="prose prose-invert prose-headings:text-white prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-4 prose-h2:text-recon-blue prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-6 prose-h2:mb-3 prose-p:text-recon-light prose-p:leading-relaxed prose-ul:text-recon-light prose-li:text-recon-light prose-strong:text-white prose-code:bg-recon-navy prose-code:text-recon-green prose-code:px-2 prose-code:py-1 prose-code:rounded prose-pre:bg-recon-navy prose-pre:border prose-pre:border-recon-blue/30 prose-table:border prose-table:border-recon-blue/30 prose-th:bg-recon-navy prose-th:text-recon-cyan prose-th:font-semibold prose-th:px-4 prose-th:py-2 prose-td:text-recon-light prose-td:px-4 prose-td:py-2 prose-td:border-t prose-td:border-recon-blue/20 max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>

      {content && costBreakdown?.total !== undefined && (
        <div className="bg-recon-navy/50 px-6 py-3 border-t border-recon-blue/30">
          <div className="flex items-center justify-between text-sm">
            <div className="text-recon-grey">
              Report generated successfully
            </div>
            <div className="flex items-center gap-4">
              <span className="text-recon-grey">Cost: <span className="text-recon-green font-semibold">${costBreakdown.total.toFixed(2)}</span></span>
              <button className="px-3 py-1 bg-recon-blue text-white rounded hover:bg-recon-blue/80 transition-colors">
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
