// 36px icon button (44px touch target on phones via .g-hit). aria-label is
// required: an icon never replaces visible text without one.
import { forwardRef, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type GoalIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  icon: LucideIcon;
  "aria-label": string;
  iconSize?: number;
  disabledReason?: string;
};

export const GoalIconButton = forwardRef<HTMLButtonElement, GoalIconButtonProps>(function GoalIconButton(
  { icon: Icon, iconSize = 20, disabledReason, className, onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-testid="goal-icon-button"
      aria-disabled={disabledReason !== undefined ? "true" : undefined}
      title={disabledReason}
      onClick={disabledReason !== undefined ? (event) => { event.preventDefault(); event.stopPropagation(); } : onClick}
      className={cn(
        "g-hit inline-flex size-9 items-center justify-center rounded-g-control text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover hover:text-g-ink max-gdesk:size-11",
        disabledReason !== undefined && "cursor-not-allowed text-g-ink-3 hover:bg-transparent hover:text-g-ink-3",
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden="true" style={{ width: iconSize, height: iconSize }} strokeWidth={1.75} />
    </button>
  );
});
