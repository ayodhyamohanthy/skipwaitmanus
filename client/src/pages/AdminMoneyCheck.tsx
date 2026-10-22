import { useState } from "react";
import { AdminNav } from "@/components/AdminNav";

type Result = { ranAt: string; findingsFound: boolean; emailSent: boolean; subject: string | null; findings: string | null };

/** One button for the founder: runs the read-only money check and shows the findings here. */
export default function AdminMoneyCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/admin/money-check/run", { method: "POST", credentials: "include" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(response.status === 429 ? "It just ran. Wait 5 minutes and try again." : response.status === 401 || response.status === 403 ? "Sign in as an administrator to run this." : body.error ?? "The money check could not run."); return; }
      setResult(body as Result);
    } finally { setBusy(false); }
  };
  return (
    <main className="min-h-screen bg-white px-5 py-6 text-black sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <AdminNav current="money-check" badge="Administrator diagnostics" />
        <section className="space-y-2">
          <h1 className="text-2xl font-semibold">Money check</h1>
          <p className="text-sm text-muted-foreground">Checks every wallet, credited payment, parked payment and refund for entries that do not add up. It only reads. It changes no money. If it finds something, it also sends the usual owner email once. You can run it every 5 minutes at most.</p>
          <button type="button" onClick={() => void run()} disabled={busy} className="min-h-11 rounded-lg bg-[#141414] px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Running" : "Run money check now"}</button>
        </section>
        {error ? <p role="alert" className="text-sm font-medium text-red-700">{error}</p> : null}
        {result ? (
          <section aria-label="Money check result" className="space-y-2">
            <h2 className="text-lg font-semibold">{result.findingsFound ? result.subject ?? "Findings" : "All clear. Nothing to flag."}</h2>
            <p className="text-sm text-muted-foreground">Ran at {new Date(result.ranAt).toLocaleString()}. {result.findingsFound ? (result.emailSent ? "Owner email sent." : "Owner email was NOT sent, read the findings below.") : "No email needed."}</p>
            {result.findings ? <pre className="whitespace-pre-wrap break-words rounded-lg border border-[#e5e5e5] p-3 text-sm">{result.findings}</pre> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
