// Kit v4 /profile "PRIVACY CONTROLS" aside (app/src/routes/profile.tsx). The
// first row reflects the saved profile visibility and referrer naming, so the
// panel never claims "not publicly discoverable" for a public page.
import { ArrowRight, Bell, Globe, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import type { ProfileVisibility } from "./VisibilityOptions";

export type ProfileRole = "seeker" | "referrer";

function discoverability(role: ProfileRole, visibility: ProfileVisibility) {
  if (visibility === "public") return { Icon: Globe, title: "Publicly discoverable", hint: "Anyone, and search engines, can see your public page." };
  if (role === "referrer") return { Icon: LockKeyhole, title: "Not publicly discoverable", hint: "Seekers see your company and function. Your name is shown only after you accept." };
  return { Icon: LockKeyhole, title: "Not publicly discoverable", hint: visibility === "link" ? "Only people with your link see your public page." : "Only referrers reviewing your ask see context." };
}

export function PrivacyControls({ role, visibility }: {
  role: ProfileRole;
  visibility: ProfileVisibility;
}) {
  const first = discoverability(role, visibility);
  return (
    <aside className="privacy-controls">
      <span className="eyebrow">PRIVACY CONTROLS</span>
      <div><first.Icon /><span><strong>{first.title}</strong><small>{first.hint}</small></span></div>
      <div><Bell /><span><strong>Useful notifications only</strong><small>Requests, decisions, replies, and time-sensitive safety updates.</small></span></div>
      <div><ShieldCheck /><span><strong>Block and report available</strong><small>Leave a conversation without losing access to support.</small></span></div>
      <Link href="/safety">Review safety boundaries <ArrowRight /></Link>
    </aside>
  );
}
