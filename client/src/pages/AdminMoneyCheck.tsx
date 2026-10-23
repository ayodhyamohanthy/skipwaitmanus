import { useEffect, useState } from "react";
import { AdminNav } from "@/components/AdminNav";
import { AdminSignInCta } from "@/components/admin/AdminSignInCta";

type Result = { ranAt: string; findingsFound: boolean; emailSent: boolean; subject: string | null; findings: string | null };

type AlertStatus = { latestOutcome: string | null; latestAt: string | null; lastSuccessAt: string | null; failuresLast7Days: number; ownerNotReached: boolean };

/** One button for the founder: runs the read-only money check and shows the findings here. */
export default function AdminMoneyCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<{ candidates: number; accounts: number; oldest: string | null; newest: string | null; applied: boolean; closed: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const closeAbandoned = async (apply: boolean) => {
    if (closing) return;
    setClosing(true); setError("");
    try {
      const response = await fetch("/api/admin/money-check/close-abandoned", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apply }) });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { setNeedsSignIn(true); return; }
      if (!response.ok) { setError(body.error ?? "We could not check abandoned checkouts."); return; }
      setPlan(body);
    } finally { setClosing(false); }
  };
  const [alertStatus, setAlertStatus] = useState<AlertStatus | null>(null);
  useEffect(() => {
    void fetch("/api/admin/money-check/status", { credentials: "include" }).then(r => { if (r.status === 401 || r.status === 403) setNeedsSignIn(true); return r.ok ? r.json() : null; }).then(b => setAlertStatus(b as AlertStatus | null)).catch(() => undefined);
  }, []);
  const [testMsg, setTestMsg] = useState("");
  const sendTest = async () => {
    setTestMsg("Sending");
    try {
      const response = await fetch("/api/admin/alerts/test", { method: "POST", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { setNeedsSignIn(true); setTestMsg(""); return; }
      setTestMsg(!response.ok ? (response.status === 429 ? "Sent a moment ago. Wait 5 minutes." : body.error ?? "The test alert could not be sent.") : body.sent ? "Test alert sent. Check the owner inbox." : "The test alert was not accepted by the mail service.");
    } catch { setTestMsg("The test alert could not be sent."); }
  };
  const run = async () => {
    if (busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/admin/money-check/run", { method: "POST", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { setNeedsSignIn(true); return; }
      if (!response.ok) { setError(response.status === 429 ? "It just ran. Wait 5 minutes and try again." : response.status === 401 || response.status === 403 ? "Sign in as an administrator to run this." : body.error ?? "The money check could not run."); return; }
      setResult(body as Result);
    } finally { setBusy(false); }
  };
  return (
    <main className="min-h-screen bg-white px-5 py-6 text-black sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <AdminNav current="money-check" badge="Administrator diagnostics" />
        {needsSignIn ? <AdminSignInCta path="/admin/money-check" message="Administrator access is required. Sign in with the administrator account, then you come back to this page." /> : null}
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold">Money check</h1>
          <p className="text-sm text-muted-foreground">Checks every wallet, credited payment, parked payment and refund for entries that do not add up. It only reads. It changes no money. If it finds something, it also sends the usual owner email once. You can run it every 5 minutes at most.</p>
          <button type="button" onClick={() => void run()} disabled={busy} className="min-h-11 rounded-lg bg-[#141414] px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Running" : "Run money check now"}</button>
          <button type="button" onClick={() => void sendTest()} className="ml-3 min-h-11 rounded-lg border border-[#141414] px-5 text-sm font-bold text-[#141414]">Send test alert</button>
          {testMsg ? <p role="status" className="text-sm">{testMsg}</p> : null}
        </section>
        {alertStatus?.ownerNotReached ? (
          <p role="alert" className="rounded-lg border border-red-700 p-3 text-sm font-semibold text-red-700">
            The owner alert email FAILED to send. Latest attempt {alertStatus.latestAt ? new Date(alertStatus.latestAt).toLocaleString() : ""}. {alertStatus.failuresLast7Days} failed in the last 7 days. {alertStatus.lastSuccessAt ? `Last delivered ${new Date(alertStatus.lastSuccessAt).toLocaleString()}.` : "It has never been delivered."} Run the check below and read the findings here.
          </p>
        ) : null}
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
        {result ? (
          <section aria-label="Money check result" className="space-y-2">
            <h2 className="text-lg font-semibold">{result.findingsFound ? result.subject ?? "Findings" : "All clear. Nothing to flag."}</h2>
            <p className="text-sm text-muted-foreground">Ran at {new Date(result.ranAt).toLocaleString()}. {result.findingsFound ? (result.emailSent ? "Owner email sent." : "Owner email was NOT sent, read the findings below.") : "No email needed."}</p>
            {result.findings ? <pre className="whitespace-pre-wrap break-words rounded-lg border border-[#e5e5e5] p-3 text-sm">{result.findings}</pre> : null}
          </section>
        ) : null}
        <section aria-label="Abandoned checkouts" className="space-y-2 border-t border-[#e5e5e5] pt-6">
          <h2 className="text-lg font-semibold">Abandoned checkout pages</h2>
          <p className="text-sm text-muted-foreground">Checkout pages opened and never paid, older than 7 days. Closing them only adds a note to each row so the money check stops listing them. Nothing is deleted and no money moves. If one of them was ever paid, it is still credited.</p>
          <button type="button" onClick={() => void closeAbandoned(false)} disabled={closing} className="min-h-11 rounded-lg border border-[#141414] px-5 text-sm font-bold disabled:opacity-50">Preview what would close</button>
          {plan ? (
            <div className="space-y-2" role="status">
              <p className="text-sm">{plan.applied ? `Closed ${plan.closed} abandoned checkout pages.` : `${plan.candidates} checkout pages from ${plan.accounts} accounts would close${plan.oldest ? `, oldest ${new Date(plan.oldest).toLocaleDateString()}` : ""}.`}</p>
              {!plan.applied && plan.candidates > 0 ? <button type="button" onClick={() => void closeAbandoned(true)} disabled={closing} className="min-h-11 rounded-lg bg-[#141414] px-5 text-sm font-bold text-white disabled:opacity-50">{`Close these ${plan.candidates}`}</button> : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
