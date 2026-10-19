import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import React, { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { AdminNav } from "@/components/AdminNav";
import { Brand } from "@/components/Brand";
import { compactDate, formatAmount } from "@/components/admin/paymentReviewCopy";
import { readApiJson } from "@/lib/apiResponse";
import {
  catalogSyncApplyResponseSchema,
  catalogSyncDryRunSchema,
  type CatalogSyncAction,
  type CatalogSyncApplyResponse,
  type CatalogSyncDryRun,
} from "@shared/catalogSync";

const DRY_RUN_PATH = "/api/admin/billing/catalog-sync";
const APPLY_PATH = "/api/admin/billing/catalog-sync/apply";
const LOAD_FALLBACK = "We could not read the Chargebee catalog.";
const APPLY_FALLBACK = "We could not run the catalog sync.";

const ACTION_LABEL: Record<CatalogSyncAction["kind"], string> = {
  item_family: "Product family",
  item: "Item",
  item_price: "Price",
};

const OUTCOME_COPY: Record<CatalogSyncApplyResponse["outcome"], string> = {
  applied: "Applied. Everything the dry run listed was created.",
  partial: "Stopped partway. Read what was created, what failed and what was left alone.",
  failed: "Nothing was created. Read the failure before trying again.",
  nothing_to_do: "Nothing to do. Every sold price already matches the catalog.",
};

function actionDetail(action: CatalogSyncAction): string {
  if (action.kind === "item_family") return action.params.name;
  if (action.kind === "item") return `${action.params.type === "plan" ? "Plan" : "Charge"} item`;
  return `${formatAmount(action.params.price, action.params.currencyCode)} · ${action.params.itemType === "plan" ? "plan" : "one-time charge"}`;
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#505050]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-black">{value}</p>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children?: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-[#e5e5e5] bg-white p-5">
      <h2 className="text-base font-semibold text-black">{title}</h2>
      {children ?? <p className="mt-2 text-sm text-[#505050]">{empty}</p>}
    </section>
  );
}

export default function AdminCatalogSync() {
  const { isSignedIn, getToken } = useAuth();
  const [dryRun, setDryRun] = useState<CatalogSyncDryRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [typedSite, setTypedSite] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [report, setReport] = useState<CatalogSyncApplyResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    setApplyError("");
    try {
      const token = await getToken();
      const response = await fetch(DRY_RUN_PATH, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" });
      const payload = await readApiJson<Record<string, unknown>>(response, LOAD_FALLBACK);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : LOAD_FALLBACK);
      const parsed = catalogSyncDryRunSchema.safeParse(payload);
      if (!parsed.success) throw new Error("The catalog answer was not readable. Nothing was changed.");
      setDryRun(parsed.data);
      setReport(null);
      setTypedSite("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : LOAD_FALLBACK);
    } finally {
      setLoading(false);
    }
  };

  // Same shape as AdminPaymentsReview: load once when sign-in settles, and again on demand.
  useEffect(() => {
    if (isSignedIn) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const apply = async () => {
    if (!dryRun) return;
    setApplying(true);
    setApplyError("");
    try {
      const token = await getToken();
      const response = await fetch(APPLY_PATH, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planHash: dryRun.planHash, confirmSite: typedSite }),
      });
      const payload = await readApiJson<Record<string, unknown>>(response, APPLY_FALLBACK);
      if (!response.ok) {
        setApplyError(typeof payload.error === "string" ? payload.error : APPLY_FALLBACK);
        // A changed catalog is not an error to retry blindly: show the new dry run.
        if (payload.code === "stale_plan") void load();
        return;
      }
      const parsed = catalogSyncApplyResponseSchema.safeParse(payload);
      if (!parsed.success) {
        setApplyError("The apply report was not readable. Check the Chargebee dashboard before trying again.");
        return;
      }
      setReport(parsed.data);
    } catch (applyFailure) {
      setApplyError(applyFailure instanceof Error ? applyFailure.message : APPLY_FALLBACK);
    } finally {
      setApplying(false);
    }
  };

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-white px-6 py-6 text-black">
        <div className="mx-auto max-w-xl">
          <Brand />
          <section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8">
            <ShieldCheck className="h-7 w-7 text-black" />
            <h1 className="mt-4 text-2xl font-semibold">Chargebee catalog sync</h1>
            <p className="mt-2 text-sm leading-6 text-[#505050]">Sign in with an administrator account to read the catalog and create the prices SkipWait sells.</p>
            <SignInButton>
              <button type="button" className="mt-5 rounded-lg bg-[#141414] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button>
            </SignInButton>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-5 py-6 text-black sm:px-6">
      <div className="mx-auto max-w-5xl">
        <AdminNav current="catalog" badge="Administrator diagnostics" />
        <section className="mt-10 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-black">Chargebee catalog</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Create the prices the catalog sells.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#505050]">
            The dry run only reads. Applying creates what is missing, in order, and never changes, archives or deletes anything. It never touches subscriptions, customers, invoices or payments.
          </p>

          {error ? (
            <div className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-[#b45309]/30 bg-[#b45309]/10 p-4 text-sm text-[#B45309]">
              <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p role="alert">{error}</p></span>
              <button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[#b45309]/30 bg-white px-4 py-2 text-xs font-bold text-[#B45309]">Retry</button>
            </div>
          ) : null}

          {loading && !dryRun ? (
            <p className="mt-8 flex items-center gap-2 text-sm text-[#505050]" data-testid="catalog-loading"><LoaderCircle className="h-4 w-4 animate-spin" />Reading the Chargebee catalog…</p>
          ) : null}
        </section>

        {dryRun ? (
          <>
            <section className="mt-6 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    data-testid="catalog-environment"
                    className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-bold ${dryRun.environment === "live" ? "border border-[#B91C1C]/40 bg-[#B91C1C]/10 text-[#B91C1C]" : "border border-[#B45309]/40 bg-[#B45309]/10 text-[#B45309]"}`}
                  >
                    {dryRun.environment === "live" ? "LIVE" : "TEST"}
                  </span>
                  <p className="text-sm font-semibold text-black" data-testid="catalog-site">Site {dryRun.site}</p>
                </div>
                <p className="text-xs text-[#505050]">Read {compactDate(dryRun.checkedAt)}</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <Count label="Sold prices" value={dryRun.counts.desired} />
                <Count label="Correct" value={dryRun.counts.correct} />
                <Count label="To create" value={dryRun.counts.toCreate} />
                <Count label="Mismatched" value={dryRun.counts.mismatched} />
                <Count label="Blocked" value={dryRun.counts.blocked} />
                <Count label="Extras" value={dryRun.counts.extras} />
                <Count label="Excluded" value={dryRun.counts.excluded} />
              </div>
            </section>

            <Section title={`To create (${dryRun.counts.toCreate})`} empty="Nothing to create. Every sold price already matches the catalog.">
              {dryRun.toCreate.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {dryRun.toCreate.map(action => (
                    <li key={`${action.kind}:${action.params.id}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm">
                      <span className="font-semibold text-black">{action.params.id}</span>
                      <span className="text-xs text-[#505050]">{ACTION_LABEL[action.kind]} · {actionDetail(action)}</span>
                    </li>
                  ))}
                </ul>
              ) : undefined}
            </Section>

            <Section title={`Mismatched — fix these in Chargebee (${dryRun.counts.mismatched})`} empty="No existing price differs from the catalog.">
              {dryRun.mismatched.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {dryRun.mismatched.map(entry => (
                    <li key={entry.itemPriceId} className="rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-black">{entry.itemPriceId}</span>
                        <span className="text-xs text-[#505050]">{formatAmount(entry.price, entry.currencyCode)} · {entry.sellableNow ? "Still sells" : "Does not sell"}</span>
                      </div>
                      <ul className="mt-1 grid gap-0.5 text-xs text-[#505050]">
                        {entry.diffs.map(diff => <li key={diff.field}>{diff.field}: expected {String(diff.expected)} → Chargebee has {String(diff.actual)}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : undefined}
            </Section>

            <Section title={`Blocked (${dryRun.counts.blocked})`} empty="Nothing is blocked.">
              {dryRun.blocked.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {dryRun.blocked.map(entry => (
                    <li key={entry.itemPriceId} className="rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm">
                      <p className="font-semibold text-black">{entry.itemPriceId}</p>
                      <p className="mt-0.5 text-xs text-[#505050]">{entry.reason}</p>
                    </li>
                  ))}
                </ul>
              ) : undefined}
            </Section>

            <Section title={`Extras — left alone (${dryRun.counts.extras})`} empty="No other SkipWait objects on this site.">
              {dryRun.extras.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {dryRun.extras.map(extra => (
                    <li key={`${extra.kind}:${extra.id}`} className="rounded-lg border border-[#e5e5e5] px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-black">{extra.id}</span>
                        <span className="text-xs text-[#505050]">{extra.kind === "item" ? "Item" : "Price"} · {extra.status}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-[#505050]">{extra.note}</p>
                    </li>
                  ))}
                </ul>
              ) : undefined}
            </Section>

            <Section title={`Excluded — never created (${dryRun.counts.excluded})`} empty="Nothing is excluded.">
              {dryRun.excluded.length > 0 ? (
                <ul className="mt-3 grid gap-1 text-xs text-[#505050]">
                  {dryRun.excluded.map(entry => <li key={entry.itemPriceId}><span className="font-semibold text-black">{entry.itemPriceId}</span> · {entry.reason}</li>)}
                </ul>
              ) : undefined}
            </Section>

            {dryRun.toCreate.length > 0 ? (
              <section className="mt-6 rounded-2xl border border-[#141414] bg-white p-5 sm:p-6">
                <h2 className="text-base font-semibold text-black">Apply this plan</h2>
                <p className="mt-1 text-sm leading-6 text-[#505050]">
                  This creates {dryRun.counts.toCreate} objects on the {dryRun.environment === "live" ? "live" : "test"} site <span className="font-semibold text-black">{dryRun.site}</span>. It cannot change an existing price: a mismatch stays reported and is fixed in Chargebee.
                </p>
                <label htmlFor="catalog-confirm" className="mt-4 block text-xs font-bold uppercase tracking-[.12em] text-[#505050]">Type the site name to confirm</label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="catalog-confirm"
                    data-testid="catalog-confirm"
                    value={typedSite}
                    onChange={event => setTypedSite(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={dryRun.site}
                    className="min-h-11 flex-1 rounded-lg border border-[#cfcfcf] bg-white px-3 py-2 text-sm text-black"
                  />
                  <button
                    type="button"
                    data-testid="catalog-apply"
                    disabled={applying || typedSite !== dryRun.site}
                    onClick={() => void apply()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#141414] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {applying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{applying ? "Applying…" : "Apply these changes"}
                  </button>
                </div>
                {applyError ? <p role="alert" className="mt-3 rounded-lg border border-[#b45309]/30 bg-[#b45309]/10 px-3 py-2 text-sm text-[#B45309]">{applyError}</p> : null}
              </section>
            ) : null}

            {report ? (
              <section className="mt-6 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-6" data-testid="catalog-report">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-black" />
                  <div>
                    <h2 className="text-base font-semibold text-black">{OUTCOME_COPY[report.outcome]}</h2>
                    <p className="mt-1 text-sm text-[#505050]">{report.created.length} created · {report.notAttempted.length} not attempted</p>
                  </div>
                </div>
                {report.created.length > 0 ? (
                  <ul className="mt-3 grid gap-1 text-sm">
                    {report.created.map(entry => (
                      <li key={`${entry.kind}:${entry.id}`} className="rounded-lg border border-[#e5e5e5] px-3 py-2">
                        <span className="font-semibold text-black">{entry.id}</span>
                        <span className="ml-2 text-xs text-[#505050]">created</span>
                        {entry.diffs.length > 0 ? <p className="mt-1 text-xs text-[#B45309]">Chargebee answered differently: {entry.diffs.map(diff => `${diff.field} expected ${String(diff.expected)}, got ${String(diff.actual)}`).join("; ")}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {report.failed ? (
                  <div className="mt-3 rounded-lg border border-[#B91C1C]/30 bg-[#B91C1C]/10 px-3 py-2 text-sm text-[#B91C1C]">
                    <p className="font-semibold">{report.failed.id} was refused.</p>
                    <p className="mt-0.5 text-xs">{report.failed.message}</p>
                  </div>
                ) : null}
                {report.notAttempted.length > 0 ? (
                  <p className="mt-3 text-xs text-[#505050]">Not attempted: {report.notAttempted.map(entry => entry.id).join(", ")}</p>
                ) : null}
                <button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#cfcfcf] bg-white px-4 py-2 text-sm font-bold text-black">
                  <RefreshCw className="h-4 w-4" />Run the dry run again
                </button>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
