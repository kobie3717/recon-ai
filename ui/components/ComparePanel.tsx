'use client';

import ReportPanel from './ReportPanel';

interface ComparePanelProps {
  report1: any;
  report2: any;
  isLoading1: boolean;
  isLoading2: boolean;
}

export default function ComparePanel({ report1, report2, isLoading1, isLoading2 }: ComparePanelProps) {
  return (
    <div className="flex h-full divide-x divide-recon-blue/20 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <ReportPanel reportData={report1} isRunning={isLoading1} />
      </div>
      <div className="flex-1 overflow-hidden">
        <ReportPanel reportData={report2} isRunning={isLoading2} />
      </div>
    </div>
  );
}
