'use client';

import ReportPanel from './ReportPanel';

interface ComparePanelProps {
  report1: any;
  report2: any;
  isLoading1: boolean;
  isLoading2: boolean;
  domain1?: string;
  domain2?: string;
  // Streaming state per side
  synthesisText1?: string;
  synthesisTokens1?: number;
  livePreview1?: string;
  synthesisText2?: string;
  synthesisTokens2?: number;
  livePreview2?: string;
  isJsonPhase?: boolean;
}

export default function ComparePanel({
  report1, report2, isLoading1, isLoading2,
  synthesisText1, synthesisTokens1, livePreview1,
  synthesisText2, synthesisTokens2, livePreview2,
  isJsonPhase,
}: ComparePanelProps) {
  return (
    <div className="flex h-full divide-x divide-recon-blue/20 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <ReportPanel
          reportData={report1}
          isRunning={isLoading1}
          synthesisText={synthesisText1}
          synthesisTokens={synthesisTokens1}
          livePreview={livePreview1}
          isJsonPhase={isJsonPhase}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <ReportPanel
          reportData={report2}
          isRunning={isLoading2}
          synthesisText={synthesisText2}
          synthesisTokens={synthesisTokens2}
          livePreview={livePreview2}
          isJsonPhase={isJsonPhase}
        />
      </div>
    </div>
  );
}
