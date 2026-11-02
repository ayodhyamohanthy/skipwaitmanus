// Goal /admin-review (D-048-p3-admin): "Decide what's waiting." The selected
// case's decision is the one commit. Guardrail 1 (D-048-admin.md §4): the
// decision keeps its exact server call, body, required reviewer note and
// audit trail - only the presentation changes. Case data comes from the
// read-only admin modules (adminApi.ts, reviewCases.ts).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearch } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalFilterChip } from "@/components/goal/GoalFilterChip";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { ADMIN_ACCESS_MESSAGE, AdminAccessError, adminKeys, adminRequest, adminRetry, companySuggestionsSchema, decisionResultSchema, loadEnrollments, safetyReportsSchema } from "@/components/admin/adminApi";
import { caseAge, companyCase, enrollmentCase, queueOrder, reportCase, type ReviewCase, statusLabel } from "@/components/admin/reviewCases";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";
import { AdminGoalFrame, AdminGoalHeading } from "./AdminGoalFrame";
import { ADMIN_REVIEW_TABS, adminTabFor, type AdminReviewTab, isAdminReviewTab } from "./adminGoalCopy";

export const GOAL_PAGE = { goalLine: "Decide what's waiting." } as const;
const BODY = "Pick a case, choose a decision and write the reviewer note. Every decision is recorded with its note in the case's audit trail.";
const KIND_LABEL: Record<ReviewCase["kind"], string> = { report: "Report", verification: "Verification", company: "Company" };

function CaseDetail({ item, choice, onChoice, note, onNote, deciding, error, onRecord }: { item: ReviewCase; choice: string; onChoice: (value: string) => void; note: string; onNote: (value: string) => void; deciding: boolean; error: string; onRecord: () => void }) {
  const missing = !choice ? "Choose a decision first." : !note.trim() ? "Write the reviewer note first." : undefined;
  return (
    <>
      <p className="text-g-meta text-g-ink-3">{`${KIND_LABEL[item.kind]} · ${item.ref} · opened ${caseAge(item.createdAt)} ago`}</p>
      <h2 className="mt-1 text-g-heading text-g-ink">{item.title}</h2>
      <p className="mt-1 text-g-meta text-g-ink-2">{item.sub}</p>
      {item.kind === "report" && !item.terminal && item.urgent ? <GoalStatus className="mt-2" status="expired" label="Urgent" /> : null}
      <h3 className="mt-6 text-g-label text-g-ink-2">Evidence</h3>
      <ul className="mt-2 grid gap-2">{item.evidence.map(line => <li key={line} className="border-l-2 border-g-hairline pl-3 text-g-body text-g-ink">{line}</li>)}</ul>
      {item.terminal ? (
        <section className="mt-6 border border-g-hairline p-4">
          <GoalStatus status="accepted" label={`Decision: ${statusLabel(item.status)}`} />
          <p className="mt-1 text-g-meta text-g-ink-2">{item.outcome}</p>
        </section>
      ) : (
        <div className="mt-6">
          <GoalNextStep reason="Choose one decision and say why. The note is required and saved with the decision.">
            <fieldset className="mt-3 grid gap-2" disabled={deciding}>
              <legend className="sr-only">Decision</legend>
              {item.decisions.map(decision => (
                <label key={decision.value} className={cn("flex cursor-pointer items-start gap-3 border p-3", choice === decision.value ? "border-g-ink" : "border-g-hairline", decision.danger ? "text-g-crimson" : "text-g-ink")}>
                  <input type="radio" name={`decision-${item.key}`} value={decision.value} checked={choice === decision.value} onChange={() => onChoice(decision.value)} className="mt-1 size-4 shrink-0 accent-g-ink" />
                  <span><span className="block text-g-label">{decision.label}</span><span className="block text-g-meta text-g-ink-2">{decision.detail}</span></span>
                </label>
              ))}
            </fieldset>
            <label className="mt-4 block text-g-label text-g-ink">Reviewer note (required)
              <textarea value={note} maxLength={500} onChange={event => onNote(event.target.value)} placeholder="Why this decision?" className="mt-2 block min-h-24 w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink" />
            </label>
            {error ? <p role="alert" className="mt-3 text-g-meta text-g-crimson">{error}</p> : null}
            <GoalButton variant="primary" className="mt-4" busy={deciding} busyLabel="Recording…" disabledReason={deciding ? undefined : missing} onClick={onRecord}>Record decision</GoalButton>
          </GoalNextStep>
        </div>
      )}
      <h3 className="mt-6 text-g-label text-g-ink-2">Audit trail</h3>
      <ol className="mt-2 grid gap-1 text-g-meta text-g-ink-3">{item.audit.map(line => <li key={line}>{line}</li>)}</ol>
    </>
  );
}

export default function GoalAdminReview() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const requestedTab = new URLSearchParams(useSearch()).get("tab");
  const [tab, setTab] = useState<AdminReviewTab>(isAdminReviewTab(requestedTab) ? requestedTab : "all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const reports = useQuery({ queryKey: adminKeys.reports, enabled: Boolean(isSignedIn), retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/safety-reports", safetyReportsSchema, fetchToken, "We could not load safety reports")).reports });
  const suggestions = useQuery({ queryKey: adminKeys.suggestions, enabled: Boolean(isSignedIn), retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/company-suggestions", companySuggestionsSchema, fetchToken, "We could not load company suggestions")).suggestions });
  const enrollments = useQuery({ queryKey: adminKeys.enrollments, enabled: Boolean(isSignedIn), retry: adminRetry, queryFn: () => loadEnrollments(fetchToken) });
  // Same call, body and invalidation as the kit console (AdminReview.tsx).
  const decide = useMutation({
    mutationFn: async ({ item, value, reason }: { item: ReviewCase; value: string; reason: string }) => {
      const path = item.kind === "report" ? `/api/admin/safety-reports/${item.id}/decision` : item.kind === "company" ? `/api/admin/company-suggestions/${item.id}/decision` : `/api/admin/approval-queue/referrer_enrollment/${item.id}/decision`;
      const body: Record<string, string> = item.kind === "verification" ? { decision: value, note: reason } : { status: value, note: reason };
      return adminRequest(path, decisionResultSchema, fetchToken, "We could not record this decision", body);
    },
    onSuccess: () => { setNote(""); setChoice(""); },
    onSettled: (_data, _error, { item }) => queryClient.invalidateQueries({ queryKey: item.kind === "report" ? adminKeys.reports : item.kind === "company" ? adminKeys.suggestions : adminKeys.enrollments }),
  });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-review-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with the designated administrator account. Queue contents are never shown to other accounts." />
        <GoalNextStep>
          <SignInButton>
            <GoalButton variant="primary" className="mt-3">Sign in</GoalButton>
          </SignInButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  const queries = [reports, suggestions, enrollments];
  if (queries.some(query => query.error instanceof AdminAccessError)) {
    return (
      <AdminGoalFrame screen="admin-review-forbidden" current="/admin-review">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Queue contents stay hidden without administrator access." />
        <section role="alert" className="border border-g-hairline bg-g-surface p-5">
          <p className="text-g-label text-g-ink">{ADMIN_ACCESS_MESSAGE}</p>
          <p className="mt-1 text-g-meta text-g-ink-2">Sign in with the designated administrator account.</p>
        </section>
      </AdminGoalFrame>
    );
  }

  const loading = queries.some(query => query.isLoading);
  const failed = queries.filter(query => query.error);
  const cases = [...queueOrder((reports.data ?? []).map(reportCase)), ...queueOrder((enrollments.data ?? []).map(enrollmentCase)), ...queueOrder((suggestions.data ?? []).map(companyCase))];
  const count = (id: AdminReviewTab) => id === "all" ? cases.length : cases.filter(item => adminTabFor(item.kind) === id).length;
  const list = tab === "all" ? cases : cases.filter(item => adminTabFor(item.kind) === tab);
  const current = list.find(item => item.key === selectedKey) ?? list[0];
  const reset = () => { setNote(""); setChoice(""); decide.reset(); };
  const record = () => {
    const reason = note.trim();
    if (!current || !choice || !reason || decide.isPending) return;
    setSelectedKey(current.key);
    decide.mutate({ item: current, value: choice, reason });
  };

  return (
    <AdminGoalFrame screen="admin-review" current="/admin-review">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
      <div className="grid gap-6 gdesk:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-label="Cases" className="min-w-0 border border-g-hairline bg-g-surface">
          <div role="group" aria-label="Review kinds" className="flex flex-wrap gap-2 border-b border-g-hairline p-3">
            {ADMIN_REVIEW_TABS.map(([id, label]) => (
              <GoalFilterChip key={id} label={label} count={count(id)} pressed={tab === id} onPressedChange={() => { setTab(id); reset(); }} />
            ))}
          </div>
          {loading ? <GoalSkeletonRows density="queue" count={3} className="py-3" /> : null}
          {failed.length ? <GoalErrorState title={failed.map(query => query.error?.message).filter(Boolean).join(" ")} retry={{ label: "Try again", onClick: () => { for (const query of failed) void query.refetch(); } }} /> : null}
          {!loading && !failed.length && list.length === 0 ? <GoalEmptyState title="Nothing to review right now." body="New reports, enrollments and company submissions appear here." /> : null}
          <ul>
            {list.map(item => (
              <li key={item.key} className="border-b border-g-hairline last:border-b-0">
                <button type="button" aria-current={current?.key === item.key || undefined} onClick={() => { setSelectedKey(item.key); reset(); }}
                  className={cn("block w-full px-4 py-3 text-left", current?.key === item.key ? "bg-g-surface-hover" : "hover:bg-g-surface-hover")}>
                  <span className="flex items-center justify-between gap-2">
                    {item.terminal ? <GoalStatus status="withdrawn" label={statusLabel(item.status)} /> : item.urgent ? <GoalStatus status="expired" label="Urgent" /> : <GoalStatus status="waiting" label={`${caseAge(item.createdAt)} waiting`} />}
                    <span className="text-g-meta text-g-ink-3">{item.ref}</span>
                  </span>
                  <span className="mt-1 block text-g-label text-g-ink">{item.title}</span>
                  <span className="block truncate text-g-meta text-g-ink-2">{item.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-live="polite" className="min-w-0 border border-g-hairline bg-g-surface p-5 gdesk:p-6">
          {current ? (
            <CaseDetail key={current.key} item={current} choice={choice} onChoice={setChoice} note={note} onNote={setNote} deciding={decide.isPending}
              error={decide.error && decide.variables?.item.key === current.key ? decide.error.message : ""} onRecord={record} />
          ) : (
            <p className="text-g-meta text-g-ink-2" aria-busy={loading || undefined}>{loading ? "Loading cases…" : failed.length ? "Some cases could not load." : "Nothing is selected."}</p>
          )}
        </section>
      </div>
    </AdminGoalFrame>
  );
}
