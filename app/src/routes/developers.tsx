import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, KeyRound, ShieldCheck, Terminal, Webhook, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Panel } from "@/components/preview-kit";

export const Route = createFileRoute("/developers")({
  head: () => pageMeta("SkipWait for assistants & developers", "Connect SkipWait to ChatGPT, Claude or your own scripts with MCP and a simple API. Open to any app, agent or MCP client."),
  component: Developers,
});

const tools = [["search_companies", "Companies open to referrals, by role, location, function"], ["get_company", "Details and how to ask"], ["list_my_requests", "Your open and closed requests"], ["get_request_thread", "Replies and messages on one request"], ["draft_ask", "Create a draft ask — never sends"], ["send_ask", "Send a draft — needs your approval on phone or web"], ["withdraw_ask", "Free up a slot"], ["run_tool", "One-Pager, dossier, salary coach… — needs approval, spends credits"], ["list_alerts / save_alert", "Company and role alerts"], ["add_work_item", "Add to your work showcase"]] as const;

function Developers() {
  return <div className="min-h-screen">
    <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5"><Link to="/" className="wordmark text-xl">SkipWait<span className="brand-dot">.</span></Link><Button asChild variant="outline" size="sm"><Link to="/assistants">Connected assistants</Link></Button></header>
    <main className="mx-auto max-w-5xl px-4 pb-20">
      <p className="example-banner mb-6">DESIGN PREVIEW · API NOT LIVE</p>
      <span className="eyebrow">For assistants & developers</span>
      <h1 className="mt-2 max-w-3xl text-4xl font-semibold sm:text-5xl">Use SkipWait from ChatGPT, Claude, or your own code<span className="brand-dot">.</span></h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Your assistant finds companies, drafts asks and tracks replies. You approve every send. For Land and Concierge members.</p>
      <div className="mt-6 flex flex-wrap gap-2"><Button asChild size="lg"><Link to="/connect-assistant">Connect an assistant</Link></Button><Button asChild variant="outline" size="lg"><Link to="/developer-console">Build an app</Link></Button></div>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <Panel><Bot className="mb-3 size-6 text-primary" /><h2 className="font-semibold">MCP connector</h2><p className="mt-1 text-sm text-muted-foreground">Add <code>https://skipwait.me/mcp</code> in ChatGPT, Claude, Cursor or any MCP client. Sign in, approve, done.</p></Panel>
        <Panel><KeyRound className="mb-3 size-6 text-primary" /><h2 className="font-semibold">REST API</h2><p className="mt-1 text-sm text-muted-foreground">Personal tokens for scripts, trackers and spreadsheets. Same tools, same limits.</p></Panel>
        <Panel><Webhook className="mb-3 size-6 text-primary" /><h2 className="font-semibold">Webhooks</h2><p className="mt-1 text-sm text-muted-foreground">Signed events when an ask is accepted, passed or gets a message.</p></Panel>
      </div>

      <h2 className="mt-14 text-2xl font-semibold">Tools</h2>
      <Panel className="mt-4 overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="p-4">Tool</th><th className="p-4">What it does</th></tr></thead><tbody>{tools.map(([t, d]) => <tr key={t} className="border-t border-border"><td className="whitespace-nowrap p-4 font-mono text-xs">{t}</td><td className="p-4">{d}</td></tr>)}</tbody></table></Panel>

      <h2 className="mt-14 text-2xl font-semibold">Quick start</h2>
      <Panel tone="muted" className="mt-4 overflow-x-auto"><Terminal className="mb-2 size-5" /><pre className="font-mono text-xs leading-relaxed">{`curl https://skipwait.me/api/v1/companies?role=product+designer \\
  -H "Authorization: Bearer sw_live_…"`}</pre></Panel>

      <div className="mt-14 grid gap-4 md:grid-cols-2">
        <Panel><ShieldCheck className="mb-3 size-6 text-primary" /><h2 className="font-semibold">Same rules as people</h2><ul className="mt-2 space-y-1 text-sm text-muted-foreground"><li>Same open-request slots and daily ask limit</li><li>Quality checks on every ask</li><li>Referrer sees which assistant helped</li><li>Every call logged in your Activity</li></ul></Panel>
        <Panel><X className="mb-3 size-6 text-destructive" /><h2 className="font-semibold">Never possible</h2><ul className="mt-2 space-y-1 text-sm text-muted-foreground"><li>Automating a referrer's decision</li><li>Bulk or spray asks</li><li>Buying queue position</li><li>Reading anyone else's data</li></ul></Panel>
      </div>
      <Panel tone="muted" className="mt-4 text-sm"><strong>Open platform:</strong> any app, AI agent or MCP client (job trackers, assistants like Instinct) can integrate. Register in the <Link to="/developer-console" className="text-link">developer console</Link> for a verified badge. Users on Land and Concierge get full send and tool access through apps.</Panel>
    </main>
  </div>;
}
