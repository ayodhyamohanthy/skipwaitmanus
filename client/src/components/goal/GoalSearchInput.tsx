import { Search } from "lucide-react";
import { forwardRef, type InputHTMLAttributes } from "react";
import { gcn } from "./gcn";

export type GoalSearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
};

/** 44px search field (48px on phones) with a leading lucide search icon. */
export const GoalSearchInput = forwardRef<HTMLInputElement, GoalSearchInputProps>(function GoalSearchInput(
  { label, value, onValueChange, className, ...rest },
  ref,
) {
  return (
    <div className={gcn("relative", className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-g-ink-3" strokeWidth={1.75} />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        className="h-11 w-full rounded-g-control border border-g-control-edge bg-g-surface pl-11 pr-3 text-g-body text-g-ink placeholder:text-g-ink-3 max-gdesk:h-12"
        {...rest}
      />
    </div>
  );
});
