import { SignInButton, useAuth } from "@/_core/auth";
import { ArrowRight, CheckCircle2, Database, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import { readApiJson } from "@/lib/apiResponse";

type StatementResult = { statement: string; ok: boolean; error?: string };
type SchemaSnapshot = { reconciled: boolean; results: StatementResult[]; firstError: string | null };

/**
 * Administrator surface for the boot schema reconciler. Shows the last run's
 * per-statement outcomes and lets an admin run the pending allowlisted DDL
 * (the fixed ALTER/CREATE list in server/schemaReconcile.ts) from the app —
 * no shell or migration client needed. There is no free-form SQL input.
 */
export default function AdminSchema() {
  const { isSignedIn, getToken } = useAuth();
  const [snapshot, setSnapshot] = useState<SchemaSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true; setLoading(true); setError("");
    void (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch("/api/admin/schema/reconcile", { credentials: "include", headers });
        const payload = await readApiJson<SchemaSnapshot & { error?: string }>(response, "We could not load the schema reconcile status");
        if (!response.ok) throw new Error(payload.error || "We could not load the schema reconcile status");
        if (active) setSnapshot(payload);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "We could not load the schema reconcile status"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  const run = async () => {
    setRunning(true); setError("");
    try {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch("/api/admin/schema/reconcile", { method: "POST", credentials: "include", headers });
      const payload = await readApiJson<SchemaSnapshot & { error?: string }>(response, "We could not run the schema reconcile");
      if (!response.ok) throw new Error(payload.error || "We could not run the schema reconcile");
      setSnapshot(payload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not run the schema reconcile"); }
    finally { setRunning(false); }
  };

  if (!isSignedIn) return <main className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-xl"><Brand /><section className="mt-16 rounded-2xl border border-slate-200 bg-surface p-7 shadow-sm sm:p-9"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-primary"><ShieldCheck className="h-5 w-5" /></span><h1 className="mt-6 text-3xl font-semibold tracking-[-.045em]">Schema reconcile</h1><p className="mt-3 text-sm leading-6 text-slate-600">Sign in with the designated administrator account to inspect and run the pending database schema reconciliation.</p><SignInButton><button type="button" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">Secure sign in <ArrowRight className="h-4 w-4" /></button></SignInButton></section></div></main>;

  return <main data-skipwait-screen="admin-schema" className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-4xl"><AdminNav current="schema" /><section className="mt-10"><p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-primary"><Database className="h-3.5 w-3.5" />Database maintenance</p><div className="mt-4 flex flex-wrap items-start justify-between gap-4"><h1 className="text-4xl font-semibold tracking-[-.055em] sm:text-5xl">Schema reconcile</h1><div className="flex gap-2"><button type="button" onClick={() => void run()} disabled={running} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />{running ? "Running…" : "Run reconcile"}</button></div></div><p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">Runs the fixed, allowlisted ALTER/CREATE statements the app expects (missing columns and B2B tables). Only statements still missing are executed — the run is idempotent and safe to repeat. No free-form SQL can be submitted here.</p></section>
  {error && <div role="alert" className="mt-7 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
  {loading && !snapshot ? <div className="mt-8 h-40 animate-pulse rounded-2xl border border-slate-200 bg-surface" /> : snapshot ? <>
    <section className="mt-8 grid gap-4 sm:grid-cols-2"><article className={`rounded-2xl border bg-surface p-5 shadow-sm ${snapshot.reconciled ? "border-emerald-200" : "border-amber-200"}`}><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Status</p><p className={`mt-2 flex items-center gap-2 text-2xl font-semibold tracking-[-.03em] ${snapshot.reconciled ? "text-emerald-800" : "text-amber-800"}`}>{snapshot.reconciled ? <><CheckCircle2 className="h-6 w-6" />Reconciled</> : <><XCircle className="h-6 w-6" />Not fully reconciled</>}</p><p className="mt-1 text-sm leading-6 text-slate-600">{snapshot.reconciled ? "Every expected column and table exists." : "Some statements failed or have not run yet. Re-running is safe."}</p></article><article className={`rounded-2xl border bg-surface p-5 shadow-sm ${snapshot.firstError ? "border-rose-200" : "border-slate-200"}`}><p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">First error</p><p className="mt-2 break-words text-sm leading-6 text-slate-800">{snapshot.firstError || "None recorded — the last run had no statement failures."}</p></article></section>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm sm:p-6"><h2 className="text-2xl font-semibold tracking-[-.035em]">Per-statement results</h2><p className="mt-2 text-sm leading-6 text-slate-600">{snapshot.results.length ? "Outcome of each allowlisted statement from the most recent run." : "No run has happened yet in this server process. Use Run reconcile to attempt the pending statements now."}</p>{snapshot.results.length ? <ul className="mt-6 space-y-3">{snapshot.results.map((item, index) => <li key={index} className={`rounded-xl border p-4 ${item.ok ? "border-emerald-100 bg-emerald-50/50" : "border-rose-200 bg-rose-50/60"}`}><div className="flex items-start gap-3">{item.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />}<div className="min-w-0"><p className="break-words font-mono text-xs leading-5 text-slate-900">{item.statement}</p>{item.error && <p className="mt-1 break-words text-xs font-semibold leading-5 text-rose-800">{item.error}</p>}</div></div></li>)}</ul> : null}</section>
  </> : null}
  </div></main>;
}
