// Goal /settings > Privacy: blocked people, the binding talent-discovery
// consent and the device-stored analytics choice. Contracts and copy mirror the
// kit panels; only the visual language and recovery affordances change.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoalButton, GoalErrorState, GoalNum } from "@/components/goal";
import { BLOCKS_ERROR, UNBLOCK_ERROR, fetchBlocks, settingsKeys, unblock, type BlockRow, type TokenSource } from "@/components/settings/settingsApi";
import { readCookieConsent, saveCookieConsent } from "@/components/CookieConsent";
import { trpc } from "@/lib/trpc";
import { DoneNote, InlineError, Row, Switch } from "./settingsParts";

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

function blockDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

/** "Member · blocked Oct 2 · spam": the kit row line, from what the server knows. */
const blockLabel = (block: BlockRow) => ["Member", `blocked ${blockDate(block.createdAt)}`.trim(), block.reason || ""].filter(Boolean).join(" · ");

export function BlockedPeoplePanel({ getToken, online }: { getToken: TokenSource; online: boolean }) {
  const queryClient = useQueryClient();
  const blocks = useQuery({ queryKey: settingsKeys.blocks, retry: false, queryFn: () => fetchBlocks(getToken) });
  const remove = useMutation({
    mutationFn: async (id: number) => { await unblock(id, getToken); return id; },
    onSuccess: id => queryClient.setQueryData<BlockRow[]>(settingsKeys.blocks, current => current?.filter(block => block.id !== id)),
  });
  return (
    <>
      <h3 className="text-g-heading text-g-ink">Blocked people</h3>
      {remove.isError ? <InlineError>{messageOf(remove.error, UNBLOCK_ERROR)}</InlineError> : null}
      {blocks.isPending ? <p role="status" className="mt-3 text-g-meta text-g-ink-3">Loading your blocked list…</p>
        : blocks.isError ? <GoalErrorState className="mt-3 px-0" title="We could not load your blocked list." body="Nothing was changed. Check your connection and try again." retry={{ label: "Try again", onClick: () => { void blocks.refetch(); } }} />
        : blocks.data.length === 0 ? <p className="mt-3 text-g-meta text-g-ink-2">You haven't blocked anyone.</p>
        : <ul className="mt-3">
          {blocks.data.map(block => {
            const busy = remove.isPending && remove.variables === block.id;
            return <li key={block.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-g-hairline last:border-0">
              <span className="min-w-0 text-g-label text-g-ink">{blockLabel(block)}</span>
              <GoalButton variant="ghost" size="sm" busy={busy} busyLabel="Unblocking…" disabledReason={!online ? "Reconnect to unblock someone." : undefined} onClick={() => remove.mutate(block.id)}>Unblock</GoalButton>
            </li>;
          })}
        </ul>}
    </>
  );
}

/** Mirrors the talentConsent.grant input enum in server/routers.ts. */
const TALENT_FIELDS = ["headline", "location", "skills", "experience", "expertise"] as const;
type TalentField = (typeof TALENT_FIELDS)[number];
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

  return (
    <section data-skipwait-screen="talent-consent" className="mt-8">
      <h3 className="text-g-heading text-g-ink">Talent discovery consent</h3>
      <p className="mt-2 text-g-meta text-g-ink-2">Preview and control what approved employers can see. skipwait.me uses this only for anonymous talent discovery and employer introduction requests. Employers may spend <GoalNum>{state?.unlockCreditCost ?? 5}</GoalNum> credits to unlock the exact approved snapshot for <GoalNum>{state?.unlockDays ?? 30}</GoalNum> days. You choose whether to respond to contact requests.</p>
      <dl className="mt-4 border border-g-hairline p-3 text-g-meta text-g-ink-2">
        <div><dt className="inline font-semibold text-g-ink">Audience: </dt><dd className="inline">{state?.audience ?? "Approved employers on skipwait.me"}</dd></div>
        <div><dt className="inline font-semibold text-g-ink">Retention: </dt><dd className="inline">Discovery consent records are retained for {state?.retentionDays ?? 90} days for access history and safety controls.</dd></div>
        <div><dt className="inline font-semibold text-g-ink">Policy: </dt><dd className="inline">{state?.policyVersion ?? "Loading current policy"}</dd></div>
      </dl>
      <fieldset className="mt-4">
        <legend className="text-g-label text-g-ink">Fields employers may see</legend>
        <div className="mt-2 grid gap-2 gdesk:grid-cols-2">
          {TALENT_FIELDS.map(field => (
            <label key={field} className="flex min-h-11 items-center gap-2 rounded-g-control border border-g-hairline px-3 text-g-label capitalize text-g-ink">
              <input type="checkbox" className="size-4 accent-g-ink" checked={fields.includes(field)} onChange={event => toggle(field, event.target.checked)} />{field}
            </label>
          ))}
        </div>
        <p className="mt-2 text-g-meta text-g-ink-3">Location, skills and experience are shown in coarse form to reduce re-identification. Edits do not expand an employer's existing snapshot.</p>
      </fieldset>
      {notice ? <DoneNote>{notice}</DoneNote> : null}
      {state?.active
        ? <GoalButton className="mt-4" variant="outline" busy={revoke.isPending} busyLabel="Removing…" onClick={() => revoke.mutate({ reason: "seeker_opt_out" })}>Opt out and revoke access</GoalButton>
        : <GoalButton className="mt-4" variant="outline" busy={grant.isPending} busyLabel="Saving…" disabledReason={!state?.policyVersion ? "The current policy is still loading." : !fields.length ? "Pick at least one field first." : undefined} onClick={() => { if (state?.policyVersion) grant.mutate({ policyVersion: state.policyVersion, disclosedFields: [...fields], source: "settings_preview" }); }}>I reviewed this preview - opt in</GoalButton>}
      <p className="mt-3 text-g-meta text-g-ink-3">Opting out is immediate. Rejoining later does not restore old employer access; employers must unlock again under your current consent.</p>
    </section>
  );
}

export function CookiePanel() {
  const [analytics, setAnalytics] = useState(() => readCookieConsent() === "all");
  const toggle = () => { const next = !analytics; saveCookieConsent(next ? "all" : "essential"); setAnalytics(next); };
  return (
    <section className="mt-8">
      <h3 className="text-g-heading text-g-ink">Cookies &amp; analytics</h3>
      <p className="mt-2 text-g-meta text-g-ink-2">Saved on this device only. Never sold, never used for ads.</p>
      <div className="mt-2">
        <Row label="Essential" hint="Keeps you signed in and the site working. Always on."><span className="text-g-meta text-g-ink-3">Always on</span></Row>
        <Row label="Product analytics" hint="Anonymous usage recordings that help us fix and improve skipwait.me.">
          <Switch on={analytics} label="Product analytics" onChange={toggle} />
        </Row>
      </div>
    </section>
  );
}
