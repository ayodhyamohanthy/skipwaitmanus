import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { field } from "@/components/kit/preview-kit";
import { passwordRules, type PasswordResetConfirmResponse } from "@shared/passwordReset";
import {
  PasswordResetNetworkError, checkPasswordResetLink, confirmPasswordReset, forgetResetLinkToken, retryAfterText, takeResetLinkToken,
} from "@/lib/passwordResetClient";

/**
 * Kit v4 reset-password (app/src/routes/reset-password.tsx) on the live
 * /api/auth/password-reset/{status,confirm}. The link's state (valid, expired,
 * invalid) comes from the server; the kit's preview chips are not shipped.
 */
type LinkView = "checking" | "valid" | "expired" | "invalid" | "error";

function confirmFailureText(result: PasswordResetConfirmResponse | Error): string | null {
  if (result instanceof Error) return result instanceof PasswordResetNetworkError ? result.message : "Something went wrong. Try again.";
  switch (result.status) {
    case "updated": case "expired": case "invalid": return null;
    case "weak_password": return "Use at least 10 characters, including a number or symbol.";
    case "password_rejected": return "That password can’t be used. Choose a different one.";
    case "rate_limited": return `Too many attempts. ${retryAfterText(result.retryAfterSeconds)}`;
    case "unavailable": return "Password reset isn’t available right now. Try again in a few minutes.";
    case "failed": return "We couldn’t update your password. Try again.";
  }
}

function Wordmark() {
  return <Link href="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link>;
}

export default function ResetPassword() {
  const [token] = useState(takeResetLinkToken);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const status = useQuery({
    queryKey: ["password-reset-link", token],
    queryFn: async () => {
      const result = await checkPasswordResetLink(token ?? "");
      if (result.status === "expired" || result.status === "invalid") forgetResetLinkToken();
      return result;
    },
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const confirm = useMutation({
    mutationFn: (password: string) => confirmPasswordReset(token ?? "", password),
    onSuccess: result => { if (result.status === "updated" || result.status === "expired" || result.status === "invalid") forgetResetLinkToken(); },
  });
  const rules = passwordRules(pw, pw2);
  const ok = rules.every(rule => rule.met);
  const outcome = confirm.data?.status;

  const view: LinkView = token === null ? "invalid"
    : outcome === "expired" ? "expired" : outcome === "invalid" ? "invalid"
    : status.isPending ? "checking"
    : status.data?.status === "valid" ? "valid"
    : status.data?.status === "expired" ? "expired"
    : status.data?.status === "invalid" ? "invalid"
    : "error";
  const statusFailure = status.error instanceof PasswordResetNetworkError ? status.error.message
    : status.data?.status === "rate_limited" ? `Too many attempts. ${retryAfterText(status.data.retryAfterSeconds)}`
    : "Password reset isn’t available right now. Try again in a few minutes.";
  const failure = confirm.error ? confirmFailureText(confirm.error) : confirm.data ? confirmFailureText(confirm.data) : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ok && !confirm.isPending) confirm.mutate(pw);
  }

  return <div className="grid min-h-screen place-items-center bg-background px-5 py-10"><main data-skipwait-screen="reset-password" className="w-full max-w-md">
    <Wordmark />
    {view === "checking" ? <section className="mt-10" aria-busy="true"><h1 className="text-3xl font-semibold">Set a new password</h1><p role="status" className="mt-2 text-muted-foreground">Checking your reset link…</p></section>
      : view === "expired" ? <section className="mt-10"><h1 className="text-3xl font-semibold">This link has expired.</h1><p className="mt-2 text-muted-foreground">Reset links work for 1 hour, once. Request a new one.</p><Button asChild className="mt-6 w-full"><Link href="/forgot-password">Send a new link</Link></Button></section>
      : view === "invalid" ? <section className="mt-10"><h1 className="text-3xl font-semibold">This link doesn’t work.</h1><p className="mt-2 text-muted-foreground">Open the newest reset email, or request a new link.</p><Button asChild className="mt-6 w-full"><Link href="/forgot-password">Send a new link</Link></Button></section>
      : view === "error" ? <section className="mt-10"><h1 className="text-3xl font-semibold">Set a new password</h1><p role="alert" className="mt-2 text-muted-foreground">{statusFailure}</p><Button className="mt-6 w-full" onClick={() => void status.refetch()} disabled={status.isFetching}>{status.isFetching ? "Checking…" : "Try again"}</Button></section>
      : outcome === "updated" ? <section className="mt-10 text-center" aria-live="polite"><Check className="mx-auto size-12 text-primary" /><h1 className="mt-4 text-2xl font-semibold">Password updated.</h1><p className="mt-2 text-muted-foreground">{confirm.data?.status === "updated" && confirm.data.otherSessionsSignedOut ? "Sign in with your new password. Every device was signed out for safety." : "Sign in with your new password."}</p><Button asChild className="mt-6"><Link href="/sign-in">Sign in</Link></Button></section>
      : <form className="mt-10" onSubmit={submit} noValidate><h1 className="text-3xl font-semibold">Set a new password</h1><label className="mt-6 block text-sm font-medium">New password<span className="relative block"><input type={show ? "text" : "password"} autoComplete="new-password" className={`${field} pr-12`} value={pw} onChange={event => setPw(event.target.value)} /><button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} className="absolute right-1 top-1/2 mt-1 grid size-11 -translate-y-1/2 place-items-center">{show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></span></label><label className="mt-4 block text-sm font-medium">Confirm password<input type={show ? "text" : "password"} autoComplete="new-password" className={field} value={pw2} onChange={event => setPw2(event.target.value)} /></label><ul className="mt-4 space-y-1 text-sm">{rules.map(rule => <li key={rule.id} className={`flex items-center gap-2 ${rule.met ? "" : "text-muted-foreground"}`}>{rule.met ? <Check className="size-4 text-primary" /> : <Circle className="size-4" />}{rule.label}</li>)}</ul>{failure ? <p role="alert" className="mt-4 text-sm text-destructive">{failure}</p> : null}<Button type="submit" className="mt-6 w-full" disabled={!ok || confirm.isPending}>{confirm.isPending ? "Updating…" : "Update password"}</Button></form>}
  </main></div>;
}
