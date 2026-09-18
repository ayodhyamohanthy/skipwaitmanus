import { Handshake, Plus, Sparkles } from "lucide-react";
import React, { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import { readApiJson } from "@/lib/apiResponse";

type PartnerModuleRow = { id: number; partnerName: string; category: "interview_prep" | "resume_vetting" | "skill_assessment" | "other"; headline: string; description: string | null; targetRoles: string | null; ctaLabel: string; ctaUrl: string; isActive: boolean; impressions: number; clicks: number };
type SponsorshipRow = { id: number; companyDomain: string; roleTitle: string; sponsoredTier: string | null; sponsoredUntil: string | Date | null };
type Tab = "partners" | "sponsored";

const emptyForm = { partnerName: "", category: "interview_prep", headline: "", description: "", targetRoles: "", ctaLabel: "Learn more", ctaUrl: "" };
const categoryLabels: Record<PartnerModuleRow["category"], string> = { interview_prep: "Interview prep", resume_vetting: "Resume vetting", skill_assessment: "Skill assessment", other: "Other" };

export default function AdminPartners() {
  const { isSignedIn, getToken } = useAuth();
  const [tab, setTab] = useState<Tab>("partners");
  const [modules, setModules] = useState<PartnerModuleRow[]>([]);
  const [sponsorships, setSponsorships] = useState<SponsorshipRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [saving, setSaving] = useState(false);

  const authHeaders = async (): Promise<Record<string, string>> => { const token = await getToken(); return token ? { Authorization: `Bearer ${token}` } : {}; };

  const load = async () => {
    if (!isSignedIn) { setLoading(false); return; }
    setLoading(true); setError(""); setDenied(false);
    try {
      const headers = await authHeaders();
      const [partnersResponse, sponsorResponse] = await Promise.all([fetch("/api/admin/partners", { headers, credentials: "include" }), fetch("/api/admin/sponsorships", { headers, credentials: "include" })]);
      if (partnersResponse.status === 403 || sponsorResponse.status === 403) { setDenied(true); return; }
      const partnersPayload = await readApiJson<{ modules?: PartnerModuleRow[]; error?: string }>(partnersResponse, "We could not load partner modules");
      const sponsorPayload = await readApiJson<{ sponsorships?: SponsorshipRow[]; error?: string }>(sponsorResponse, "We could not load sponsorships");
      if (!partnersResponse.ok) throw new Error(partnersPayload.error || "We could not load partner modules");
      setModules(partnersPayload.modules || []);
      if (sponsorResponse.ok) setSponsorships(sponsorPayload.sponsorships || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load partner inventory"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [isSignedIn]);

  const createModule = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/partners", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, credentials: "include", body: JSON.stringify(form) });
      const payload = await readApiJson<{ module?: unknown; error?: string }>(response, "We could not create the partner module");
      if (!response.ok) throw new Error(payload.error || "We could not create the partner module");
      setForm(emptyForm);
      void load();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "We could not create the partner module"); }
    finally { setSaving(false); }
  };

  const toggleActive = async (module: PartnerModuleRow) => {
    setModules(current => current.map(row => row.id === module.id ? { ...row, isActive: !row.isActive } : row));
    try {
      const response = await fetch(`/api/admin/partners/${module.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, credentials: "include", body: JSON.stringify({ isActive: !module.isActive }) });
      if (!response.ok) throw new Error();
    } catch { setModules(current => current.map(row => row.id === module.id ? { ...row, isActive: module.isActive } : row)); }
  };

  const endSponsorship = async (sponsorship: SponsorshipRow) => {
    try {
      const response = await fetch(`/api/admin/opportunities/${sponsorship.id}/end-sponsorship`, { method: "POST", headers: { ...(await authHeaders()) }, credentials: "include" });
      if (!response.ok) throw new Error();
      setSponsorships(current => current.filter(row => row.id !== sponsorship.id));
    } catch { setError("We could not end this sponsorship"); }
  };

  if (!isSignedIn) return <main data-skipwait-screen="admin-partners" className="min-h-screen bg-[#F5F4EF] px-5 py-6 text-[#191713]"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#E2DDD2] bg-white p-8"><Handshake className="h-7 w-7 text-[#191713]" /><h1 className="mt-4 text-2xl font-semibold">Administrator sign-in required</h1><p className="mt-2 text-sm leading-6 text-[#625D52]">Sign in with an administrator account to manage partner modules and sponsored roles.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#191713] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  if (denied) return <main data-skipwait-screen="admin-partners" className="min-h-screen bg-[#F5F4EF] px-5 py-6 text-[#191713]"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#E2DDD2] bg-white p-8"><h1 className="text-2xl font-semibold">Administrator access is required</h1><p className="mt-2 text-sm leading-6 text-[#625D52]">Partner inventory is available only to the designated administrator account.</p><a href="/" className="mt-5 inline-flex items-center rounded-lg border border-[#D5CFC0] bg-white px-4 py-3 text-sm font-semibold text-[#3F3B33]">Back to skipwait.me</a></section></div></main>;
  return <main data-skipwait-screen="admin-partners" className="min-h-screen bg-[#F5F4EF] px-5 py-6 text-[#191713] sm:px-6"><div className="mx-auto max-w-6xl"><AdminNav current="partners" /><section className="mt-10 rounded-2xl border border-[#E2DDD2] bg-white p-5 sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#191713]">B2B inventory</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Partner modules and sponsored roles.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#625D52]">Curate the contextual third-party slots shown inside seeker feeds, and audit the self-serve sponsorships currently buying placement.</p><div className="mt-5 flex gap-2" role="tablist" aria-label="B2B inventory sections"><button type="button" role="tab" aria-selected={tab === "partners"} onClick={() => setTab("partners")} className={`inline-flex min-h-10 items-center rounded-lg border px-4 py-2 text-xs font-bold ${tab === "partners" ? "border-[#191713] bg-[#191713] text-white" : "border-[#E2DDD2] bg-white text-[#3F3B33]"}`}>Partner modules</button><button type="button" role="tab" aria-selected={tab === "sponsored"} onClick={() => setTab("sponsored")} className={`inline-flex min-h-10 items-center rounded-lg border px-4 py-2 text-xs font-bold ${tab === "sponsored" ? "border-[#191713] bg-[#191713] text-white" : "border-[#E2DDD2] bg-white text-[#3F3B33]"}`}><Sparkles className="mr-1.5 h-3.5 w-3.5" />Sponsored roles ({sponsorships.length})</button></div>{error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{loading ? <div className="mt-6 grid gap-3">{[0, 1].map(index => <div key={index} className="h-24 animate-pulse rounded-xl border border-[#E2DDD2] bg-white" />)}</div> : tab === "partners" ? <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]"><ul className="grid gap-3">{!modules.length ? <li className="rounded-xl border border-dashed border-[#E2DDD2] p-10 text-center"><p className="text-sm font-bold text-[#2E2B25]">No partner modules yet.</p><p className="mt-1 text-sm text-[#625D52]">Add the first contextual slot with the form beside this list.</p></li> : modules.map(module => <li key={module.id} className="rounded-xl border border-[#E2DDD2] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-sm font-bold text-[#191713]">{module.headline}</h2><p className="mt-1 text-[11px] text-[#625D52]">{[module.partnerName, categoryLabels[module.category], module.targetRoles || "All roles"].filter(Boolean).join(" · ")}</p></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-[#ECE8DD] px-2.5 py-1 text-[11px] font-bold text-[#625D52]">{module.impressions} views · {module.clicks} clicks</span><button type="button" aria-pressed={module.isActive} onClick={() => void toggleActive(module)} className={`inline-flex min-h-9 items-center rounded-lg border px-3 py-1.5 text-[11px] font-bold ${module.isActive ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-[#D5CFC0] bg-white text-[#625D52]"}`}>{module.isActive ? "Active" : "Paused"}</button></div></div><p className="mt-2 truncate text-xs text-[#625D52]">{module.ctaUrl}</p></li>)}</ul><form onSubmit={event => { event.preventDefault(); void createModule(); }} className="h-fit rounded-xl border border-[#E2DDD2] bg-white p-4"><p className="flex items-center gap-2 text-sm font-bold text-[#191713]"><Plus className="h-4 w-4 text-[#191713]" />New partner module</p><label className="mt-3 block text-xs font-semibold text-[#3F3B33]">Partner name<input required value={form.partnerName} onChange={event => setForm(current => ({ ...current, partnerName: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DDD2] px-3 py-2 text-sm outline-none focus:border-[#191713]" /></label><label className="mt-3 block text-xs font-semibold text-[#3F3B33]">Category<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DDD2] px-3 py-2 text-sm outline-none focus:border-[#191713]">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="mt-3 block text-xs font-semibold text-[#3F3B33]">Headline<input required value={form.headline} onChange={event => setForm(current => ({ ...current, headline: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DDD2] px-3 py-2 text-sm outline-none focus:border-[#191713]" /></label><label className="mt-3 block text-xs font-semibold text-[#3F3B33]">Description<textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-[#E2DDD2] px-3 py-2 text-sm outline-none focus:border-[#191713]" /></label><label className="mt-3 block text-xs font-semibold text-[#3F3B33]">Target roles (comma-separated keywords)<input value={form.targetRoles} onChange={event => setForm(current => ({ ...current, targetRoles: event.target.value }))} placeholder="frontend, react, node" className="mt-1 w-full rounded-lg border border-[#E2DDD2] px-3 py-2 text-sm outline-none focus:border-[#191713]" /></label><label className="mt-3 block text-xs font-semibold text-[#3F3B33]">CTA label<input required value={form.ctaLabel} onChange={event => setForm(current => ({ ...current, ctaLabel: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#E2DDD2] px-3 py-2 text-sm outline-none focus:border-[#191713]" /></label><label className="mt-3 block text-xs font-semibold text-[#3F3B33]">CTA URL<input required type="url" value={form.ctaUrl} onChange={event => setForm(current => ({ ...current, ctaUrl: event.target.value }))} placeholder="https://partner.example/tool" className="mt-1 w-full rounded-lg border border-[#E2DDD2] px-3 py-2 text-sm outline-none focus:border-[#191713]" /></label><button type="submit" disabled={saving} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#191713] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60">{saving ? "Creating…" : "Create module"}</button></form></div> : sponsorships.length ? <ul className="mt-6 grid gap-3">{sponsorships.map(sponsorship => <li key={sponsorship.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2DDD2] bg-white p-4"><div className="min-w-0"><h2 className="text-sm font-bold text-[#191713]">{sponsorship.roleTitle}</h2><p className="mt-1 text-[11px] text-[#625D52]">{[sponsorship.companyDomain, sponsorship.sponsoredTier ? `Tier: ${sponsorship.sponsoredTier}` : null, sponsorship.sponsoredUntil ? `Until ${new Date(sponsorship.sponsoredUntil).toLocaleDateString()}` : null].filter(Boolean).join(" · ")}</p></div><button type="button" onClick={() => void endSponsorship(sponsorship)} className="inline-flex min-h-11 items-center rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-xs font-bold text-[#b91c1c] hover:bg-rose-50">End sponsorship</button></li>)}</ul> : <div className="mt-6 rounded-xl border border-dashed border-[#E2DDD2] p-10 text-center"><p className="text-sm font-bold text-[#2E2B25]">No active sponsorships.</p><p className="mt-1 text-sm text-[#625D52]">Employer-sponsored roles appear here for audit and early termination.</p></div>}</section></div></main>;
}
