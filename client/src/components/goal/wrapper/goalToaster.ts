// Goal toaster styling (D-048-F-app-wrapper). The app keeps exactly one sonner
// Toaster mounted for its whole life (a remount drops toasts already in
// flight, e.g. a toast fired just before navigating); on a goal route these
// props restyle that same instance with goal tokens. Position, offsets and
// sonner's default durations are untouched. Goal tokens are light-only until
// D-048-dark-mode lands, so the goal variant pins sonner's light theme.
import type { CSSProperties } from "react";
import { toast } from "sonner";

export const GOAL_TOASTER_PROPS = {
  theme: "light",
  className: "toaster group g-scope",
  style: {
    "--normal-bg": "var(--g-surface)",
    "--normal-text": "var(--g-ink)",
    "--normal-border": "var(--g-control-edge)",
    "--border-radius": "8px",
    fontFamily: "var(--g-font-sans)",
  } as CSSProperties,
} as const;

/**
 * An error toast in the goal UI: the crimson input-error hue on its icon (DESIGN.md rule 5), the problem as the
 * title in ink for legibility, the fix in the description. Pass one id per source so a repeat press replaces the toast instead of stacking it.
 */
export function goalErrorToast(message: string, options: { id: string; description?: string }) {
  return toast.error(message, { ...options, classNames: { icon: "text-g-crimson" } });
}
