// The two-person brand mark + wordmark, ONE swappable component (owner's
// 16:27 pick: small grey person + big ink person, arc rising small-to-big).
// Final logo geometry may still change - update THIS component only.
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function GoalBrandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 72" className={cn("h-6 w-auto", className)} aria-hidden="true" focusable="false">
      <path d="M26 34 C28 6 80 6 78 28" fill="none" stroke="#0A0A0A" strokeWidth="6" strokeLinecap="round" />
      <path d="M70 19 L78 30 L86 19" fill="none" stroke="#0A0A0A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="46" r="7" fill="#8A8A8A" />
      <path d="M8 66 a13 11 0 0 1 24 0 Z" fill="#8A8A8A" />
      <circle cx="70" cy="38" r="11" fill="#0A0A0A" />
      <path d="M52 66 a19 15 0 0 1 36 0 Z" fill="#0A0A0A" />
    </svg>
  );
}

export function GoalBrandMark({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <GoalBrandIcon className={iconClassName} />
      <span className="text-g-label font-semibold tracking-tight text-g-ink">skipwait.me</span>
    </span>
  );
}

/** The hero banner art: the SAME two-person geometry enlarged, on a ground
 *  hairline (owner 16:30: "illustration over the logo enlarged as image as
 *  banner"). aria-hidden; the arc draws once on load unless reduced motion.
 *  Geometry changes land here and in GoalBrandIcon together - one file. */
export function GoalBrandBannerArt({ className }: { className?: string }) {
  const arcRef = useRef<SVGPathElement>(null);
  useEffect(() => {
    const path = arcRef.current;
    if (!path || typeof path.getTotalLength !== "function") return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    path.style.transition = "stroke-dashoffset 900ms ease-out";
    requestAnimationFrame(() => requestAnimationFrame(() => { path.style.strokeDashoffset = "0"; }));
  }, []);
  return (
    <svg viewBox="0 0 720 380" className={className} aria-hidden="true" focusable="false">
      <line x1="180" y1="336" x2="540" y2="336" stroke="#EBEBEB" strokeWidth="2" />
      <path ref={arcRef} d="M300 220 C310 40 500 40 462 190" fill="none" stroke="#0A0A0A" strokeWidth="18" strokeLinecap="round" />
      <path d="M428 156 L464 204 L500 156" fill="none" stroke="#0A0A0A" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="300" cy="262" r="24" fill="#8A8A8A" />
      <path d="M258 336 a44 40 0 0 1 84 0 Z" fill="#8A8A8A" />
      <circle cx="452" cy="238" r="38" fill="#0A0A0A" />
      <path d="M388 336 a64 56 0 0 1 128 0 Z" fill="#0A0A0A" />
    </svg>
  );
}
