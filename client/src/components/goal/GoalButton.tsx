// GoalButton (shell.css:153-182). Never the native disabled attribute
// (index.css:178 paints it grey !important): aria-disabled="true" suppresses
// activation instead. At most one variant="primary" per screen (the
// composition test pins it). Keycaps are desktop-only hints.
import { Slot } from "@radix-ui/react-slot";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GoalKeycap, type GoalKeycapIcon } from "./GoalKeycap";

export type GoalButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "md" | "sm" | "xs";
  touch?: "default" | "large";
  keys?: (ReactNode | { icon: GoalKeycapIcon })[];
  busy?: boolean;
  busyLabel?: string;
  disabledReason?: string;
  asChild?: boolean;
  leadingIcon?: LucideIcon;
  /** Left-aligned ghost action: the label sits flush with the text column; the padding stays as hit area. */
  flush?: boolean;
};

const SIZES = {
  "md": "h-(--g-control-h) px-[14px]",
  "sm": "h-9 px-3",
  "xs": "h-8 px-2.5",
} as const;

export const GoalButton = forwardRef<HTMLButtonElement, GoalButtonProps>(function GoalButton(
  { variant = "ghost", size = "md", touch = "default", keys, busy = false, busyLabel, disabledReason, asChild = false, leadingIcon: LeadingIcon, flush = false, className, children, onClick, ...rest },
  ref,
) {
  const reasonId = useId();
  const inert = busy || disabledReason !== undefined;
  const Comp = asChild ? Slot : "button";
  return (
    <>
      <Comp
        ref={ref as never}
        type={asChild ? undefined : (rest.type ?? "button")}
        data-testid="goal-button"
        {...(variant === "primary" ? { "data-g-primary": true } : {})}
        aria-disabled={inert ? "true" : undefined}
        aria-busy={busy ? "true" : undefined}
        aria-describedby={disabledReason !== undefined ? reasonId : undefined}
        onClick={inert ? (event: { preventDefault(): void; stopPropagation(): void }) => { event.preventDefault(); event.stopPropagation(); } : onClick}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-g-control border border-transparent text-g-label whitespace-nowrap transition-colors duration-(--g-dur-hover) ease-g-out select-none",
          SIZES[size],
          touch === "large" ? "max-gdesk:h-12" : "max-gdesk:h-11",
          keys?.length ? "pr-2.5 max-gdesk:pr-[14px]" : "",
          flush && (size === "md" ? "-ml-[15px]" : size === "sm" ? "-ml-[13px]" : "-ml-[11px]"),
          variant === "primary" && !inert && "bg-g-primary text-g-on-primary hover:bg-g-primary-pressed active:bg-g-primary-pressed hover:not-active:bg-g-primary-hover",
          variant === "ghost" && !inert && "text-g-ink hover:bg-g-surface-hover aria-expanded:bg-g-surface-hover",
          variant === "outline" && !inert && "border-g-ink text-g-ink",
          inert && "cursor-not-allowed border-g-control-edge text-g-ink-3 bg-transparent hover:bg-transparent active:bg-transparent",
          className,
        )}
        {...rest}
      >
        {asChild ? children : (<>
        {busy && <LoaderCircle aria-hidden="true" className="size-4" strokeWidth={1.75} />}
        {!busy && LeadingIcon && <LeadingIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />}
        {busy && busyLabel ? busyLabel : children}
        {keys?.length ? (
          <span aria-hidden="true" className="ml-0.5 inline-flex items-center gap-1 max-gdesk:hidden">
            {keys.map((key, index) => {
              if (typeof key === "object" && key !== null && "icon" in (key as Record<string, unknown>)) {
                return <GoalKeycap key={index} icon={(key as { icon: GoalKeycapIcon }).icon} onPrimary={variant === "primary" && !inert} />;
              }
              return <GoalKeycap key={index} onPrimary={variant === "primary" && !inert}>{key as ReactNode}</GoalKeycap>;
            })}
          </span>
        ) : null}
        </>)}
      </Comp>
      {disabledReason !== undefined ? <span id={reasonId} className="sr-only">{disabledReason}</span> : null}
    </>
  );
});
