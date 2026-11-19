// Kit v4 /profile form (app/src/routes/profile.tsx `.profile-form`): display
// name, headline, then the resume field (seeker) or the verified company
// (referrer), and Save. Public-page details live with the public page: the
// link on /work, visibility on /p/:handle.
import { ArrowRight, Check, FileText } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import type { ProfileRole } from "./PrivacyControls";

export function ProfileForm({ role, displayName, headline, onHeadline, verifiedCompany, saving, saved, error, onSave }: {
  role: ProfileRole;
  displayName: string;
  headline: string;
  onHeadline: (value: string) => void;
  verifiedCompany: string | null;
  saving: boolean;
  saved: boolean;
  error: string;
  onSave: () => void;
}) {
  return (
    <div className="profile-form">
      <label>Display name
        <input value={displayName} readOnly aria-readonly="true" />
        <small className="font-normal text-muted-foreground">From your sign-in account.</small>
      </label>
      <label>Headline<input value={headline} maxLength={180} onChange={event => onHeadline(event.target.value)} placeholder={role === "seeker" ? "Your role and strongest area" : "Your function at work"} /></label>
      {role === "seeker" ? (
        <label className="upload-field">
          <FileText aria-hidden="true" />
          <span><strong>Resume</strong><small>Shared only after you choose and a request is accepted.</small></span>
          <Button variant="outline" asChild><Link href="/ask">Attach with an ask</Link></Button>
        </label>
      ) : (
        <label>Company
          {verifiedCompany ? (
            <select defaultValue="verified"><option value="verified">{verifiedCompany}</option></select>
          ) : (
            <select defaultValue=""><option value="" disabled>Select verified company</option></select>
          )}
        </label>
      )}
      {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
      <p role="status" className="sr-only">{saved ? "Profile saved." : ""}</p>
      <Button disabled={saving} onClick={onSave}>{saving ? "Saving…" : saved ? <><Check />Profile saved</> : <>Save profile <ArrowRight /></>}</Button>
    </div>
  );
}
