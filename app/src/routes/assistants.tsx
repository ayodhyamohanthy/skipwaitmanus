import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Heading, Panel, StateChips, Toggle, field } from "@/components/preview-kit";

export const Route = createFileRoute("/assistants")({
  head: () => pageMeta("Connected assistants", "See and control which AI assistants and API tokens can use your SkipWait account."),
  component: Assistants,
});

const tabs = ["Assistants", "API tokens", "Activity"] as const;
type A = { name: string; scopes: string; last: string };
const seed: A[] = [{ name: "ChatGPT", scopes: "Read · Draft · Send with approval · Credits with approval", last: "Used 2 hours ago" }, { name: "Claude", scopes: "Read · Draft", last: "Used 3 days ago" }];
const activity = [["Today 10:14", "ChatGPT", "Drafted an ask to Wipro", "Waiting for your approval"], ["Today 10:02", "ChatGPT", "Searched companies: “product design, Bengaluru”", ""], ["Yesterday", "ChatGPT", "Ran Ask One-Pager · 3 credits", "Approved by you"], ["Yesterday", "Claude", "Read your open requests", ""], ["2 Oct", "ChatGPT", "Tried to send a 9th ask", "Blocked: open-request limit"]] as const;

function Assistants() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Assistants");
  const [list, setList] = useState(seed);
  const [confirmSend, setConfirmSend] = useState(true);
  const [tokens, setTokens] = useState<string[]>(["Job-tracker script · created 1 Oct"]);
  const [newTok, setNewTok] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<"Land" | "Momentum or Start">("Land");

  return <main className="page-content mx-auto max-w-3xl">
    <Heading eyebrow="Settings" title="Connected assistants" text="Use SkipWait from ChatGPT, Claude and your own tools. You stay in control of every ask and every credit." />
    <StateChips label="Plan:" states={["Land", "Momentum or Start"] as const} value={plan} onChange={setPlan} />
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-full bg-muted p-1">{tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-11 flex-1 whitespace-nowrap rounded-full px-4 text-sm ${tab === t ? "bg-background font-semibold shadow-sm" : ""}`}>{t}</button>)}</div>

    {plan !== "Land" ? <Panel className="text-center"><Bot className="mx-auto size-8" /><h2 className="mt-2 font-semibold">Assistants and API tokens come with Land</h2><p className="mt-1 text-sm text-muted-foreground">Land and Concierge members can sign in, connect and apply from ChatGPT, Claude, bots and their own tools.</p><Button asChild className="mt-4"><Link to="/plans">Upgrade to Land</Link></Button></Panel> : <>
    {tab === "Assistants" && <>
      {list.length === 0 ? <Panel className="text-center"><Bot className="mx-auto size-8" /><h2 className="mt-2 font-semibold">No assistants connected</h2><p className="mt-1 text-sm text-muted-foreground">In ChatGPT or Claude, add SkipWait as a connector and approve it here.</p></Panel> :
        <ul className="space-y-3">{list.map(a => <li key={a.name}><Panel><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted"><Bot className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block">{a.name}</strong><small className="block text-muted-foreground">{a.scopes}</small><small className="text-muted-foreground">{a.last}</small></span><Button variant="ghost" size="sm" onClick={() => setList(list.filter(x => x !== a))}><Trash2 />Disconnect</Button></div></Panel></li>)}</ul>}
      <Panel className="mt-4"><h2 className="font-semibold">Safety</h2><Toggle on={confirmSend} onChange={setConfirmSend} label="Ask me before any ask is sent" hint="Always on. Assistants can draft, you send." /><Toggle on={true} onChange={() => {}} label="Ask me before credits are spent" hint="Always on" /><p className="mt-2 text-xs text-muted-foreground">Assistants follow the same limits as you: open-request slots, daily asks, quality checks. They never move you up a queue.</p></Panel>
      <Panel tone="muted" className="mt-4"><h2 className="font-semibold">How to connect</h2><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm"><li>In ChatGPT or Claude, open Connectors and add <code className="rounded bg-background px-1">skipwait.me/mcp</code></li><li>Sign in and approve what it can do</li><li>Ask: “Find companies open to referrals for product designers”</li></ol><Button asChild variant="link" className="mt-1 px-0"><Link to="/connect-assistant">Preview the approval screen</Link></Button></Panel>
    </>}

    {tab === "API tokens" && <>
      {newTok && <Panel tone="accent" className="mb-4"><strong className="block">Copy your token now</strong><p className="text-sm">You won't see it again.</p><div className="mt-3 flex gap-2"><code className="min-w-0 flex-1 truncate rounded-xl bg-background px-3 py-3 font-mono text-sm">{newTok}</code><Button variant="outline" onClick={() => setNewTok(null)}><Copy />Copy</Button></div></Panel>}
      <Panel><h2 className="font-semibold">Your tokens</h2>{tokens.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No tokens yet.</p> : <ul className="mt-2">{tokens.map(t => <li key={t} className="flex min-h-14 items-center gap-3 border-b border-border last:border-0"><KeyRound className="size-5" /><span className="flex-1 text-sm">{t}</span><Button variant="ghost" size="sm" onClick={() => setTokens(tokens.filter(x => x !== t))}>Revoke</Button></li>)}</ul>}
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); if (!name.trim()) return; setTokens([...tokens, `${name} · created today`]); setNewTok("sw_live_••••••••••••••••7Qk2"); setName(""); }}><label className="flex-1"><span className="sr-only">Token name</span><input className={`${field} !mt-0`} placeholder="Name, e.g. Notion tracker" value={name} onChange={e => setName(e.target.value)} /></label><Button type="submit" size="lg"><Plus />Create token</Button></form>
        <p className="mt-3 text-xs text-muted-foreground">Tokens can read, draft and send with approval. They can't spend credits without you. <Link to="/developers" className="text-link">Developer docs</Link></p></Panel>
    </>}

    {tab === "Activity" && <Panel><h2 className="font-semibold">Everything assistants did</h2><ul className="mt-2">{activity.map(([t, who, what, note]) => <li key={t + what} className="border-b border-border py-3 last:border-0"><span className="text-xs text-muted-foreground">{t} · {who}</span><strong className="block text-sm">{what}</strong>{note && <small className={note.startsWith("Blocked") ? "text-destructive" : "text-muted-foreground"}>{note}</small>}</li>)}</ul><Button asChild variant="link" className="px-0"><Link to="/approve">Review waiting approval</Link></Button></Panel>}
    </>}
    <p className="example-banner mt-6">DESIGN PREVIEW · EXAMPLE ACTIVITY</p>
  </main>;
}
