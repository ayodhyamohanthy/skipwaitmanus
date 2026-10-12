// Talent discovery consent: the binding opt-in/opt-out for anonymous employer
// discovery (server/routers.ts talentConsent.*), as a kit Panel in Privacy.
import { useState } from "react";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { trpc } from "@/lib/trpc";
import { DoneNotice } from "./settingsUi";

/** Mirrors the talentConsent.grant input enum in server/routers.ts. */
export const TALENT_FIELDS = ["headline", "location", "skills", "experience", "expertise"] as const;
export type TalentField = (typeof TALENT_FIELDS)[number];
const DEFAULT_FIELDS: readonly TalentField[] = ["headline", "location", "skills", "experience"];

export function TalentConsentPanel() {
  const consentState = trpc.talentConsent.state.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [fields, setFields] = useState<readonly TalentField[]>(DEFAULT_FIELDS);
  const [notice, setNotice] = useState("");
  const grant = trpc.talentConsent.grant.useMutation({ onSuccess: async () => { setNotice("Your talent-discovery consent is active."); await utils.talentConsent.state.invalidate(); } });
  const revoke = trpc.talentConsent.revoke.useMutation({ onSuccess: async () => { setNotice("You are out of talent discovery. Existing access and references were revoked."); await utils.talentConsent.state.invalidate(); } });
  const state = consentState.data;
  const toggle = (field: TalentField, on: boolean) => setFields(current => (on ? TALENT_FIELDS.filter(item => item === field || current.includes(item)) : current.filter(item => item !== field)));

  return <Panel>
    <div data-skipwait-screen="talent-consent">
      <h2 className="text-lg font-semibold">Talent discovery consent</h2>
      <p className="mt-1 text-sm text-muted-foreground">Preview and control what approved employers can see. SkipWait uses this only for anonymous talent discovery and employer introduction requests. Employers may spend {state?.unlockCreditCost ?? 5} credits to unlock the exact approved snapshot for {state?.unlockDays ?? 30} days. You choose whether to respond to contact requests.</p>
      <dl className="mt-4 space-y-1 rounded-xl bg-muted p-3 text-sm">
        <div><dt className="inline font-semibold">Audience: </dt><dd className="inline">{state?.audience ?? "Approved employers on SkipWait"}</dd></div>
        <div><dt className="inline font-semibold">Retention: </dt><dd className="inline">Discovery consent records are retained for {state?.retentionDays ?? 90} days for access history and safety controls.</dd></div>
        <div><dt className="inline font-semibold">Policy: </dt><dd className="inline">{state?.policyVersion ?? "Loading current policy"}</dd></div>
      </dl>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Fields employers may see</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {TALENT_FIELDS.map(field => <label key={field} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm capitalize">
            <input type="checkbox" className="size-4 accent-primary" checked={fields.includes(field)} onChange={event => toggle(field, event.target.checked)} />{field}
          </label>)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Location, skills and experience are shown in coarse form to reduce re-identification. Edits do not expand an employer's existing snapshot.</p>
      </fieldset>
      {notice ? <DoneNotice>{notice}</DoneNotice> : null}
      {state?.active
        ? <Button variant="outline" className="mt-4 text-destructive" disabled={revoke.isPending} onClick={() => revoke.mutate({ reason: "seeker_opt_out" })}>{revoke.isPending ? "Removing…" : "Opt out and revoke access"}</Button>
        : <Button className="mt-4" disabled={!state?.policyVersion || !fields.length || grant.isPending} onClick={() => { if (state?.policyVersion) grant.mutate({ policyVersion: state.policyVersion, disclosedFields: [...fields], source: "settings_preview" }); }}>{grant.isPending ? "Saving…" : "I reviewed this preview - opt in"}</Button>}
      <p className="mt-3 text-xs text-muted-foreground">Opting out is immediate. Rejoining later does not restore old employer access; employers must unlock again under your current consent.</p>
    </div>
  </Panel>;
}
