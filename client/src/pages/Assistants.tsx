import { useState } from "react";
import { Bot, KeyRound, Trash2 } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/assistants` (screens/web/22_assistants__*.png,
 * app/src/routes/assistants.tsx).
 *
 * Three tabs — Assistants / API tokens / Activity — behind a plan gate.
 *
 * THREE DEPARTURES FROM THE KIT'S PREVIEW, all the same class of correction:
 *
 * 1. NO SEEDED ASSISTANTS. The kit ships two examples ("ChatGPT", "Claude")
 *    with scope strings and "Used 2 hours ago". Those are fabricated
 *    connections — the page would claim integrations the account does not have.
 *    It opens on the kit's own empty state instead.
 *
 * 2. NO SEEDED ACTIVITY. The kit's Activity tab lists five invented events
 *    including "Ran Ask One-Pager · 3 credits" and a blocked 9th ask. The kit
 *    labels it "EXAMPLE ACTIVITY"; in production that is fabricated history, so
 *    the tab shows an honest empty state until a real log exists.
 *
 * 3. NO FABRICATED TOKEN. The kit's create form sets the new token to a
 *    hard-coded "sw_live_••••••••••••••••7Qk2". Minting a fake credential is
 *    worse than the other two: a user would paste it into a script and it would
 *    never authenticate. Token creation needs the API, so the form is not
 *    offered until it exists.
 *
 * The plan gate also drops the kit's plan names ("Land", "Momentum or Start")
 * for the same reason /help and /emails do — this product sells Pro and Max, so
 * naming a tier nobody can buy is the same error class as an invented price.
 */

const TABS = ["Assistants", "API tokens", "Activity"] as const;
type Tab = (typeof TABS)[number];

const CAN = ["Read companies, requests, alerts and replies", "Draft asks for you to review", "Send an ask — only after you approve each one", "Run paid tools — the credit cost is shown, you approve first"];

const card = "rounded-lg border border-border bg-background p-5";
const quiet = "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground";

export default function Assistants() {
  const [tab, setTab] = useState<Tab>("Assistants");
  const [connected, setConnected] = useState<Array<{ name: string; scopes: string }>>([]);

  return (
    <main data-skipwait-screen="assistants" className="page-content mx-auto max-w-3xl">
      <p className="eyebrow text-muted-foreground">Settings</p>
      <h1 className="mt-3 text-4xl font-semibold">Connected assistants</h1>
      <p className="mt-2 text-sm text-muted-foreground">Use SkipWait from ChatGPT, Claude and your own tools. You stay in control of every ask and every credit.</p>

      <div role="tablist" aria-label="Assistant settings" className="mb-5 mt-6 flex gap-1 overflow-x-auto rounded-full bg-muted p-1">
        {TABS.map(name => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-full px-4 text-sm ${tab === name ? "bg-background font-semibold shadow-sm" : ""}`}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Assistants" && (
        <>
          {connected.length === 0 ? (
            <section className={`${card} text-center`}>
              <Bot className="mx-auto size-8" aria-hidden="true" />
              <h2 className="mt-2 font-semibold">No assistants connected</h2>
              <p className="mt-1 text-sm text-muted-foreground">In ChatGPT or Claude, add SkipWait as a connector and approve it here.</p>
              <Link href="/connect-assistant" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">See what an assistant can do</Link>
            </section>
          ) : (
            <ul className="space-y-3">
              {connected.map(assistant => (
                <li key={assistant.name}>
                  <section className={card}>
                    <div className="flex items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted" aria-hidden="true"><Bot className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <strong className="block">{assistant.name}</strong>
                        <small className="block text-muted-foreground">{assistant.scopes}</small>
                      </span>
                      <button type="button" className={quiet} onClick={() => setConnected(list => list.filter(entry => entry !== assistant))}>
                        <Trash2 className="size-4" aria-hidden="true" />Disconnect
                      </button>
                    </div>
                  </section>
                </li>
              ))}
            </ul>
          )}

          <section className={`${card} mt-4`}>
            <h2 className="font-semibold">What an assistant can do</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {CAN.map(item => <li key={item}>{item}</li>)}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Assistants follow the same limits as you: open-request slots, daily asks, quality checks. They never move you up a queue, and every send and every credit spend needs your approval.
            </p>
          </section>

          <section className="mt-4 rounded-lg bg-muted p-5">
            <h2 className="font-semibold">How to connect</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>In ChatGPT or Claude, open Connectors and add <code className="rounded bg-background px-1 font-mono text-xs">skipwait.me/mcp</code></li>
              <li>Sign in and approve what it can do</li>
              <li>Ask: "Find companies open to referrals for product designers"</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">Not live yet — the MCP server ships with assistant access.</p>
          </section>
        </>
      )}

      {tab === "API tokens" && (
        <section className={card}>
          <h2 className="font-semibold">Your tokens</h2>
          <p className="mt-2 text-sm text-muted-foreground">No tokens yet. Personal tokens are issued by the API, which is not live — this page will not show a token it cannot verify.</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Tokens will read, draft and send with approval. They cannot spend credits without you.{" "}
            <Link href="/developers" className="text-link">Developer docs</Link>
          </p>
        </section>
      )}

      {tab === "Activity" && (
        <section className={card}>
          <h2 className="font-semibold">Everything assistants did</h2>
          <p className="mt-2 text-sm text-muted-foreground">No assistant activity yet. Every call an assistant makes is recorded here, including the ones it was blocked from making.</p>
          <Link href="/approve" className="text-link mt-3 inline-flex min-h-11 items-center text-sm font-semibold">Review waiting approval</Link>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-border p-5">
        <KeyRound className="size-5 text-primary" aria-hidden="true" />
        <h2 className="mt-2 font-semibold">Assistants and API tokens are part of the top plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">Signing in, connecting and applying from ChatGPT, Claude, bots or your own tools is part of the highest tier. Referrals stay free for everyone.</p>
        <Link href="/plans" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground">See plans</Link>
      </section>
    </main>
  );
}
