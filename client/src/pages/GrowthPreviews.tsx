import { Brand } from "@/components/Brand";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Clock3,
  ExternalLink,
  Facebook,
  FileText,
  Linkedin,
  LockKeyhole,
  MapPin,
  MessageCircleMore,
  ShieldCheck,
  Share2,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

type PreviewKind = "wall" | "post" | "share";

const previewRoutes: Record<PreviewKind, string> = {
  wall: "/wall",
  post: "/post-opportunity",
  share: "/request-share-preview",
};

const previewLabels: Record<PreviewKind, string> = {
  wall: "Opportunity Wall",
  post: "Employee post",
  share: "Share card",
};

function PreviewShell({ active, children }: { active: PreviewKind; children: React.ReactNode }) {
  const [, go] = useLocation();

  return (
    <main className="min-h-screen bg-[#F5F4EF] text-[#191713]">
      <header className="border-b border-[#E2DDD2] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-[#DBEAFE] bg-[#E8F0FE] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-[#191713] sm:inline-flex">Design preview</span>
            <button onClick={() => go("/")} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#625D52] hover:bg-[#ECE8DD] hover:text-[#191713]"><ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Home</span></button>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 pb-3 sm:px-6" aria-label="Design preview navigation">
          {(Object.keys(previewRoutes) as PreviewKind[]).map((key) => (
            <button
              key={key}
              onClick={() => go(previewRoutes[key])}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${active === key ? "bg-[#191713] text-white shadow-sm" : "text-[#625D52] hover:bg-[#ECE8DD] hover:text-[#191713]"}`}
              aria-current={active === key ? "page" : undefined}
            >
              {previewLabels[key]}
            </button>
          ))}
        </div>
      </header>
      <div className="border-b border-[#DBEAFE] bg-[#E8F0FE]/70 px-5 py-2.5 text-center text-xs font-medium text-[#625D52]"><span className="font-bold text-[#191713]">Preview only.</span> This shows the proposed experience; nothing is published, shared, or sent.</div>
      {children}
    </main>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="inline-flex items-center gap-2 rounded-full bg-[#E8F0FE] px-3 py-1.5 text-xs font-bold text-[#191713]"><Sparkles className="h-3.5 w-3.5" />{children}</p>;
}

const opportunityCards = [
  { kind: "Private referrals open", role: "Product Designer", company: "Company X", city: "Remote · India", note: "A verified employee is accepting private referral requests for this role.", timing: "Hiring now", cta: "Use this opportunity" },
  { kind: "Walk-in", role: "Customer Support", company: "Company Y", city: "Bengaluru", note: "Verified employee shared a public walk-in opportunity with private referral support.", timing: "Saturday · 10:00–14:00", cta: "See walk-in details" },
  { kind: "Private referrals open", role: "Backend Engineer", company: "Company Z", city: "Remote · Global", note: "A verified employee is welcoming relevant requests without exposing their identity.", timing: "Hiring now", cta: "Use this opportunity" },
];

export function OpportunityWallPreview() {
  const announce = (role: string) => toast(`Preview only — “${role}” would prefill a private referral request without asking the Job Seeker to sign in yet.`);

  return <PreviewShell active="wall">
    <section className="mx-auto max-w-6xl px-5 pb-14 pt-9 sm:px-6 sm:pb-20 sm:pt-14">
      <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <Eyebrow>Design A · Public, anonymous discovery</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[.98] tracking-[-.02em] sm:text-6xl">Find an opening. Keep the people behind it private.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#625D52] sm:text-lg">The Opportunity Wall shows only company-level hiring signals from verified employees. Browse freely; protect your resume only when you choose to send a request.</p>
        </div>
        <div className="rounded-2xl border border-[#E2DDD2] bg-white p-4 shadow-sm lg:w-[276px]"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></span><div><p className="text-sm font-bold text-[#191713]">Identity stays hidden</p><p className="mt-1 text-xs leading-5 text-[#625D52]">No employee names, emails, or public profiles appear here.</p></div></div></div>
      </div>

      <div className="mt-9 grid gap-4 lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="grid gap-4 sm:grid-cols-2">
          {opportunityCards.map((opportunity, index) => (
            <article key={opportunity.role} className={`group flex min-h-[300px] flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${index === 0 ? "border-[#BFDBFE] ring-1 ring-[#E8F0FE]" : "border-[#E2DDD2]"}`}>
              <div className="flex items-start justify-between gap-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${opportunity.kind === "Walk-in" ? "bg-amber-50 text-amber-800" : "bg-[#E8F0FE] text-[#191713]"}`}>{opportunity.kind === "Walk-in" ? <CalendarDays className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}{opportunity.kind}</span><span className="text-[11px] font-semibold text-[#625D52]">Verified company signal</span></div>
              <div className="mt-7"><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#625D52]">{opportunity.company}</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em] text-[#191713]">{opportunity.role}</h2><p className="mt-3 text-sm leading-6 text-[#625D52]">{opportunity.note}</p></div>
              <div className="mt-auto pt-6"><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-[#625D52]"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#191713]" />{opportunity.city}</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-[#191713]" />{opportunity.timing}</span></div><button aria-label={`Use ${opportunity.role} opportunity`} onClick={() => announce(opportunity.role)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#2A2721] active:scale-[.98]">{opportunity.cta}<ArrowRight className="h-4 w-4" /></button></div>
            </article>
          ))}
        </div>
        <aside className="rounded-2xl bg-[#191713] p-6 text-white shadow-sm"><UsersRound className="h-6 w-6 text-[#BFDBFE]" /><h2 className="mt-5 text-xl font-semibold tracking-[-.03em]">Work somewhere that is hiring?</h2><p className="mt-3 text-sm leading-6 text-[#D5CFC0]">Help Job Seekers find a trusted route without becoming publicly searchable.</p><button onClick={() => toast("Preview only — work-email sign-in would appear when an employee chooses to post or join company coverage.")} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-[#191713] hover:bg-[#E8F0FE]">Share an opportunity <ChevronRight className="h-4 w-4" /></button><div className="mt-6 border-t border-white/15 pt-5 text-xs leading-5 text-[#ededff]">Work-email verification happens only when you participate. It never publishes your identity.</div></aside>
      </div>
    </section>
  </PreviewShell>;
}

export function OpportunityPostPreview() {
  const [mode, setMode] = useState<"hiring" | "walkin">("hiring");
  const [role, setRole] = useState("Product Designer");
  const [link, setLink] = useState("https://careers.companyx.com/product-designer");
  const title = role.trim() || "Your role";
  const subline = mode === "hiring" ? "Private referrals are welcome" : "Walk-in · Saturday, 10:00–14:00";

  return <PreviewShell active="post">
    <section className="mx-auto max-w-6xl px-5 pb-14 pt-9 sm:px-6 sm:pb-20 sm:pt-14">
      <div className="max-w-3xl">
        <Eyebrow>Design B · 20-second employee post</Eyebrow>
        <h1 className="mt-4 text-4xl font-semibold leading-[.98] tracking-[-.02em] sm:text-6xl">Share a real opening. Never share your identity.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#625D52] sm:text-lg">A compact composer asks for the smallest useful signal, then makes a clean public card. Secure sign-in and work-email verification wait until Publish.</p>
      </div>

      <div className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
        <form onSubmit={(event) => { event.preventDefault(); toast("Preview only — secure sign-in would open after the employee chooses Publish."); }} className="rounded-2xl border border-[#E2DDD2] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-[#191713]">Create a company signal</p><p className="mt-1 text-sm text-[#625D52]">No profile. No long description. Just enough to be useful.</p></div><span className="hidden h-9 w-9 place-items-center rounded-xl bg-[#E8F0FE] text-[#191713] sm:grid"><BriefcaseBusiness className="h-5 w-5" /></span></div>
          <fieldset className="mt-7"><legend className="text-sm font-bold text-[#2E2B25]">What are you sharing?</legend><div className="mt-3 grid grid-cols-2 gap-3"><button type="button" aria-label="Hiring now" onClick={() => setMode("hiring")} className={`rounded-xl border p-4 text-left transition ${mode === "hiring" ? "border-[#191713] bg-[#E8F0FE] ring-1 ring-[#DBEAFE]" : "border-[#E2DDD2] hover:border-[#BFDBFE]"}`}><BadgeCheck className={`h-5 w-5 ${mode === "hiring" ? "text-[#191713]" : "text-[#625D52]"}`} /><span className="mt-3 block text-sm font-bold text-[#191713]">Hiring now</span><span className="mt-1 block text-xs leading-5 text-[#625D52]">A role where private referrals are welcome.</span></button><button type="button" aria-label="Walk-in" onClick={() => setMode("walkin")} className={`rounded-xl border p-4 text-left transition ${mode === "walkin" ? "border-[#191713] bg-[#E8F0FE] ring-1 ring-[#DBEAFE]" : "border-[#E2DDD2] hover:border-[#BFDBFE]"}`}><CalendarDays className={`h-5 w-5 ${mode === "walkin" ? "text-[#191713]" : "text-[#625D52]"}`} /><span className="mt-3 block text-sm font-bold text-[#191713]">Walk-in</span><span className="mt-1 block text-xs leading-5 text-[#625D52]">A public event with a clear date and place.</span></button></div></fieldset>
          <div className="mt-6 grid gap-5"><label className="grid gap-2 text-sm font-bold text-[#2E2B25]">Role or job URL<input value={role} onChange={(event) => setRole(event.target.value)} className="min-h-12 rounded-lg border border-[#D5CFC0] px-3 text-sm font-medium outline-none placeholder:text-[#625D52] focus:border-[#191713] focus:ring-4 focus:ring-[#E8F0FE]" placeholder="e.g. Product Designer" /></label><label className="grid gap-2 text-sm font-bold text-[#2E2B25]">Job link <span className="font-medium text-[#625D52]">(optional in this preview)</span><input value={link} onChange={(event) => setLink(event.target.value)} className="min-h-12 rounded-lg border border-[#D5CFC0] px-3 text-sm font-medium outline-none placeholder:text-[#625D52] focus:border-[#191713] focus:ring-4 focus:ring-[#E8F0FE]" placeholder="https://careers.company.com/role" /></label></div>
          {mode === "walkin" && <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold text-[#2E2B25]">Date<input defaultValue="Saturday, 16 August" className="min-h-12 rounded-lg border border-[#D5CFC0] px-3 text-sm font-medium outline-none focus:border-[#191713] focus:ring-4 focus:ring-[#E8F0FE]" /></label><label className="grid gap-2 text-sm font-bold text-[#2E2B25]">Location<input defaultValue="Bengaluru" className="min-h-12 rounded-lg border border-[#D5CFC0] px-3 text-sm font-medium outline-none focus:border-[#191713] focus:ring-4 focus:ring-[#E8F0FE]" /></label></div>}
          <div className="mt-7 flex items-start gap-3 rounded-xl border border-[#DBEAFE] bg-[#E8F0FE]/70 p-4 text-sm leading-6 text-[#3F3B33]"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#191713]" /><span>Your company is inferred from a verified work email after you publish. Your name and work email never appear on the card.</span></div>
          <button type="submit" className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#2A2721] active:scale-[.98]">Publish privately <ArrowRight className="h-4 w-4" /></button>
        </form>

        <aside className="rounded-2xl bg-[#191713] p-5 text-white shadow-sm sm:p-7"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.14em] text-[#BFDBFE]">Your public card</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white">Preview</span></div><div className="mt-6 rounded-2xl bg-white p-5 text-[#191713]"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F0FE] px-2.5 py-1 text-[11px] font-bold text-[#191713]"><BadgeCheck className="h-3.5 w-3.5" />Verified company signal</span><p className="mt-7 text-[11px] font-bold uppercase tracking-[.14em] text-[#625D52]">Company X</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">{title}</h2><p className="mt-3 text-sm leading-6 text-[#625D52]">A verified employee at Company X is sharing this opportunity. {subline}.</p><div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-[#625D52]"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#191713]" />Company location</span><span className="inline-flex items-center gap-1.5"><ExternalLink className="h-3.5 w-3.5 text-[#191713]" />Role link</span></div><button type="button" className="mt-6 w-full rounded-lg bg-[#ECE8DD] px-4 py-2.5 text-sm font-bold text-[#625D52]">Use this opportunity</button></div><div className="mt-6 flex items-start gap-3 border-t border-white/15 pt-5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><p className="text-xs leading-5 text-[#D5CFC0]">The employee confirms the public hiring details on publish. The job link remains optional for walk-ins.</p></div></aside>
      </div>
    </section>
  </PreviewShell>;
}

export function RequestSharePreview() {
  const share = (channel: string) => toast(`Preview only — ${channel} would share an invitation to join Company X coverage, never the Job Seeker’s resume.`);

  return <PreviewShell active="share">
    <section className="mx-auto max-w-6xl px-5 pb-14 pt-9 sm:px-6 sm:pb-20 sm:pt-14">
      <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto]"><div><Eyebrow>Design C · After a private request</Eyebrow><h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[.98] tracking-[-.02em] sm:text-6xl">Your request is private. Your invite can grow coverage.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[#625D52] sm:text-lg">The share card appears after a request is sent. It makes one useful, privacy-safe ask: invite a person who works at the target company to become verified.</p></div><div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />Private request sent</div></div>

      <div className="mt-9 grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
        <div className="rounded-2xl border border-[#E2DDD2] bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></span><div><p className="text-sm font-bold text-[#191713]">Your private request is on its way</p><p className="mt-1 text-sm leading-6 text-[#625D52]">Only eligible, work-email-verified employees at <strong>Company X</strong> can claim it. Your resume is not included in this invitation.</p></div></div>
          <div className="mt-8 rounded-2xl border border-[#DBEAFE] bg-[#E8F0FE]/60 p-5 sm:p-6"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#191713]">A private company invitation</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em] text-[#191713]">Know someone at Company X?</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#625D52]">Invite one trusted employee to join private company coverage. They decide whether to verify their work email—there are no automatic invites.</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#191713] shadow-sm"><Share2 className="h-5 w-5" /></span></div>
            <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-[#DBEAFE] bg-white p-3"><span className="truncate text-sm font-semibold text-[#625D52]">skipwait.me/join/company-x</span><button onClick={() => share("Copy link")} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#191713] px-3 py-2 text-xs font-bold text-white hover:bg-[#2E2B25]"><Clipboard className="h-3.5 w-3.5" />Copy</button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3"><button onClick={() => share("WhatsApp")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#E2DDD2] bg-white px-3 text-sm font-bold text-[#3F3B33] hover:border-[#BFDBFE] hover:bg-[#E8F0FE]"><MessageCircleMore className="h-4 w-4 text-[#191713]" />WhatsApp</button><button onClick={() => share("LinkedIn")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#E2DDD2] bg-white px-3 text-sm font-bold text-[#3F3B33] hover:border-[#BFDBFE] hover:bg-[#E8F0FE]"><Linkedin className="h-4 w-4 text-[#191713]" />LinkedIn</button><button onClick={() => share("Email")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#E2DDD2] bg-white px-3 text-sm font-bold text-[#3F3B33] hover:border-[#BFDBFE] hover:bg-[#E8F0FE]"><FileText className="h-4 w-4 text-[#191713]" />Email</button></div>
          </div>
          <p className="mt-5 text-xs leading-5 text-[#625D52]">This link invites someone to verify their work email for Company X. It does not reveal the candidate, role documents, or request details.</p>
        </div>

        <aside className="rounded-2xl bg-[#191713] p-6 text-white shadow-sm"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#BFDBFE]">What they see</p><div className="mt-5 rounded-2xl bg-white p-5 text-[#191713]"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F0FE] px-2.5 py-1 text-[11px] font-bold text-[#191713]"><BadgeCheck className="h-3.5 w-3.5" />Company coverage</span><h2 className="mt-5 text-xl font-semibold tracking-[-.035em]">Help cover referrals at Company X</h2><p className="mt-2 text-sm leading-6 text-[#625D52]">Verify your work email to see private requests that match your company. Your identity stays hidden from Job Seekers.</p><button onClick={() => share("Employee entry")} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2A2721]">Join privately <ArrowRight className="h-4 w-4" /></button></div><div className="mt-5 flex items-start gap-3 text-xs leading-5 text-[#D5CFC0]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />The flow asks for work-email verification only after the employee chooses to join.</div></aside>
      </div>
    </section>
  </PreviewShell>;
}
