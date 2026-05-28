'use client';

import { useEffect, useState } from 'react';

export default function SplashOverlay() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Show on EVERY page load (no sessionStorage flag)
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const dismiss = () => {
    setFading(true);
    setTimeout(() => setVisible(false), 600);
  };

  // Keyboard dismiss
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      onClick={dismiss}
      className={`fixed inset-0 z-[9999] cursor-pointer transition-opacity duration-600 ease-out ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        backgroundImage: `url('/cover.jpg')`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#0a0e1a',
      }}
      role="button"
      aria-label="Click to enter Recon"
    >
      {/* Dark gradient for legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/70" />

      {/* Content */}
      <div className="relative h-full flex flex-col items-center justify-end pb-16 px-6">
        {/* Top brand badges */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
          <span className="bg-green-500/10 text-green-400 border border-green-500/40 px-3 py-1 rounded text-[11px] font-mono uppercase tracking-widest">
            No Fake AI
          </span>
          <span className="bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 px-3 py-1 rounded text-[11px] font-mono uppercase tracking-widest">
            Powered by Bright Data
          </span>
        </div>

        {/* Hero text */}
        <div className="text-center mb-6">
          <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight font-mono drop-shadow-[0_2px_20px_rgba(0,0,0,0.8)]">
            RECON
          </h1>
          <p className="text-lg md:text-xl text-cyan-300 mt-2 font-light tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            Observable AI Web Intelligence
          </p>
        </div>

        {/* Click hint */}
        <div className="flex items-center gap-2 text-white/70 text-sm font-mono animate-pulse">
          <span>›</span>
          <span>Click anywhere to enter</span>
          <span>‹</span>
        </div>
      </div>
    </div>
  );
}
