// W0 "More" (designer, Oct 21 2026): the shell's disclosure menu.
// Desktop: bottom of the rail, rail-item style. Phone: last slot of the bottom bar.
// Rows: Help & safety, Terms, Privacy, Support — surface card, ink 44px rows,
// opens upward, no colour/pill/black commit style. AccountMenu stays unchanged.
import { Ellipsis } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useThemeOptional } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { GoalButton } from "./GoalButton";

const MORE_LINKS = [
  { label: "Help & safety", href: "/help" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Support", href: "/support" },
] as const;

export function GoalMoreMenu({ variant }: { variant: "rail" | "bar" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const appearance = useThemeOptional();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", variant === "bar" && "flex flex-1 items-stretch")}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={cn(
          "text-g-badge text-g-ink-3 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink",
          variant === "rail"
            ? "flex size-[88px] h-14 flex-col items-center justify-center gap-1 rounded-g-tile"
            : "flex flex-1 flex-col items-center justify-center gap-0.5",
        )}
      >
        <Ellipsis aria-hidden="true" className="size-5" strokeWidth={1.75} />
        More
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="More"
          className={cn(
            "absolute bottom-full z-30 mb-2 min-w-44 overflow-hidden rounded-g-control border border-g-hairline bg-g-surface shadow-g-popover",
            variant === "rail" ? "left-0" : "right-0",
          )}
        >
          {MORE_LINKS.map(link => (
            <a
              key={link.href}
              role="menuitem"
              href={link.href}
              className="flex h-11 items-center px-4 text-sm text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover"
            >
              {link.label}
            </a>
          ))}
          {appearance?.switchable ? (
            <>
              <div role="separator" className="border-t border-g-hairline" />
              <GoalButton
                variant="ghost"
                role="menuitem"
                aria-label={`Appearance: ${appearance.theme === "dark" ? "Dark" : "Light"}`}
                onClick={() => {
                  appearance.toggleTheme?.();
                  setOpen(false);
                }}
                className="h-11 w-full justify-between rounded-none px-4 text-sm font-normal"
              >
                Appearance
                <span className="text-g-ink-3">{appearance.theme === "dark" ? "Dark" : "Light"}</span>
              </GoalButton>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
