import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Class merging for goal UI. The project's `cn` uses tailwind-merge's default theme, which reads `text-g-body`
 * (a font size) and `text-g-ink` (a colour) as the same group and silently drops one of them. This merger knows
 * the goal theme keys from the D-048 block in `client/src/index.css`. */
const goalMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["g-display", "g-heading", "g-body", "g-label", "g-meta", "g-badge", "g-mono", "g-row-phone"],
      radius: ["g-keycap", "g-control", "g-tile", "g-popover", "g-sheet"],
      shadow: ["g-popover", "g-drawer", "g-focus"],
      font: ["g-sans", "g-mono"],
      ease: ["g-out", "g-in"],
      animate: ["g-drawer-in", "g-drawer-out", "g-sheet-in", "g-sheet-out", "g-fade-in", "g-fade-out"],
    },
  },
});

export function gcn(...inputs: ClassValue[]): string {
  return goalMerge(clsx(inputs));
}
