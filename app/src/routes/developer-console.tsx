import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppWindow, BadgeCheck, Bot, Clock, Copy, Plus, ShieldAlert, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Panel, StateChips, field } from "@/components/preview-kit";

export const Route = createFileRoute("/developer-console")({
  head: () => pageMeta("Developer console", "Register your app, AI agent or MCP client so its users can search and apply for referrals on SkipWait."),
  component: Console,
});

const kinds = [["Web or mobile app", "Job trackers, career tools, ATS-like apps", AppWindow], ["AI agent or MCP client", "Assistants that apply on a user's behalf", Bot], ["Server integration", "Back-office sync with webhooks", Webhook]] as const;
const scopes = [["companies:read", "Search companies open to referrals", false], ["requests:read", "Read the user's requests and replies", false], ["asks:draft", "Create draft asks", false], ["asks:send", "Send asks — user approves each one in SkipWait", true], ["profile:read", "Basic profile and resume (with user consent)", true], ["credits:spend", "Run paid tools — user approves cost each time", true], ["webhooks", "Accepted / passed / message events", false]] as const;
const states = ["My apps", "New app", "App details", "In review", "Rejected", "Suspended"] as const;

function Console() {
  const [s, setS] = useState<(typeof states)[number]>("My apps");
  const [kind, setKind] = useState(0);
  const [sel, setSel] = useState<string[]>(["companies:read", "requests:read", "asks:draft"]);
  const t = (k: string) => setSel(x => x.includes(k) ? x.filter(y => y !== k) : [...x, k]);

  return <div className="min-h-screen">
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5"><Link to="/developers" className="wordmark text-xl">SkipWait<span className="brand-dot">.</span> <small className="font-mono text-xs text-muted-foreground">developers</small></Link><span className="text-sm text-muted-foreground">dev@instinct.app</span></header>
    <main className="mx-auto max-w-3xl px-4 pb-20">
      <StateChips states={states} value={s} onChange={setS} />

      {s === "My apps" && <>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-semibold">Your apps</h1><p className="mt-1 text-muted-foreground">Let your users find companies and apply for referrals without leaving your product.</p></div><Button onClick={() => setS("New app")}><Plus />New app</Button></div>
        <ul className="mt-6 space-y-3">{[["Instinct", "AI agent · Live · verified", "Live", BadgeCheck], ["Instinct (staging)", "Test mode · 3 test users", "Test", Clock]].map(([n, d, st, I]) => { const Icon = I as typeof Clock; return <li key={n as string}><button onClick={() => setS("App details")} className="w-full text-left"><Panel className="flex items-center gap-3 hover:border-primary"><span className="grid size-11 place-items-center rounded-xl bg-muted"><Bot className="size-5" /></span><span className="flex-1"><strong className="block">{n as string}</strong><small className="text-muted-foreground">{d as string}</small></span><span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"><Icon className="size-3.5" />{st as string}</span></Panel></button></li>; })}</ul>
      </>}

      {s === "New app" && <>
        <h1 className="text-3xl font-semibold">Register an app</h1>
        <fieldset className="mt-6"><legend className="font-semibold">What are you building?</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{kinds.map(([k, d, I], i) => <button key={k} type="button" onClick={() => setKind(i)} aria-pressed={kind === i} className={`rounded-2xl border p-4 text-left ${kind === i ? "border-primary bg-primary/5" : "border-border"}`}><I className="mb-2 size-5" /><strong className="block text-sm">{k}</strong><small className="text-muted-foreground">{d}</small></button>)}</div></fieldset>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">App name<input className={field} defaultValue="Instinct" /></label><label className="text-sm font-medium">Website<input className={field} defaultValue="https://instinct.app" /></label><label className="text-sm font-medium sm:col-span-2">Redirect URLs<input className={field} defaultValue="https://instinct.app/oauth/skipwait" /></label><label className="text-sm font-medium sm:col-span-2">What does your app do for job seekers?<textarea className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background p-4 text-base" placeholder="Shown to users on the approval screen" /></label></div>
        {kind === 1 && <Panel tone="muted" className="mt-4 text-sm">MCP clients can also connect with no registration through <code>skipwait.me/mcp</code> (dynamic registration). Registering gets you a verified badge, your logo on the approval screen and higher limits.</Panel>}
        <fieldset className="mt-6"><legend className="font-semibold">Permissions</legend><p className="text-sm text-muted-foreground">Ask only for what you need. Items marked review are checked by our team.</p><ul className="mt-2">{scopes.map(([k, d, r]) => <li key={k}><label className="flex min-h-12 items-center gap-3 border-b border-border py-2"><input type="checkbox" className="size-5" checked={sel.includes(k)} onChange={() => t(k)} /><span className="flex-1"><code className="text-xs">{k}</code><small className="block text-muted-foreground">{d}</small></span>{r && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">review</span>}</label></li>)}</ul></fieldset>
        <label className="mt-4 flex gap-3 text-sm"><input type="checkbox" defaultChecked className="mt-1 size-5" />I agree to the developer terms: no bulk asks, no selling user data, no automating referrer decisions, show users what is sent.</label>
        <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={() => setS("My apps")}>Cancel</Button><Button onClick={() => setS("In review")}>Create app</Button></div>
      </>}

      {s === "App details" && <>
        <h1 className="flex items-center gap-2 text-3xl font-semibold">Instinct <BadgeCheck className="text-primary" /></h1><p className="text-muted-foreground">AI agent · Live</p>
        <Panel className="mt-6"><h2 className="font-semibold">Credentials</h2><div className="mt-3 space-y-3 text-sm"><div><small className="text-muted-foreground">Client ID</small><div className="flex gap-2"><code className="flex-1 truncate rounded-xl bg-muted px-3 py-2">sw_app_7f3k29ab</code><Button variant="outline" size="sm"><Copy />Copy</Button></div></div><div><small className="text-muted-foreground">Client secret</small><div className="flex gap-2"><code className="flex-1 rounded-xl bg-muted px-3 py-2">••••••••••••</code><Button variant="outline" size="sm">Rotate</Button></div></div></div></Panel>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">{[["Connected users", "Shown once live"], ["Asks sent via app", "Shown once live"], ["Approval rate", "Shown once live"]].map(([a, b]) => <Panel key={a}><small className="text-muted-foreground">{a}</small><strong className="block text-lg">—</strong><small className="text-muted-foreground">{b}</small></Panel>)}</div>
        <Panel className="mt-4"><h2 className="font-semibold">Webhooks</h2><input className={field} defaultValue="https://instinct.app/hooks/skipwait" aria-label="Webhook URL" /><p className="mt-2 text-xs text-muted-foreground">Events are signed. Verify the signature header before trusting them.</p></Panel>
        <Panel tone="muted" className="mt-4 text-sm"><strong>Limits:</strong> per user, the same open-request and daily-ask limits as the SkipWait app. Per app: 600 requests/min. Users on any plan can connect; what they can do follows their own plan.</Panel>
      </>}

      {s === "In review" && <Panel className="text-center"><Clock className="mx-auto size-8" /><h1 className="mt-3 text-2xl font-semibold">Instinct is in review</h1><p className="mt-2 text-sm text-muted-foreground">Test mode works now for up to 10 test users. Review for send and profile permissions usually takes 2–5 business days.</p><Button className="mt-4" onClick={() => setS("App details")}>Open test credentials</Button></Panel>}
      {s === "Rejected" && <Panel><ShieldAlert className="size-8 text-destructive" /><h1 className="mt-3 text-2xl font-semibold">Changes needed</h1><ul className="mt-2 list-disc space-y-1 pl-5 text-sm"><li>Your app sends asks without showing the user the final note first.</li><li>Privacy policy link is missing.</li></ul><Button className="mt-4" onClick={() => setS("New app")}>Edit and resubmit</Button></Panel>}
      {s === "Suspended" && <Panel><ShieldAlert className="size-8 text-destructive" /><h1 className="mt-3 text-2xl font-semibold">App suspended</h1><p className="mt-2 text-sm text-muted-foreground">Many referrers reported repeated asks sent through your app. Connected users have been notified. Reply to the safety team to appeal.</p><Button variant="outline" className="mt-4" asChild><Link to="/help">Contact safety team</Link></Button></Panel>}
      <p className="example-banner mt-8">DESIGN PREVIEW · EXAMPLE APP</p>
    </main>
  </div>;
}
