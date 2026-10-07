import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { readApiJson } from "@/lib/apiResponse";

type VanityFastTrackState = { companyDomain: string; isActive: true };

export default function VanityFastTrackLink() {
  const [, params] = useRoute("/refer/:companySlug/:vanityAlias");
  const [, go] = useLocation();
  const [link, setLink] = useState<VanityFastTrackState | null>(null);
  const [error, setError] = useState("");
  const companySlug = params?.companySlug || "";
  const vanityAlias = params?.vanityAlias || "";
  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => { setError(""); setLink(null); setReloadKey(key => key + 1); };

  useEffect(() => {
    let active = true;
    void fetch(`/api/referrer-fast-track/vanity/${encodeURIComponent(companySlug)}/${encodeURIComponent(vanityAlias)}`, { cache: "no-store" }).then(async response => {
      const payload = await readApiJson<{ link?: VanityFastTrackState; error?: string }>(response, "This private referral link is unavailable");
      if (!response.ok) throw new Error(payload.error || "This private referral link is unavailable");
      if (active) setLink(payload.link || null);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "This private referral link is unavailable"); });
    return () => { active = false; };
  }, [companySlug, vanityAlias, reloadKey]);

  return <main data-skipwait-screen="vanity-fast-track-link" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center"><Link href="/" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back</Link></header>{error ? <section className="flex flex-1 flex-col justify-center"><div role="alert" className="rounded-xl border border-[#b91c1c]/30 bg-[#b91c1c]/10 p-5 text-center"><p className="text-sm font-bold text-[#B91C1C]">{error}</p><p className="mt-1 text-sm text-muted-foreground">The link may have expired or been paused. Nothing was changed.</p><button type="button" onClick={retry} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#b91c1c]/30 bg-white px-4 py-2.5 text-sm font-bold text-[#B91C1C]">Try again</button><Link href="/start" className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white">Start a referral request</Link></div></section> : !link ? <section className="flex flex-1 flex-col justify-center"><div role="status" aria-busy="true" aria-live="polite" className="h-44 animate-pulse rounded-xl border border-border bg-white" /></section> : <><section className="flex min-h-0 flex-1 flex-col"><div className="flex flex-1 flex-col justify-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-black"><ShieldCheck className="h-7 w-7" /></span><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.02em]">Request a referral at {link.companyDomain}.</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">Add the job link and your resume. A verified employee at {link.companyDomain} can choose whether to review. Their identity stays private.</p><p className="mt-4 text-xs leading-5 text-muted-foreground">This does not bypass the employer’s application process or guarantee a referral.</p></div></section><section className="shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4" aria-label="Start a request"><footer><button type="button" onClick={() => go(`/start?referCompany=${encodeURIComponent(companySlug)}&referAlias=${encodeURIComponent(vanityAlias)}`)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 text-sm font-bold text-white">Start private request <ArrowRight className="h-4 w-4" /></button></footer></section></>}</div></main>;
}
