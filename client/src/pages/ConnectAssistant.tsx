import { useState } from "react";
import { Bot, Check, Clock, Lock, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { Link } from "wouter";

/**
 * Kit v4 `/connect-assistant` (screens/web/24_connect-assistant__*.png,
 * app/src/routes/connect-assistant.tsx).
 *
 * The OAuth consent screen for an assistant, with all seven designed states.
 *
 * ONE COPY CHANGE. The kit's consent line names a specific account —
 * "ChatGPT will be able to use SkipWait as asha@gmail.com". That is a sample
 * address, and printing someone's address on a consent screen is exactly the
 * kind of detail that must come from the session. It now says "your signed-in
 * account", which is true for every reader; the real address belongs here once
 * the connection flow supplies it.
 *
 * The state switcher stays for the same reason as /app-states: this screen's
 * job is to show every outcome of a consent attempt. The states themselves are
 * driven by the real flow (signed out, plan gate, expiry) once the OAuth
 * handshake exists — nothing here grants access on its own.
 */

const STATES = ["Consent", "Unverified app", "Signed out", "Not on Land", "Expired", "Approved", "Declined"] as const;
type State = (typeof STATES)[number];

const CAN = [
  ["Search companies open to referrals", "read"],
  ["See your requests, alerts and replies", "read"],
  ["Draft asks for you to review", "draft"],
  ["Send an ask — only after you approve each one", "send"],
  ["Run paid tools — shows the credit cost, you approve first", "credits"],
] as const;

const NEVER = [
  "Accept, pass or refer on anyone's behalf",
  "See referrers' work emails or other people's data",
  "Skip the queue or go past your open-request limit",
  "Buy plans or credits",
];

const card = "rounded-lg border border-border bg-background p-5";
const primary = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground";
const outline = "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-foreground bg-background px-5 text-sm font-semibold";

export default function ConnectAssistant() {
  const [state, setState] = useState<State>("Consent");
  const [scopes, setScopes] = useState<string[]>(CAN.map(([, key]) => key));
  const toggle = (key: string) => setScopes(current => (current.includes(key) ? current.filter(value => value !== key) : [...current, key]));

  return (
    <main data-skipwait-screen="connect-assistant" className="mx-auto min-h-dvh max-w-lg px-4 py-8 sm:py-14">
      <Link href="/" className="mb-6 inline-block text-xl font-bold">SkipWait<span className="text-primary">.</span></Link>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Consent state">
        {STATES.map(name => (
          <button
            key={name}
            type="button"
            aria-pressed={state === name}
            onClick={() => setState(name)}
            className={`min-h-11 rounded-full border px-4 text-xs font-semibold ${state === name ? "border-primary bg-accent" : "border-border"}`}
          >
            {name}
          </button>
        ))}
      </div>

      {state === "Consent" && (
        <>
          <div className="mt-6 flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-2xl bg-muted" aria-hidden="true"><Bot className="size-7" /></span>
            <span className="text-2xl text-muted-foreground" aria-hidden="true">→</span>
            <span className="grid size-14 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground" aria-hidden="true">S</span>
          </div>
          <h1 className="mt-5 text-3xl font-semibold">Connect ChatGPT to SkipWait</h1>
          <p className="mt-2 text-muted-foreground">
            ChatGPT will be able to use SkipWait as <strong className="text-foreground">your signed-in account</strong>.{" "}
            <button type="button" className="text-link">Switch account</button>
          </p>

          <section className={`${card} mt-6`}>
            <h2 className="font-semibold">It can</h2>
            <ul className="mt-2">
              {CAN.map(([label, key]) => (
                // Keyed on the label, not the scope: two rows share the "read"
                // scope, and duplicate React keys can silently drop children.
                <li key={label}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border py-2 last:border-0">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--primary)]"
                      checked={scopes.includes(key)}
                      onChange={() => toggle(key)}
                      disabled={key === "read"}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-3 rounded-lg bg-muted p-5">
            <h2 className="font-semibold">It can never</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {NEVER.map(rule => (
                <li key={rule} className="flex gap-2"><X className="size-4 shrink-0 text-destructive" aria-hidden="true" />{rule}</li>
              ))}
            </ul>
          </section>

          <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
            <Lock className="size-4 shrink-0" aria-hidden="true" />
            Asks it sends show "Sent with ChatGPT" to the referrer. You can disconnect anytime in Settings → Connected assistants.
          </p>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <button type="button" className={outline} onClick={() => setState("Declined")}>Cancel connection</button>
            <button type="button" className={primary} onClick={() => setState("Approved")}>Approve</button>
          </div>
        </>
      )}

      {state === "Unverified app" && (
        <section className="mt-6 rounded-lg border-2 border-destructive bg-background p-5">
          <ShieldAlert className="size-8 text-destructive" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-semibold">"JobBot" isn't verified by SkipWait</h1>
          <p className="mt-2 text-sm text-muted-foreground">It connected through the open MCP link. It can only read and draft until it's verified. Only continue if you trust it.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" className={outline} onClick={() => setState("Declined")}>Cancel</button>
            <button type="button" className={primary} onClick={() => setState("Approved")}>Continue, read &amp; draft only</button>
          </div>
        </section>
      )}

      {state === "Signed out" && (
        <section className={`${card} mt-6 text-center`}>
          <Bot className="mx-auto size-8" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-semibold">Sign in to connect ChatGPT</h1>
          <p className="mt-2 text-sm text-muted-foreground">You'll come straight back here after signing in.</p>
          <Link href="/sign-in" className={`${primary} mt-5`}>Sign in to SkipWait</Link>
        </section>
      )}

      {state === "Not on Land" && (
        <section className={`${card} mt-6 text-center`}>
          <ShieldCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-semibold">Assistants need Land</h1>
          <p className="mt-2 text-sm text-muted-foreground">Signing in, connecting and applying through ChatGPT, Claude, bots or your own tools is part of Land and Concierge.</p>
          <div className="mt-5 grid gap-2">
            <Link href="/plans" className={primary}>See plans</Link>
            <Link href="/explore" className="inline-flex min-h-11 w-full items-center justify-center px-5 text-sm font-semibold text-muted-foreground">Keep using SkipWait yourself</Link>
          </div>
        </section>
      )}

      {state === "Expired" && (
        <section className={`${card} mt-6 text-center`}>
          <Clock className="mx-auto size-8" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-semibold">This link has expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">Go back to ChatGPT and start the connection again. It takes a few seconds.</p>
        </section>
      )}

      {state === "Approved" && (
        <section className={`${card} mt-6 text-center`}>
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent"><Check className="size-8 text-primary" aria-hidden="true" /></span>
          <h1 className="mt-3 text-2xl font-semibold">ChatGPT is connected</h1>
          <p className="mt-2 text-sm text-muted-foreground">Taking you back to ChatGPT…</p>
          <Link href="/assistants" className={`${outline} mt-5`}>Manage assistants</Link>
        </section>
      )}

      {state === "Declined" && (
        <section className={`${card} mt-6 text-center`}>
          <ShieldAlert className="mx-auto size-8" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-semibold">Connection cancelled</h1>
          <p className="mt-2 text-sm text-muted-foreground">ChatGPT has no access to your SkipWait account.</p>
        </section>
      )}
    </main>
  );
}
