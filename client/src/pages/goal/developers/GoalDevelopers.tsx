// Goal /developers (D-048-p3-dev; packet docs/plans/D-048-admin.md). A public
// page that fetches nothing, in the static goal frame. It states only what is
// live, like the kit page: the MCP endpoint, personal tokens issued in
// Connected assistants, and member approval of every proposed ask.
import { Link } from "wouter";
import { GoalButton, GoalNextStep } from "@/components/goal";
import { GoalStaticFrame } from "@/components/goal/GoalStaticFrame";
import { DOCUMENTED_MCP_TOOLS, MCP_ENDPOINT } from "@/components/developers/mcpTools";

export const GOAL_PAGE = { goalLine: "Connect your assistant or build your app." } as const;

const QUICK_START = `curl ${MCP_ENDPOINT} \\
  -H "Authorization: Bearer sw_…" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

const FACTS = [
  ["MCP connector", <>Add <code className="font-g-mono text-g-meta">{MCP_ENDPOINT}</code> in ChatGPT, Claude, Cursor or any MCP client. Sign in, approve, done.</>],
  ["Personal tokens", <>Create one in <Link href="/assistants" className="text-g-ink underline underline-offset-[3px] hover:no-underline">Connected assistants</Link> for your own scripts and trackers. Same tools, same limits.</>],
  ["Your approval", <>A proposed ask waits in skipwait.me until you approve it, with the credit cost shown first.</>],
] as const;

const SAME_RULES = ["Same open-request slots and credit costs", "Quality checks on every ask", "You approve every ask before it is sent", "Every call logged in your Activity"];
const NEVER = ["Automating a referrer's decision", "Bulk or spray asks", "Buying queue position", "Reading anyone else's data"];

function RuleList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <section className="border border-g-hairline p-4 gdesk:p-5">
      <h2 className="text-g-heading text-g-ink">{title}</h2>
      <ul className="mt-2 grid gap-1 text-g-meta text-g-ink-2">{items.map(item => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}

export default function GoalDevelopers() {
  return (
    <GoalStaticFrame status="For Land and Concierge members">
      <div data-skipwait-screen="developers" data-goal-page="developers">
        <h1 className="text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
        <p className="mt-2 text-g-body text-g-ink-2">Use skipwait.me from ChatGPT, Claude, or your own code. Your assistant finds companies, drafts asks and tracks replies. You approve every send.</p>

        <div className="mt-6"><GoalNextStep reason="Connect the assistant you already use. Every ask it drafts waits for your approval.">
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <GoalButton variant="primary" touch="large" asChild><Link href="/connect-assistant">Connect an assistant</Link></GoalButton>
            <GoalButton variant="outline" touch="large" asChild><Link href="/developer-console">Build an app</Link></GoalButton>
          </div>
        </GoalNextStep></div>

        <dl className="mt-8 grid gap-4 gdesk:grid-cols-3">
          {FACTS.map(([title, body]) => (
            <div key={title} className="border-t border-g-hairline pt-3">
              <dt className="text-g-label text-g-ink">{title}</dt>
              <dd className="mt-1 text-g-meta text-g-ink-2">{body}</dd>
            </div>
          ))}
        </dl>

        <h2 id="goal-dev-tools" className="mt-10 text-g-heading text-g-ink">Tools</h2>
        <div className="mt-3 overflow-x-auto border border-g-hairline">
          <table aria-labelledby="goal-dev-tools" className="w-full text-left text-g-meta">
            <thead><tr className="text-g-ink-2"><th scope="col" className="px-4 py-3 font-medium">Tool</th><th scope="col" className="px-4 py-3 font-medium">What it does</th></tr></thead>
            <tbody>{DOCUMENTED_MCP_TOOLS.map(([tool, description]) => (
              <tr key={tool} className="border-t border-g-hairline"><td className="whitespace-nowrap px-4 py-3 font-g-mono text-g-ink">{tool}</td><td className="px-4 py-3 text-g-ink-2">{description}</td></tr>
            ))}</tbody>
          </table>
        </div>

        <h2 className="mt-10 text-g-heading text-g-ink">Quick start</h2>
        <pre className="mt-3 overflow-x-auto border border-g-hairline bg-g-surface p-4 font-g-mono text-g-meta leading-relaxed text-g-ink">{QUICK_START}</pre>

        <div className="mt-10 grid gap-4 gdesk:grid-cols-2">
          <RuleList title="Same rules as people" items={SAME_RULES} />
          <RuleList title="Never possible" items={NEVER} />
        </div>
        <p className="mt-4 text-g-meta text-g-ink-2"><span className="text-g-ink">Open platform:</span> any app, AI agent or MCP client (job trackers, assistants) can integrate. Register in the <Link href="/developer-console" className="text-g-ink underline underline-offset-[3px] hover:no-underline">developer console</Link> for a verified badge. Users on Land and Concierge get full send and tool access through apps.</p>
      </div>
    </GoalStaticFrame>
  );
}
