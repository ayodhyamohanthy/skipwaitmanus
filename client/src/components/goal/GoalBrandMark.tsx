// V6-B "overlapping queue" brand mark (owner pick Oct 21 16:46, verified
// author=user phonemsg-01M5F2T2JQCD9QNM72W8N5D4DS): three people rising
// (tokens --g-mark-1/2/3), shared baseline, flat, no strokes, no arrow.
// Geometry from the designer's final assets (skipwait-icon.svg). Wordmark
// W1 (owner pick, relayed by main 16:51): ink "SkipWait" + grey ".me". ONE
// swappable component: the designer's final lockup SVG lands here.
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const ICON_VIEWBOX = "76 214 392 236";

function V6BPaths() {
  return (
    <>
      <circle cx="140" cy="337.2" r="25.04" fill="var(--g-mark-1)" />
      <path d="M93.6 430A46.4 57.52 0 0 1 186.4 430Z" fill="var(--g-mark-1)" />
      <circle cx="255" cy="308.2" r="32.865" fill="var(--g-mark-2)" />
      <path d="M194.1 430A60.9 75.495 0 0 1 315.9 430Z" fill="var(--g-mark-2)" />
      <circle cx="372" cy="273.4" r="42.255" fill="var(--g-mark-3)" />
      <path d="M293.7 430A78.3 97.065 0 0 1 450.3 430Z" fill="var(--g-mark-3)" />
    </>
  );
}

export function GoalBrandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox={ICON_VIEWBOX} className={cn("h-6 w-auto", className)} aria-hidden="true" focusable="false">
      <V6BPaths />
    </svg>
  );
}

/** The brand lockup (V6-B icon + W1 wordmark, designer's final asset,
 *  header size 26px). The single image swap point for future logo updates. */
export function GoalBrandMark({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <img src="/brand/lockup.svg" alt="SkipWait.me" className={cn("h-[26px] w-auto", iconClassName, className)} />
  );
}

/** The hero banner art: the SAME V6-B geometry enlarged on the warm band
 *  (owner 16:30 banner ask + 16:43 warm pick + 16:46 mark pick). A gentle
 *  one-time rise on load; reduced-motion renders it fully. */
export function GoalBrandBannerArt({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(16px)";
    el.style.transition = "opacity 600ms ease-out, transform 600ms ease-out";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }));
  }, []);
  return (
    <svg ref={ref} viewBox={ICON_VIEWBOX} className={className} aria-hidden="true" focusable="false">
      <V6BPaths />
    </svg>
  );
}
