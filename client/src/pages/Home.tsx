import { ArrowRight, ArrowUpRight, Check, FileText, LockKeyhole, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, FluentProvider, Tab, TabList, makeStyles, webLightTheme } from "@fluentui/react-components";
import { SignInButton, useAuth } from "@/_core/auth";
import { applySeo, faqJsonLd } from "@/lib/seo";
import { LANDING_EMPLOYEE_STEPS, LANDING_EXPLORE, LANDING_FAQ, LANDING_FAQ_HEADING, LANDING_GUIDES, LANDING_SEEKER_STEPS, LANDING_SUMMARY, LANDING_TITLE } from "@shared/landingContent";

const sans = '"Helvetica Neue", "Segoe UI", sans-serif';
const theme = { ...webLightTheme, fontFamilyBase: sans, colorBrandBackground: "#0000ff", colorBrandBackgroundHover: "#0000cc", colorBrandBackgroundPressed: "#000099", colorBrandForeground1: "#0000ff", colorBrandStroke1: "#0000ff", borderRadiusMedium: "18px" };
const useStyles = makeStyles({
  root: { minHeight: "100dvh", backgroundColor: "#ffffff", color: "#000000", fontFamily: sans, "& h1, & h2, & h3": { fontFamily: sans, margin: 0, textWrap: "balance" }, "& p": { margin: 0 }, "& a": { color: "inherit", textDecorationLine: "none" }, "& a:focus-visible": { outline: "3px solid #0000ff", outlineOffset: "5px" }, "& ::selection": { backgroundColor: "#fffc52", color: "#000000" } },
  header: { maxWidth: "1280px", margin: "auto", height: "88px", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px", "@media(max-width:767px)": { padding: "0 20px", height: "72px" } },
  brand: { display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "24px", fontWeight: 600, letterSpacing: "-.04em" },
  mark: { border: "1.5px solid #000000", width: "30px", height: "30px", display: "grid", placeItems: "center", borderRadius: "9px" },
  nav: { display: "flex", alignItems: "center", gap: "30px", fontSize: "14px", "& a": { minHeight: "44px", display: "inline-flex", alignItems: "center" }, "@media(max-width:767px)": { display: "none" } },
  menu: { display: "none", "@media(max-width:767px)": { display: "inline-flex", minHeight: "44px", minWidth: "44px" } },
  workspace: { maxWidth: "1200px", margin: "auto", padding: "12px 20px", display: "flex", flexWrap: "wrap", gap: "8px" },
  hero: { maxWidth: "1200px", margin: "auto", textAlign: "center", padding: "48px 24px 52px", "@media(max-width:767px)": { padding: "32px 20px 36px" } },
  headline: { fontSize: "clamp(48px, 6.8vw, 92px)", lineHeight: ".98", letterSpacing: "-.04em", fontWeight: 500, "@media(max-width:767px)": { fontSize: "clamp(40px, 10vw, 60px)" } },
  description: { maxWidth: "550px", margin: "24px auto 0", paddingTop: "24px", fontSize: "20px", lineHeight: "1.5", "@media(max-width:767px)": { fontSize: "17px", paddingTop: "20px" } },
  actions: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px", marginTop: "28px", "& button": { minHeight: "54px", padding: "14px 24px", fontSize: "16px", whiteSpace: "nowrap" }, "@media(max-width:420px)": { "& button": { width: "100%" } } },
  descriptionSub: { maxWidth: "620px", margin: "14px auto 0", fontSize: "15px", lineHeight: "1.6", color: "#505050", "@media(max-width:767px)": { fontSize: "14px" } },
  secondary: { border: "1px solid #000000", color: "#000000", backgroundColor: "#ffffff", ":hover": { backgroundColor: "#000000", color: "#ffffff", border: "1px solid #000000" } },
  playground: { maxWidth: "1200px", margin: "0 auto 80px", display: "grid", gridTemplateColumns: "1.1fr 1fr", backgroundColor: "#0000ff", color: "#ffffff", borderRadius: "76px", padding: "52px 64px", gap: "64px", alignItems: "center", "@media(max-width:1240px)": { marginLeft: "24px", marginRight: "24px", gap: "32px", padding: "44px" }, "@media(max-width:767px)": { gridTemplateColumns: "1fr", margin: "0 16px 48px", borderRadius: "38px", padding: "32px 24px", gap: "28px" } },
  playCopy: { "& h2": { fontSize: "clamp(36px, 4vw, 54px)", fontWeight: 500, letterSpacing: "-.04em", lineHeight: "1.04" }, "& p": { maxWidth: "330px", fontSize: "16px", lineHeight: "1.65", paddingTop: "22px", color: "#ededff" } },
  sphere: { width: "100px", height: "100px", borderRadius: "50%", backgroundColor: "#fffc52", marginTop: "32px", "@media(max-width:767px)": { display: "none" } },
  guide: { backgroundColor: "#ffffff", color: "#000000", borderRadius: "38px", padding: "28px", minWidth: 0, "@media(max-width:767px)": { borderRadius: "24px", padding: "20px" } },
  guideTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", fontSize: "13px", paddingBottom: "14px", borderBottom: "1px solid #cfcfcf" },
  tabs: { margin: "14px 0 20px", "& button": { minHeight: "44px" } },
  guideTitle: { fontSize: "25px", letterSpacing: "-.025em", lineHeight: "1.2", fontWeight: 500 },
  list: { listStyleType: "none", padding: 0, margin: "22px 0", display: "grid", gap: "18px" },
  item: { display: "flex", gap: "14px", alignItems: "flex-start", "& strong": { fontWeight: 600, fontSize: "14px" }, "& p": { color: "#505050", fontSize: "13px", lineHeight: "1.5", paddingTop: "4px" } },
  number: { fontFamily: '"JetBrains Mono", monospace', fontSize: "11px", width: "28px", height: "28px", display: "grid", placeItems: "center", border: "1px solid #cfcfcf", borderRadius: "50%", flexShrink: 0 },
  guideFoot: { display: "flex", alignItems: "center", gap: "8px", borderTop: "1px solid #cfcfcf", paddingTop: "16px", fontSize: "12px" },
  reassurance: { maxWidth: "1100px", margin: "0 auto 80px", padding: "0 24px", display: "flex", alignItems: "center", gap: "56px", "& h2": { flex: 1, fontSize: "42px", lineHeight: "1.1", letterSpacing: "-.035em", fontWeight: 500 }, "& p": { flex: 1, fontSize: "17px", lineHeight: "1.7", color: "#505050" }, "@media(max-width:767px)": { flexDirection: "column", alignItems: "flex-start", gap: "20px", marginBottom: "48px", "& h2": { fontSize: "34px" } } },
  faq: { maxWidth: "1100px", margin: "0 auto 80px", padding: "0 24px", "& h2": { fontSize: "42px", lineHeight: "1.1", letterSpacing: "-.035em", fontWeight: 500, maxWidth: "620px" }, "@media(max-width:767px)": { marginBottom: "48px", "& h2": { fontSize: "34px" } } },
  faqList: { margin: "36px 0 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px 48px", "@media(max-width:767px)": { gridTemplateColumns: "1fr", gap: "26px", marginTop: "26px" } },
  faqItem: { "& dt": { fontSize: "17px", fontWeight: 600, letterSpacing: "-.01em" }, "& dd": { margin: "8px 0 0", fontSize: "15px", lineHeight: "1.65", color: "#505050" } },
  dark: { backgroundColor: "#121212", color: "#ffffff", padding: "64px 24px", "@media(max-width:767px)": { padding: "36px 16px" } },
  darkInner: { maxWidth: "1200px", margin: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px", alignItems: "center", "@media(max-width:767px)": { gridTemplateColumns: "1fr", gap: "32px" } },
  yellow: { backgroundColor: "#fffc52", color: "#000000", borderRadius: "76px", padding: "60px 48px", "& h2": { fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, lineHeight: "1.02", letterSpacing: "-.04em" }, "@media(max-width:767px)": { borderRadius: "38px", padding: "40px 28px" } },
  commitments: { display: "grid", gap: "32px", padding: "0 16px", "& h3": { fontSize: "24px", fontWeight: 500, marginBottom: "10px" }, "& p": { color: "#cfcfcf", fontSize: "16px", lineHeight: "1.65", maxWidth: "390px" } },
  footer: { maxWidth: "1280px", margin: "auto", padding: "28px 32px", display: "grid", gap: "10px", fontSize: "13px", "& a": { minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "8px" }, "@media(max-width:767px)": { padding: "24px 20px" } },
  footerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px", "@media(max-width:767px)": { flexDirection: "column", alignItems: "flex-start", gap: "4px" } },
  footerLinks: { display: "flex", flexWrap: "wrap", gap: "4px 22px", "& a": { minHeight: "44px", color: "#505050", fontSize: "13px" }, "@media(max-width:767px)": { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 16px" } },
  impact: { padding: "24px", textAlign: "center", fontSize: "14px" },
  menuLinks: { display: "grid", gap: "12px", "& a": { display: "flex", alignItems: "center", minHeight: "44px" } },
});

export default function Home() {
  const s = useStyles();
  const [, go] = useLocation();
  const { isSignedIn } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [audience, setAudience] = useState("seeker");
  const [acceptedReferrals, setAcceptedReferrals] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/referral-impact").then(response => response.json()).then(payload => {
      if (active && typeof payload.acceptedReferrals === "number" && payload.acceptedReferrals > 0) setAcceptedReferrals(Math.floor(payload.acceptedReferrals));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    // Per-route metadata: the shell ships one <head>, so without this the home
    // route keeps whatever title the last visited screen set.
    applySeo({ title: LANDING_TITLE, description: LANDING_SUMMARY, path: "/", jsonLd: faqJsonLd(LANDING_FAQ) });
  }, []);
  // The steps the crawlable landing snapshot prints, from one shared source.
  const steps = audience === "seeker" ? LANDING_SEEKER_STEPS : LANDING_EMPLOYEE_STEPS;
  return <FluentProvider theme={theme} className={s.root}>
    <header className={s.header}><Link href="/" className={s.brand} aria-label="Skipwait home"><span className={s.mark}><ArrowUpRight size={22} aria-hidden="true" /></span>skipwait.me</Link><nav className={s.nav} aria-label="Public navigation"><Link href="/jobs">Browse roles</Link><Link href="/wall">Internal openings</Link><Link href="/support">How it works</Link><Link href="/pricing">Pricing</Link><Link href="/privacy">Privacy</Link><SignInButton><Button className={s.secondary} size="large">Sign in</Button></SignInButton></nav><Button className={s.menu} appearance="subtle" icon={<Menu size={22} />} aria-label="Open navigation menu" onClick={() => setMenuOpen(true)} /></header>
    {isSignedIn && <nav className={s.workspace} aria-label="Your workspace"><Button onClick={() => go("/requests")}>My requests</Button><Button onClick={() => go("/inbox")}>My company inbox</Button><Button onClick={() => go("/wall")}>Internal openings</Button></nav>}
    <main>
      <section className={s.hero}><h1 className={s.headline}>Good work deserves<br />a good introduction.</h1><p className={s.description}>A private referral to your next role.<br />From someone who already works there.</p><p className={s.descriptionSub}>{LANDING_SUMMARY}</p><div className={s.actions}><Button appearance="primary" size="large" icon={<ArrowRight size={19} />} iconPosition="after" onClick={() => go("/start")}>I need a referral</Button><Button className={s.secondary} size="large" onClick={() => go("/referrer")}>I can refer someone</Button></div></section>
      <section className={s.playground} aria-label="How referrals work"><div className={s.playCopy}><h2>Your next move.<br />All the right parts.</h2><p>A role worth pursuing. Your experience. Someone on the inside who can choose to help.</p><div className={s.sphere} aria-hidden="true" /></div><div className={s.guide}><div className={s.guideTop}><span>Make the introduction</span><FileText size={19} aria-hidden="true" /></div><TabList className={s.tabs} selectedValue={audience} onTabSelect={(_, data) => setAudience(String(data.value))} aria-label="Referral steps"><Tab value="seeker">Job seekers</Tab><Tab value="employee">Employees</Tab></TabList><h3 className={s.guideTitle}>{audience === "seeker" ? "A little context goes a long way." : "A referral on your terms."}</h3><ol className={s.list}>{steps.map((step, index) => <li key={step.title} className={s.item}><span className={s.number}>{index + 1}</span><div><strong>{step.title}</strong><p>{step.body}</p></div></li>)}</ol><div className={s.guideFoot}><LockKeyhole size={15} aria-hidden="true" />Private by default. Never a public feed.</div></div></section>
      <section className={s.reassurance}><h2>Less cold outreach.<br />More real context.</h2><p>No searching for the perfect opening message. Share the role, your resume, and your fit in one complete request.</p></section>
      <section className={s.faq} aria-labelledby="landing-faq-heading"><h2 id="landing-faq-heading">{LANDING_FAQ_HEADING}</h2><dl className={s.faqList}>{LANDING_FAQ.map(entry => <div key={entry.question} className={s.faqItem}><dt>{entry.question}</dt><dd>{entry.answer}</dd></div>)}</dl></section>
      <section className={s.dark}><div className={s.darkInner}><div className={s.yellow}><h2>A careful yes.<br />An easy no.<br />Your choice.</h2></div><div className={s.commitments}><div><Check size={24} aria-hidden="true" /><h3>People, not a public feed.</h3><p>Your request is reviewed privately by verified employees at the target company.</p></div><div><h3>An introduction. Not a guarantee.</h3><p>Employees decide whether to help. A referral never guarantees an interview or a job.</p></div></div></div></section>
      {acceptedReferrals ? <p className={s.impact}>{acceptedReferrals} referral requests accepted on skipwait.me · participants stay private.</p> : null}
    </main>
    <footer className={s.footer}><div className={s.footerRow}><span>skipwait.me · Better introductions. On your terms.</span><Link href="/employer">Hiring for your company?<ArrowUpRight size={16} aria-hidden="true" /></Link></div><nav className={s.footerLinks} aria-label="skipwait.me pages">{LANDING_EXPLORE.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav><p className="font-semibold text-black">Guides</p><nav className={s.footerLinks} aria-label="Guides">{LANDING_GUIDES.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav></footer>
    <Dialog open={menuOpen} onOpenChange={(_, data) => setMenuOpen(data.open)}><DialogSurface><DialogBody><DialogTitle action={<Button appearance="subtle" aria-label="Close navigation menu" icon={<X size={20} />} onClick={() => setMenuOpen(false)} />}>Menu</DialogTitle><DialogContent><nav className={s.menuLinks} aria-label="Mobile navigation"><Link href="/jobs" onClick={() => setMenuOpen(false)}>Browse roles</Link><Link href="/wall" onClick={() => setMenuOpen(false)}>Internal openings</Link><Link href="/support" onClick={() => setMenuOpen(false)}>How it works</Link><Link href="/pricing" onClick={() => setMenuOpen(false)}>Pricing</Link><Link href="/privacy" onClick={() => setMenuOpen(false)}>Privacy</Link><SignInButton><Button onClick={() => setMenuOpen(false)}>Sign in</Button></SignInButton></nav></DialogContent></DialogBody></DialogSurface></Dialog>
  </FluentProvider>;
}
