import { useEffect, useState } from 'react';

/** Compact relative time, e.g. "just now", "12m ago", "3h ago", "2d ago". */
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return 'never';
  const d = typeof date === 'string' ? new Date(date) : date;
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Re-renders the calling component on an interval so relative timestamps
 * ("updated 5m ago") stay current without a manual refresh. Returns the current
 * epoch ms, though callers usually just need the re-render side effect.
 */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
