import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RECON — Observable AI Web Intelligence",
  description: "Watch AI agents research the web live. Every claim sourced. No fake AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-white min-h-screen flex flex-col">
        <main className="flex-1">{children}</main>
        <footer className="border-t border-recon-blue/20 bg-recon-navy/40 mt-auto">
          <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-recon-grey">
            <div className="flex items-center gap-3">
              <span className="font-mono text-recon-cyan">RECON</span>
              <span>·</span>
              <span>Observable AI Web Intelligence · No Fake AI</span>
            </div>
            <div className="flex items-center gap-3">
              <span>Powered by</span>
              <a href="https://brightdata.com" target="_blank" rel="noopener" className="text-recon-cyan hover:underline">Bright Data</a>
              <span>+</span>
              <a href="https://anthropic.com" target="_blank" rel="noopener" className="text-recon-cyan hover:underline">Claude</a>
              <span>·</span>
              <a href="https://lablab.ai" target="_blank" rel="noopener" className="text-recon-cyan hover:underline">lablab.ai hackathon 2026</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
