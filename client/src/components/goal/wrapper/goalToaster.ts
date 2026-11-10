// Goal toaster styling (D-048-F-app-wrapper). The app keeps exactly one sonner
// Toaster mounted for its whole life (a remount drops toasts already in
// flight, e.g. a toast fired just before navigating); on a goal route these
// props restyle that same instance with goal tokens. Position, offsets and
// sonner's default durations are untouched. Goal tokens are light-only until
// D-048-dark-mode lands, so the goal variant pins sonner's light theme.
import type { CSSProperties } from "react";

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
