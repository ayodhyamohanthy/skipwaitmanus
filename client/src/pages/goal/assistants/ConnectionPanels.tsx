import { useState } from "react";
import { GoalButton, GoalField, GoalTextInput } from "@/components/goal";
import { createdLabel, describeEvent, scopeSummary, providerLabel, timeAgo, type AssistantConnection, type AssistantEvent, type AssistantToken } from "@/components/assistants/format";
import { AccessStatus, NetworkButton, NextStep, Section } from "./AssistantLayout";

export function PlanGate() {
  return (
    <NextStep>
      <AccessStatus>Assistants are not available on your plan</AccessStatus>
      <h2 className="mt-3 text-g-heading">Assistant access is not available yet</h2>
      <p className="mt-2 text-g-body text-g-ink-2">Connecting and applying from ChatGPT, Claude, bots and custom tools will be available with assistant access.</p>
      <GoalButton asChild variant="primary" className="mt-4"><a href="/explore">Find a referral yourself</a></GoalButton>
    </NextStep>
  );
}
export function AssistantsPanel({ connections, workingId, onDisconnect }: { connections: readonly AssistantConnection[]; workingId: number | null; onDisconnect(connection: AssistantConnection): void }) {
  return <>
    <NextStep><h2 className="text-g-heading">{connections.length ? "Review a referral before it is sent" : "Connect from your assistant"}</h2><p className="mt-2 text-g-body text-g-ink-2">{connections.length ? "Your assistant prepares the work. You decide what is sent and when referrals are spent." : "In ChatGPT or Claude, add skipwait.me as a connector. Return here to review exactly what it can do."}</p><GoalButton asChild variant="primary" className="mt-4"><a href={connections.length ? "/approve" : "/connect-assistant"}>{connections.length ? "Review approvals" : "Review connection permissions"}</a></GoalButton></NextStep>
    <Section title="Connected assistants"><ul aria-label="Connected assistants">{connections.map(c => <li key={c.id} className="flex flex-wrap justify-between gap-3 border-b border-g-hairline py-4"><div className="min-w-0"><h3 className="break-words text-g-label">{providerLabel(c.provider,c.appName)}</h3><p className="mt-1 text-g-meta text-g-ink-2">{scopeSummary(c.scopes)}</p><p className="mt-1 text-g-meta text-g-ink-3">{c.lastUsedAt ? `Used ${timeAgo(c.lastUsedAt)}` : `Connected ${timeAgo(c.connectedAt)}`}</p></div><NetworkButton busy={workingId === c.id} onClick={() => onDisconnect(c)}>Disconnect</NetworkButton></li>)}</ul>{!connections.length ? <p className="text-g-body text-g-ink-2">No assistants connected.</p> : null}</Section>
    <Section title="You stay in control"><ul className="space-y-3 text-g-body text-g-ink-2"><li>Always ask before a referral is sent.</li><li>Always ask before referrals are spent.</li><li>Your usual open-request limits and quality checks still apply. No queue priority.</li></ul></Section>
    <Section title="How to connect"><ol className="list-decimal space-y-3 pl-5 text-g-body text-g-ink-2"><li>In ChatGPT or Claude, add the connector <code className="break-all font-g-mono">skipwait.me/api/mcp</code>.</li><li>Sign in and approve what it may do.</li><li>Ask it to find companies or draft a referral. You review before it sends.</li></ol><a href="/developers" className="g-hit mt-4 inline-block text-g-meta underline underline-offset-4">Developer docs</a></Section>
  </>;
}
export function TokensPanel({ tokens, onceToken, creating, workingId, onCreate, onRevoke }: { tokens: readonly AssistantToken[]; onceToken: string | null; creating: boolean; workingId: number | null; onCreate(name: string): Promise<boolean>; onRevoke(token: AssistantToken): void }) {
  const [name,setName] = useState(""); const [copyState,setCopyState] = useState("");
  const copy = async () => { try { if (!navigator.clipboard) throw new Error(); await navigator.clipboard.writeText(onceToken ?? ""); setCopyState("Copied"); } catch { setCopyState("Copy did not work. Select and copy the token below."); } };
  return <>
    {onceToken ? <Section title="Copy your token now"><p className="text-g-body">You will not see it again. Keep it private.</p><code className="mt-3 block break-all border border-g-control-edge p-3 font-g-mono text-g-mono">{onceToken}</code><GoalButton className="mt-2" onClick={() => void copy()}>Copy token</GoalButton><p role="status" className="text-g-meta">{copyState}</p></Section> : null}
    <NextStep><form onSubmit={e => { e.preventDefault(); if (name.trim() && !creating) void onCreate(name.trim()).then(ok => { if(ok) setName(""); }); }}><GoalField label="Name this API token" htmlFor="assistant-token-name" help="Choose a name you can recognize later."><GoalTextInput id="assistant-token-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} required /></GoalField><NetworkButton className="mt-4" variant="primary" type="submit" busy={creating} blocked={!name.trim() ? "Enter a token name" : undefined}>Create token</NetworkButton></form><p className="mt-3 text-g-meta text-g-ink-2">Tokens can read, draft and send with approval. They cannot spend referrals without you.</p></NextStep>
    <Section title="Your tokens"><ul>{tokens.map(t => <li className="flex flex-wrap items-center justify-between gap-3 border-b border-g-hairline py-4" key={t.id}><span className="min-w-0 break-words text-g-label" title={`Starts ${t.prefix}…`}>{t.name}<span className="mt-1 block text-g-meta text-g-ink-2">Created {createdLabel(t.createdAt)} · {t.lastUsedAt ? `Used ${timeAgo(t.lastUsedAt)}` : "Not used yet"}</span></span><NetworkButton busy={workingId === t.id} onClick={() => onRevoke(t)}>Revoke</NetworkButton></li>)}</ul>{!tokens.length ? <p className="text-g-body text-g-ink-2">No tokens yet.</p> : null}</Section>
  </>;
}
export function ActivityPanel({activity}: {activity: readonly AssistantEvent[]}) {
  return <><NextStep><p className="text-g-body text-g-ink-2">Check what your assistants prepared before approving an action.</p><GoalButton asChild variant="primary" className="mt-3"><a href="/approve">Review waiting approvals</a></GoalButton></NextStep><Section title="Everything assistants did">{!activity.length ? <p className="text-g-body text-g-ink-2">No assistant activity yet.</p> : <ul>{activity.map((event,i) => { const row=describeEvent(event); return <li key={`${event.createdAt}-${i}`} className="border-b border-g-hairline py-4"><p className="text-g-meta text-g-ink-3">{row.stamp} · {row.who}</p><h3 className="mt-1 text-g-label">{row.what}</h3>{row.note ? <p className="mt-1 text-g-meta text-g-ink-2">{row.note}</p>:null}</li>;})}</ul>}</Section></>;
}
