import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Bell, Check, Gauge, Layers, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Toggle } from "@/components/preview-kit";

export const Route = createFileRoute("/referrer-setup")({
  head: () => pageMeta("Referrer setup", "After verifying, choose the job areas you can judge, your monthly capacity, visibility and notifications."),
  component: Setup,
});

const fns = ["Engineering", "Product", "Design", "Data", "Marketing", "Operations", "Sales", "Finance", "HR"];
const lv = ["Intern", "Early career", "Mid-level", "Senior", "Lead+"];
const steps = ["Areas", "Capacity", "Visibility", "Notifications", "Ready"];

function Setup() {
  const [s, setS] = useState(0);
  const [f, setF] = useState(["Design"]);
  const [l, setL] = useState(["Mid-level", "Senior"]);
  const [cap, setCap] = useState(3);
  const [vis, setVis] = useState<"anon" | "public">("anon");
  const [n, setN] = useState({ push: true, email: true, digest: false });
  const tog = (arr: string[], set: (a: string[]) => void, x: string) => set(arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x]);

  return <main className="page-content mx-auto max-w-2xl">
    <div className="mb-4 flex items-center gap-2 text-sm"><BadgeCheck className="size-4 text-primary" />Verified at Wipro</div>
    <ol className="mb-8 grid grid-cols-5 gap-1.5">{steps.map((x, i) => <li key={x}><span className={`block h-1.5 rounded-full ${i <= s ? "bg-primary" : "bg-muted"}`} /><span className="mt-1.5 hidden text-xs text-muted-foreground sm:block">{x}</span></li>)}</ol>
    {s === 0 && <section><Layers className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Which roles can you judge?</h1><p className="mt-2 text-muted-foreground">You'll only get asks for these.</p><h2 className="mt-6 text-sm font-semibold">Job areas</h2><div className="mt-2 flex flex-wrap gap-2">{fns.map(x => <button key={x} onClick={() => tog(f, setF, x)} className={`min-h-11 rounded-full border px-4 text-sm ${f.includes(x) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{x}</button>)}</div><h2 className="mt-6 text-sm font-semibold">Levels</h2><div className="mt-2 flex flex-wrap gap-2">{lv.map(x => <button key={x} onClick={() => tog(l, setL, x)} className={`min-h-11 rounded-full border px-4 text-sm ${l.includes(x) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{x}</button>)}</div></section>}
    {s === 1 && <section><Gauge className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">How many asks a month?</h1><p className="mt-2 text-muted-foreground">Be realistic — you can change or pause anytime.</p><p className="mt-8 text-center text-6xl font-semibold">{cap}</p><p className="text-center text-sm text-muted-foreground">asks per month · about {Math.max(1, Math.round(cap * 5))} minutes</p><input type="range" min={1} max={15} value={cap} onChange={e => setCap(+e.target.value)} className="mt-6 w-full" aria-label="Monthly capacity" /><p className="mt-4 rounded-xl bg-muted p-3 text-sm">Most new referrers start with 3. When you're full, new asks go to others — never to a waiting pile.</p></section>}
    {s === 2 && <section><UserRound className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">How should seekers see you?</h1><div className="mt-6 grid gap-3">{([["anon", "Anonymous (recommended)", "“Someone at Wipro · Design”. Name shown after you accept."], ["public", "Named public profile", "Your name and headline on the Wipro page and your public profile."]] as const).map(([k, t, d]) => <button key={k} onClick={() => setVis(k)} className={`rounded-2xl border p-4 text-left ${vis === k ? "border-primary bg-primary/5" : "border-border"}`}><strong className="block">{t}</strong><small className="text-muted-foreground">{d}</small></button>)}</div></section>}
    {s === 3 && <section><Bell className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">When should we tell you?</h1><div className="mt-6"><Toggle on={n.push} onChange={x => setN({ ...n, push: x })} label="Push when a new ask arrives" /><Toggle on={n.email} onChange={x => setN({ ...n, email: x })} label="Email reminder before an ask expires" /><Toggle on={n.digest} onChange={x => setN({ ...n, digest: x })} label="Instead, one daily summary" hint="Fewer interruptions" /></div></section>}
    {s === 4 && <section className="text-center"><Check className="mx-auto size-12 text-primary" /><h1 className="mt-4 text-3xl font-semibold">You're open for asks.</h1><p className="mt-2 text-muted-foreground">{f.join(", ")} · {l.join(", ")} · {cap}/month · {vis === "anon" ? "anonymous" : "named"}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" asChild><Link to="/p/$handle" params={{ handle: "preview" }}>Share my profile</Link></Button><Button asChild><Link to="/referrer-home">Go to referrer home <ArrowRight /></Link></Button></div></section>}
    {s < 4 && <footer className="mt-10 flex justify-between">{s > 0 ? <Button variant="ghost" onClick={() => setS(s - 1)}><ArrowLeft />Back</Button> : <span />}<Button disabled={s === 0 && (!f.length || !l.length)} onClick={() => setS(s + 1)}>{s === 3 ? "Finish" : "Continue"} <ArrowRight /></Button></footer>}
  </main>;
}
