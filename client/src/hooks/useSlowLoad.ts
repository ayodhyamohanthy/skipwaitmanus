import { useEffect, useRef, useState } from "react";

/**
 * Loading-state timing per the pending-screens spec (§2.2 / §2.4):
 *  - hold the skeleton for at least `minVisibleMs` so a fast response does
 *    not flash a skeleton for a single frame;
 *  - after `slowAfterMs` surface an honest "taking longer than expected"
 *    line instead of leaving the user staring at a silent skeleton.
 *
 * Returns `{ showSkeleton, isSlow }`. Callers render the skeleton while
 * `showSkeleton` is true and append the slow line when `isSlow` is true.
 */
export function useSlowLoad(loading: boolean, { minVisibleMs = 300, slowAfterMs = 15_000 }: { minVisibleMs?: number; slowAfterMs?: number } = {}) {
  const [holding, setHolding] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      startedAt.current = Date.now();
      setHolding(true); setIsSlow(false);
      const slowTimer = window.setTimeout(() => setIsSlow(true), slowAfterMs);
      return () => window.clearTimeout(slowTimer);
    }
    setIsSlow(false);
    const elapsed = startedAt.current === null ? minVisibleMs : Date.now() - startedAt.current;
    const remaining = Math.max(0, minVisibleMs - elapsed);
    if (remaining === 0) { setHolding(false); return; }
    const holdTimer = window.setTimeout(() => setHolding(false), remaining);
    return () => window.clearTimeout(holdTimer);
  }, [loading, minVisibleMs, slowAfterMs]);

  return { showSkeleton: loading || holding, isSlow: loading && isSlow };
}
