// Goal /admin/catalog-sync (D-048-p3-admin-money). Load and apply are copied
// verbatim from AdminCatalogSync.tsx, including the stale_plan reload and the
// typed-site confirmation. The ~40 inline hex colours of the legacy page do
// not survive here: status is dot+text with goal tokens (packet §4.2).
import { useEffect, useState } from "react";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { readApiJson } from "@/lib/apiResponse";
import { catalogSyncApplyResponseSchema, catalogSyncDryRunSchema, type CatalogSyncApplyResponse, type CatalogSyncDryRun } from "@shared/catalogSync";
import { AdminMoneyGoalFrame, AdminMoneyHeading } from "./AdminMoneyGoalFrame";
import { MONEY_GOAL_LINE, catalogCountLabel } from "./adminMoneyCopy";

export const GOAL_PAGE = { goalLine: MONEY_GOAL_LINE } as const;

const DRY_RUN_PATH = "/api/admin/billing/catalog-sync";
const APPLY_PATH = "/api/admin/billing/catalog-sync/apply";
const LOAD_FALLBACK = "We could not read the Chargebee catalog.";
const APPLY_FALLBACK = "We could not run the catalog sync.";

export default function GoalAdminCatalogSync() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
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

  useEffect(() => {
    if (isSignedIn) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const apply = async () => {
    // Same typed-site condition as AdminCatalogSync.tsx:289 (disabled button).
    if (!dryRun || typedSite !== dryRun.site) return;
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
      <AdminMoneyGoalFrame screen="admin-catalog-sync-sign-in" current="/admin/catalog-sync">
        <AdminMoneyHeading current="/admin/catalog-sync" />
        <GoalNextStep reason="Sign in with the designated administrator account before reading the catalog dry run.">
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminMoneyGoalFrame>
    );
  }

  const counts = dryRun ? Object.entries(dryRun.counts) : [];
  const ready = Boolean(dryRun) && typedSite === dryRun?.site;

  return (
    <AdminMoneyGoalFrame screen="admin-catalog-sync" current="/admin/catalog-sync">
      <AdminMoneyHeading current="/admin/catalog-sync" />
      {!dryRun ? (
        <GoalNextStep reason={error ? "The catalog did not answer. Reload the dry run before applying anything." : "Read the dry run first: it classifies the configured site against the sold catalog and changes nothing."}>
          <GoalButton variant="primary" className="mt-3" busy={loading} busyLabel="Reading the dry run…" onClick={() => { void load(); }}>{error ? "Reload the dry run" : "Read the dry run"}</GoalButton>
        </GoalNextStep>
      ) : null}
      {error ? <GoalErrorState className="mt-6" title={error} retry={{ label: "Try again", onClick: () => { void load(); } }} /> : null}
      {loading ? <GoalSkeletonRows density="queue" count={3} className="mt-6 py-3" /> : null}
      {!loading && !error && !dryRun ? <GoalEmptyState title="No dry run yet." body="A dry run classifies the configured site against the sold catalog. Nothing is changed by reading it." /> : null}
      {dryRun ? (
        <section aria-label="Catalog dry run" className="mt-6 border border-g-hairline bg-g-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-g-hairline p-4">
            <div>
              <h2 className="text-g-label text-g-ink">{dryRun.site}</h2>
              <p className="mt-1 text-g-meta text-g-ink-3">{dryRun.environment} · checked {new Date(dryRun.checkedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST</p>
            </div>
            <GoalStatus status={dryRun.mismatched.length || dryRun.blocked.length ? "expired" : "accepted"} label={dryRun.mismatched.length || dryRun.blocked.length ? "Needs a decision" : "Matches the catalog"} />
          </div>
          <ul className="grid gap-2 p-4">
            {counts.map(([key, value]) => (
              <li key={key} className="flex items-center justify-between gap-3 text-g-body">
                <span className="text-g-ink-2">{catalogCountLabel(key)}</span>
                <GoalStatus status={Number(value) > 0 ? "waiting" : "accepted"} label={String(value)} />
              </li>
            ))}
          </ul>
          <p className="border-t border-g-hairline p-4 text-g-meta text-g-ink-3">Plan {dryRun.planHash.slice(0, 12)}…</p>
        </section>
      ) : null}
      {report ? (
        <section role="status" className="mt-6 border border-g-hairline bg-g-surface p-4">
          <GoalStatus status={report.outcome === "applied" ? "accepted" : report.outcome === "failed" ? "expired" : "waiting"} label={`Sync ${report.outcome.replaceAll("_", " ")}`} />
          <p className="mt-2 text-g-meta text-g-ink-2">{report.created.length} created · {report.failed ? "the provider refused one object" : "no provider failure"}. Check the Chargebee dashboard before acting again.</p>
        </section>
      ) : null}
      {dryRun ? (
        <GoalNextStep reason="Apply the same plan you just read. Type the site exactly to confirm; nothing changes before that.">
          <label className="mt-3 block text-g-label text-g-ink">Type the site to confirm
            <input aria-label="Type the site to confirm" value={typedSite} onChange={event => setTypedSite(event.target.value)} placeholder={dryRun.site} className="mt-2 block w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink" />
          </label>
          {applyError ? <p role="alert" className="mt-3 text-g-meta text-g-crimson">{applyError}</p> : null}
          <GoalButton variant="primary" className="mt-4" busy={applying} busyLabel="Applying…" disabledReason={ready ? undefined : `Type ${dryRun.site} to confirm`} onClick={() => { void apply(); }}>Apply the catalog plan</GoalButton>
        </GoalNextStep>
      ) : null}
    </AdminMoneyGoalFrame>
  );
}
