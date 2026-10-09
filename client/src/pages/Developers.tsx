import { ArrowRight, Bot, KeyRound, ShieldCheck, Terminal, Webhook, X } from "lucide-react";
import { Link } from "wouter";

const TOOLS = [
  ["search_companies", "Companies open to referrals, by role, location, function"],
  ["get_company", "Details and how to ask"],
  ["list_my_requests", "Your open and closed requests"],
  ["get_request_thread", "Replies and messages on one request"],
  ["draft_ask", "Create a draft ask — never sends"],
  ["send_ask", "Send a draft — needs your approval on phone or web"],
  ["withdraw_ask", "Free up a slot"],
  ["run_tool", "One-Pager, dossier, salary coach… — needs approval, spends credits"],
  ["list_alerts / save_alert", "Company and role alerts"],
  ["add_work_item", "Add to your work showcase"],
] as const;

export default function Developers() {
  return (
    <div data-skipwait-screen="developers" className="min-h-screen bg-[var(--background)]">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4">
        <Link href="/" className="text-xl font-semibold tracking-[-.04em]" aria-label="SkipWait home">SkipWait<span className="brand-dot">.</span></Link>
        <span className="eyebrow">For builders</span>
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-16">
        <span className="eyebrow">For assistants &amp; developers</span>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold">Use SkipWait from ChatGPT, Claude, or your own code<span className="brand-dot">.</span></h1>
        <p className="mt-4 max-w-2xl text-[var(--muted-foreground)]">Your assistant finds companies, drafts asks and tracks replies. You approve every send. Open to any app, agent or MCP client.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/connect-assistant" className="brand-button">Connect an assistant <ArrowRight /></Link>
          <Link href="/developer-console" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Build an app</Link>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <article className="rounded-3xl border border-[var(--border)] p-5">
            <Bot className="size-5 text-[var(--primary)]" />
            <h2 className="mt-3 font-semibold">MCP connector</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">Add <code className="font-mono text-xs">https://skipwait.me/mcp</code> in ChatGPT, Claude, Cursor or any MCP client. Sign in, approve, done.</p>
          </article>
          <article className="rounded-3xl border border-[var(--border)] p-5">
            <KeyRound className="size-5 text-[var(--primary)]" />
            <h2 className="mt-3 font-semibold">REST API</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">Personal tokens for scripts, trackers and spreadsheets. Same tools, same limits.</p>
          </article>
          <article className="rounded-3xl border border-[var(--border)] p-5">
            <Webhook className="size-5 text-[var(--primary)]" />
            <h2 className="mt-3 font-semibold">Webhooks</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">Signed events when an ask is accepted, passed or gets a message.</p>
          </article>
        </div>

        <h2 className="mt-14 text-2xl font-semibold">Tools</h2>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--muted)]"><tr><th className="p-4">Tool</th><th className="p-4">What it does</th></tr></thead>
            <tbody>{TOOLS.map(([tool, description]) => <tr key={tool} className="border-t border-[var(--border)]"><td className="whitespace-nowrap p-4 font-mono text-xs">{tool}</td><td className="p-4">{description}</td></tr>)}</tbody>
          </table>
        </div>

        <h2 className="mt-14 text-2xl font-semibold">Quick start</h2>
        <div className="mt-4 overflow-x-auto rounded-3xl bg-[var(--muted)] p-5">
          <Terminal className="mb-2 size-5" />
          <pre className="font-mono text-xs leading-relaxed">{`curl https://skipwait.me/api/v1/companies?role=product+designer \\
  -H "Authorization: Bearer sw_live_…"`}</pre>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-[var(--border)] p-5">
            <ShieldCheck className="mb-3 size-5 text-[var(--primary)]" />
            <h2 className="font-semibold">Same rules as people</h2>
            <ul className="mt-2 space-y-1 text-sm text-[var(--muted-foreground)]"><li>Same open-request slots and daily ask limit</li><li>Quality checks on every ask</li><li>Referrer sees which assistant helped</li><li>Every call logged in your Activity</li></ul>
          </article>
          <article className="rounded-3xl border border-[var(--border)] p-5">
            <X className="mb-3 size-5 text-[var(--destructive)]" />
            <h2 className="font-semibold">Never possible</h2>
            <ul className="mt-2 space-y-1 text-sm text-[var(--muted-foreground)]"><li>Automating a referrer&apos;s decision</li><li>Bulk or spray asks</li><li>Buying queue position</li><li>Reading anyone else&apos;s data</li></ul>
          </article>
        </div>
        <div className="mt-4 rounded-3xl bg-[var(--muted)] p-5 text-sm">
          <p><strong>Open platform:</strong> any app, AI agent or MCP client can integrate. Register in the <Link href="/developer-console" className="text-link">developer console</Link> for a verified badge.</p>
        </div>

        <div className="mt-8 rounded-3xl border border-[var(--border)] p-5 text-sm">
          <p><strong>Human in the loop.</strong> Assistant connections, scoped tokens, approvals, and the activity log are live — manage them in the <Link href="/assistants" className="text-link">assistants page</Link>.</p>
          <p className="mt-2"><Link href="/support" className="text-link">Contact support for help <ArrowRight /></Link></p>
        </div>
      </main>
    </div>
  );
}
