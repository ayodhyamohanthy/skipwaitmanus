import { useId } from "react";
import { gcn } from "./gcn";

/** One numbered reason card ("01"…"03") with a live character count (D-077(4)). The card rings on focus; over the
 * limit, the edge and the count turn crimson (an input error, seeker side only). Line breaks are not kept: each
 * reason is one line of the stored note. */
export function GoalReasonInput({ index, value, onChange, max, placeholder }: { index: number; value: string; onChange: (value: string) => void; max: number; placeholder: string }) {
  const id = useId();
  const count = value.trim().length;
  const over = count > max;
  return (
    <div className={gcn("grid grid-cols-[24px_minmax(0,1fr)] gap-x-2 gap-y-1 rounded-g-control border bg-g-surface px-3 pb-2 pt-3 focus-within:border-g-ink focus-within:shadow-g-focus", over ? "border-g-crimson" : "border-g-control-edge")}>
      <label htmlFor={id} className="g-num leading-6 text-g-ink-3">
        <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <span className="sr-only">Reason {index + 1}</span>
      </label>
      <textarea
        id={id}
        value={value}
        rows={2}
        maxLength={max + 60}
        placeholder={placeholder}
        aria-invalid={over ? true : undefined}
        onChange={event => onChange(event.target.value.replace(/\r?\n/g, " "))}
        className="g-focus-inner min-h-6 w-full resize-none border-0 bg-transparent p-0 text-pretty text-g-body text-g-ink outline-none placeholder:text-g-ink-3 [field-sizing:content]"
      />
      <span className={gcn("col-start-2 justify-self-end g-num", over ? "text-g-crimson" : "text-g-ink-3")}>
        {count}/{max}
        {over ? <span className="sr-only">, over the limit</span> : null}
      </span>
    </div>
  );
}
