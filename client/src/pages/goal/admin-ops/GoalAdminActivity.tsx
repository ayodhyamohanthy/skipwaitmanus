// Goal /admin/activity (D-048-p3-admin-ops; ADMIN-activity-log, D-393): "Diagnose the referral journey."
// The search is the one next step: free text, a person (account id or email: an email also finds sign-in
// attempts made with it when no account has it), the kind of event, the outcome and a date range. The log pages
// back 250 events at a time, the filtered range exports as CSV, and a person filter also shows that person's
// referral-request history. `?person=` opens the page on one person (the users list links here).
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ACTIVITY_FAMILIES, ACTIVITY_FAMILY_LABELS } from "@shared/adminActivity";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { usePersistFn } from "@/hooks/usePersistFn";
import { ActivityTable } from "./ActivityTable";
import { exportActivity, loadActivity, type ActivityQuery } from "./adminOpsApi";
import { PersonRequestHistory } from "./PersonRequestHistory";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";

export const GOAL_PAGE = { goalLine: "Diagnose the referral journey." } as const;
const BODY = "Every sign-in, sign-in attempt and material workflow request is recorded with minimized metadata. Sign-in rows keep a masked email, a shortened network address and the device type for 90 days. No document contents or names, target URLs, OTPs, passwords, session tokens, referral text, invite codes, or payment credentials are stored.";

const OUTCOMES = [
  { value: "", label: "All outcomes" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "denied", label: "Denied" },
] as const;
const CONTROL = "mt-1.5 block h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink";
const BLANK: Required<ActivityQuery> = { query: "", outcome: "", person: "", family: "", from: "", to: "" };

function personFromUrl(): string {
  try { return (new URLSearchParams(window.location.search).get("person") ?? "").trim().slice(0, 320); } catch { return ""; }
}

function saveBlob(blob: Blob, name: string) {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function GoalAdminActivity() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [draft, setDraft] = useState<Required<ActivityQuery>>(() => ({ ...BLANK, person: personFromUrl() }));
  const [applied, setApplied] = useState<Required<ActivityQuery>>(draft);
  const [exporting, setExporting] = useState<"idle" | "busy" | "failed">("idle");
  const events = useInfiniteQuery({
    queryKey: ["admin-activity", applied],
    enabled: Boolean(isSignedIn),
    retry: false,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => loadActivity(fetchToken, applied, pageParam),
    getNextPageParam: last => last.nextBefore ?? undefined,
  });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-activity-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with an administrator account to view privacy-safe operational diagnostics." />
        <GoalNextStep>
          {/* SignInButton renders its own <button>; wrapping GoalButton in it nests buttons. */}
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  const set = (key: keyof ActivityQuery) => (event: { target: { value: string } }) => setDraft(current => ({ ...current, [key]: event.target.value }));
  const apply = (next: Required<ActivityQuery>) => { setDraft(next); setApplied({ ...next, query: next.query.trim(), person: next.person.trim() }); };
  const follow = (person: string) => apply({ ...BLANK, person });
  const loading = events.isPending || (events.isFetching && !events.isFetchingNextPage);
  const list = events.data?.pages.flatMap(page => page.events) ?? [];
  const download = async () => {
    setExporting("busy");
    try { saveBlob(await exportActivity(fetchToken, applied), `skipwait-activity-${new Date().toISOString().slice(0, 10)}.csv`); setExporting("idle"); } catch { setExporting("failed"); }
  };

  return (
    <AdminGoalFrame screen="admin-activity">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
      <GoalNextStep reason="Find what happened: search the events, or follow one person by account id or email.">
        <form className="mt-3 grid gap-3 gdesk:grid-cols-2" onSubmit={event => { event.preventDefault(); apply(draft); }}>
          <label className="block text-g-label text-g-ink">Search activity
            <input value={draft.query} onChange={set("query")} placeholder="Search actor, action, company, or resource" className={CONTROL} />
          </label>
          <label className="block text-g-label text-g-ink">Person
            <input value={draft.person} onChange={set("person")} placeholder="Account id or email" autoComplete="off" className={CONTROL} />
          </label>
          <div className="grid gap-3 gdesk:col-span-2 gdesk:grid-cols-[repeat(4,minmax(0,1fr))_auto] gdesk:items-end">
            <label className="block text-g-label text-g-ink">Kind
              <select value={draft.family} onChange={set("family")} className={CONTROL}>
                <option value="">All kinds</option>
                {ACTIVITY_FAMILIES.map(family => <option key={family} value={family}>{ACTIVITY_FAMILY_LABELS[family]}</option>)}
              </select>
            </label>
            <label className="block text-g-label text-g-ink">Outcome
              <select value={draft.outcome} onChange={set("outcome")} className={CONTROL}>
                {OUTCOMES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block text-g-label text-g-ink">From
              <input type="date" value={draft.from} onChange={set("from")} className={CONTROL} />
            </label>
            <label className="block text-g-label text-g-ink">To
              <input type="date" value={draft.to} onChange={set("to")} className={CONTROL} />
            </label>
            <GoalButton variant="primary" type="submit" busy={loading} busyLabel="Searching…">Search</GoalButton>
          </div>
        </form>
      </GoalNextStep>

      <section aria-label="Operational activity" className="mt-6 border border-g-hairline bg-g-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-g-hairline px-4 py-3">
          <p className="text-g-meta text-g-ink-3">{applied.person ? `Activity for ${applied.person}` : "Most recent events"}{list.length ? ` · ${list.length} shown` : ""}</p>
          <div className="flex items-center gap-3">
            {exporting === "failed" ? <span role="alert" className="text-g-meta text-g-crimson">The export failed. Try again.</span> : null}
            <GoalButton variant="outline" busy={exporting === "busy"} busyLabel="Exporting…" onClick={() => void download()} disabledReason={list.length ? undefined : "There are no events to export for this search."}>Export CSV</GoalButton>
          </div>
        </div>
        {events.error ? (
          <GoalErrorState title={events.error.message} body="Nothing is shown as clear while the event list failed to load." retry={{ label: "Try again", onClick: () => void events.refetch() }} />
        ) : loading ? (
          <GoalSkeletonRows density="queue" count={4} className="py-4" />
        ) : list.length === 0 ? (
          <GoalEmptyState title="No matching operational activity yet." body="Widen the search or choose another outcome." />
        ) : (
          <>
            <ActivityTable events={list} onFollow={follow} />
            {events.hasNextPage ? (
              <div className="border-t border-g-hairline px-4 py-3">
                <GoalButton variant="outline" busy={events.isFetchingNextPage} busyLabel="Loading…" onClick={() => void events.fetchNextPage()}>Load older events</GoalButton>
              </div>
            ) : null}
          </>
        )}
      </section>

      {applied.person ? <PersonRequestHistory person={applied.person} getToken={fetchToken} /> : null}
    </AdminGoalFrame>
  );
}
