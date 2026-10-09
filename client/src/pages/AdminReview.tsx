import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3, Inbox, ShieldCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useSearch } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { AdminAccessError, ADMIN_ACCESS_MESSAGE, adminKeys, adminRequest, adminRetry, companySuggestionsSchema, decisionResultSchema, loadEnrollments, safetyReportsSchema } from "@/components/admin/adminApi";
import { ReviewCaseDetail } from "@/components/admin/ReviewCaseDetail";
import { caseAge, companyCase, enrollmentCase, queueOrder, reportCase, type ReviewCase, statusLabel } from "@/components/admin/reviewCases";
import { usePersistFn } from "@/hooks/usePersistFn";

const TABS = [["all", "All"], ["reports", "Reports"], ["verifications", "Verifications"], ["companies", "Companies"]] as const;
type Tab = (typeof TABS)[number][0];
const KIND_BY_TAB: Record<Exclude<Tab, "all">, ReviewCase["kind"]> = { reports: "report", verifications: "verification", companies: "company" };
const isTab = (value: string | null): value is Tab => TABS.some(([id]) => id === value);

function Frame({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-muted">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-foreground px-5 py-3 text-background"><span className="text-xs font-semibold tracking-widest">INTERNAL OPERATIONS · REVIEW QUEUE</span><Button variant="secondary" size="sm" asChild><Link href="/admin"><ArrowLeft />Admin overview</Link></Button></header>
    {children}
  </div>;
}

function GateCard({ screen, title = "Review queue.", body, children }: { screen: string; title?: string; body: string; children?: ReactNode }) {
  return <main data-skipwait-screen={screen} className="mx-auto max-w-xl p-5"><section className="rounded-3xl bg-background p-6" role={children ? undefined : "alert"}><span className="grid size-11 place-items-center rounded-2xl bg-muted"><ShieldCheck className="size-5" /></span><p className="eyebrow mt-4">INTERNAL OPERATIONS</p><h1 className="mt-2 text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{body}</p>{children}</section></main>;
}

export default function AdminReview() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const requestedTab = new URLSearchParams(useSearch()).get("tab");
  const [tab, setTab] = useState<Tab>(isTab(requestedTab) ? requestedTab : "all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const reports = useQuery({ queryKey: adminKeys.reports, enabled: isSignedIn, retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/safety-reports", safetyReportsSchema, fetchToken, "We could not load safety reports")).reports });
  const suggestions = useQuery({ queryKey: adminKeys.suggestions, enabled: isSignedIn, retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/company-suggestions", companySuggestionsSchema, fetchToken, "We could not load company suggestions")).suggestions });
  const enrollments = useQuery({ queryKey: adminKeys.enrollments, enabled: isSignedIn, retry: adminRetry, queryFn: () => loadEnrollments(fetchToken) });
  const decide = useMutation({
    mutationFn: async ({ item, value, reason }: { item: ReviewCase; value: string; reason: string }) => {
      const path = item.kind === "report" ? `/api/admin/safety-reports/${item.id}/decision` : item.kind === "company" ? `/api/admin/company-suggestions/${item.id}/decision` : `/api/admin/approval-queue/referrer_enrollment/${item.id}/decision`;
      const body: Record<string, string> = item.kind === "verification" ? { decision: value, note: reason } : { status: value, note: reason };
      return adminRequest(path, decisionResultSchema, fetchToken, "We could not record this decision", body);
    },
    onSuccess: () => setNote(""),
    onSettled: (_data, _error, { item }) => queryClient.invalidateQueries({ queryKey: item.kind === "report" ? adminKeys.reports : item.kind === "company" ? adminKeys.suggestions : adminKeys.enrollments }),
  });

  if (!isSignedIn) return <Frame><GateCard screen="admin-review-sign-in" body="Sign in with the designated administrator account."><SignInButton className={buttonVariants({ className: "mt-5 w-full" })}>Sign in</SignInButton></GateCard></Frame>;

  const queries = [reports, suggestions, enrollments];
  const forbidden = queries.some(query => query.error instanceof AdminAccessError);
  const loading = queries.some(query => query.isLoading);
  const errors = Array.from(new Set(queries.flatMap(query => query.error && !(query.error instanceof AdminAccessError) ? [query.error.message] : [])));
  const cases = [...queueOrder((reports.data ?? []).map(reportCase)), ...queueOrder((enrollments.data ?? []).map(enrollmentCase)), ...queueOrder((suggestions.data ?? []).map(companyCase))];
  const count = (id: Tab) => id === "all" ? cases.length : cases.filter(item => item.kind === KIND_BY_TAB[id]).length;
  const list = tab === "all" ? cases : cases.filter(item => item.kind === KIND_BY_TAB[tab]);
  const current = list.find(item => item.key === selectedKey) ?? list[0];
  const select = (key: string) => { setSelectedKey(key); setNote(""); decide.reset(); };

  if (forbidden) return <Frame><GateCard screen="admin-review-forbidden" title={ADMIN_ACCESS_MESSAGE} body="Queue contents stay hidden without administrator access. Sign in with the designated administrator account." /></Frame>;

  return <Frame>
    <div data-skipwait-screen="admin-review" className="mx-auto grid max-w-6xl gap-4 p-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="min-w-0 rounded-3xl bg-background p-3" aria-label="Cases">
        <div className="flex gap-1 overflow-x-auto p-1" role="tablist" aria-label="Review kinds">{TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setNote(""); decide.reset(); }} className={`min-h-9 shrink-0 rounded-full px-3 text-sm ${tab === id ? "bg-foreground text-background" : "text-muted-foreground"}`}>{label} <span className="opacity-60">{count(id)}</span></button>)}</div>
        {loading ? <div className="mt-2 space-y-1" aria-busy="true" aria-label="Loading the queue">{[0, 1, 2].map(index => <div key={index} className="h-[76px] animate-pulse rounded-2xl bg-muted" />)}</div> : null}
        {errors.length ? <p role="alert" className="p-4 text-sm font-semibold text-destructive">{errors.join(" ")} <button type="button" className="underline" onClick={() => { for (const query of queries) if (query.error) void query.refetch(); }}>Try again</button></p> : null}
        {!loading && !errors.length && list.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No cases here right now.</p> : null}
        <ul className="mt-2 space-y-1">{list.map(item => <li key={item.key}><button type="button" aria-current={current?.key === item.key || undefined} onClick={() => select(item.key)} className={`w-full rounded-2xl p-3 text-left ${current?.key === item.key ? "bg-muted" : "hover:bg-muted/60"}`}><div className="flex items-center justify-between gap-2 text-xs"><span className={`rounded-full px-2 py-0.5 font-semibold ${item.urgent ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}>{item.urgent ? "Urgent" : "Normal"}</span><span className="text-muted-foreground">{item.terminal ? <Check className="inline size-3.5" /> : <Clock3 className="inline size-3.5" />} {item.terminal ? statusLabel(item.status) : caseAge(item.createdAt)}</span></div><strong className="mt-1 block text-sm">{item.title}</strong><small className="text-muted-foreground">{item.ref} · {item.sub}</small></button></li>)}</ul>
      </section>
      <section className="min-w-0 rounded-3xl bg-background p-5 sm:p-6" aria-live="polite">
        {current ? <ReviewCaseDetail key={current.key} item={current} note={note} onNote={setNote} deciding={decide.isPending} error={decide.error && decide.variables?.item.key === current.key ? decide.error.message : ""} onDecide={value => { const reason = note.trim(); if (reason && !decide.isPending) { setSelectedKey(current.key); decide.mutate({ item: current, value, reason }); } }} />
          : <div className="flex flex-wrap items-start gap-3" aria-busy={loading || undefined}><span className="grid size-11 place-items-center rounded-2xl bg-muted"><Inbox className="size-5" /></span><div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold">{loading ? "Loading cases…" : errors.length ? "Some cases could not load." : "Nothing to review right now."}</h1><p className="text-sm text-muted-foreground">New reports, enrollments, and company submissions appear here.</p></div></div>}
      </section>
    </div>
  </Frame>;
}
