import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
export const Route = createFileRoute("/safety")({ head: () => pageMeta("Help & safety", "Understand privacy, free referrals, verification, and honest expectations on SkipWait."), component: Safety });
const answers = [
  ["Are referrals really free?", "Yes. No payments between job seekers and referrers, no commissions, and no paid priority. A referral is a voluntary introduction, not a purchase."],
  ["Who can see a referrer’s name?", "Referrer names are not public. A name is revealed only to the seeker whose request that referrer has accepted."],
  ["Does a referral guarantee an interview?", "No. A referral, interview, offer, or job is never guaranteed. Employers make their own hiring decisions."],
  ["What does work-email verification mean?", "It confirms ownership of an email address on an approved company domain. It does not prove current employment or employer endorsement."],
  ["When is my resume shared?", "The proposed experience keeps resumes private until a referrer accepts a request. This design preview does not collect or share resumes."],
  ["What if someone asks me to pay?", "Do not pay for a referral or share sensitive financial information. Reporting and support channels must be connected before the platform launches."],
];
function Safety() { return <main className="page-content"><div className="page-heading"><div><span className="eyebrow">TRUST IS THE WHOLE POINT</span><h1>Help & safety<span className="brand-dot">.</span></h1><p>Clear boundaries. Real people. No fine-print surprises.</p></div></div><section className="safety-list">{answers.map(([title, answer], index) => <details key={title} open={index === 0}><summary>{title}</summary><p>{answer}</p></details>)}</section><section className="employee-band mt-8"><span className="band-icon"><ShieldCheck /></span><div><h3>Your next move, on your terms.</h3><p>Explore freely. Share only when you’re ready.</p></div><Button asChild variant="outline"><Link to="/explore">Explore <ArrowUpRight /></Link></Button></section><p className="design-note">DESIGN PREVIEW · APPROVED LEGAL POLICIES AND SUPPORT DETAILS ARE NOT YET PROVIDED.</p></main>; }