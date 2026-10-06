import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Check, Coins, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Panel, StateChips } from "@/components/preview-kit";

export const Route = createFileRoute("/approve")({
  head: () => pageMeta("Approve assistant action", "Approve, edit or decline an ask or paid tool that your assistant prepared."),
  component: Approve,
});

const states = ["Send an ask", "Spend credits", "Editing", "Sent", "Declined", "Slots full"] as const;

function Approve() {
  const [s, setS] = useState<(typeof states)[number]>("Send an ask");
  const [note, setNote] = useState("Hi — I'm a product designer with 5 years in fintech. I'd love a referral for the Senior Product Designer role (req #44120). My one-pager is attached. Thank you for considering it.");
  return <main className="page-content mx-auto max-w-lg">
    <StateChips states={states} value={s} onChange={setS} />
    <div className="rounded-[2rem] border border-border bg-card p-5 shadow-xl sm:p-6">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted sm:hidden" />
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><Bot className="size-4" />ChatGPT · just now</p>
      {(s === "Send an ask" || s === "Editing") && <>
        <h1 className="mt-2 text-2xl font-semibold">Send this ask to Wipro?</h1>
        <p className="mt-1 text-sm text-muted-foreground">Senior Product Designer · Bengaluru · uses 1 of your 30 open slots</p>
        {s === "Editing" ? <label className="mt-4 block"><span className="sr-only">Ask note</span><textarea className="min-h-40 w-full rounded-2xl border border-input bg-background p-4 text-base" value={note} onChange={e => setNote(e.target.value)} /></label> : <Panel tone="muted" className="mt-4 text-sm">{note}</Panel>}
        <ul className="mt-3 space-y-1 text-sm"><li className="flex gap-2"><Check className="size-4 text-primary" />Quality check passed</li><li className="flex gap-2"><Check className="size-4 text-primary" />Location fits the role</li><li className="flex gap-2"><Check className="size-4 text-primary" />Referrer sees “Sent with ChatGPT”</li></ul>
        <div className="mt-5 grid grid-cols-3 gap-2"><Button variant="ghost" onClick={() => setS("Declined")}><X />Decline</Button><Button variant="outline" onClick={() => setS(s === "Editing" ? "Send an ask" : "Editing")}><Pencil />{s === "Editing" ? "Done" : "Edit"}</Button><Button onClick={() => setS("Sent")}><Check />Send</Button></div>
      </>}
      {s === "Spend credits" && <>
        <h1 className="mt-2 text-2xl font-semibold">Make an Ask One-Pager?</h1>
        <p className="mt-1 text-sm text-muted-foreground">For Senior Product Designer at Wipro</p>
        <Panel tone="muted" className="mt-4 flex items-center gap-3"><Coins className="size-6" /><span className="flex-1"><strong className="block">3 credits</strong><small className="text-muted-foreground">You have 112 · 109 after this</small></span></Panel>
        <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setS("Declined")}>Not now</Button><Button onClick={() => setS("Sent")}>Use 3 credits</Button></div>
      </>}
      {s === "Sent" && <div className="py-4 text-center"><span className="mx-auto grid size-16 place-items-center rounded-full bg-accent"><Check className="size-8 text-primary" /></span><h1 className="mt-3 text-2xl font-semibold">Done</h1><p className="mt-1 text-sm text-muted-foreground">ChatGPT has been told. Track it in Requests.</p><Button asChild variant="outline" className="mt-4"><Link to="/requests">Open requests</Link></Button></div>}
      {s === "Declined" && <div className="py-4 text-center"><X className="mx-auto size-8" /><h1 className="mt-3 text-2xl font-semibold">Declined</h1><p className="mt-1 text-sm text-muted-foreground">Nothing was sent and no credits were used.</p></div>}
      {s === "Slots full" && <div className="py-2"><h1 className="mt-2 text-2xl font-semibold">All 30 slots are in use</h1><p className="mt-1 text-sm text-muted-foreground">ChatGPT saved this ask as a draft. It can be sent when a request is answered or you withdraw one.</p><div className="mt-5 grid grid-cols-2 gap-2"><Button asChild variant="outline"><Link to="/requests">Manage requests</Link></Button><Button onClick={() => setS("Declined")}>Keep as draft</Button></div></div>}
    </div>
    <p className="mt-4 text-center text-xs text-muted-foreground">Shown as a push notification and in Alerts. Unanswered approvals expire after 24 hours.</p>
  </main>;
}
