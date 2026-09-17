import { ArrowRight, ArrowUpRight, FileText, Link2, LockKeyhole, Menu, Moon, ShieldCheck, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button, Card, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, FluentProvider, Tab, TabList, makeStyles, tokens, webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { SignInButton, useAuth } from "@/_core/auth";

const useStyles = makeStyles({
  root: {
    minHeight: "100dvh",
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    "& h1, & h2, & h3": { fontFamily: tokens.fontFamilyBase, margin: 0, textWrap: "initial" },
    "& p": { margin: 0 },
    "& a": { textDecorationLine: "none", color: "inherit" },
    "& a:focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: "4px" },
  },
  header: { maxWidth: "1280px", margin: "0 auto", padding: "0 40px", height: "80px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", "@media (max-width: 767px)": { padding: "0 20px", height: "72px" } },
  brand: { display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "24px", fontWeight: 600, letterSpacing: "-1px" },
  mark: { width: "34px", height: "34px", borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand, display: "grid", placeItems: "center" },
  nav: { display: "flex", alignItems: "center", gap: "28px", fontSize: tokens.fontSizeBase300, "& a": { display: "inline-flex", alignItems: "center", minHeight: "44px" }, "@media (max-width: 767px)": { display: "none" } },
  headerActions: { display: "flex", gap: "8px", alignItems: "center" },
  mobile: { display: "none", "@media (max-width: 767px)": { display: "inline-flex" } },
  workspace: { maxWidth: "1200px", margin: "0 auto", padding: "12px 20px", display: "flex", flexWrap: "wrap", gap: "8px" },
  hero: { maxWidth: "1280px", margin: "0 auto", padding: "48px 40px 64px", display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "72px", alignItems: "center", "@media (max-width: 1000px)": { gap: "32px" }, "@media (max-width: 767px)": { gridTemplateColumns: "1fr", padding: "32px 20px 40px", gap: "40px" } },
  eyebrow: { display: "flex", alignItems: "center", gap: "8px", color: tokens.colorBrandForeground1, fontSize: tokens.fontSizeBase300, fontWeight: 600, marginBottom: "24px" },
  headline: { fontSize: "clamp(42px, 4.6vw, 64px)", lineHeight: "1.08", fontWeight: 600, letterSpacing: "-.045em", "& span": { color: tokens.colorBrandForeground1 }, "@media (max-width: 767px)": { fontSize: "clamp(36px, 8.8vw, 52px)" } },
  lede: { fontSize: tokens.fontSizeBase400, lineHeight: "1.7", color: tokens.colorNeutralForeground2, maxWidth: "390px", paddingTop: "24px" },
  actions: { display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "32px", "& button": { minHeight: "48px" }, "@media (max-width: 400px)": { flexDirection: "column", alignItems: "stretch" } },
  guide: { padding: "28px", gap: "22px", borderRadius: tokens.borderRadiusXLarge, boxShadow: tokens.shadow8, "@media (max-width: 767px)": { padding: "24px" } },
  guideHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase300 },
  guideHeading: { fontSize: tokens.fontSizeBase500, fontWeight: 600, lineHeight: "1.3", letterSpacing: "-.025em" },
  steps: { display: "grid", gap: "24px", padding: 0, margin: 0, listStyleType: "none" },
  step: { display: "flex", alignItems: "flex-start", gap: "16px", "& h3": { fontSize: tokens.fontSizeBase300, fontWeight: 600, lineHeight: "1.5" }, "& p": { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase300, lineHeight: "1.6", paddingTop: "5px" } },
  stepIcon: { width: "40px", height: "40px", flexShrink: 0, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, display: "grid", placeItems: "center" },
  privacy: { borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: "20px", display: "flex", gap: "8px", alignItems: "center", color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200 },
  story: { backgroundColor: tokens.colorBrandBackground2, padding: "48px 40px", "@media (max-width: 767px)": { padding: "36px 20px" } },
  storyInner: { maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "48px", "& h2": { fontSize: "28px", fontWeight: 600, lineHeight: "1.2", letterSpacing: "-.025em" }, "& h3": { fontSize: tokens.fontSizeBase400, fontWeight: 600, marginBottom: "12px" }, "& p": { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground2, lineHeight: "1.7" }, "@media (max-width: 767px)": { gridTemplateColumns: "1fr", gap: "28px" } },
  footer: { maxWidth: "1280px", margin: "0 auto", padding: "24px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground2, "& a": { display: "inline-flex", gap: "8px", alignItems: "center", minHeight: "44px", color: tokens.colorBrandForeground1 }, "@media (max-width: 767px)": { padding: "24px 20px", flexDirection: "column", alignItems: "flex-start", gap: "8px" } },
  menuLinks: { display: "grid", gap: "12px", "& a": { display: "flex", alignItems: "center", minHeight: "48px", color: tokens.colorBrandForeground1 } },
  impact: { maxWidth: "1200px", margin: "0 auto", padding: "20px", fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground2 },
});

export default function Home() {
  const styles = useStyles();
  const [, go] = useLocation();
  const { isSignedIn } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [audience, setAudience] = useState("seeker");
  const [dark, setDark] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches));
  const [acceptedReferrals, setAcceptedReferrals] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/referral-impact").then(response => response.json()).then(payload => {
      if (active && typeof payload.acceptedReferrals === "number" && payload.acceptedReferrals > 0) setAcceptedReferrals(Math.floor(payload.acceptedReferrals));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const steps = audience === "seeker"
    ? [{ icon: Link2, title: "Bring the opportunity", body: "Paste a job link. We identify the role and company." }, { icon: FileText, title: "Tell your story", body: "Add your resume and a short note about your fit." }, { icon: ShieldCheck, title: "Reach the right people", body: "Verified employees at that company can privately review your request." }]
    : [{ icon: ShieldCheck, title: "Verify your work email", body: "Access private referral requests for your company." }, { icon: FileText, title: "Review with context", body: "See the role, resume, and a forwardable note in one place." }, { icon: LockKeyhole, title: "Choose how to help", body: "Refer someone when it feels right. You can always pass." }];
  return <FluentProvider theme={dark ? webDarkTheme : webLightTheme} className={styles.root}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="Skipwait home"><span className={styles.mark}><ArrowUpRight size={24} aria-hidden="true" /></span>skipwait.me</Link>
      <div className={styles.headerActions}><nav aria-label="Public navigation" className={styles.nav}><Link href="/support">How it works</Link><Link href="/privacy">Privacy</Link><SignInButton><Button size="large">Sign in</Button></SignInButton></nav><Button appearance="subtle" size="large" icon={dark ? <Sun size={19} /> : <Moon size={19} />} aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => setDark(!dark)} /><Button className={styles.mobile} appearance="subtle" size="large" aria-label="Open navigation menu" icon={<Menu size={22} />} onClick={() => setMenuOpen(true)} /></div>
    </header>
    {isSignedIn && <nav aria-label="Your workspace" className={styles.workspace}><Button onClick={() => go("/requests")}>My requests</Button><Button onClick={() => go("/inbox")}>My company inbox</Button><Button onClick={() => go("/wall")}>Internal openings</Button></nav>}
    <main>
      <section className={styles.hero}>
        <div><div className={styles.eyebrow}><ShieldCheck size={18} aria-hidden="true" />Private introductions. Real possibilities.</div><h1 className={styles.headline}>Your next role. <br /><span>A better way in.</span></h1><p className={styles.lede}>Connect with verified employees for a thoughtful, private referral to the role you want.</p><div className={styles.actions}><Button appearance="primary" size="large" icon={<ArrowRight size={18} />} iconPosition="after" onClick={() => go("/start")}>I need a referral</Button><Button size="large" icon={<ArrowUpRight size={18} />} iconPosition="after" onClick={() => go("/referrer")}>I can refer someone</Button></div></div>
        <Card className={styles.guide} role="region" aria-label="How referrals work"><div className={styles.guideHeader}><span>A better introduction</span><LockKeyhole size={18} aria-hidden="true" /></div><TabList selectedValue={audience} onTabSelect={(_, data) => setAudience(String(data.value))} aria-label="Referral steps"><Tab value="seeker">Job seekers</Tab><Tab value="employee">Employees</Tab></TabList><h2 className={styles.guideHeading}>{audience === "seeker" ? "Your next move, simplified." : "A referral on your terms."}</h2><ol className={styles.steps}>{steps.map(({ icon: Icon, title, body }) => <li key={title} className={styles.step}><span className={styles.stepIcon}><Icon size={21} aria-hidden="true" /></span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol><div className={styles.privacy}><LockKeyhole size={15} aria-hidden="true" />No public request feed. Private by default.</div></Card>
      </section>
      <section className={styles.story}><div className={styles.storyInner}><h2>A connection. <br />Not a cold message.</h2><div><h3>Context, not guesswork.</h3><p>A real role, a resume, and a reason to connect. Everything an employee needs to consider your request.</p></div><div><h3>Choice on both sides.</h3><p>Nothing is shared without a choice. Employees decide whether to help. A referral is never a hiring guarantee.</p></div></div></section>
      {acceptedReferrals && <p className={styles.impact}>Referral requests are private and acceptance is recorded on SkipWait</p>}
    </main>
    <footer className={styles.footer}><span>Better introductions. On your terms.</span><Link href="/employer">Hiring for your company?<ArrowUpRight size={16} aria-hidden="true" /></Link></footer>
    <Dialog open={menuOpen} onOpenChange={(_, data) => setMenuOpen(data.open)}><DialogSurface><DialogBody><DialogTitle action={<Button appearance="subtle" aria-label="Close navigation menu" icon={<X size={20} />} onClick={() => setMenuOpen(false)} />}>Menu</DialogTitle><DialogContent><nav className={styles.menuLinks} aria-label="Mobile navigation"><Link href="/support" onClick={() => setMenuOpen(false)}>How it works</Link><Link href="/privacy" onClick={() => setMenuOpen(false)}>Privacy</Link><SignInButton><Button size="large" onClick={() => setMenuOpen(false)}>Sign in</Button></SignInButton></nav></DialogContent></DialogBody></DialogSurface></Dialog>
  </FluentProvider>;
}
