'use client';

export function SourceLink({ url, label }: { url?: string; label?: string }) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={label || 'View source'}
      className="inline-flex items-center text-cyan-400/70 hover:text-cyan-300 text-xs ml-1 no-underline"
    >
      ↗
    </a>
  );
}
