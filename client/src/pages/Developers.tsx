import { Bot, CircleCheck, KeyRound, ShieldCheck, Terminal, X } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { DOCUMENTED_MCP_TOOLS, MCP_ENDPOINT } from "@/components/developers/mcpTools";

// Describes only what is live: the MCP endpoint, personal tokens issued in
// Connected assistants, and member approval of every proposed ask.
const QUICK_START = `curl ${MCP_ENDPOINT} \\
  -H "Authorization: Bearer sw_…" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

export default function Developers() {
  return (
    <div data-skipwait-screen="developers" className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5"><Link href="/" className="wordmark text-xl">SkipWait<span className="brand-dot">.</span></Link><Button asChild variant="outline" size="sm"><Link href="/assistants">Connected assistants</Link></Button></header>
      <main className="mx-auto max-w-5xl px-4 pb-20">
        <span className="eyebrow">For assistants & developers</span>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold sm:text-5xl">Use SkipWait from ChatGPT, Claude, or your own code<span className="brand-dot">.</span></h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">Your assistant finds companies, drafts asks and tracks replies. You approve every send. For Max members.</p>
        <div className="mt-6 flex flex-wrap gap-2"><Button asChild size="lg"><Link href="/connect-assistant">Connect an assistant</Link></Button><Button asChild variant="outline" size="lg"><Link href="/developer-console">Build an app</Link></Button></div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <Panel><Bot className="mb-3 size-6 text-primary" /><h2 className="font-semibold">MCP connector</h2><p className="mt-1 text-sm text-muted-foreground">Add <code>{MCP_ENDPOINT}</code> in ChatGPT, Claude, Cursor or any MCP client. Sign in, approve, done.</p></Panel>
          <Panel><KeyRound className="mb-3 size-6 text-primary" /><h2 className="font-semibold">Personal tokens</h2><p className="mt-1 text-sm text-muted-foreground">Create one in Connected assistants for your own scripts and trackers. Same tools, same limits.</p></Panel>
          <Panel><CircleCheck className="mb-3 size-6 text-primary" /><h2 className="font-semibold">Your approval</h2><p className="mt-1 text-sm text-muted-foreground">A proposed ask waits in SkipWait until you approve it, with the credit cost shown first.</p></Panel>
        </div>

        <h2 className="mt-14 text-2xl font-semibold">Tools</h2>
        <Panel className="mt-4 overflow-x-auto p-0"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr><th className="p-4">Tool</th><th className="p-4">What it does</th></tr></thead><tbody>{DOCUMENTED_MCP_TOOLS.map(([tool, description]) => <tr key={tool} className="border-t border-border"><td className="whitespace-nowrap p-4 font-mono text-xs">{tool}</td><td className="p-4">{description}</td></tr>)}</tbody></table></Panel>

        <h2 className="mt-14 text-2xl font-semibold">Quick start</h2>
        <Panel tone="muted" className="mt-4 overflow-x-auto"><Terminal className="mb-2 size-5" /><pre className="font-mono text-xs leading-relaxed">{QUICK_START}</pre></Panel>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <Panel><ShieldCheck className="mb-3 size-6 text-primary" /><h2 className="font-semibold">Same rules as people</h2><ul className="mt-2 space-y-1 text-sm text-muted-foreground"><li>Same open-request slots and credit costs</li><li>Quality checks on every ask</li><li>You approve every ask before it is sent</li><li>Every call logged in your Activity</li></ul></Panel>
          <Panel><X className="mb-3 size-6 text-destructive" /><h2 className="font-semibold">Never possible</h2><ul className="mt-2 space-y-1 text-sm text-muted-foreground"><li>Automating a referrer's decision</li><li>Bulk or spray asks</li><li>Buying queue position</li><li>Reading anyone else's data</li></ul></Panel>
        </div>
        <Panel tone="muted" className="mt-4 text-sm"><strong>Open platform:</strong> any app, AI agent or MCP client (job trackers, assistants) can integrate. Register in the <Link href="/developer-console" className="text-link">developer console</Link> for a verified badge. Members on Max can connect apps and approve the asks they propose.</Panel>
      </main>
    </div>
  );
}
