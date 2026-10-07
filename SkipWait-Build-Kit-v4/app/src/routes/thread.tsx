import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Clock3, ExternalLink, EyeOff, FileText, HelpCircle, Send, ShieldCheck, Undo2, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/thread")({
  head: () => pageMeta("Referral request thread", "One place for a referral request: the ask, the referrer's decision, private messages, and every status update."),
  component: Thread,
});

const stages = ["Requested", "Accepted", "Referred", "Interviewing", "Offer", "Hired"] as const;
const endStates = ["Declined", "Expired"] as const;
type Status = (typeof stages)[number] | (typeof endStates)[number];
const passReasons = ["Not my team or function", "Role needs more experience", "Not enough context", "At capacity right now", "Prefer not to say"];
type Msg = { from: "seeker" | "referrer" | "system"; text: string };

function Thread() {
  const [role, setRole] = useState<"seeker" | "referrer">("referrer");
  const [status, setStatus] = useState<Status>("Requested");
  const [modal, setModal] = useState<null | "accept" | "pass" | "info" | "referred" | "withdraw">(null);
  const [reason, setReason] = useState(passReasons[0]);
  const [confirmed, setConfirmed] = useState(false);
  const [draft, setDraft] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const accepted = !["Requested", ...endStates].includes(status);
  const idx = stages.indexOf(status as (typeof stages)[number]);
  const go = (s: Status, m?: Msg) => { setStatus(s); if (m) setMsgs(x => [...x, m]); setModal(null); };
  const send = () => { if (!draft.trim()) return; setMsgs(x => [...x, { from: role, text: draft.trim() }]); setDraft(""); };
  const reset = (s: Status) => { setStatus(s); setMsgs(s === "Requested" || s === "Expired" || s === "Declined" ? [] : [{ from: "system", text: "Request accepted. Identities and resume are now shared." }, { from: "referrer", text: "Happy to help — I'll submit this through our referral portal this week." }]); };

  return <main className="page-content">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Link to="/requests" className="text-link flex items-center gap-1 text-sm"><ArrowLeft className="size-4" />All requests</Link>
      <div className="flex rounded-full bg-muted p-1 text-sm" role="tablist" aria-label="View as">{(["seeker", "referrer"] as const).map(r => <button key={r} role="tab" aria-selected={role === r} onClick={() => setRole(r)} className={`min-h-10 rounded-full px-4 ${role === r ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{r === "seeker" ? "Seeker view" : "Referrer view"}</button>)}</div></div>
    <div className="mb-4 flex flex-wrap gap-2 text-xs"><span className="example-banner !m-0"><ShieldCheck />EXAMPLE THREAD · NOT LIVE ACTIVITY</span><span className="self-center text-muted-foreground">Jump to state:</span>{[...stages, ...endStates].map(s => <button key={s} onClick={() => reset(s)} className={`rounded-full border px-3 py-1 ${status === s ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>{s}</button>)}</div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 rounded-3xl border border-border bg-card">
        <header className="flex flex-wrap items-start gap-3 border-b border-border p-5"><span className="company-mark">W</span><div className="min-w-0 flex-1"><span className="eyebrow">DESIGN · WIPRO</span><h1 className="text-2xl font-semibold">Product Designer</h1><a href="#" className="text-link mt-1 inline-flex items-center gap-1 text-sm">Official job posting <ExternalLink className="size-3.5" /></a></div><StatusPill status={status} /></header>

        <ol className="flex gap-1 overflow-x-auto border-b border-border px-5 py-4" aria-label="Request progress">{stages.map((s, i) => <li key={s} className="min-w-16 flex-1"><span className={`block h-1.5 rounded-full ${idx >= i ? "bg-primary" : "bg-muted"}`} /><span className={`mt-1.5 block text-[11px] ${idx === i ? "font-semibold" : "text-muted-foreground"}`}>{s}</span></li>)}</ol>

        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">{accepted || role === "seeker" ? <UserRound className="size-5" /> : <EyeOff className="size-5" />}</span><div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-muted p-4"><strong className="text-sm">{accepted || role === "seeker" ? "Asha R. · Senior Product Designer" : "Seeker · identity hidden"}</strong><p className="mt-1">"I've led two end-to-end redesigns for enterprise workflow products and would value an honest fit check for this role."</p><div className="mt-3 flex flex-wrap gap-2 text-xs">{accepted ? <><span className="flex items-center gap-1 rounded-full bg-background px-3 py-1"><FileText className="size-3.5" />Resume.pdf</span><Link to="/p/$handle" params={{ handle: "preview" }} className="flex items-center gap-1 rounded-full bg-background px-3 py-1">Work profile <ArrowRight className="size-3" /></Link></> : <span className="flex items-center gap-1 rounded-full bg-background px-3 py-1"><EyeOff className="size-3.5" />Resume and profile shared after acceptance</span>}</div></div></div>

          {status === "Requested" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4" />{role === "seeker" ? "Waiting for a verified Wipro referrer. Expires in 6 days if nobody accepts — your slot returns automatically." : "Expires in 6 days. No reply needed to pass — but a quick answer helps."}</p>}
          {status === "Declined" && <Notice tone="muted" title={role === "seeker" ? "This referrer passed." : "You passed privately."} text={role === "seeker" ? "It's not a judgment of you. Your slot is open again — try another verified referrer at Wipro." : `Reason shared with the seeker: "${reason}". Your identity was never revealed.`} />}
          {status === "Expired" && <Notice tone="muted" title="This request expired." text={role === "seeker" ? "Nobody could take it within 7 days. Your slot is free — refresh your note and ask again." : "It left your queue automatically. No penalty."} />}

          {msgs.map((m, i) => m.from === "system" ? <p key={i} className="text-center text-xs text-muted-foreground">— {m.text} —</p> : <div key={i} className={`flex ${m.from === role ? "justify-end" : ""}`}><p className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.from === role ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"}`}>{m.text}</p></div>)}
          {status === "Referred" && <Notice tone="accent" title="Referral submitted" text="Submitted through Wipro's internal referral portal. Companies decide hiring; SkipWait never promises outcomes." />}
          {status === "Hired" && <Notice tone="accent" title="Hired. Congratulations." text={role === "seeker" ? "Thank your referrer, then pay it forward — become a referrer once you're verified." : "Thank you for opening this door."} />}
        </div>

        {accepted && <div className="flex gap-2 border-t border-border p-4"><input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Write a message…" aria-label="Message" className="h-12 min-w-0 flex-1 rounded-full border border-input bg-background px-4" /><Button size="icon" className="size-12 rounded-full" aria-label="Send" onClick={send}><Send /></Button></div>}
      </section>

      <aside className="space-y-4">
        <div className="rounded-3xl border border-border p-5">
          <span className="eyebrow">{role === "referrer" ? "YOUR DECISION" : "YOUR NEXT STEP"}</span>
          {role === "referrer" && status === "Requested" && <><h2 className="mt-2 text-lg font-semibold">Would you refer this person?</h2><div className="mt-4 grid gap-2"><Button onClick={() => setModal("accept")}>Accept & connect <ArrowRight /></Button><Button variant="outline" onClick={() => setModal("info")}><HelpCircle />Ask one question</Button><Button variant="ghost" onClick={() => setModal("pass")}>Pass privately</Button></div></>}
          {role === "referrer" && status === "Accepted" && <><h2 className="mt-2 text-lg font-semibold">Submit through your company.</h2><p className="mt-1 text-sm text-muted-foreground">Then mark it here so the seeker knows.</p><Button className="mt-4 w-full" onClick={() => setModal("referred")}>Mark as referred <Check /></Button></>}
          {role === "seeker" && status === "Requested" && <><h2 className="mt-2 text-lg font-semibold">Nothing to do yet.</h2><p className="mt-1 text-sm text-muted-foreground">We'll notify you the moment it's accepted.</p><Button variant="ghost" className="mt-4 w-full" onClick={() => setModal("withdraw")}><Undo2 />Withdraw request</Button></>}
          {role === "seeker" && ["Referred", "Interviewing", "Offer"].includes(status) && <><h2 className="mt-2 text-lg font-semibold">Update your progress</h2><div className="mt-3 grid gap-2">{(["Interviewing", "Offer", "Hired"] as const).filter(s => stages.indexOf(s) > idx).map(s => <Button key={s} variant="outline" onClick={() => go(s, { from: "system", text: `Seeker updated status to ${s}.` })}>{s}</Button>)}</div><Link to="/plans" className="text-link mt-4 block text-sm">Prepare with an interview dossier →</Link></>}
          {(status === "Declined" || status === "Expired") && <Button asChild className="mt-4 w-full"><Link to="/explore">Find another referrer <ArrowRight /></Link></Button>}
          {((role === "referrer" && !["Requested", "Accepted", "Declined", "Expired"].includes(status)) || (role === "seeker" && ["Accepted", "Hired"].includes(status))) && <p className="mt-2 text-sm text-muted-foreground">{status === "Hired" ? <Link to="/landed" className="text-link">Open the landed journey →</Link> : "Use messages to coordinate. Keep personal contact details off-platform only if you both choose to."}</p>}
        </div>
        <div className="rounded-3xl bg-muted p-5 text-sm"><span className="eyebrow">REFERRER</span><p className="mt-2 flex items-center gap-2 font-medium">{accepted ? "Rahul K. · Design Lead" : "Someone at Wipro"}<BadgeCheck className="size-4 text-primary" /></p><p className="text-muted-foreground">Verified via work email</p></div>
        <div className="rounded-3xl border border-border p-5 text-sm text-muted-foreground"><ShieldCheck className="mb-2 size-5 text-primary" />Referrals are free. Never pay or accept money for a referral. <Link to="/report" className="text-link">Report or block</Link></div>
      </aside>
    </div>

    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="m-title" onClick={e => e.stopPropagation()}><Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={() => setModal(null)}><X /></Button>
      {modal === "accept" && <><h2 id="m-title" className="text-xl font-semibold">Accept this request?</h2><p className="mt-2 text-muted-foreground">You'll both see names, and you'll get the resume.</p><label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-1 size-4" />I'll refer only through Wipro's official process and won't accept anything in return.</label><footer className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button disabled={!confirmed} onClick={() => go("Accepted", { from: "system", text: "Request accepted. Identities and resume are now shared." })}>Accept <Check /></Button></footer></>}
      {modal === "pass" && <><h2 id="m-title" className="text-xl font-semibold">Pass privately</h2><p className="mt-2 text-muted-foreground">The seeker sees a kind note with your reason. Never your name.</p><div className="mt-4 grid gap-2">{passReasons.map(r => <label key={r} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 ${reason === r ? "border-primary bg-primary/5" : "border-border"}`}><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />{r}</label>)}</div><footer className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button onClick={() => go("Declined")}>Pass</Button></footer></>}
      {modal === "info" && <><h2 id="m-title" className="text-xl font-semibold">Ask one question</h2><p className="mt-2 text-muted-foreground">You stay anonymous. The request stays in your queue.</p><textarea className="mt-4 min-h-28 w-full rounded-xl border border-input bg-background p-3" defaultValue="Could you share a link to one project most relevant to this role?" aria-label="Question" /><footer className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button onClick={() => go("Requested", { from: "system", text: "Referrer asked a question. Seeker notified." })}>Send question</Button></footer></>}
      {modal === "referred" && <><h2 id="m-title" className="text-xl font-semibold">Mark as referred</h2><p className="mt-2 text-muted-foreground">Optional: add your portal's reference so the seeker can mention it.</p><input className="mt-4 h-12 w-full rounded-xl border border-input bg-background px-4" placeholder="Reference ID (optional)" aria-label="Reference ID" /><footer className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button onClick={() => go("Referred", { from: "system", text: "Referrer marked this as referred." })}>Confirm <Check /></Button></footer></>}
      {modal === "withdraw" && <><h2 id="m-title" className="text-xl font-semibold">Withdraw this request?</h2><p className="mt-2 text-muted-foreground">It leaves the referrer's queue and frees your slot.</p><footer className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setModal(null)}>Keep it</Button><Button variant="destructive" onClick={() => go("Expired")}>Withdraw</Button></footer></>}
    </section></div>}
  </main>;
}

function Notice({ tone, title, text }: { tone: "muted" | "accent"; title: string; text: string }) {
  return <div className={`rounded-2xl p-4 ${tone === "accent" ? "bg-accent text-accent-foreground" : "bg-muted"}`}><strong>{title}</strong><p className="mt-1 text-sm">{text}</p></div>;
}
