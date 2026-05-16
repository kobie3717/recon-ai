interface HeaderProps {
  url: string;
  onUrlChange: (url: string) => void;
  credits: number;
  disabled: boolean;
}

export default function Header({ url, onUrlChange, credits, disabled }: HeaderProps) {
  return (
    <div className="bg-recon-navy border-b border-recon-blue/30 px-6 py-4 flex items-center gap-6">
      <div className="flex flex-col">
        <h1 className="text-white text-xl font-bold">RECON</h1>
        <p className="text-recon-cyan text-sm">Competitive Intelligence</p>
      </div>

      <div className="flex-1 max-w-3xl">
        <input
          type="text"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={disabled}
          placeholder="Enter company URL — e.g. https://chain.link"
          className="w-full px-4 py-2 bg-recon-dark border border-recon-grey/30 rounded-lg text-white placeholder-recon-grey focus:outline-none focus:border-recon-cyan focus:ring-1 focus:ring-recon-cyan disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      <div className="text-recon-green font-semibold whitespace-nowrap">
        Credits: ${credits.toFixed(2)}
      </div>
    </div>
  );
}
