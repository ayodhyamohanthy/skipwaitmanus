import { Slot, Slottable } from "@radix-ui/react-slot";
import type { LucideIcon } from "lucide-react";
import { forwardRef, useId, type ButtonHTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { gcn } from "./gcn";
import { GoalKeycaps, type GoalKey } from "./GoalKeycap";

export type GoalButtonVariant = "primary" | "ghost" | "outline";

export type GoalButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  variant?: GoalButtonVariant;
  size?: "md" | "sm" | "xs";
  /** Phone height: 44px by default, 48px for drawer, sheet and decision-bar actions. */
  touch?: "default" | "large";
  keys?: readonly GoalKey[];
  busy?: boolean;
  busyLabel?: string;
  /** Why the action is unavailable. Sets aria-disabled and describes the button; the click is swallowed. */
  disabledReason?: string;
  /** aria-disabled with no reason text (for example Pass until a reason is picked). */
  inactive?: boolean;
  asChild?: boolean;
  leadingIcon?: LucideIcon;
  children: ReactNode;
};

const SIZE = { md: "h-10 px-3.5", sm: "h-9 px-3", xs: "h-8 px-2.5" } as const;

/** Goal button (DESIGN.md Components). Never uses the native `disabled` attribute: the Kit v4 layer paints disabled
 * buttons grey with `!important`, and faded disabled controls are banned. A screen renders at most one primary. */
export const GoalButton = forwardRef<HTMLButtonElement, GoalButtonProps>(function GoalButton(
  { variant = "ghost", size = "md", touch = "default", keys = [], busy = false, busyLabel, disabledReason, inactive = false, asChild = false,
    leadingIcon: LeadingIcon, className, children, onClick, onKeyDown, type, ...rest },
  ref,
) {
  const reasonId = useId();
  const unavailable = busy || inactive || Boolean(disabledReason);
  const showKeys = keys.length > 0 && !busy;
  const greyed = unavailable && !busy;
  const classes = gcn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-g-control border border-transparent text-g-label",
    "transition-colors duration-(--g-dur-hover) ease-g-out",
    SIZE[size],
    touch === "large" ? "max-gdesk:h-12" : "max-gdesk:h-11",
    showKeys && "pr-2.5 max-gdesk:pr-3.5",
    !greyed && variant === "primary" && "bg-g-primary text-g-on-primary hover:bg-g-primary-hover active:bg-g-primary-pressed",
    !greyed && variant === "ghost" && "text-g-ink hover:bg-g-surface-hover aria-expanded:bg-g-surface-hover",
    !greyed && variant === "outline" && "border-g-ink text-g-ink hover:bg-g-surface-hover",
    greyed && "cursor-not-allowed border-g-control-edge bg-transparent text-g-ink-3",
    busy && "cursor-progress",
    className,
  );
  const block = (event: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (unavailable) return block(event);
    onClick?.(event);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (unavailable && (event.key === "Enter" || event.key === " ")) return block(event);
    onKeyDown?.(event);
  };
  const shared = {
    ...rest,
    ref,
    className: classes,
    "aria-disabled": unavailable ? true : undefined,
    "aria-busy": busy ? true : undefined,
    "aria-describedby": disabledReason ? reasonId : rest["aria-describedby"],
    "data-g-primary": variant === "primary" ? "" : undefined,
    onClick: handleClick,
    onKeyDown: handleKeyDown,
  };
  const leading = LeadingIcon ? <LeadingIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} /> : null;
  const reason = disabledReason ? <span id={reasonId} hidden>{disabledReason}</span> : null;
  if (asChild) {
    return (
      <Slot {...shared}>
        <Slottable>{children}</Slottable>
      </Slot>
    );
  }
  return (
    <button type={type ?? "button"} {...shared}>
      {leading}
      <span>{busy && busyLabel ? busyLabel : children}</span>
      {showKeys ? <GoalKeycaps keys={keys} onPrimary={variant === "primary" && !greyed} /> : null}
      {reason}
    </button>
  );
});
