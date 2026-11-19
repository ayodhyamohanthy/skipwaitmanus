import { useEffect, useState } from "react";
import { AdminNav } from "@/components/AdminNav";

type Card = { id: string; will: string; affects: string; undo: string; expiresAt: string };
type Turn = { question: string; answer: string; toolsUsed: string[]; cards: Card[] };
type Outcome = { ok: boolean; message: string; output?: string; state: string };

function ApprovalCard({ card }: { card: Card }) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "approve" | "deny") => {
    if (busy || outcome) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/skippie/cards/${card.id}/decision`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const body = await response.json().catch(() => ({ ok: false, message: "Skippy could not record that.", state: "unknown" }));
      setOutcome(body);
    } finally { setBusy(false); }
  };
  return (
    <section aria-label="Approval card" className="rounded-md border-2 border-amber-500 p-3 text-sm">
      <p className="font-semibold">Approval needed</p>
      <dl className="mt-2 space-y-1">
        <div><dt className="inline font-medium">It will: </dt><dd className="inline">{card.will}</dd></div>
        <div><dt className="inline font-medium">It affects: </dt><dd className="inline">{card.affects}</dd></div>
        <div><dt className="inline font-medium">Undo: </dt><dd className="inline">{card.undo}</dd></div>
        <div><dt className="inline font-medium">Expires: </dt><dd className="inline">{new Date(card.expiresAt).toLocaleTimeString()} (one use)</dd></div>
      </dl>
      {outcome ? (
        <div role="status" className="mt-3"><p className={outcome.ok ? "text-green-800" : "text-red-700"}>{outcome.message}</p>{outcome.output ? <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border p-2">{outcome.output}</pre> : null}</div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button className="min-h-11 flex-1 rounded-md bg-black px-4 text-white disabled:opacity-50" disabled={busy} onClick={() => void decide("approve")} type="button">Approve</button>
          <button className="min-h-11 flex-1 rounded-md border px-4 disabled:opacity-50" disabled={busy} onClick={() => void decide("deny")} type="button">Deny</button>
        </div>
      )}
    </section>
  );
}

export default function AdminSkippie() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/skippie/ask", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(response.status === 404 ? "Skippy is not turned on." : body.error ?? "Skippy could not answer."); return; }
      setTurns(prev => [...prev, { question: q, answer: body.answer, toolsUsed: body.toolsUsed ?? [], cards: body.cards ?? [] }]);
      setQuestion("");
    } finally { setBusy(false); }
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <AdminNav current="skippy" badge="Administrator diagnostics" />
      <h1 className="text-2xl font-semibold">Skippy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Skippy can look at the money check, parked payments, scheduled jobs, deploy health and Sentry. It cannot change anything by itself: for a low-risk action it shows a card, and nothing happens until you press Approve. Every question, card and result is logged in Activity.</p>
      <ol className="mt-6 space-y-5">
        {turns.map((turn, i) => (
          <li key={i} className="space-y-2">
            <p className="font-medium">{turn.question}</p>
            <pre className="whitespace-pre-wrap break-words rounded-md border p-3 text-sm">{turn.answer}</pre>
            {turn.cards.map(card => <ApprovalCard key={card.id} card={card} />)}
            <p className="text-xs text-muted-foreground">Looked at: {turn.toolsUsed.join(", ") || "nothing"}</p>
          </li>
        ))}
      </ol>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <form className="mt-6 flex gap-2" onSubmit={e => { e.preventDefault(); void ask(); }}>
        <input aria-label="Ask Skippy" className="min-h-11 flex-1 rounded-md border px-3" maxLength={500} placeholder="Why did the money check fail?" value={question} onChange={e => setQuestion(e.target.value)} />
        <button className="min-h-11 rounded-md bg-black px-4 text-white disabled:opacity-50" disabled={busy || !question.trim()} type="submit">{busy ? "Asking" : "Ask"}</button>
      </form>
    </main>
  );
}
