import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { StateChips, field } from "@/components/preview-kit";

export const Route = createFileRoute("/reset-password")({
  head: () => pageMeta("Set a new password", "Choose a new password for your SkipWait account."),
  component: Reset,
});

function Reset() {
  const [st, setSt] = useState<"Valid link" | "Expired link">("Valid link");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const rules = [["At least 10 characters", pw.length >= 10], ["A number or symbol", /[\d\W]/.test(pw)], ["Passwords match", !!pw && pw === pw2]] as const;
  const ok = rules.every(r => r[1]);
  return <div className="grid min-h-screen place-items-center bg-background px-5 py-10"><main className="w-full max-w-md">
    <Link to="/" className="wordmark">SkipWait<span className="brand-dot">.</span></Link>
    <div className="mt-6"><StateChips states={["Valid link", "Expired link"] as const} value={st} onChange={v => { setSt(v); setDone(false); }} /></div>
    {st === "Expired link" ? <section className="mt-4"><h1 className="text-3xl font-semibold">This link has expired.</h1><p className="mt-2 text-muted-foreground">Reset links work for 1 hour, once. Request a new one.</p><Button asChild className="mt-6 w-full"><Link to="/forgot-password">Send a new link</Link></Button></section>
      : done ? <section className="mt-4 text-center"><Check className="mx-auto size-12 text-primary" /><h1 className="mt-4 text-2xl font-semibold">Password updated.</h1><p className="mt-2 text-muted-foreground">You're signed in. Other devices were signed out for safety.</p><Button asChild className="mt-6"><Link to="/explore">Continue</Link></Button></section>
      : <section className="mt-4"><h1 className="text-3xl font-semibold">Set a new password</h1><label className="mt-6 block text-sm font-medium">New password<span className="relative block"><input type={show ? "text" : "password"} autoComplete="new-password" className={`${field} pr-12`} value={pw} onChange={e => setPw(e.target.value)} /><button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} className="absolute right-1 top-1/2 mt-1 grid size-11 -translate-y-1/2 place-items-center">{show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></span></label><label className="mt-4 block text-sm font-medium">Confirm password<input type={show ? "text" : "password"} autoComplete="new-password" className={field} value={pw2} onChange={e => setPw2(e.target.value)} /></label><ul className="mt-4 space-y-1 text-sm">{rules.map(([l, v]) => <li key={l} className={`flex items-center gap-2 ${v ? "" : "text-muted-foreground"}`}>{v ? <Check className="size-4 text-primary" /> : <Circle className="size-4" />}{l}</li>)}</ul><Button className="mt-6 w-full" disabled={!ok} onClick={() => setDone(true)}>Update password</Button></section>}
  </main></div>;
}
