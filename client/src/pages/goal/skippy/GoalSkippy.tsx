// The goal /skippy page (D-048 phase 3, row D-048-p3-skippy; GOAL_UI_COVERAGE.md §6.4).
// Skippy.tsx switches here when goalSurfaceOn("skippy") is true.
//
// Rules kept:
// - Goal line: "Get your ask ready." (h1)
// - One "Your next step" block with one primary black commit button (GoalButton variant="primary").
// - Referral-only wording (D-180, D-173): no seeker-facing "credits"; uses "referrals".
// - Status dot + label via GoalStatus (DOCTRINE.md).
// - Goal design tokens only; no kit.css classes or kit components.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/_core/auth";
import { uploadResume, validateResumeFile } from "@/lib/resumeUpload";
import { GoalButton, GoalNextStep, GoalStatus } from "@/components/goal";
import { cn } from "@/lib/utils";

export const GOAL_PAGE = { goalLine: "Get your ask ready." } as const;

export type Quote = { level: number; cost: number; totalAvailable: number; shortfall: number };
export type Session = {
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
export type SavedResume = { id: number; fileName: string; mimeType?: string };
export type Msg = { from: "you" | "skippy"; text: string };

async function turn(body: Record<string, unknown>): Promise<{ replies: string[]; session: Session }> {
  const response = await fetch("/api/skippie/turn", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { error?: string }).error ??
        (response.status === 404 ? "Skippy is not turned on for your account yet." : "Skippy hit a snag. Try again."),
    );
  }
  return data as { replies: string[]; session: Session };
}

export default function GoalSkippy() {
  const { isSignedIn, isLoaded, getToken, openSignIn } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    {
      from: "skippy",
      text: "Hi, I'm Skippy. Which company do you want a referral at? Paste the job link and I'll help you make the strongest ask - I never send anything without your yes.",
    },
  ]);
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
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/skippie/state", { credentials: "include" })
      .then(async r => {
        if (!r.ok) {
          setError(r.status === 404 ? "Skippy is not turned on for your account yet." : "We could not load Skippy.");
          return;
        }
        const data = await r.json();
        setSession(data.session);
        setResumes(data.resumes ?? []);
      })
      .catch(() => setError("We could not load Skippy."));
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight });
  }, [messages, session]);

  const apply = useCallback(
    (out: { replies: string[]; session: Session }, mine?: string) => {
      setMessages(prev => [
        ...prev,
        ...(mine ? [{ from: "you" as const, text: mine }] : []),
        ...out.replies.map(t => ({ from: "skippy" as const, text: t })),
      ]);
      setSession(out.session);
      if (out.session.suggestedNote && !note) setNote(out.session.suggestedNote);
    },
    [note],
  );

  const send = useCallback(
    async (body: Record<string, unknown>, mine?: string) => {
      if (busy) return;
      setBusy(true);
      setError("");
      try {
        apply(await turn(body), mine);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Skippy hit a snag. Try again.");
        if (mine) setMessages(prev => [...prev, { from: "you", text: mine }]);
      } finally {
        setBusy(false);
      }
    },
    [apply, busy],
  );

  const onUpload = async (file: File) => {
    const problem = validateResumeFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(true);
    setError("");
    try {
      const doc = await uploadResume(file, getToken);
      setResumes(prev => [{ id: doc.id, fileName: doc.fileName }, ...prev]);
      await send({ kind: "choose_resume", attachmentId: doc.id }, `Uploaded ${file.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed. Try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (isLoaded && !isSignedIn) {
    return (
      <main data-skipwait-screen="skippy" className="g-scope mx-auto flex min-h-svh max-w-2xl flex-col px-4 py-8 text-g-ink">
        <header className="mb-6">
          <h1 className="text-g-display font-medium text-g-ink">Get your ask ready.</h1>
          <p className="mt-2 text-g-body text-g-ink-2">Sign in to chat with Skippy about your referral.</p>
        </header>
        <GoalNextStep reason="Sign in to continue your referral request.">
          <div className="mt-3">
            <GoalButton variant="primary" onClick={() => openSignIn()}>
              Sign in
            </GoalButton>
          </div>
        </GoalNextStep>
      </main>
    );
  }

  const step = session?.step ?? "job_link";
  const quote = session?.quote;
  const gaps = session?.gaps ?? [];
  const matches = session?.matches ?? [];
  const factsById = new Map((session?.facts ?? []).map(f => [f.id, f.text]));

  const onSubmitText = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (t) {
      setText("");
      void send({ kind: "text", text: t }, t);
    }
  };

  return (
    <main data-skipwait-screen="skippy" className="g-scope mx-auto flex min-h-svh max-w-2xl flex-col px-4 py-8 text-g-ink">
      <header className="mb-6">
        <h1 className="text-g-display font-medium text-g-ink">Get your ask ready.</h1>
        <p className="mt-2 text-g-body text-g-ink-2">
          Ask for a referral by chat. Skippy reads the job post, compares your resume only with your yes, and sends only when you say "Send it". skipwait.me never promises a referral.
        </p>
      </header>

      <div
        ref={scrollRef}
        className="mb-6 flex-1 space-y-3 overflow-y-auto rounded-g-control border border-g-hairline bg-g-surface p-4"
        style={{ maxHeight: "48vh" }}
        aria-live="polite"
      >
        {messages.map((m, i) => (
          <div key={i} className={m.from === "you" ? "text-right" : "text-left"}>
            <span
              className={cn(
                "inline-block whitespace-pre-wrap break-words rounded-g-control px-3.5 py-2 text-g-body",
                m.from === "you" ? "bg-g-ink text-white" : "bg-neutral-100 text-g-ink",
              )}
            >
              {m.text}
            </span>
          </div>
        ))}
        {busy ? <GoalStatus status="under_review" label="Skippy is thinking…" /> : null}
      </div>

      {error ? (
        <p role="alert" className="mb-4 text-g-meta text-g-crimson">
          {error}
        </p>
      ) : null}

      {step === "resume" ? (
        <GoalNextStep reason="Upload your resume or pick a saved one to compare against the job.">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            className="sr-only"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
          <div className="mt-3 space-y-3">
            <GoalButton variant="primary" className="w-full" busy={uploading || busy} onClick={() => fileInput.current?.click()}>
              {uploading ? "Uploading…" : "Upload a resume"}
            </GoalButton>
            {resumes.length ? (
              <div className="space-y-2 pt-2 border-t border-g-hairline">
                <p className="text-g-meta text-g-ink-3">Or pick a saved one:</p>
                {resumes.map(r => (
                  <GoalButton
                    key={r.id}
                    variant="outline"
                    className="w-full justify-start text-left"
                    busy={busy}
                    onClick={() => void send({ kind: "choose_resume", attachmentId: r.id }, r.fileName)}
                  >
                    {r.fileName}
                  </GoalButton>
                ))}
              </div>
            ) : null}
          </div>
        </GoalNextStep>
      ) : null}

      {step === "consent" ? (
        <GoalNextStep
          reason={`May Skippy read ${session?.attachmentName ? `"${session.attachmentName}"` : "your resume"} with the AI model to compare it against the job and help with your note?`}
        >
          <div className="mt-3 flex gap-3">
            <GoalButton variant="primary" className="flex-1" busy={busy} onClick={() => void send({ kind: "consent", allow: true }, "Yes")}>
              Yes, compare it
            </GoalButton>
            <GoalButton variant="outline" className="flex-1" busy={busy} onClick={() => void send({ kind: "consent", allow: false }, "No")}>
              No
            </GoalButton>
          </div>
        </GoalNextStep>
      ) : null}

      {step === "fit" ? (
        <>
          {matches.length || gaps.length ? (
            <div className="mb-6 space-y-3 rounded-g-control border border-g-hairline bg-g-surface p-4 text-g-body">
              {matches.length ? (
                <ul className="list-disc pl-5 space-y-1">
                  {matches.map(m => (
                    <li key={m.requirement + m.factId}>
                      <strong className="text-g-ink">{m.requirement}</strong> - <span className="text-g-ink-2">{factsById.get(m.factId)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {gaps.length ? <p className="text-g-ink-2">Missing from your resume: {gaps.join("; ")}</p> : null}
              {gaps.length && session?.consentToAi && !session?.resumeUnreadable ? (
                <div className="flex gap-2 pt-2">
                  <GoalButton variant="outline" size="sm" busy={busy} onClick={() => void send({ kind: "tailor_start" }, "Help me tailor my resume")}>
                    Build a tailored resume
                  </GoalButton>
                  <GoalButton variant="ghost" size="sm" busy={busy} onClick={() => void send({ kind: "tailor_skip" })}>
                    Keep my original
                  </GoalButton>
                </div>
              ) : null}
            </div>
          ) : null}
          <GoalNextStep reason="Review and save your note to the referrer. The final words are always yours.">
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-g-meta text-g-ink-2">Your note to the referrer</span>
                <textarea
                  className="mt-1 w-full resize-none rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink placeholder:text-g-ink-3"
                  rows={4}
                  maxLength={1400}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="A short reason you are a strong fit."
                />
              </label>
              <div className="flex gap-3">
                <GoalButton
                  variant="primary"
                  className="flex-1"
                  busy={busy}
                  disabledReason={note.trim().length < 4 ? "Enter at least 4 characters" : undefined}
                  onClick={() => void send({ kind: "submit_note", text: note }, note)}
                >
                  Save my note
                </GoalButton>
                {session?.suggestedNote && note !== session.suggestedNote ? (
                  <GoalButton variant="outline" className="flex-1" busy={busy} onClick={() => void send({ kind: "confirm_suggested_note" }, "Use the draft")}>
                    Use Skippy's draft
                  </GoalButton>
                ) : null}
              </div>
            </div>
          </GoalNextStep>
        </>
      ) : null}

      {step === "tailor_skills" && session?.tailor ? (
        <>
          <div className="mb-6 space-y-3 rounded-g-control border border-g-hairline bg-g-surface p-4">
            <p className="text-g-label text-g-ink font-medium">Do you truly know each of these? Only what you confirm gets added.</p>
            {session.tailor.additions.map(a => (
              <div key={a.skill} className="flex items-center gap-2 text-g-body">
                <span className="flex-1 text-g-ink">{a.skill}</span>
                <GoalButton
                  variant={a.confirmed === true ? "outline" : "ghost"}
                  size="sm"
                  aria-label={`I know ${a.skill}`}
                  busy={busy}
                  onClick={() => void send({ kind: "tailor_skill", skill: a.skill, knows: true })}
                >
                  I know this
                </GoalButton>
                <GoalButton
                  variant={a.confirmed === false ? "outline" : "ghost"}
                  size="sm"
                  aria-label={`I do not know ${a.skill}`}
                  busy={busy}
                  onClick={() => void send({ kind: "tailor_skill", skill: a.skill, knows: false })}
                >
                  I don't
                </GoalButton>
              </div>
            ))}
          </div>
          <GoalNextStep reason="Build the tailored resume with only your confirmed skills.">
            <div className="mt-3">
              <GoalButton variant="primary" className="w-full" busy={busy} onClick={() => void send({ kind: "tailor_build" }, "Build it")}>
                Build the tailored resume
              </GoalButton>
            </div>
          </GoalNextStep>
        </>
      ) : null}

      {step === "tailor_review" && session?.tailor?.generatedText ? (
        <>
          <div className="mb-6 space-y-3 rounded-g-control border border-g-hairline bg-g-surface p-4">
            <p className="text-g-label text-g-ink font-medium">Read it. It is your original resume plus only what you confirmed.</p>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-g-control bg-g-surface p-3 font-g-mono text-g-meta text-g-ink border border-g-hairline">
              {session.tailor.generatedText}
            </pre>
          </div>
          <GoalNextStep reason="Confirm whether to use this tailored resume for your referral request.">
            <div className="mt-3 flex gap-3">
              <GoalButton variant="primary" className="flex-1" busy={busy} onClick={() => void send({ kind: "tailor_approve", approve: true }, "Use it for this ask")}>
                Use it for this ask
              </GoalButton>
              <GoalButton variant="outline" className="flex-1" busy={busy} onClick={() => void send({ kind: "tailor_approve", approve: false }, "Keep my original")}>
                Keep my original
              </GoalButton>
            </div>
          </GoalNextStep>
        </>
      ) : null}

      {step === "quote" && quote ? (
        <>
          <div className="mb-6 space-y-3 rounded-g-control border border-g-hairline bg-g-surface p-4">
            <p className="text-g-heading text-g-ink font-medium">
              This referral request costs {quote.cost} referral{quote.cost === 1 ? "" : "s"}. You have {quote.totalAvailable}.
            </p>
            {session?.note ? (
              <p className="whitespace-pre-wrap break-words rounded-g-control bg-neutral-50 p-3 text-g-body text-g-ink border border-g-hairline">
                Your note: {session.note}
              </p>
            ) : null}
            {session?.noteFlags?.length ? <p className="text-g-meta text-g-amber">Double-check: {session.noteFlags.join("; ")}</p> : null}
            <label className="block text-g-meta text-g-ink-2">
              <span>Edit your note before sending</span>
              <textarea
                className="mt-1 w-full resize-none rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink"
                rows={3}
                maxLength={1400}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </label>
            {note !== (session?.note ?? "") ? (
              <GoalButton
                variant="outline"
                className="w-full"
                busy={busy}
                disabledReason={note.trim().length < 4 ? "Enter at least 4 characters" : undefined}
                onClick={() => void send({ kind: "submit_note", text: note }, note)}
              >
                Save the edited note
              </GoalButton>
            ) : null}
          </div>

          {quote.shortfall > 0 ? (
            <GoalNextStep reason={`Add ${quote.shortfall} more referral${quote.shortfall === 1 ? "" : "s"} to send this request.`}>
              <div className="mt-3">
                <GoalButton variant="primary" asChild className="w-full">
                  <a href="/plans">Add {quote.shortfall} more referral{quote.shortfall === 1 ? "" : "s"} on /plans</a>
                </GoalButton>
              </div>
            </GoalNextStep>
          ) : (
            <GoalNextStep reason="Send your referral request to verified employees. You are charged only when a referrer can see it.">
              <div className="mt-3 flex gap-3">
                <GoalButton variant="primary" className="flex-1" busy={busy} onClick={() => void send({ kind: "confirm_send", send: true }, "Send it")}>
                  Send it
                </GoalButton>
                <GoalButton variant="outline" className="flex-1" busy={busy} onClick={() => void send({ kind: "confirm_send", send: false }, "Not yet")}>
                  Not yet
                </GoalButton>
              </div>
            </GoalNextStep>
          )}
        </>
      ) : null}

      {step === "done" ? (
        <>
          <div className="mb-6 space-y-3 rounded-g-control border border-g-hairline bg-g-surface p-4">
            <GoalStatus
              status={session?.coverageStatus === "waiting_for_company_coverage" ? "waiting" : "referred"}
              label={session?.coverageStatus === "waiting_for_company_coverage" ? "Waiting for company coverage" : "With verified employees"}
            />
            <p className="text-g-body text-g-ink">
              {session?.coverageStatus === "waiting_for_company_coverage"
                ? "Your referral request is saved and costs nothing until a verified employee can see it."
                : "Your referral request is with verified employees."}
            </p>
          </div>
          <GoalNextStep reason="Track your referral request or start a new one.">
            <div className="mt-3 flex gap-3">
              <GoalButton variant="primary" asChild className="flex-1">
                <a href="/requests">Track it under My asks</a>
              </GoalButton>
              <GoalButton variant="outline" className="flex-1" busy={busy} onClick={() => { setNote(""); void send({ kind: "restart" }); }}>
                Ask at another company
              </GoalButton>
            </div>
          </GoalNextStep>
        </>
      ) : null}

      {step === "job_link" || step === "job_text" ? (
        <GoalNextStep reason={step === "job_link" ? "Paste the link to the job you want a referral for." : "Paste the job description."}>
          <form className="mt-3 flex gap-2" onSubmit={onSubmitText}>
            <input
              aria-label={step === "job_link" ? "Job link" : "Job description"}
              className="h-(--g-control-h) flex-1 rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3"
              maxLength={20000}
              placeholder={step === "job_link" ? "Paste the job link…" : "Paste the job description…"}
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <GoalButton variant="primary" type="submit" busy={busy} disabledReason={!text.trim() ? "Enter a link or description" : undefined}>
              Send
            </GoalButton>
          </form>
        </GoalNextStep>
      ) : null}
    </main>
  );
}
