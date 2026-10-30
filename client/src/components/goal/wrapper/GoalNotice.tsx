// Goal network notice (offline, slow connection) for the app-wide wrapper
// (D-048-F-app-wrapper). A plain in-flow status line above the page, in goal
// tokens: it sits before the shell, so it never covers the top bar, the rail,
// the bottom bar or the cookie banner. Status stays text, never a coloured fill.
import type { ReactNode } from "react";

export function GoalNotice({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-goal-wrapper="notice"
      className="g-scope flex min-h-9 items-center gap-2 border-b border-g-hairline bg-g-surface-sunken px-6 py-2 text-g-meta text-g-ink-2 max-gdesk:px-4"
    >
      {icon}{children}
    </div>
  );
}
