import type { LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { gcn } from "./gcn";

export type GoalIconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled" | "children"> & {
  label: string;
  icon: LucideIcon;
  iconSize?: number;
  inactive?: boolean;
};

/** 36px icon button (44px on phones) with a required accessible name. */
export const GoalIconButton = forwardRef<HTMLButtonElement, GoalIconButtonProps>(function GoalIconButton(
  { label, icon: Icon, iconSize = 20, inactive = false, className, onClick, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      aria-disabled={inactive ? true : undefined}
      onClick={event => {
        if (inactive) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={gcn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-g-control text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out",
        "hover:bg-g-surface-hover hover:text-g-ink max-gdesk:size-11",
        inactive && "cursor-not-allowed text-g-control-edge hover:bg-transparent hover:text-g-control-edge",
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden="true" style={{ width: iconSize, height: iconSize }} strokeWidth={1.75} />
    </button>
  );
});
