import { CircleAlert } from "lucide-react";
import { useState } from "react";
import type { AppKind, DeveloperApp } from "@shared/assistant";
import { DEVELOPER_APP_REVIEW_SCOPES } from "@shared/assistant";
import { Button } from "@/components/kit/button";
import { Panel, field } from "@/components/kit/preview-kit";
import { ALL_SCOPES, DEFAULT_SCOPES, KINDS } from "./consoleMeta";

export type RegisterAppInput = { name: string; kind: AppKind; description: string; website?: string; redirectUrls: string[]; scopes: string[]; agreeToTerms: boolean };

type Props = {
  /** A rejected app being edited: the form starts from its registration. */
  initial: DeveloperApp | null;
  working: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (input: RegisterAppInput) => void;
};

export function RegisterAppForm({ initial, working, error, onCancel, onSubmit }: Props) {
  const [kind, setKind] = useState<AppKind>(initial?.kind ?? "web_app");
  const [name, setName] = useState(initial?.name ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [redirectUrls, setRedirectUrls] = useState(initial?.redirectUrls.join(", ") ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [scopes, setScopes] = useState<string[]>(initial ? [...initial.scopes] : [...DEFAULT_SCOPES]);
  const [agreed, setAgreed] = useState(true);
  const [missing, setMissing] = useState("");

  const toggleScope = (key: string) => setScopes(current => (current.includes(key) ? current.filter(item => item !== key) : [...current, key]));
  const submit = () => {
    if (working) return;
    if (!name.trim() || !description.trim()) { setMissing("Add the app name and what your app does for job seekers."); return; }
    if (!agreed) { setMissing("Agree to the developer terms to register an app."); return; }
    setMissing("");
    onSubmit({
      name, kind, description,
      website: website.trim() || undefined,
      redirectUrls: redirectUrls.split(/[\n,]/).map(url => url.trim()).filter(Boolean),
      scopes, agreeToTerms: agreed,
    });
  };
  const message = missing || error;

  return (
    <>
      <h1 className="text-3xl font-semibold">Register an app</h1>
      <fieldset className="mt-6"><legend className="font-semibold">What are you building?</legend><div className="mt-2 grid gap-2 sm:grid-cols-3">{KINDS.map(option => <button key={option.key} type="button" onClick={() => setKind(option.key)} aria-pressed={kind === option.key} className={`rounded-2xl border p-4 text-left ${kind === option.key ? "border-primary bg-primary/5" : "border-border"}`}><option.Icon className="mb-2 size-5" /><strong className="block text-sm">{option.label}</strong><small className="text-muted-foreground">{option.description}</small></button>)}</div></fieldset>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">App name<input className={field} value={name} onChange={event => setName(event.target.value)} placeholder="Instinct" /></label>
        <label className="text-sm font-medium">Website<input className={field} value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://instinct.app" /></label>
        <label className="text-sm font-medium sm:col-span-2">Redirect URLs<input className={field} value={redirectUrls} onChange={event => setRedirectUrls(event.target.value)} placeholder="https://instinct.app/oauth/skipwait" /></label>
        <label className="text-sm font-medium sm:col-span-2">What does your app do for job seekers?<textarea className="mt-2 min-h-24 w-full rounded-xl border border-input bg-background p-4 text-base" value={description} onChange={event => setDescription(event.target.value)} placeholder="Shown to users on the approval screen" /></label>
      </div>
      {kind === "agent_mcp" ? <Panel tone="muted" className="mt-4 text-sm">MCP clients can also connect with no registration through <code>skipwait.me/api/mcp</code> (dynamic registration). Registering gets you a verified badge once your app passes review.</Panel> : null}
      <fieldset className="mt-6"><legend className="font-semibold">Permissions</legend><p className="text-sm text-muted-foreground">Ask only for what you need. Items marked review are checked by our team.</p><ul className="mt-2">{ALL_SCOPES.map(scope => <li key={scope.key}><label className="flex min-h-12 items-center gap-3 border-b border-border py-2"><input type="checkbox" className="size-5" checked={scopes.includes(scope.key)} onChange={() => toggleScope(scope.key)} /><span className="flex-1"><code className="text-xs">{scope.key}</code><small className="block text-muted-foreground">{scope.label}</small></span>{DEVELOPER_APP_REVIEW_SCOPES.includes(scope.key) ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">review</span> : null}</label></li>)}</ul></fieldset>
      <label className="mt-4 flex gap-3 text-sm"><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} className="mt-1 size-5" />I agree to the developer terms: no bulk asks, no selling user data, no automating referrer decisions, show users what is sent.</label>
      {message ? <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-destructive"><CircleAlert className="mt-0.5 size-4 shrink-0" />{message}</p> : null}
      <div className="mt-6 flex justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button disabled={working} onClick={submit}>{working ? "Registering…" : "Create app"}</Button></div>
    </>
  );
}
