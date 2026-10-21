import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { BadgeCheck } from "lucide-react";
import { useAuth } from "@/_core/auth";
import content from "../../../design/goal-ui/content.json";
const copy = content.claimCompany;
export const companyClaimVisible = () => import.meta.env.VITE_COMPANY_CLAIM === "true";
type Dashboard = { company: { name: string; slug: string; domain: string; openToReferrals: boolean }; signal: { state: "insufficient" } | { state: "shown"; answeredThisMonth: number; usualFirstReplyDays: number; referrersInside: number } };
async function call(path: string, body?: object) {
  const res = await fetch(`/api/company-claim/${path}`, { credentials: "include", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? copy.error);
  return data;
}
export default function CompanyClaim() {
  const { isSignedIn } = useAuth();
  const [, go] = useLocation();
  const [isDashboard, params] = useRoute("/company/dashboard/:slug");
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  useEffect(() => {
    const meta = document.createElement("meta"); meta.name = "referrer"; meta.content = "no-referrer";
    document.head.appendChild(meta); return () => { meta.remove(); };
  }, []);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  useEffect(() => {
    if (!companyClaimVisible() || !isDashboard || !isSignedIn || !params?.slug) return;
    let active = true;
    setDashboard(null); setError("");
    void call(`dashboard/${encodeURIComponent(params.slug)}`).then(value => { if (active) setDashboard(value); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [isDashboard, isSignedIn, params?.slug]);
  if (!companyClaimVisible()) return <main className="page-content"><h1>Page not available</h1><Link href="/for-companies">For companies</Link></main>;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (token) {
        const result = await call("confirm", { token });
        // Remove the secret token from history before leaving confirmation.
        window.history.replaceState(null, "", "/company/claim");
        go(`/company/dashboard/${encodeURIComponent(result.slug)}`);
      } else { await call("send", { email }); setSent(true); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : copy.error); }
    finally { setBusy(false); }
  };
  const company = dashboard?.company;
  const signal = dashboard?.signal;
  return <div className="company-claim-site">
    <header className="company-claim-header"><Link href="/">skipwait.me</Link><Link href="/for-companies">{copy.label}</Link></header>
    <main className="company-claim-main">
      <p className="company-claim-label">{isDashboard ? copy.dashboard : copy.label}</p>
      <h1>{company?.name ?? (isDashboard ? copy.dashboard : copy.title)}</h1>
      {!isDashboard ? <>
        <p className="company-claim-intro">{copy.intro}</p>
        <h2>{copy.benefitsTitle}</h2>
        <div className="company-claim-benefits">{copy.benefits.map(item => <section key={item.title}><h3>{item.title}</h3><p>{item.body}</p></section>)}</div>
        <h2>{copy.privacyTitle}</h2><p>{copy.privacy}</p>
      </> : null}
      {!isSignedIn ? <Link className="company-claim-primary" href={`/sign-in?intent=referrer&returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`}>{copy.signin}</Link> : isDashboard ? <>
        {!dashboard && !error ? <p role="status">{copy.loading}</p> : null}
        {company ? <p className="company-claim-verified"><BadgeCheck size={16} />{company.domain} verified · {copy.period}</p> : null}
        {signal?.state === "shown" ? <div className="company-claim-kpis"><div><strong>{signal.answeredThisMonth}</strong><span>{copy.answered}</span></div><div><strong>{signal.usualFirstReplyDays} days</strong><span>{copy.reply}</span></div><div><strong>{signal.referrersInside}</strong><span>{copy.employees}</span></div></div> : signal ? <p className="company-claim-empty">{copy.insufficient}</p> : null}
        {company ? <><h2>{copy.publicTitle}</h2>{signal?.state === "shown" ? <div className="company-claim-public"><p>{company.openToReferrals ? copy.open : copy.closed}</p><div className="company-claim-kpis"><div><strong>{signal.usualFirstReplyDays} days</strong><span>{copy.reply}</span></div><div><strong>{signal.answeredThisMonth}</strong><span>{copy.answered}</span></div><div><strong>{signal.referrersInside}</strong><span>{copy.employees}</span></div></div></div> : <p>{copy.insufficient}</p>}<Link href={`/explore/${company.slug}`}>{copy.back}</Link><p>{copy.thin}</p><h2>{copy.peopleTitle}</h2><p>{copy.people}</p><small>{copy.footer}</small></> : null}
      </> : <form onSubmit={submit} className="company-claim-form">
        {token ? <p>{copy.confirmNote}</p> : <><label htmlFor="claim-work-email">{copy.emailLabel}</label><input id="claim-work-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></>}
        <button className="company-claim-primary" disabled={busy || sent} type="submit">{token ? copy.confirm : copy.send}</button>
        {sent ? <p role="status">{copy.sent}</p> : null}
      </form>}
      {error ? <p role="alert">{error}</p> : null}
      {!isDashboard ? <><small>{copy.fine}</small><Link href="/suggest-company">Suggest a company</Link></> : null}
    </main>
  </div>;
}
