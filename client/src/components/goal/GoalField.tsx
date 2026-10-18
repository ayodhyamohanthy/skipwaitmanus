import { Check, CircleAlert, type LucideIcon } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { gcn } from "./gcn";

export type GoalFieldHint = { text: string; tone: "muted" | "pass"; icon?: LucideIcon };

/** A labelled control with optional help, a hint (a passed check is ink with lucide check, never emerald) and an error
 * (crimson: input errors on the seeker side only; never inside the referrer queue). */
export function GoalField({ id, label, help, hint, error, children, className }: {
  id: string;
  label: string;
  help?: ReactNode;
  hint?: GoalFieldHint | null;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const HintIcon = hint?.icon ?? (hint?.tone === "pass" ? Check : null);
  return (
    <div className={gcn("grid gap-2", className)}>
      <label htmlFor={id} className="text-g-label text-g-ink">{label}</label>
      {help ? <p id={`${id}-help`} className="-mt-1 text-g-meta text-g-ink-3">{help}</p> : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-2 text-g-meta text-g-crimson">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={gcn("flex items-start gap-2 text-g-meta", hint.tone === "pass" ? "text-g-ink" : "text-g-ink-3")}>
          {HintIcon ? <HintIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={hint.tone === "pass" ? 2 : 1.75} /> : null}
          <span>{hint.text}</span>
        </p>
      ) : null}
    </div>
  );
}

export type GoalTextInputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

/** 40px text input (48px on phones). Pair with GoalField; pass `aria-describedby` for its help/hint/error ids. */
export const GoalTextInput = forwardRef<HTMLInputElement, GoalTextInputProps>(function GoalTextInput({ invalid = false, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid ? true : undefined}
      className={gcn(
        "h-10 w-full text-ellipsis rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3 max-gdesk:h-12",
        invalid && "border-g-crimson",
        className,
      )}
      {...rest}
    />
  );
});

/** A standalone input error line (crimson: an input error, seeker side only; never in the referrer queue). */
export function GoalFieldError({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-g-meta text-g-crimson">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </p>
  );
}
