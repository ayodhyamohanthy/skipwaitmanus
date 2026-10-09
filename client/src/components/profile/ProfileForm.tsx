// Kit v4 /profile form (app/src/routes/profile.tsx `.profile-form`), carrying
// every live profile field. Seeker and referrer tabs edit the same profile row;
// the referrer tab shows the work-email-verified company instead of a resume.
import { ArrowRight, Check, FileText, Link2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import type { ProfileRole } from "./PrivacyControls";
import { VisibilityOptions, type ProfileVisibility } from "./VisibilityOptions";

export type ProfileFormState = {
  headline: string;
  currentTitle: string;
  location: string;
  bio: string;
  skills: string;
  openToText: string;
  handle: string;
  profileVisibility: ProfileVisibility;
};

type TextField = Exclude<keyof ProfileFormState, "profileVisibility">;

const hint = "font-normal text-muted-foreground";

export function ProfileForm({ role, displayName, form, onField, onVisibility, verifiedCompany, saving, saved, error, copied, onCopy, onSave }: {
  role: ProfileRole;
  displayName: string;
  form: ProfileFormState;
  onField: (field: TextField, value: string) => void;
  onVisibility: (value: ProfileVisibility) => void;
  verifiedCompany: string | null;
  saving: boolean;
  saved: boolean;
  error: string;
  copied: boolean;
  onCopy: () => void;
  onSave: () => void;
}) {
  const text = (field: TextField, max: number, placeholder: string) => (
    <input value={form[field]} maxLength={max} onChange={event => onField(field, event.target.value)} placeholder={placeholder} />
  );
  return (
    <div className="profile-form">
      <label>Display name
        <input value={displayName} readOnly aria-readonly="true" />
        <small className={hint}>From your sign-in account.</small>
      </label>
      <label>Headline{text("headline", 180, role === "seeker" ? "Your role and strongest area" : "Your function at work")}</label>
      {role === "seeker" ? (
        <div className="upload-field grid gap-[7px] text-xs font-semibold">
          <FileText aria-hidden="true" />
          <span><strong>Resume</strong><small>Shared only after you choose and a request is accepted.</small></span>
          <Button variant="outline" asChild><Link href="/ask">Attach with an ask</Link></Button>
        </div>
      ) : (
        <label>Company
          {verifiedCompany ? (
            <select defaultValue="verified" aria-describedby="profile-company-hint"><option value="verified">{verifiedCompany}</option></select>
          ) : (
            <select defaultValue="" aria-describedby="profile-company-hint"><option value="" disabled>Select verified company</option></select>
          )}
          <small id="profile-company-hint" className={hint}>
            {verifiedCompany ? "Verified through your work email." : "Companies come from a verified work email."}{" "}
            <Link href="/referrer-setup" className="text-link">{verifiedCompany ? "Referrer settings" : "Set up referring"}</Link>
          </small>
        </label>
      )}
      {role === "seeker" ? (
        <>
          <label>Current title{text("currentTitle", 160, "Product Designer")}</label>
          <label>Location{text("location", 120, "Bengaluru, India")}</label>
          <label>Bio
            <textarea value={form.bio} maxLength={2000} rows={4} onChange={event => onField("bio", event.target.value)} placeholder="What you do and what you're looking for." className="min-h-28 rounded-[7px] border border-border bg-background p-3 font-normal" />
          </label>
          <label>Skills (comma separated){text("skills", 1000, "Design systems, prototyping, research")}</label>
          <label>Open to (comma separated, up to 5){text("openToText", 400, "Product Designer, UX Lead, Design Systems")}
            <small className={hint}>Shown as chips on your public page.</small>
          </label>
          <label>Profile handle
            <span className="flex items-center gap-2">
              <span className="shrink-0 font-normal text-muted-foreground">skipwait.me/p/</span>
              <input value={form.handle} maxLength={40} onChange={event => onField("handle", event.target.value)} placeholder="yourname" className="w-full min-w-0" />
            </span>
            <small className={hint}>3–40 lowercase letters, numbers, or dashes.</small>
          </label>
          {form.handle ? (
            <button type="button" onClick={onCopy} className="inline-flex min-h-11 items-center gap-2 justify-self-start text-sm font-semibold"><Link2 className="size-4" aria-hidden="true" />{copied ? "Copied" : "Copy profile link"}</button>
          ) : null}
          <div className="grid gap-2">
            <span className="eyebrow">WHO CAN SEE THIS</span>
            <VisibilityOptions value={form.profileVisibility} onChange={onVisibility} className="grid gap-2" />
          </div>
        </>
      ) : null}
      {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
      <p role="status" className="sr-only">{saved ? "Profile saved." : ""}</p>
      <Button disabled={saving} onClick={onSave}>{saving ? "Saving…" : saved ? <><Check />Profile saved</> : <>Save profile <ArrowRight /></>}</Button>
    </div>
  );
}
