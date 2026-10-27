import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/auth";
import { uploadResume, validateResumeFile } from "@/lib/resumeUpload";

type Quote = { level: number; cost: number; totalAvailable: number; shortfall: number };
type Session = {
  step: "job_link" | "job_text" | "resume" | "consent" | "fit" | "tailor_skills" | "tailor_review" | "quote" | "done";
  targetRoleUrl?: string;
  jobSource?: "link" | "pasted";
  requirements?: string[];
  attachmentId?: number;
  attachmentName?: string;
  consentToAi?: boolean;
  resumeUnreadable?: boolean;
  facts?: Array<{ id: string; text: string; source: string }>;
  matches?: Array<{ requirement: string; factId: string }>;
  gaps?: string[];
  suggestedNote?: string;
  note?: string;
  noteFlags?: string[];
  quote?: Quote;
  tailor?: { additions: Array<{ skill: string; confirmed: boolean | null }>; generatedText?: string };
  createdRequestId?: number;
  companyDomain?: string;
  coverageStatus?: "covered" | "waiting_for_company_coverage";
};
type SavedResume = { id: number; fileName: string; mimeType?: string };
type Msg = { from: "you" | "skippy"; text: string };

async function turn(body: Record<string, unknown>): Promise<{ replies: string[]; session: Session }> {
  const response = await fetch("/api/skippie/turn", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? (response.status === 404 ? "Skippy is not turned on for your account yet." : "Skippy hit a snag. Try again."));
  return data as { replies: string[]; session: Session };
}

export default function Skippy() {
  const { isSignedIn, isLoaded, getToken, openSignIn } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([{ from: "skippy", text: "Hi, I'm Skippy. Which company do you want a referral at? Paste the job link and I'll help you make the strongest ask - I never send anything without your yes." }]);
  const [session, setSession] = useState<Session | null>(null);
  const [resumes, setResumes] = useState<SavedResume[]>([]);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/skippie/state", { credentials: "include" })
      .then(async r => {
        if (!r.ok) { setError(r.status === 404 ? "Skippy is not turned on for your account yet." : "We could not load Skippy."); return; }
        const data = await r.json();
        setSession(data.session);
        setResumes(data.resumes ?? []);
      })
      .catch(() => setError("We could not load Skippy."));
  }, [isLoaded, isSignedIn]);

  useEffect(() => { scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight }); }, [messages, session]);

  const apply = useCallback((out: { replies: string[]; session: Session }, mine?: string) => {
    setMessages(prev => [...prev, ...(mine ? [{ from: "you" as const, text: mine }] : []), ...out.replies.map(text => ({ from: "skippy" as const, text }))]);
    setSession(out.session);
    if (out.session.suggestedNote && !note) setNote(out.session.suggestedNote);
  }, [note]);

  const send = useCallback(async (body: Record<string, unknown>, mine?: string) => {
    if (busy) return;
    setBusy(true); setError("");
    try { apply(await turn(body), mine); }
    catch (e) { setError(e instanceof Error ? e.message : "Skippy hit a snag. Try again."); if (mine) setMessages(prev => [...prev, { from: "you", text: mine }]); }
    finally { setBusy(false); }
  }, [apply, busy]);

  const onUpload = async (file: File) => {
    const problem = validateResumeFile(file);
    if (problem) { setError(problem); return; }
    setUploading(true); setError("");
    try {
      const doc = await uploadResume(file, getToken);
      setResumes(prev => [{ id: doc.id, fileName: doc.fileName }, ...prev]);
      await send({ kind: "choose_resume", attachmentId: doc.id }, `Uploaded ${file.name}`);
    } catch (e) { setError(e instanceof Error ? e.message : "The upload failed. Try again."); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ""; }
  };

  if (isLoaded && !isSignedIn) {
    return <main className="mx-auto max-w-2xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold">Skippy</h1><p className="mt-2 text-sm text-muted-foreground">Sign in to chat with Skippy about your referral.</p><button className="mt-6 min-h-11 rounded-md bg-black px-6 text-white" onClick={() => openSignIn()}>Sign in</button></main>;
  }

  const step = session?.step ?? "job_link";
  const quote = session?.quote;
  const gaps = session?.gaps ?? [];
  const matches = session?.matches ?? [];
  const factsById = new Map((session?.facts ?? []).map(f => [f.id, f.text]));

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col px-4 py-6">
      <h1 className="text-2xl font-semibold">Skippy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Ask for a referral by chat. Skippy reads the job post, compares your resume only with your yes, and sends only when you say "Send it". skipwait.me never promises a referral.</p>

      <div ref={scrollRef} className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-md border p-3" style={{ maxHeight: "55vh" }} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={m.from === "you" ? "text-right" : "text-left"}>
            <span className={`inline-block whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${m.from === "you" ? "bg-black text-white" : "bg-neutral-100 text-black"}`}>{m.text}</span>
          </div>
        ))}
        {busy ? <p className="text-xs text-muted-foreground">Skippy is thinking…</p> : null}
      </div>

      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}

      {step === "resume" ? (
        <section className="mt-4 space-y-2 rounded-md border p-3" aria-label="Choose your resume">
          <p className="text-sm font-medium">Your resume</p>
          <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void onUpload(f); }} />
          <button type="button" className="min-h-11 w-full rounded-md bg-black px-4 text-white disabled:opacity-50" disabled={uploading || busy} onClick={() => fileInput.current?.click()}>{uploading ? "Uploading…" : "Upload a resume"}</button>
          {resumes.length ? <p className="text-xs text-muted-foreground">Or pick a saved one:</p> : null}
          {resumes.map(r => (
            <button key={r.id} type="button" className="min-h-11 w-full rounded-md border px-3 text-left text-sm" disabled={busy} onClick={() => void send({ kind: "choose_resume", attachmentId: r.id }, r.fileName)}>{r.fileName}</button>
          ))}
        </section>
      ) : null}

      {step === "consent" ? (
        <section className="mt-4 space-y-2 rounded-md border p-3" aria-label="Resume reading consent">
          <p className="text-sm">May Skippy read <strong>{session?.attachmentName}</strong> with the AI model to compare it against the job and help with your note?</p>
          <div className="flex gap-2">
            <button type="button" className="min-h-11 flex-1 rounded-md bg-black px-4 text-white" disabled={busy} onClick={() => void send({ kind: "consent", allow: true }, "Yes")}>Yes, compare it</button>
            <button type="button" className="min-h-11 flex-1 rounded-md border px-4" disabled={busy} onClick={() => void send({ kind: "consent", allow: false }, "No")}>No</button>
          </div>
        </section>
      ) : null}

      {step === "fit" ? (
        <section className="mt-4 space-y-3 rounded-md border p-3" aria-label="Your note">
          {matches.length || gaps.length ? (
            <div className="text-sm">
              {matches.length ? <ul className="list-disc pl-5">{matches.map(m => <li key={m.requirement + m.factId}><strong>{m.requirement}</strong> - {factsById.get(m.factId)}</li>)}</ul> : null}
              {gaps.length ? <p className="mt-2 text-muted-foreground">Missing from your resume: {gaps.join("; ")}</p> : null}
            </div>
          ) : null}
          {gaps.length && session?.consentToAi && !session?.resumeUnreadable ? (
            <div className="flex gap-2">
              <button type="button" className="min-h-11 flex-1 rounded-md border px-3 text-sm" disabled={busy} onClick={() => void send({ kind: "tailor_start" }, "Help me tailor my resume")}>Build a tailored resume</button>
              <button type="button" className="min-h-11 flex-1 rounded-md border px-3 text-sm" disabled={busy} onClick={() => void send({ kind: "tailor_skip" })}>Keep my original</button>
            </div>
          ) : null}
          <label className="block text-sm">
            <span className="font-medium">Your note to the referrer (the final words are yours)</span>
            <textarea className="mt-1 w-full resize-none rounded-md border p-2 text-sm" rows={4} maxLength={1400} value={note} onChange={e => setNote(e.target.value)} placeholder="A short reason you are a strong fit." />
          </label>
          <div className="flex gap-2">
            <button type="button" className="min-h-11 flex-1 rounded-md bg-black px-4 text-white disabled:opacity-50" disabled={busy || note.trim().length < 4} onClick={() => void send({ kind: "submit_note", text: note }, note)}>Save my note</button>
            {session?.suggestedNote && note !== session.suggestedNote ? <button type="button" className="min-h-11 flex-1 rounded-md border px-4" disabled={busy} onClick={() => void send({ kind: "confirm_suggested_note" }, "Use the draft")}>Use Skippy's draft</button> : null}
          </div>
        </section>
      ) : null}

      {step === "tailor_skills" && session?.tailor ? (
        <section className="mt-4 space-y-2 rounded-md border p-3" aria-label="Confirm your skills">
          <p className="text-sm font-medium">Do you truly know each of these? Only what you confirm gets added.</p>
          {session.tailor.additions.map(a => (
            <div key={a.skill} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{a.skill}</span>
              <button type="button" aria-label={`I know ${a.skill}`} className={`min-h-9 rounded-md px-3 ${a.confirmed === true ? "bg-black text-white" : "border"}`} disabled={busy} onClick={() => void send({ kind: "tailor_skill", skill: a.skill, knows: true })}>I know this</button>
              <button type="button" aria-label={`I do not know ${a.skill}`} className={`min-h-9 rounded-md px-3 ${a.confirmed === false ? "bg-black text-white" : "border"}`} disabled={busy} onClick={() => void send({ kind: "tailor_skill", skill: a.skill, knows: false })}>I don't</button>
            </div>
          ))}
          <button type="button" className="min-h-11 w-full rounded-md bg-black px-4 text-white" disabled={busy} onClick={() => void send({ kind: "tailor_build" }, "Build it")}>Build the tailored resume</button>
        </section>
      ) : null}

      {step === "tailor_review" && session?.tailor?.generatedText ? (
        <section className="mt-4 space-y-2 rounded-md border p-3" aria-label="Review the tailored resume">
          <p className="text-sm font-medium">Read it. It is your original resume plus only what you confirmed.</p>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-neutral-50 p-3 text-xs">{session.tailor.generatedText}</pre>
          <div className="flex gap-2">
            <button type="button" className="min-h-11 flex-1 rounded-md bg-black px-4 text-white" disabled={busy} onClick={() => void send({ kind: "tailor_approve", approve: true }, "Use it for this ask")}>Use it for this ask</button>
            <button type="button" className="min-h-11 flex-1 rounded-md border px-4" disabled={busy} onClick={() => void send({ kind: "tailor_approve", approve: false }, "Keep my original")}>Keep my original</button>
          </div>
        </section>
      ) : null}

      {step === "quote" && quote ? (
        <section className="mt-4 space-y-2 rounded-md border p-3" aria-label="Cost and send">
          <p className="text-sm font-medium">This ask costs {quote.cost} credit{quote.cost === 1 ? "" : "s"}. You have {quote.totalAvailable}.</p>
          {session?.note ? <p className="whitespace-pre-wrap break-words rounded-md bg-neutral-50 p-2 text-sm">Your note: {session.note}</p> : null}
          {session?.noteFlags?.length ? <p className="text-sm text-amber-700">Double-check: {session.noteFlags.join("; ")}</p> : null}
          {quote.shortfall > 0 ? (
            <a href="/plans" className="block min-h-11 rounded-md bg-black px-4 py-3 text-center text-white">Add {quote.shortfall} more credit{quote.shortfall === 1 ? "" : "s"} on /plans</a>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="min-h-11 flex-1 rounded-md bg-black px-4 text-white" disabled={busy} onClick={() => void send({ kind: "confirm_send", send: true }, "Send it")}>Send it</button>
              <button type="button" className="min-h-11 flex-1 rounded-md border px-4" disabled={busy} onClick={() => void send({ kind: "confirm_send", send: false }, "Not yet")}>Not yet</button>
            </div>
          )}
          <label className="block text-sm">
            <span className="text-muted-foreground">Edit your note before sending</span>
            <textarea className="mt-1 w-full resize-none rounded-md border p-2 text-sm" rows={3} maxLength={1400} value={note} onChange={e => setNote(e.target.value)} />
          </label>
          {note !== (session?.note ?? "") ? <button type="button" className="min-h-11 w-full rounded-md border px-4" disabled={busy || note.trim().length < 4} onClick={() => void send({ kind: "submit_note", text: note }, note)}>Save the edited note</button> : null}
        </section>
      ) : null}

      {step === "done" ? (
        <section className="mt-4 space-y-2 rounded-md border p-3">
          <p className="text-sm">{session?.coverageStatus === "waiting_for_company_coverage" ? "Your ask is saved and costs nothing until a verified employee can see it." : "Your ask is with verified employees."}</p>
          <div className="flex gap-2">
            <a href="/requests" className="min-h-11 flex-1 rounded-md bg-black px-4 py-3 text-center text-white">Track it under My referrals</a>
            <button type="button" className="min-h-11 flex-1 rounded-md border px-4" disabled={busy} onClick={() => { setNote(""); void send({ kind: "restart" }); }}>Ask at another company</button>
          </div>
        </section>
      ) : null}

      {step === "job_link" || step === "job_text" ? (
        <form className="mt-4 flex gap-2" onSubmit={e => { e.preventDefault(); const t = text.trim(); if (t) { setText(""); void send({ kind: "text", text: t }, t); } }}>
          <input aria-label={step === "job_link" ? "Job link" : "Job description"} className="min-h-11 flex-1 rounded-md border px-3" maxLength={20000} placeholder={step === "job_link" ? "Paste the job link…" : "Paste the job description…"} value={text} onChange={e => setText(e.target.value)} />
          <button className="min-h-11 rounded-md bg-black px-4 text-white disabled:opacity-50" disabled={busy || !text.trim()} type="submit">Send</button>
        </form>
      ) : null}
    </main>
  );
}
