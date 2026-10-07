import { Bot, KeyRound, ShieldCheck, Terminal, Webhook, X } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/developers` (screens/web/25_developers__default.png,
 * app/src/routes/developers.tsx).
 *
 * Standalone developer page: the MCP/REST/webhook surface, the tool table, a
 * quick-start curl, and the two rules panels.
 *
 * ONE COPY DECISION. The kit heads the page with "DESIGN PREVIEW · API NOT
 * LIVE", and the capture shows it. The label is preview scaffolding, but the
 * statement inside it is factually true — there is no MCP server and no
 * `/api/v1` yet, so deleting the whole banner would tell people to add
 * `https://skipwait.me/mcp` to Claude and get nothing back. So the preview
 * label is dropped and the true part is kept, worded as product status rather
 * than as a design marker. It comes out the day the endpoint exists.
 *
 * The tool table is the contract the kit specifies. Nothing here is
 * implemented server-side yet; this page describes what ships with it.
 */

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

const SAME_RULES = ["Same open-request slots and daily ask limit", "Quality checks on every ask", "Referrer sees which assistant helped", "Every call logged in your Activity"];
const NEVER = ["Automating a referrer's decision", "Bulk or spray asks", "Buying queue position", "Reading anyone else's data"];

const card = "rounded-lg border border-border bg-background p-5";

export default function Developers() {
  return (
    <div data-skipwait-screen="developers" className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5">
        <Link href="/" className="text-xl font-bold">SkipWait<span className="text-primary">.</span></Link>
        <Link href="/assistants" className="inline-flex min-h-11 items-center rounded-lg border border-foreground px-4 text-sm font-semibold">Connected assistants</Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20">
        <p className="mb-6 rounded-lg bg-muted px-4 py-3 text-xs font-semibold">
          Not live yet — the MCP server and API ship with assistant access.
        </p>

        <p className="eyebrow text-muted-foreground">For assistants &amp; developers</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold sm:text-5xl">
          Use SkipWait from ChatGPT, Claude, or your own code<span className="text-primary">.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Your assistant finds companies, drafts asks and tracks replies. You approve every send. For Land and Concierge members.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/connect-assistant" className="brand-button inline-flex items-center bg-primary text-sm font-semibold text-primary-foreground">Connect an assistant</Link>
          <Link href="/developer-console" className="brand-button inline-flex items-center border-2 border-foreground bg-background text-sm font-semibold">Build an app</Link>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          <section className={card}>
            <Bot className="mb-3 size-6 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">MCP connector</h2>
            <p className="mt-1 text-sm text-muted-foreground">Add <code className="font-mono text-xs">https://skipwait.me/mcp</code> in ChatGPT, Claude, Cursor or any MCP client. Sign in, approve, done.</p>
          </section>
          <section className={card}>
            <KeyRound className="mb-3 size-6 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">REST API</h2>
            <p className="mt-1 text-sm text-muted-foreground">Personal tokens for scripts, trackers and spreadsheets. Same tools, same limits.</p>
          </section>
          <section className={card}>
            <Webhook className="mb-3 size-6 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Webhooks</h2>
            <p className="mt-1 text-sm text-muted-foreground">Signed events when an ask is accepted, passed or gets a message.</p>
          </section>
        </div>

        <h2 className="mt-14 text-2xl font-semibold">Tools</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted">
              <tr><th className="p-4">Tool</th><th className="p-4">What it does</th></tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, description]) => (
                <tr key={name} className="border-t border-border">
                  <td className="whitespace-nowrap p-4 font-mono text-xs">{name}</td>
                  <td className="p-4">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-14 text-2xl font-semibold">Quick start</h2>
        <section className="mt-4 overflow-x-auto rounded-lg bg-muted p-5">
          <Terminal className="mb-2 size-5" aria-hidden="true" />
          <pre className="font-mono text-xs leading-relaxed">{`curl https://skipwait.me/api/v1/companies?role=product+designer \\
  -H "Authorization: Bearer sw_live_…"`}</pre>
        </section>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <section className={card}>
            <ShieldCheck className="mb-3 size-6 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Same rules as people</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {SAME_RULES.map(rule => <li key={rule}>{rule}</li>)}
            </ul>
          </section>
          <section className={card}>
            <X className="mb-3 size-6 text-destructive" aria-hidden="true" />
            <h2 className="font-semibold">Never possible</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {NEVER.map(rule => <li key={rule}>{rule}</li>)}
            </ul>
          </section>
        </div>

        <section className="mt-4 rounded-lg bg-muted p-5 text-sm">
          <strong>Open platform:</strong> any app, AI agent or MCP client (job trackers, assistants like Instinct) can integrate. Register in the{" "}
          <Link href="/developer-console" className="text-link">developer console</Link> for a verified badge. Users on Land and Concierge get full send and tool access through apps.
        </section>
      </main>
    </div>
  );
}
