import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileText, Github, Globe, Globe2, Linkedin, MapPin, Target, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { Panel, field } from "@/components/preview-kit";

export const Route = createFileRoute("/onboarding")({
  head: () => pageMeta("Set up your search", "A two-minute setup: target roles, resume, work links, and where you can work — so every referral ask is ready."),
  component: Onboarding,
});

const roles = ["Software Engineer", "Product Manager", "Product Designer", "Data Analyst", "Data Scientist", "Marketing", "Operations", "Sales", "Customer Success", "Consulting"];
const levels = ["Student / intern", "Early career", "Mid-level", "Senior", "Lead / manager", "Director+"];
const steps = ["Goal", "Roles", "Resume", "Work", "Location", "Ready"];

function Onboarding() {
  const [s, setS] = useState(0);
  const [goal, setGoal] = useState("Actively looking");
  const [picked, setPicked] = useState<string[]>(["Product Designer"]);
  const [level, setLevel] = useState("Senior");
  const [resume, setResume] = useState<"none" | "uploading" | "done" | "error">("none");
  const [links, setLinks] = useState<string[]>([]);
  const [remote, setRemote] = useState(true);
  const [visa, setVisa] = useState("Need sponsorship for some countries");
  const done = [goal, picked.length > 0, resume === "done", links.length > 0, true].filter(Boolean).length;

  return <main className="page-content mx-auto max-w-3xl">
    <div className="mb-6 flex items-center justify-between gap-3"><span className="eyebrow">STEP {s + 1} OF {steps.length} · ABOUT 2 MINUTES</span>{s < 5 && <button className="text-link text-sm" onClick={() => setS(5)}>Skip for now</button>}</div>
    <ol className="mb-8 grid grid-cols-6 gap-1.5" aria-label="Setup progress">{steps.map((l, i) => <li key={l}><span className={`block h-1.5 rounded-full ${i <= s ? "bg-primary" : "bg-muted"}`} /><span className="mt-1.5 hidden text-xs text-muted-foreground sm:block">{l}</span></li>)}</ol>

    {s === 0 && <section><Target className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Where are you in your search?</h1><p className="mt-2 text-muted-foreground">This only tunes what we show you. Nobody else sees it.</p><div className="mt-6 grid gap-3">{[["Actively looking", "Interviewing or applying this month"], ["Open to the right role", "Happy where I am, curious"], ["Changing careers", "Moving into a new function"], ["Just graduated", "Looking for a first role"]].map(([g, d]) => <button key={g} onClick={() => setGoal(g!)} className={`flex min-h-16 items-center justify-between rounded-2xl border p-4 text-left ${goal === g ? "border-primary bg-primary/5" : "border-border"}`}><span><strong className="block">{g}</strong><small className="text-muted-foreground">{d}</small></span>{goal === g && <Check className="text-primary" />}</button>)}</div></section>}

    {s === 1 && <section><h1 className="text-3xl font-semibold">Which roles are you targeting?</h1><p className="mt-2 text-muted-foreground">Pick up to 3. Referrers see these when you ask.</p><div className="mt-6 flex flex-wrap gap-2">{roles.map(r => { const on = picked.includes(r); return <button key={r} disabled={!on && picked.length >= 3} onClick={() => setPicked(on ? picked.filter(x => x !== r) : [...picked, r])} className={`min-h-11 rounded-full border px-4 text-sm disabled:opacity-40 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{on && <Check className="mr-1 inline size-4" />}{r}</button>; })}</div><p className="mt-2 text-xs text-muted-foreground">{picked.length}/3 selected</p><h2 className="mt-8 font-semibold">Experience level</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{levels.map(l => <button key={l} onClick={() => setLevel(l)} className={`min-h-11 rounded-xl border px-3 text-sm ${level === l ? "border-primary bg-primary/5 font-semibold" : "border-border"}`}>{l}</button>)}</div></section>}

    {s === 2 && <section><FileText className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Add your resume</h1><p className="mt-2 text-muted-foreground">Private. Shared only with a referrer after they accept your ask.</p>
      <button onClick={() => { setResume("uploading"); setTimeout(() => setResume("done"), 1200); }} className={`mt-6 flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed p-10 ${resume === "error" ? "border-destructive" : "border-border hover:border-primary"}`}>
        {resume === "none" && <><Upload className="size-8" /><strong>Drop PDF or tap to choose</strong><small className="text-muted-foreground">PDF or DOCX · up to 5 MB</small></>}
        {resume === "uploading" && <><span className="h-2 w-40 overflow-hidden rounded-full bg-muted"><span className="block h-full w-2/3 animate-pulse bg-primary" /></span><strong>Uploading…</strong></>}
        {resume === "done" && <><Check className="size-8 text-primary" /><strong>Asha_R_Resume.pdf</strong><small className="text-muted-foreground">2 pages · tap to replace</small></>}
        {resume === "error" && <><strong className="text-destructive">That file is over 5 MB.</strong><small className="text-muted-foreground">Try a compressed PDF.</small></>}
      </button>
      <div className="mt-3 flex gap-2 text-xs"><button className="rounded-full border border-border px-3 py-1" onClick={() => setResume("error")}>Show error</button><button className="rounded-full border border-border px-3 py-1" onClick={() => setResume("none")}>Reset</button></div>
      <p className="mt-4 text-sm text-muted-foreground">No resume yet? <Link to="/plans" className="text-link">Build one with a resume overhaul</Link> or continue — you can add it before your first ask.</p></section>}

    {s === 3 && <section><h1 className="text-3xl font-semibold">Show your work</h1><p className="mt-2 text-muted-foreground">Optional, but asks with a work link stand out.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{[["LinkedIn", Linkedin], ["GitHub", Github], ["Portfolio site", Globe], ["Behance / Dribbble", Globe2]].map(([l, I]) => { const Icon = I as typeof Globe; const on = links.includes(l as string); return <button key={l as string} onClick={() => setLinks(on ? links.filter(x => x !== l) : [...links, l as string])} className={`flex min-h-14 items-center gap-3 rounded-2xl border p-4 text-left ${on ? "border-primary bg-primary/5" : "border-border"}`}><Icon className="size-5" /><span className="flex-1 font-medium">{l as string}</span>{on ? <Check className="text-primary" /> : <span className="text-sm text-muted-foreground">Connect</span>}</button>; })}</div></section>}

    {s === 4 && <section><MapPin className="mb-3 text-primary" /><h1 className="text-3xl font-semibold">Where can you work?</h1><p className="mt-2 text-muted-foreground">We'll warn you before asking for roles that can't work for you.</p><label className="mt-6 block text-sm font-medium">Current city<input className={field} defaultValue="Bengaluru, India" /></label><label className="mt-4 block text-sm font-medium">Countries you can work in<input className={field} defaultValue="India, United Arab Emirates" /></label><button onClick={() => setRemote(!remote)} className={`mt-4 flex min-h-12 w-full items-center justify-between rounded-xl border px-4 ${remote ? "border-primary bg-primary/5" : "border-border"}`}>Open to remote roles {remote && <Check className="text-primary" />}</button><label className="mt-4 block text-sm font-medium">Work authorization<select className={field} value={visa} onChange={e => setVisa(e.target.value)}><option>No sponsorship needed</option><option>Need sponsorship for some countries</option><option>Open to relocation with sponsorship</option></select></label></section>}

    {s === 5 && <section className="text-center"><span className="mx-auto grid size-20 place-items-center rounded-full bg-accent"><Check className="size-10 text-primary" /></span><h1 className="mt-4 text-3xl font-semibold">You're ready to ask.</h1><p className="mt-2 text-muted-foreground">Setup {Math.round((done / 5) * 100)}% complete. Finish anything you skipped from Profile.</p>
      <Panel className="mx-auto mt-6 max-w-md text-left"><ul className="space-y-3 text-sm">{[["Search goal", !!goal], ["Target roles", picked.length > 0], ["Resume", resume === "done"], ["Work links", links.length > 0], ["Location & authorization", true]].map(([l, ok]) => <li key={l as string} className="flex items-center justify-between"><span>{l as string}</span>{ok ? <Check className="size-4 text-primary" /> : <button className="text-link" onClick={() => setS(["Search goal", "Target roles", "Resume", "Work links"].indexOf(l as string))}>Add</button>}</li>)}</ul></Panel>
      <div className="mt-8 flex flex-wrap justify-center gap-3"><Button variant="outline" asChild><Link to="/alerts">Set alerts</Link></Button><Button asChild><Link to="/explore">Find a referrer <ArrowRight /></Link></Button></div></section>}

    {s < 5 && <footer className="mt-10 flex justify-between gap-3">{s > 0 ? <Button variant="ghost" onClick={() => setS(s - 1)}><ArrowLeft />Back</Button> : <span />}<Button disabled={s === 1 && picked.length === 0} onClick={() => setS(s + 1)}>{s === 4 ? "Finish" : "Continue"} <ArrowRight /></Button></footer>}
  </main>;
}
