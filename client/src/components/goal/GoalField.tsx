// GoalField (label + control + help/hint/error). A passed check is ink, not
// emerald (find-a-referral.css:67). Input errors are crimson (BRIEF.md §126)
// — never inside the referrer queue.
import { Check, CircleAlert, type LucideIcon } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GoalField({ label, htmlFor, help, hint, error, children }: {
  label: string;
  htmlFor?: string;
  help?: string;
  hint?: { icon: LucideIcon; text: string; tone: "muted" | "pass" };
  error?: string;
  children: ReactNode;
}) {
  const autoId = useId();
  const errorId = `${autoId}-error`;
  return (
    <div data-testid="goal-field" className="grid gap-2">
      <label htmlFor={htmlFor} className="text-g-label text-g-ink">{label}</label>
      {help ? <p className="-mt-1 text-g-meta text-g-ink-3">{help}</p> : null}
      {children}
      {hint ? (
        <p className={cn("flex items-center gap-2 text-g-meta", hint.tone === "pass" ? "text-g-ink" : "text-g-ink-3")}>
          {(() => { const HintIcon = hint.tone === "pass" ? Check : hint.icon; return <HintIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />; })()}
          {hint.text}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-center gap-2 text-g-meta text-g-crimson">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The text input for a GoalField; pass the field's id via htmlFor/id. */
export function GoalTextInput({ id, invalid, describedBy, className, ...rest }: { id?: string; invalid?: boolean; describedBy?: string; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <input
      id={id}
      aria-invalid={invalid ? "true" : undefined}
      aria-describedby={describedBy}
      className={cn(
        "h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3 max-gdesk:h-12",
        className,
      )}
      style={{ textOverflow: "ellipsis" }}
      {...rest}
    />
  );
}
