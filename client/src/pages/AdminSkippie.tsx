import { useEffect, useState } from "react";

type Turn = { question: string; answer: string; toolsUsed: string[] };

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
      if (!response.ok) { setError(response.status === 404 ? "Skippie is not turned on." : body.error ?? "Skippie could not answer."); return; }
      setTurns(prev => [...prev, { question: q, answer: body.answer, toolsUsed: body.toolsUsed ?? [] }]);
      setQuestion("");
    } finally { setBusy(false); }
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Skippie</h1>
      <p className="mt-1 text-sm text-muted-foreground">Read-only. Skippie can look at the money check, parked payments, scheduled jobs, deploy health and Sentry. It cannot change anything. Every question is logged in Activity.</p>
      <ol className="mt-6 space-y-5">
        {turns.map((turn, i) => (
          <li key={i} className="space-y-2">
            <p className="font-medium">{turn.question}</p>
            <pre className="whitespace-pre-wrap break-words rounded-md border p-3 text-sm">{turn.answer}</pre>
            <p className="text-xs text-muted-foreground">Looked at: {turn.toolsUsed.join(", ") || "nothing"}</p>
          </li>
        ))}
      </ol>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
      <form className="mt-6 flex gap-2" onSubmit={e => { e.preventDefault(); void ask(); }}>
        <input aria-label="Ask Skippie" className="min-h-11 flex-1 rounded-md border px-3" maxLength={500} placeholder="Why did the money check fail?" value={question} onChange={e => setQuestion(e.target.value)} />
        <button className="min-h-11 rounded-md bg-black px-4 text-white disabled:opacity-50" disabled={busy || !question.trim()} type="submit">{busy ? "Asking" : "Ask"}</button>
      </form>
    </main>
  );
}
