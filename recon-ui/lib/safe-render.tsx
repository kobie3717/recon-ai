import React from 'react';

/**
 * Defensive render helper — safely renders unknown values as React nodes.
 * Never crashes on unexpected object shapes.
 *
 * Usage: <S v={foo.bar} />
 */
export function S({ v }: { v: unknown }): React.ReactNode {
  if (v == null) return null;

  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }

  if (typeof v === 'object' && v !== null && 'text' in (v as object) && typeof (v as any).text === 'string') {
    return (v as any).text;
  }

  // Never crash on unexpected shapes
  return null;
}
