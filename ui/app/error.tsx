'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[recon] unhandled error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-recon-dark text-white">
      <div className="text-6xl mb-4">⚠</div>
      <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
      <p className="text-recon-grey mb-6 text-sm">{error.message || 'An unexpected error occurred'}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-recon-cyan/20 border border-recon-cyan/50 text-recon-cyan rounded hover:bg-recon-cyan/30 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
