'use client';

interface HeaderProps {
  credits: number;
}

export default function Header({ credits }: HeaderProps) {
  return (
    <header className="border-b border-recon-blue/30 bg-recon-navy px-6 py-4 flex items-center justify-between">
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <h1 className="text-white text-xl font-bold">RECON</h1>
          <span className="bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider">No Fake AI</span>
        </div>
        <p className="text-recon-cyan text-sm">Observable AI Web Intelligence</p>
      </div>
      <div className="text-recon-green font-semibold whitespace-nowrap">
        Credits: ${credits % 1 === 0 ? credits.toFixed(0) : credits.toFixed(2)}
      </div>
    </header>
  );
}
