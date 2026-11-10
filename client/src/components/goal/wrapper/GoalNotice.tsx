// Goal network notice (offline, slow connection) for the app-wide wrapper
// (D-048-F-app-wrapper). A floating status pill in goal tokens, fixed near the
// bottom of the viewport, so it takes no layout space: the page never moves
// when it appears or goes (no layout shift). On a phone it floats centred above
// the goal bottom bar; on desktop it sits in the bottom-right corner, clear of
// centred page footers and primary actions; it stays below sheets, drawers (z-40/50) and the cookie
// banner (z-60), and lets pointer input through to the page beneath.
// Status stays text, never a coloured fill.
import type { ReactNode } from "react";

export function GoalNotice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-goal-wrapper="notice"
      className="g-scope pointer-events-none fixed inset-x-0 bottom-[calc(var(--g-bottombar-h)+12px+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-4 gdesk:bottom-[max(24px,env(safe-area-inset-bottom,0px))] gdesk:justify-end gdesk:px-6"
    >
      <div className="flex max-w-full items-center gap-2 rounded-g-popover gdesk:max-w-xs bg-g-surface px-4 py-2 text-g-meta text-g-ink-2 shadow-g-popover">
        {icon}{children}
      </div>
    </div>
  );
}
