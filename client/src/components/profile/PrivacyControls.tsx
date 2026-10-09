// Kit v4 /profile "PRIVACY CONTROLS" aside (app/src/routes/profile.tsx). The
// first row reflects the saved profile visibility and referrer naming, so the
// panel never claims "not publicly discoverable" for a public page.
import { ArrowRight, BadgeCheck, Bell, Globe, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import type { ProfileVisibility } from "./VisibilityOptions";

export type ProfileRole = "seeker" | "referrer";

function discoverability(role: ProfileRole, visibility: ProfileVisibility, referrerNamed: boolean) {
  if (visibility === "public") return { Icon: Globe, title: "Publicly discoverable", hint: "Anyone, and search engines, can see your public page." };
  if (role === "referrer") return { Icon: LockKeyhole, title: "Not publicly discoverable", hint: referrerNamed ? "Seekers see your name, company and function." : "Seekers see your company and function, not your name." };
  return { Icon: LockKeyhole, title: "Not publicly discoverable", hint: visibility === "link" ? "Only people with your link see your public page." : "Only referrers reviewing your ask see context." };
}

export function PrivacyControls({ role, visibility, referrerNamed, verifiedDomain }: {
  role: ProfileRole;
  visibility: ProfileVisibility;
  referrerNamed: boolean;
  verifiedDomain: string | null;
}) {
  const first = discoverability(role, visibility, referrerNamed);
  return (
    <aside className="privacy-controls">
      <span className="eyebrow">PRIVACY CONTROLS</span>
      <div><first.Icon /><span><strong>{first.title}</strong><small>{first.hint}</small></span></div>
      {verifiedDomain ? <div><BadgeCheck /><span><strong>Verified at {verifiedDomain}</strong><small>Your email is never shown to seekers.</small></span></div> : null}
      <div><Bell /><span><strong>Useful notifications only</strong><small>Requests, decisions, replies, and time-sensitive safety updates.</small></span></div>
      <div><ShieldCheck /><span><strong>Report available</strong><small>Report a conversation without losing access to support.</small></span></div>
      <Link href="/safety">Review safety boundaries <ArrowRight /></Link>
    </aside>
  );
}
