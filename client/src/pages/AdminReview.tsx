import { AlertTriangle, Building2, Check, Clock3, FileText, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type Report = { id: number; reason: string; details: string | null; referralRequestId: number | null; reportedUserId: number | null; urgent: boolean; status: string; createdAt: string };
type Suggestion = { id: number; companyName: string; website: string | null; role: string; status: string; createdAt: string };
type Tab = "all" | "reports" | "companies";

const REPORT_DECISIONS = [["under_review", "Mark under review"], ["resolved", "Resolve with action"], ["dismissed", "Dismiss, no violation"]] as const;
const COMPANY_DECISIONS = [["under_review", "Mark under review"], ["approved", "Approve for listing"], ["dismissed", "Dismiss"]] as const;

export default function AdminReview() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [tab, setTab] = useState<Tab>("all");
  const [reports, setReports] = useState<Report[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<{ kind: "report" | "company"; id: number } | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [deciding, setDeciding] = useState(false);

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setForbidden(false);
    try {
      const token = await fetchToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [reportsResponse, suggestionsResponse] = await Promise.all([
        fetch("/api/admin/safety-reports", { credentials: "include", headers }),
        fetch("/api/admin/company-suggestions", { credentials: "include", headers }),
      ]);
      if (reportsResponse.status === 403 || suggestionsResponse.status === 403) { setForbidden(true); return; }
      const reportsPayload = await readApiJson<{ reports?: Report[] }>(reportsResponse, "We could not load safety reports");
      const suggestionsPayload = await readApiJson<{ suggestions?: Suggestion[] }>(suggestionsResponse, "We could not load company suggestions");
      if (!reportsResponse.ok || !suggestionsResponse.ok) throw new Error("We could not load the review queue");
      setReports(Array.isArray(reportsPayload.reports) ? reportsPayload.reports : []);
      setSuggestions(Array.isArray(suggestionsPayload.suggestions) ? suggestionsPayload.suggestions : []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load the review queue"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [fetchToken, isSignedIn]);

  const decide = async (status: string) => {
    if (!selected || !note.trim() || deciding) return;
    setDeciding(true); setError("");
    try {
      const token = await fetchToken();
      const path = selected.kind === "report" ? `/api/admin/safety-reports/${selected.id}/decision` : `/api/admin/company-suggestions/${selected.id}/decision`;
      const response = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ status, note: note.trim() }) });
      const payload = await readApiJson<{ error?: string }>(response, "We could not record this decision");
      if (!response.ok) throw new Error(payload.error || "We could not record this decision");
      setNote("");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not record this decision"); }
    finally { setDeciding(false); }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="admin-review-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Internal operations</p>
        <h1 className="mt-2 text-3xl font-semibold">Review queue.</h1>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  const current = selected?.kind === "report" ? reports.find(item => item.id === selected.id) : suggestions.find(item => item.id === selected?.id);
  const decisions = selected?.kind === "company" ? COMPANY_DECISIONS : REPORT_DECISIONS;
  const terminal = current && (current.status === "resolved" || current.status === "dismissed" || current.status === "approved");

  return (
    <div data-skipwait-screen="admin-review" className="min-h-screen bg-[var(--muted)]">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-[var(--foreground)] px-5 py-3 text-[var(--background)]">
        <span className="text-xs font-semibold tracking-widest">INTERNAL OPERATIONS · REVIEW QUEUE</span>
        <Link href="/admin" className="rounded-lg bg-[var(--background)] px-3 py-2 text-xs font-bold text-[var(--foreground)]">Admin overview</Link>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 p-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-3xl bg-[var(--background)] p-3">
          <div className="flex gap-1 overflow-x-auto p-1" role="tablist" aria-label="Review kinds">
            {(["all", "reports", "companies"] as const).map(value => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`min-h-9 shrink-0 rounded-full px-3 text-sm ${tab === value ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground)]"}`}>
                {value === "all" ? `All ${reports.length + suggestions.length}` : value === "reports" ? `Reports ${reports.length}` : `Companies ${suggestions.length}`}
              </button>
            ))}
          </div>
          {loading ? <p className="p-4 text-sm text-[var(--muted-foreground)]">Loading the queue…</p> : null}
          {forbidden ? <p role="alert" className="p-4 text-sm font-semibold">Administrator access is required.</p> : null}
          {error ? <p role="alert" className="p-4 text-sm font-semibold text-[var(--destructive)]">{error} <button type="button" className="underline" onClick={() => { void load(); }}>Try again</button></p> : null}
          <ul className="mt-2 space-y-1">
            {(tab === "all" || tab === "reports") && reports.map(item => (
              <li key={`r-${item.id}`}>
                <button type="button" onClick={() => { setSelected({ kind: "report", id: item.id }); setNote(""); }} className={`w-full rounded-2xl p-3 text-left ${selected?.kind === "report" && selected.id === item.id ? "bg-[var(--muted)]" : ""}`}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${item.urgent ? "bg-[var(--destructive)] text-[var(--destructive-foreground)]" : "bg-[var(--muted)]"}`}>{item.urgent ? "Urgent" : item.status}</span>
                    <span className="text-[var(--muted-foreground)]">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  <strong className="mt-1 block text-sm">{item.reason}</strong>
                  <small className="text-[var(--muted-foreground)]">R-{1000 + item.id}</small>
                </button>
              </li>
            ))}
            {(tab === "all" || tab === "companies") && suggestions.map(item => (
              <li key={`c-${item.id}`}>
                <button type="button" onClick={() => { setSelected({ kind: "company", id: item.id }); setNote(""); }} className={`w-full rounded-2xl p-3 text-left ${selected?.kind === "company" && selected.id === item.id ? "bg-[var(--muted)]" : ""}`}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 font-semibold">{item.status}</span>
                    <span className="text-[var(--muted-foreground)]">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                  <strong className="mt-1 block text-sm">{item.companyName}</strong>
                  <small className="text-[var(--muted-foreground)]">Suggested company · {item.role}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="min-w-0 rounded-3xl bg-[var(--background)] p-5 sm:p-6" aria-live="polite">
          {!current ? <p className="text-sm text-[var(--muted-foreground)]">Select a case to review its evidence and record a decision.</p> : selected?.kind === "report" ? (
            <ReportDetail item={reports.find(item => item.id === selected.id)!} note={note} setNote={setNote} deciding={deciding} terminal={Boolean(terminal)} onDecide={status => { void decide(status); }} />
          ) : (
            <CompanyDetail item={suggestions.find(item => item.id === selected!.id)!} note={note} setNote={setNote} deciding={deciding} terminal={Boolean(terminal)} onDecide={status => { void decide(status); }} />
          )}
        </section>
      </div>
    </div>
  );
}

function ReportDetail({ item, note, setNote, deciding, terminal, onDecide }: { item: { id: number; reason: string; details: string | null; referralRequestId: number | null; reportedUserId: number | null; urgent: boolean; status: string; createdAt: string }; note: string; setNote: (value: string) => void; deciding: boolean; terminal: boolean; onDecide: (status: string) => void }) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[var(--muted)]"><ShieldAlert className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <span className="text-xs text-[var(--muted-foreground)]">REPORT · R-{1000 + item.id} · opened {new Date(item.createdAt).toLocaleDateString()}</span>
          <h1 className="text-2xl font-semibold">{item.reason}</h1>
        </div>
        {item.urgent ? <span className="flex items-center gap-1 text-sm font-semibold text-[var(--destructive)]"><AlertTriangle className="size-4" />SLA 4h</span> : <span className="flex items-center gap-1 text-sm text-[var(--muted-foreground)]"><Clock3 className="size-4" />SLA 48h</span>}
      </div>
      <h2 className="mt-6 text-sm font-semibold">Evidence</h2>
      <ul className="mt-2 space-y-2">
        {item.details ? <li className="flex gap-2 rounded-xl bg-[var(--muted)] p-3 text-sm"><FileText className="size-4 shrink-0" />{item.details}</li> : <li className="rounded-xl bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">No written details — reason only.</li>}
        {item.referralRequestId ? <li className="flex gap-2 rounded-xl bg-[var(--muted)] p-3 text-sm"><FileText className="size-4 shrink-0" />Linked referral request #{item.referralRequestId}</li> : null}
        {item.reportedUserId ? <li className="flex gap-2 rounded-xl bg-[var(--muted)] p-3 text-sm"><FileText className="size-4 shrink-0" />Reported account #{item.reportedUserId}</li> : null}
      </ul>
      {terminal ? (
        <div className="mt-6 rounded-2xl bg-[var(--accent)] p-4"><strong className="flex items-center gap-2"><Check className="size-4" />Decision: {item.status}</strong><p className="mt-1 text-sm">Reporter notified. Appeal within 14 days via support.</p></div>
      ) : (
        <>
          <h2 className="mt-6 text-sm font-semibold">Decision</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {REPORT_DECISIONS.map(([value, label]) => (
              <button key={value} type="button" disabled={!note.trim() || deciding} onClick={() => onDecide(value)} className="min-h-14 rounded-2xl border border-[var(--border)] p-3 text-left text-sm font-semibold disabled:opacity-40">{label}</button>
            ))}
          </div>
          <label className="mt-4 block text-sm font-medium">Reviewer note (required)<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder="Why this decision? Visible to other reviewers only." className="mt-2 min-h-24 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] p-3" /></label>
        </>
      )}
    </>
  );
}

function CompanyDetail({ item, note, setNote, deciding, terminal, onDecide }: { item: { id: number; companyName: string; website: string | null; role: string; status: string; createdAt: string }; note: string; setNote: (value: string) => void; deciding: boolean; terminal: boolean; onDecide: (status: string) => void }) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[var(--muted)]"><Building2 className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <span className="text-xs text-[var(--muted-foreground)]">COMPANY · opened {new Date(item.createdAt).toLocaleDateString()}</span>
          <h1 className="text-2xl font-semibold">{item.companyName}</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Suggested by a {item.role}{item.website ? <> · {item.website}</> : ""}</p>
        </div>
      </div>
      {terminal ? (
        <div className="mt-6 rounded-2xl bg-[var(--accent)] p-4"><strong className="flex items-center gap-2"><Check className="size-4" />Decision: {item.status}</strong><p className="mt-1 text-sm">Submitter notified.</p></div>
      ) : (
        <>
          <h2 className="mt-6 text-sm font-semibold">Decision</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {[["under_review", "Mark under review"], ["approved", "Approve for listing"], ["dismissed", "Dismiss"]].map(([value, label]) => (
              <button key={value} type="button" disabled={!note.trim() || deciding} onClick={() => onDecide(value)} className="min-h-14 rounded-2xl border border-[var(--border)] p-3 text-left text-sm font-semibold disabled:opacity-40">{label}</button>
            ))}
          </div>
          <label className="mt-4 block text-sm font-medium">Reviewer note (required)<textarea value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder="Why this decision? Visible to other reviewers only." className="mt-2 min-h-24 w-full rounded-xl border border-[var(--input)] bg-[var(--background)] p-3" /></label>
        </>
      )}
    </>
  );
}
