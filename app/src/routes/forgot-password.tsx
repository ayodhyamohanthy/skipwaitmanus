import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { field } from "@/components/preview-kit";

export const Route = createFileRoute("/forgot-password")({
  head: () => pageMeta("Reset your password", "Get a secure link to reset your SkipWait password."),
  component: Forgot,
});

function Forgot() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return <div className="grid min-h-screen place-items-center bg-background px-5 py-10"><main className="w-full max-w-md">
    <Link to="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link>
    {!sent ? <section className="mt-10"><h1 className="text-3xl font-semibold">Forgot your password?</h1><p className="mt-2 text-muted-foreground">Enter your account email. We'll send a link to set a new one.</p><label className="mt-6 block text-sm font-medium">Email<input type="email" autoComplete="email" className={field} value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && valid && setSent(true)} /></label><Button className="mt-6 w-full" disabled={!valid} onClick={() => setSent(true)}>Send reset link</Button></section>
      : <section className="mt-10 text-center"><span className="mx-auto grid size-16 place-items-center rounded-full bg-muted"><MailCheck className="size-8 text-primary" /></span><h1 className="mt-4 text-2xl font-semibold">Check your email.</h1><p className="mt-2 text-muted-foreground">If an account exists for <strong className="break-all text-foreground">{email}</strong>, a reset link is on its way. It works for 1 hour.</p><Button variant="outline" className="mt-6" onClick={() => setSent(false)}>Use a different email</Button><p className="mt-4 text-sm"><Link to="/reset-password" className="text-link">Preview the reset screen →</Link></p></section>}
    <Link to="/sign-in" className="text-link mt-8 inline-flex items-center gap-1 text-sm"><ArrowLeft className="size-4" />Back to sign in</Link>
    <p className="mt-6 text-xs text-muted-foreground">DESIGN PREVIEW · NO EMAIL IS SENT</p>
  </main></div>;
}
