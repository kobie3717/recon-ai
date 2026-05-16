'use client';

interface HeaderProps {
  credits: number;
}

export default function Header({ credits }: HeaderProps) {
  return (
    <header className="border-b border-recon-blue/30 bg-recon-navy px-6 py-4 flex items-center justify-between">
      <div className="flex flex-col">
        <h1 className="text-white text-xl font-bold">RECON</h1>
        <p className="text-recon-cyan text-sm">Competitive Intelligence</p>
      </div>
      <div className="text-recon-green font-semibold whitespace-nowrap">
        Credits: ${credits.toFixed(2)}
      </div>
    </header>
  );
}
