interface ReportButtonsProps {
  onSelectMode: (mode: string, cost: number) => void;
  disabled: boolean;
}

const reportModes = [
  { mode: 'standard', label: 'Generate Report', cost: 2.0, color: 'blue', icon: '' },
  { mode: 'seo', label: 'SEO Analysis', cost: 5.0, color: 'outline', icon: '' },
  { mode: 'redteam', label: 'Red Team', cost: 12.0, color: 'outline', icon: '⚔' },
  { mode: 'deep', label: 'Deep Search', cost: 15.0, color: 'purple', icon: '✦' },
  { mode: 'bundle', label: 'Bundle All', cost: 25.0, color: 'outline', icon: '★' },
];

export default function ReportButtons({ onSelectMode, disabled }: ReportButtonsProps) {
  return (
    <div className="bg-recon-navy/50 border-b border-recon-blue/20 px-4 py-2 flex items-center gap-3 overflow-x-auto">
      {reportModes.map(({ mode, label, cost, color, icon }) => {
        const baseClasses = "px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all disabled:opacity-50 disabled:cursor-not-allowed";

        let colorClasses = "";
        if (color === 'blue') {
          colorClasses = "bg-recon-blue text-white hover:bg-recon-blue/80";
        } else if (color === 'purple') {
          colorClasses = "bg-indigo-600 text-white hover:bg-indigo-700";
        } else {
          colorClasses = "bg-recon-navy border border-recon-grey/50 text-white hover:bg-recon-grey/20";
        }

        return (
          <button
            key={mode}
            onClick={() => onSelectMode(mode, cost)}
            disabled={disabled}
            className={`${baseClasses} ${colorClasses}`}
          >
            {label} ${cost.toFixed(2)} {icon}
          </button>
        );
      })}
    </div>
  );
}
