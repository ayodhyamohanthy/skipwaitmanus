import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { field } from "@/components/kit/preview-kit";
import { isResetEmail, type PasswordResetSendResponse } from "@shared/passwordReset";
import { PasswordResetNetworkError, retryAfterText, sendPasswordReset } from "@/lib/passwordResetClient";

/**
 * Kit v4 forgot-password (app/src/routes/forgot-password.tsx) on the live
 * POST /api/auth/password-reset/send. The server answers "sent" whether or not
 * an account exists, so this page never reveals which emails have accounts.
 */
function sendFailureText(result: PasswordResetSendResponse | Error): string | null {
  if (result instanceof Error) return result instanceof PasswordResetNetworkError ? result.message : "Something went wrong. Try again.";
  switch (result.status) {
    case "sent": return null;
    case "invalid_email": return "Enter a valid email address.";
    case "rate_limited": return `Too many reset requests. ${retryAfterText(result.retryAfterSeconds)}`;
    case "unavailable": return "Password reset isn’t available right now. Try again in a few minutes.";
  }
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const send = useMutation({ mutationFn: (address: string) => sendPasswordReset(address) });
  const valid = isResetEmail(email);
  const sent = send.data?.status === "sent" ? send.variables : null;
  const failure = send.error ? sendFailureText(send.error) : send.data ? sendFailureText(send.data) : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid && !send.isPending) send.mutate(email.trim());
  }

  return <div className="grid min-h-screen place-items-center bg-background px-5 py-10"><main data-skipwait-screen="forgot-password" className="w-full max-w-md">
    <Link href="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link>
    {!sent ? <form className="mt-10" onSubmit={submit} noValidate><h1 className="text-3xl font-semibold">Forgot your password?</h1><p className="mt-2 text-muted-foreground">Enter your account email. We'll send a link to set a new one.</p><label className="mt-6 block text-sm font-medium">Email<input type="email" autoComplete="email" className={field} value={email} onChange={event => { setEmail(event.target.value); if (failure) send.reset(); }} aria-invalid={failure ? true : undefined} aria-describedby={failure ? "forgot-error" : undefined} /></label>{failure ? <p id="forgot-error" role="alert" className="mt-3 text-sm text-destructive">{failure}</p> : null}<Button type="submit" className="mt-6 w-full" disabled={!valid || send.isPending}>{send.isPending ? "Sending…" : "Send reset link"}</Button></form>
      : <section className="mt-10 text-center" aria-live="polite"><span className="mx-auto grid size-16 place-items-center rounded-full bg-muted"><MailCheck className="size-8 text-primary" /></span><h1 className="mt-4 text-2xl font-semibold">Check your email.</h1><p className="mt-2 text-muted-foreground">If an account exists for <strong className="break-all text-foreground">{sent}</strong>, a reset link is on its way. It works for 1 hour.</p><Button variant="outline" className="mt-6" onClick={() => send.reset()}>Use a different email</Button></section>}
    <Link href="/sign-in" className="text-link mt-8 inline-flex items-center gap-1 text-sm"><ArrowLeft className="size-4" />Back to sign in</Link>
  </main></div>;
}
