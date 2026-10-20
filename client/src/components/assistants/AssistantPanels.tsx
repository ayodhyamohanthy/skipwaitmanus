// Kit v4 /assistants tab panels (app/src/routes/assistants.tsx), driven by real rows.
import { Bot, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { LAND_NOT_ON_SALE_LINE } from "@shared/assistant";
import { Button } from "@/components/kit/button";
import { Panel, field } from "@/components/kit/preview-kit";
import { createdLabel, describeEvent, scopeSummary, providerLabel, timeAgo, type AssistantConnection, type AssistantEvent, type AssistantToken } from "./format";

// Kit Toggle markup (a role="switch" button), fixed "on": the server always asks
// before a send or a credit spend, so the switch is aria-disabled and clicking it
// changes nothing. No `disabled` attribute: that would grey it out like an unavailable control.
function AlwaysOnRow({ label, hint }: { label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked="true" aria-disabled="true" onClick={event => event.preventDefault()} className="flex min-h-14 w-full cursor-default items-center justify-between gap-4 border-b border-border py-3 text-left last:border-0">
      <span><strong className="block text-sm">{label}</strong><small className="text-muted-foreground">{hint}</small></span>
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-primary"><span className="absolute left-6 top-1 size-5 rounded-full bg-background" /></span>
    </button>
  );
}

export function PlanGate() {
  return (
    <Panel className="text-center">
      <Bot className="mx-auto size-8" />
      <h2 className="mt-2 font-semibold">Assistants and API tokens come with Land</h2>
      <p className="mt-1 text-sm text-muted-foreground">Land and Concierge members can sign in, connect and apply from ChatGPT, Claude, bots and their own tools.</p>
      {/* No upgrade link while /plans sells no Land: it would lead to a page that cannot sell it. */}
      <p className="mt-4 text-sm">{LAND_NOT_ON_SALE_LINE}</p>
    </Panel>
  );
}

export function AssistantsPanel({ connections, workingId, onDisconnect }: { connections: readonly AssistantConnection[]; workingId: number | null; onDisconnect: (connection: AssistantConnection) => void }) {
  return (
    <>
      {connections.length === 0 ? (
        <Panel className="text-center">
          <Bot className="mx-auto size-8" />
          <h2 className="mt-2 font-semibold">No assistants connected</h2>
          <p className="mt-1 text-sm text-muted-foreground">In ChatGPT or Claude, add skipwait.me as a connector and approve it here.</p>
        </Panel>
      ) : (
        <ul className="space-y-3" aria-label="Connected assistants">
          {connections.map(connection => (
            <li key={connection.id}>
              <Panel>
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted"><Bot className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <strong className="block">{providerLabel(connection.provider, connection.appName)}</strong>
                    <small className="block text-muted-foreground">{scopeSummary(connection.scopes)}</small>
                    <small className="text-muted-foreground">{connection.lastUsedAt ? `Used ${timeAgo(connection.lastUsedAt)}` : `Connected ${timeAgo(connection.connectedAt)}`}</small>
                  </span>
                  <Button variant="ghost" size="sm" disabled={workingId === connection.id} onClick={() => onDisconnect(connection)}><Trash2 />{workingId === connection.id ? "Disconnecting…" : "Disconnect"}</Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
      <Panel className="mt-4">
        <h2 className="font-semibold">Safety</h2>
        <AlwaysOnRow label="Ask me before any ask is sent" hint="Always on. Assistants can draft, you send." />
        <AlwaysOnRow label="Ask me before credits are spent" hint="Always on" />
        <p className="mt-2 text-xs text-muted-foreground">Assistants follow the same limits as you: open-request slots, daily asks, quality checks. They never move you up a queue.</p>
      </Panel>
      <Panel tone="muted" className="mt-4">
        <h2 className="font-semibold">How to connect</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>In ChatGPT or Claude, open Connectors and add <code className="rounded bg-background px-1">skipwait.me/api/mcp</code></li>
          <li>Sign in and approve what it can do</li>
          <li>Ask: “Find companies open to referrals for product designers”</li>
        </ol>
        <Button asChild variant="link" className="mt-1 px-0"><Link href="/connect-assistant">Preview the approval screen</Link></Button>
      </Panel>
    </>
  );
}

export function TokensPanel({ tokens, onceToken, creating, workingId, onCreate, onRevoke }: {
  tokens: readonly AssistantToken[];
  onceToken: string | null;
  creating: boolean;
  workingId: number | null;
  onCreate: (name: string) => Promise<boolean>;
  onRevoke: (token: AssistantToken) => void;
}) {
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable: the token stays selectable on screen */ }
  };
  return (
    <>
      {onceToken ? (
        <Panel tone="accent" className="mb-4">
          <strong className="block">Copy your token now</strong>
          <p className="text-sm">You won&apos;t see it again.</p>
          <div className="mt-3 flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-background px-3 py-3 font-mono text-sm">{onceToken}</code>
            <Button variant="outline" onClick={() => { void copy(onceToken); }}><Copy />{copied ? "Copied" : "Copy"}</Button>
          </div>
        </Panel>
      ) : null}
      <Panel>
        <h2 className="font-semibold">Your tokens</h2>
        {tokens.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No tokens yet.</p> : (
          <ul className="mt-2">
            {tokens.map(token => {
              // Kit row text is exactly "{name} · created {date}"; the key prefix and last use stay available to hover and screen readers.
              const detail = `Starts ${token.prefix}…${token.lastUsedAt ? ` · used ${timeAgo(token.lastUsedAt)}` : " · not used yet"}`;
              return (
                <li key={token.id} className="flex min-h-14 items-center gap-3 border-b border-border last:border-0">
                  <KeyRound className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 text-sm" title={detail}>{token.name} · created {createdLabel(token.createdAt)}<span className="sr-only"> · {detail}</span></span>
                  <Button variant="ghost" size="sm" disabled={workingId === token.id} onClick={() => onRevoke(token)}>{workingId === token.id ? "Revoking…" : "Revoke"}</Button>
                </li>
              );
            })}
          </ul>
        )}
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); const trimmed = name.trim(); if (!trimmed || creating) return; void onCreate(trimmed).then(ok => { if (ok) setName(""); }); }}>
          <label className="flex-1"><span className="sr-only">Token name</span><input className={`${field} !mt-0`} placeholder="Name, e.g. Notion tracker" maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
          <Button type="submit" size="lg" disabled={creating}><Plus />{creating ? "Creating…" : "Create token"}</Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">Tokens can read, draft and send with approval. They can&apos;t spend credits without you. <Link href="/developers" className="text-link">Developer docs</Link></p>
      </Panel>
    </>
  );
}

export function ActivityPanel({ activity }: { activity: readonly AssistantEvent[] }) {
  return (
    <Panel>
      <h2 className="font-semibold">Everything assistants did</h2>
      {activity.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No assistant activity yet.</p> : (
        <ul className="mt-2">
          {activity.map((event, index) => {
            const row = describeEvent(event);
            return (
              <li key={`${event.createdAt}-${event.action}-${index}`} className="border-b border-border py-3 last:border-0">
                <span className="text-xs text-muted-foreground">{row.stamp} · {row.who}</span>
                <strong className="block text-sm">{row.what}</strong>
                {row.note ? <small className={row.blocked ? "text-destructive" : "text-muted-foreground"}>{row.note}</small> : null}
              </li>
            );
          })}
        </ul>
      )}
      <Button asChild variant="link" className="px-0"><Link href="/approve">Review waiting approval</Link></Button>
    </Panel>
  );
}
