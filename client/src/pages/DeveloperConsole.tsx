import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow, BadgeCheck, Bot, Check, Clock, Copy, Loader2, Plus, Server, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { readApiJson } from "@/lib/apiResponse";
import { DEVELOPER_APP_KINDS, DEVELOPER_SCOPES, type DeveloperAppKind } from "@shared/developerApps";

/**
 * Kit v4 `/developer-console` (screens/web/…, app/src/routes/developer-console.tsx).
 *
 * WHAT THE KIT ASSUMED: that an app platform exists. It lists registered apps
 * with verified badges and test users, and offers a seven-scope permission
 * picker. None of that had a backend -- no table, no routes, no OAuth.
 *
 * SO THIS SHIPS THE PART THAT IS REAL: registration and review, backed by
 * developerApps, GET/POST /api/developer/apps, and a scope contract in
 * shared/developerApps.ts. An app can be registered, gets a client id, and gets
 * a client secret exactly once.
 *
 * AND IT SAYS WHAT IS NOT BUILT. The authorization-code flow, the consent
 * screen, scope enforcement on the API and the MCP endpoint are not here. An app
 * can be registered and approved, and nothing can yet authenticate as one. The
 * kit's screens imply a live integration surface; saying so plainly is better
 * than a console that appears to issue working credentials.
 *
 * THREE DEPARTURES, as with the other kit screens: no preview state switcher, no
 * invented apps ("Instinct", "Instinct (staging)"), and no invented owner
 * ("dev@instinct.app").
 */

type AppRow = {
  id: number;
  name: string;
  kind: string;
  status: string;
  scopes: string[];
  redirectUrls: string[];
  isTestMode: boolean;
  clientId: string;
  reviewNote: string | null;
  createdAt: string;
};

const KIND_META: Record<DeveloperAppKind, { label: string; blurb: string; Icon: typeof AppWindow }> = {
  app: { label: "Web or mobile app", blurb: "Job trackers, career tools, ATS-like apps", Icon: AppWindow },
  agent: { label: "AI agent or MCP client", blurb: "Assistants that act on a user's behalf", Icon: Bot },
  server: { label: "Server integration", blurb: "Back-office sync with webhooks", Icon: Server },
};

const STATUS_META: Record<string, { label: string; Icon: typeof Clock }> = {
  in_review: { label: "In review", Icon: Clock },
  approved: { label: "Approved", Icon: BadgeCheck },
  rejected: { label: "Rejected", Icon: ShieldAlert },
  suspended: { label: "Suspended", Icon: ShieldAlert },
  draft: { label: "Draft", Icon: Clock },
};

const field = "mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-4 text-base";

export default function DeveloperConsole() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<DeveloperAppKind>("app");
  const [website, setWebsite] = useState("");
  const [redirect, setRedirect] = useState("");
  const [description, setDescription] = useState("");
  const [scopes, setScopes] = useState<string[]>(["companies:read", "requests:read", "asks:draft"]);
  const [agreed, setAgreed] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ["developer", "apps"],
    queryFn: async () => {
      const response = await fetch("/api/developer/apps", { credentials: "include" });
      return readApiJson<{ apps: AppRow[]; error?: string }>(response, "We could not load your apps");
    },
    retry: false,
  });

  const create = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/developer/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          kind,
          websiteUrl: website || "",
          redirectUrls: redirect.split(/[\s,]+/).map(part => part.trim()).filter(Boolean),
          description,
          scopes,
          agreedToTerms: agreed,
        }),
      });
      return readApiJson<{ id?: number; clientSecret?: string; error?: string }>(response, "We could not register your app");
    },
    onSuccess: payload => {
      setIssuedSecret(payload.clientSecret ?? null);
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ["developer", "apps"] });
    },
  });

  const toggleScope = (scope: string) =>
    setScopes(current => (current.includes(scope) ? current.filter(item => item !== scope) : [...current, scope]));

  const apps = data?.apps ?? [];

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/developers" className="wordmark text-xl">
          SkipWait<span className="brand-dot">.</span>{" "}
          <small className="font-mono text-xs text-muted-foreground">developers</small>
        </Link>
      </header>

      <main data-skipwait-screen="developer-console" className="mx-auto max-w-3xl px-4 pb-20">
        {issuedSecret && (
          <section className="mb-6 rounded-lg border border-primary/40 bg-muted p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Check className="size-4 text-primary" aria-hidden="true" />App registered
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Copy this client secret now. It is stored hashed and <strong>cannot be shown again</strong> — no screen or API call can retrieve it.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">{issuedSecret}</code>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(issuedSecret)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold"
              >
                <Copy className="size-4" aria-hidden="true" />Copy
              </button>
            </div>
          </section>
        )}

        {!creating && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-3xl font-semibold">Your apps</h1>
                <p className="mt-1 text-muted-foreground">
                  Let your users find companies and apply for referrals without leaving your product.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                <Plus className="size-4" aria-hidden="true" />Register an app
              </button>
            </div>

            {isPending && (
              <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />Loading your apps…
              </p>
            )}
            {error && (
              <p className="mt-6 rounded-lg border border-destructive/40 bg-muted p-4 text-sm">
                We couldn't load your apps. {error.message}.
              </p>
            )}

            {data && apps.length === 0 && (
              <div className="mt-6 rounded-lg border border-border p-6 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted" aria-hidden="true">
                  <AppWindow className="size-6" />
                </span>
                <h2 className="mt-3 font-semibold">No apps yet</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Register one to get a client id and secret. Registration is reviewed before it goes live.
                </p>
              </div>
            )}

            {apps.length > 0 && (
              <ul className="mt-6 space-y-3">
                {apps.map(app => {
                  const status = STATUS_META[app.status] ?? STATUS_META.in_review!;
                  const { Icon } = KIND_META[(app.kind as DeveloperAppKind)] ?? KIND_META.app;
                  return (
                    <li key={app.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-center gap-3">
                        <span className="grid size-11 place-items-center rounded-xl bg-muted" aria-hidden="true"><Icon className="size-5" /></span>
                        <span className="flex-1">
                          <strong className="block">{app.name}</strong>
                          <small className="text-muted-foreground">
                            {KIND_META[(app.kind as DeveloperAppKind)]?.label ?? app.kind} · {app.isTestMode ? "Test mode" : "Live"}
                          </small>
                        </span>
                        <span className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                          <status.Icon className="size-3.5" aria-hidden="true" />{status.label}
                        </span>
                      </div>
                      <p className="mt-3 font-mono text-xs text-muted-foreground">client_id: {app.clientId}</p>
                      {app.reviewNote && <p className="mt-2 text-sm text-muted-foreground">Reviewer note: {app.reviewNote}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {creating && (
          <form
            onSubmit={event => { event.preventDefault(); create.mutate(); }}
          >
            <h1 className="text-3xl font-semibold">Register an app</h1>

            <fieldset className="mt-6">
              <legend className="font-semibold">What are you building?</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {DEVELOPER_APP_KINDS.map(id => {
                  const meta = KIND_META[id];
                  const selected = kind === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setKind(id)}
                      aria-pressed={selected}
                      className={`rounded-2xl border p-4 text-left ${selected ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <meta.Icon className="mb-2 size-5" aria-hidden="true" />
                      <strong className="block text-sm">{meta.label}</strong>
                      <small className="text-muted-foreground">{meta.blurb}</small>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">App name
                <input className={field} value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120} />
              </label>
              <label className="text-sm font-medium">Website
                <input className={field} type="url" value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://" />
              </label>
              <label className="text-sm font-medium sm:col-span-2">Redirect URLs
                <input className={field} value={redirect} onChange={event => setRedirect(event.target.value)} placeholder="https://yourapp.example/oauth/skipwait" required />
                <small className="mt-1 block text-muted-foreground">Absolute https:// URLs. http://localhost is allowed for development.</small>
              </label>
              <label className="text-sm font-medium sm:col-span-2">What does your app do for job seekers?
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border border-input bg-background p-4 text-base"
                  value={description}
                  onChange={event => setDescription(event.target.value)}
                  required
                  minLength={20}
                  maxLength={1000}
                  placeholder="Shown to users on the approval screen"
                />
              </label>
            </div>

            <fieldset className="mt-6">
              <legend className="font-semibold">Permissions</legend>
              <p className="text-sm text-muted-foreground">Ask only for what you need. Items marked review are checked by our team.</p>
              <ul className="mt-2">
                {DEVELOPER_SCOPES.map(entry => (
                  <li key={entry.scope}>
                    <label className="flex min-h-12 items-center gap-3 border-b border-border py-2">
                      <input type="checkbox" className="size-5" checked={scopes.includes(entry.scope)} onChange={() => toggleScope(entry.scope)} />
                      <span className="flex-1">
                        <code className="text-xs">{entry.scope}</code>
                        <small className="block text-muted-foreground">{entry.label}</small>
                      </span>
                      {entry.requiresReview && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">review</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <label className="mt-4 flex gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-5" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
              I agree to the developer terms: no bulk asks, no selling user data, no automating referrer decisions, and I will show users what is sent.
            </label>

            {create.error && <p className="mt-4 text-sm text-destructive">{create.error.message}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-semibold text-muted-foreground">Cancel</button>
              <button
                type="submit"
                disabled={create.isPending || !agreed}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {create.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}Create app
              </button>
            </div>
          </form>
        )}

        <section className="mt-8 rounded-lg bg-muted p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4 text-primary" aria-hidden="true" />What is not built yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Registration and review are live. The OAuth authorization-code flow, the consent screen, scope enforcement on the API and the <code>skipwait.me/mcp</code> endpoint are not — so a registered app cannot authenticate yet. We would rather say that than hand you a client secret that does nothing.
          </p>
        </section>
      </main>
    </div>
  );
}
