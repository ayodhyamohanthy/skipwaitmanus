// Kit /ask eyebrow "NEW ASK · DESIGN". The function segment is where the
// seeker confirms or changes the ask's job function. Until they pick one it
// shows the shared classifier's guess from the job link, which is exactly what
// the server stores when nothing is sent; only an explicit pick is sent.
// The native select sits transparently over the visible label so the eyebrow
// keeps the label's exact width on every browser.
import { ChevronDown } from "lucide-react";
import { JOB_FUNCTIONS, parseJobFunction, type JobFunction } from "@shared/jobFunctions";

export function AskFunctionEyebrow({ value, onPick }: { value: JobFunction | null; onPick: (next: JobFunction) => void }) {
  return (
    <span className="eyebrow inline-flex flex-wrap items-center gap-x-1">
      <span>NEW ASK ·</span>
      <label className="relative inline-flex items-center gap-0.5 rounded-sm focus-within:ring-2 focus-within:ring-ring">
        <span aria-hidden="true">{value ?? "Choose a function"}</span>
        <ChevronDown aria-hidden="true" className="size-3" />
        <select
          aria-label="Job function"
          value={value ?? ""}
          onChange={event => { const next = parseJobFunction(event.target.value); if (next) onPick(next); }}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        >
          {value === null ? <option value="" disabled>Choose a function</option> : null}
          {JOB_FUNCTIONS.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </span>
  );
}
