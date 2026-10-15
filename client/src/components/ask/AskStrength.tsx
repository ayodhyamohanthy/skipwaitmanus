// Ask strength panel, ported from the kit's /ask aside (app/src/routes/ask.tsx).
// Checks are computed only from what the seeker actually entered; the kit's
// pinned-work and role-location checks have no live primitive behind them, so
// the live checks are the four the send path can honour.
import { Check, Circle } from "lucide-react";
import { Panel } from "@/components/kit/preview-kit";

export { askChecks, countWords, type AskCheck } from "@shared/askQuality";
import type { AskCheck } from "@shared/askQuality";

export function AskStrength({ checks }: { checks: readonly AskCheck[] }) {
  const score = checks.filter(check => check.ok).length;
  const strong = score === checks.length;
  const strength = strong ? "Strong" : score >= 2 ? "Good start" : "Needs work";
  return (
    <Panel>
      <div className="flex items-center justify-between"><span className="eyebrow">ASK STRENGTH</span><strong className={strong ? "text-primary" : ""}>{strength}</strong></div>
      <div className="mt-3 flex gap-1" aria-hidden="true">{checks.map((check, index) => <span key={check.label} className={`h-2 flex-1 rounded-full ${index < score ? "bg-primary" : "bg-muted"}`} />)}</div>
      <ul className="mt-4 space-y-3">
        {checks.map(check => (
          <li key={check.label} className="flex gap-2 text-sm">
            {check.ok ? <Check className="size-4 shrink-0 text-primary" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
            <span><strong className="block">{check.label}</strong>{!check.ok ? <small className="text-muted-foreground">{check.hint}</small> : null}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
