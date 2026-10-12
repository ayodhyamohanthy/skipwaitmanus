// Small kit-token building blocks shared by the Settings panels.
import type { ReactNode } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { SignInButton } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";

/** Kit Toggle row geometry (min-h-14, hairline divider) for rows that are not switches. */
export function SettingsRow({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return <div className="flex min-h-14 items-center justify-between gap-4 border-b border-border py-3 last:border-0">
    <span className="min-w-0"><strong className="block text-sm">{label}</strong>{hint ? <small className="text-muted-foreground">{hint}</small> : null}</span>
    {children}
  </div>;
}

export function DoneNotice({ children }: { children: ReactNode }) {
  return <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-muted p-3 text-sm"><CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />{children}</p>;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="mt-3 rounded-xl border border-destructive/40 p-3 text-sm text-destructive">
    <p>{message}</p>
    {onRetry ? <><p className="mt-1 text-muted-foreground">Nothing was changed. Check your connection and try again.</p><Button variant="ghost" size="sm" className="mt-2 min-h-11 text-foreground" onClick={onRetry}>Try again</Button></> : null}
  </div>;
}

export function Loading({ children }: { children: ReactNode }) {
  return <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{children}</p>;
}

/** Signed-out stand-in for a section whose controls belong to an account. */
export function SignInPanel({ title, text }: { title: string; text: string }) {
  return <Panel>
    <h2 className="text-lg font-semibold">{title}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    {/* SignInButton adopts a plain <button> child; a component child would nest buttons. */}
    <SignInButton><button type="button" className={buttonVariants({ className: "mt-4" })}>Sign in</button></SignInButton>
  </Panel>;
}
