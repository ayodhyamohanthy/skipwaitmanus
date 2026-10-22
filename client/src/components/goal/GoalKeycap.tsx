// Keycap hint (desktop only): a letter or one of the four allowed lucide
// glyphs. A hint, never the only label; the wrapper in GoalButton is
// aria-hidden. (shell.css:170-181, BRIEF.md §102)
import { ArrowDown, ArrowUp, Command, CornerDownLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const KEYCAP_ICONS = { command: Command, "corner-down-left": CornerDownLeft, "arrow-up": ArrowUp, "arrow-down": ArrowDown } as const;
export type GoalKeycapIcon = keyof typeof KEYCAP_ICONS;

export function GoalKeycap({ children, icon, onPrimary }: { children?: ReactNode; icon?: GoalKeycapIcon; onPrimary?: boolean }) {
  const Icon = icon ? KEYCAP_ICONS[icon] : null;
  return (
    <kbd
      data-testid="goal-keycap"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-g-keycap border px-[5px] text-g-badge tracking-normal",
        onPrimary ? "border-g-on-primary-edge bg-transparent text-g-on-primary" : "border-g-control-edge bg-g-surface text-g-ink-2",
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3" strokeWidth={1.75} /> : children}
    </kbd>
  );
}
