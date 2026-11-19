import { useState } from "react";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalErrorState } from "@/components/goal/GoalStates";
import { GoalNum } from "@/components/goal/GoalNum";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { abandonedCheckoutResultSchema, responseError, type AbandonedCheckoutResult } from "./adminMoneyCheckContracts";

const PATH = "/api/admin/money-check/close-abandoned";

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }) : "Not available";
}

export function GoalAbandonedCheckoutPanel({ onNeedsSignIn }: { onNeedsSignIn(): void }) {
  const [plan, setPlan] = useState<AbandonedCheckoutResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const closeAbandoned = async (apply: boolean) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(PATH, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        onNeedsSignIn();
        return;
      }
      if (!response.ok) {
        setError(responseError(payload, "We could not check abandoned checkouts."));
        return;
      }
      const parsed = abandonedCheckoutResultSchema.safeParse(payload);
      if (!parsed.success) {
        setError("The abandoned-checkout result could not be read. Nothing was reported as closed.");
        return;
      }
      setPlan(parsed.data);
    } catch {
      setError("We could not check abandoned checkouts. The result is unconfirmed; read it again before another action.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-label="Abandoned checkout pages" className="mt-6 border-t border-g-hairline pt-5">
      <h2 className="text-g-heading text-g-ink">Abandoned checkout pages</h2>
      <p className="mt-2 max-w-3xl text-g-meta text-g-ink-2">A preview reads pending checkout pages older than 7 days. Closing adds a note only; it does not delete a payment or change money, and a later confirmed payment is still credited.</p>
      <div className="mt-4">
        <GoalButton variant="outline" busy={loading} busyLabel="Reading the preview…" onClick={() => { void closeAbandoned(false); }}>Preview what would close</GoalButton>
      </div>
      {error ? <GoalErrorState className="mt-3 border border-g-hairline" title={error} retry={{ label: "Read the preview again", onClick: () => { void closeAbandoned(false); } }} /> : null}
      {plan ? (
        <section aria-label="Abandoned checkout preview" className="mt-4 border border-g-hairline bg-g-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-g-label text-g-ink">{plan.applied ? "Close result" : "Preview result"}</h3>
            <GoalStatus status={plan.applied ? "accepted" : plan.candidates > 0 ? "waiting" : "withdrawn"} label={plan.applied ? "Notes recorded" : plan.candidates > 0 ? "Preview only" : "Nothing to close"} />
          </div>
          <p className="mt-2 text-g-meta text-g-ink-2">
            {plan.applied
              ? `Closed ${plan.closed} checkout pages. No rows were deleted and no money moved.`
              : `${plan.candidates} checkout pages across ${plan.accounts} accounts would be marked. Nothing has been changed.`}
          </p>
          <p className="mt-2 text-g-meta text-g-ink-3">Oldest: {date(plan.oldest)} · newest: {date(plan.newest)} · cutoff: {date(plan.cutoff)}</p>
          {plan.byCurrency.length ? (
            <ul className="mt-3 grid gap-1 text-g-meta text-g-ink-2">
              {plan.byCurrency.map(row => <li key={row.currency}>{row.currency}: <GoalNum>{row.count}</GoalNum></li>)}
            </ul>
          ) : null}
          {!plan.applied && plan.candidates > 0 ? (
            <div className="mt-4 border-t border-g-hairline pt-3">
              <p className="text-g-meta text-g-ink-2">This second action marks the previewed pending rows. It does not delete them or change a wallet.</p>
              <GoalButton className="mt-3" variant="outline" busy={loading} busyLabel="Recording notes…" onClick={() => { void closeAbandoned(true); }}>Close these {plan.candidates} pages</GoalButton>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
