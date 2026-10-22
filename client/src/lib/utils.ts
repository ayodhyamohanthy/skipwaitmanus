import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The goal-UI type scale (DESIGN.md) reuses Tailwind's `text-*` namespace for
// font sizes: `text-g-label` is 14px, `text-g-meta` is 13px. tailwind-merge
// classifies every unknown `text-*` as a colour, so a primitive that paired a
// type token with a colour token (`text-g-label text-g-ink`) silently lost its
// type size. Listing the goal type tokens as font sizes keeps both. Only `g-*`
// classes are classified here, so Kit v4 components keep their merge
// behaviour, and the goal colour tokens stay colours (the default).
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["g-display", "g-heading", "g-body", "g-label", "g-meta", "g-badge", "g-row-phone", "g-mono"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
