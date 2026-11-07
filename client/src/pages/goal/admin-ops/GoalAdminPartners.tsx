// Goal /admin/partners (D-048-p3-admin-ops): "Curate partner slots and sponsored
// roles." The two kit tabs read as filter chips, and each carries its own single
// black commit: the module form on the slots tab, one explicit choice plus
// "End sponsorship" on the sponsored tab — the kit ends a sponsorship from a
// per-row button, and a goal page commits through the next step instead (D-150).
// The calls stay as AdminPartners.tsx makes them — same paths, headers, JSON
// bodies, the 403 gate, the optimistic pause and its exact revert copy
// (D-048-admin.md §4.1: presentation only).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/_core/auth";
import { ADMIN_ACCESS_MESSAGE, AdminAccessError } from "@/components/admin/adminApi";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalFilterChip } from "@/components/goal/GoalFilterChip";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";
import {
  createPartnerModule,
  endSponsorship,
  loadPartnerInventory,
  setPartnerModuleActive,
  type NewPartnerModule,
  type PartnerInventory,
  type PartnerModule,
  type Sponsorship,
} from "./adminOpsApi";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";

export const GOAL_PAGE = { goalLine: "Curate partner slots and sponsored roles." } as const;
const BODY = "Curate the contextual third-party slots shown inside seeker feeds, and audit the self-serve sponsorships currently buying placement.";

const INVENTORY_KEY = ["admin-partner-inventory"];
const END_FAILED = "We could not end this sponsorship";

const emptyForm: NewPartnerModule = { partnerName: "", category: "interview_prep", headline: "", description: "", targetRoles: "", ctaLabel: "Learn more", ctaUrl: "" };

const CATEGORY_LABELS: Record<NewPartnerModule["category"], string> = {
  interview_prep: "Interview prep",
  resume_vetting: "Resume vetting",
  skill_assessment: "Skill assessment",
  other: "Other",
};

const CONTROL = "mt-1.5 block h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-g-label text-g-ink">{label}{children}</label>;
}

/** The kit row's own meta line, unchanged: partner · category · target roles. */
const moduleMeta = (module: PartnerModule) => [module.partnerName, CATEGORY_LABELS[module.category], module.targetRoles || "All roles"].filter(Boolean).join(" · ");

/** The kit row's own meta line, unchanged: domain · tier · expiry. */
const sponsorshipMeta = (item: Sponsorship) => [item.companyDomain, item.sponsoredTier ? `Tier: ${item.sponsoredTier}` : null, item.sponsoredUntil ? `Until ${new Date(item.sponsoredUntil).toLocaleDateString()}` : null].filter(Boolean).join(" · ");

export default function GoalAdminPartners() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"modules" | "sponsored">("modules");
  const [form, setForm] = useState<NewPartnerModule>(emptyForm);
  const [chosen, setChosen] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState("");
  const [endError, setEndError] = useState("");

  const inventory = useQuery({
    queryKey: INVENTORY_KEY,
    enabled: Boolean(isSignedIn),
    retry: false,
    queryFn: () => loadPartnerInventory(fetchToken),
  });
  const modules = inventory.data?.modules ?? [];
  const sponsorships = inventory.data?.sponsorships ?? [];
  const chosenSponsorship = sponsorships.find(item => item.id === chosen);

  const create = useMutation({
    mutationFn: (module: NewPartnerModule) => createPartnerModule(fetchToken, module),
    onSuccess: () => { setForm(emptyForm); void inventory.refetch(); },
  });

  /** The kit page's optimistic flip: paint it now, put the row back and say so if the PATCH fails. */
  const toggle = useMutation({
    mutationFn: (module: PartnerModule) => setPartnerModuleActive(fetchToken, module.id, !module.isActive),
    onMutate: async (module) => {
      await queryClient.cancelQueries({ queryKey: INVENTORY_KEY });
      const previous = queryClient.getQueryData<PartnerInventory>(INVENTORY_KEY);
      queryClient.setQueryData<PartnerInventory>(INVENTORY_KEY, current => current && { ...current, modules: current.modules.map(row => row.id === module.id ? { ...row, isActive: !row.isActive } : row) });
      setUpdateError("");
      return { previous };
    },
    onError: (_error, module, context) => {
      if (context?.previous) queryClient.setQueryData(INVENTORY_KEY, context.previous);
      setUpdateError(`We could not update "${module.headline}". The module is unchanged — try again.`);
    },
  });

  const end = useMutation({
    mutationFn: (item: Sponsorship) => endSponsorship(fetchToken, item.id),
    onSuccess: (_result, item) => {
      queryClient.setQueryData<PartnerInventory>(INVENTORY_KEY, current => current && { ...current, sponsorships: current.sponsorships.filter(row => row.id !== item.id) });
      setChosen(null);
    },
    onError: () => setEndError(END_FAILED),
    onMutate: () => setEndError(""),
  });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-partners-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with an administrator account to manage partner modules and sponsored roles." />
        <GoalNextStep>
          {/* SignInButton renders its own <button>; wrapping GoalButton in it nests buttons. */}
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  if (inventory.error instanceof AdminAccessError) {
    return (
      <AdminGoalFrame screen="admin-partners-forbidden">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Partner inventory is available only to the designated administrator account." />
        <section role="alert" className="border border-g-hairline bg-g-surface p-5">
          <p className="text-g-label text-g-ink">{ADMIN_ACCESS_MESSAGE}</p>
          <p className="mt-1 text-g-meta text-g-ink-2">Sign in with the designated administrator account.</p>
        </section>
      </AdminGoalFrame>
    );
  }

  const loading = inventory.isPending || inventory.isFetching;

  return (
    <AdminGoalFrame screen="admin-partners">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />

      <div role="group" aria-label="B2B inventory sections" className="mb-6 flex flex-wrap gap-2">
        <GoalFilterChip label="Partner modules" pressed={tab === "modules"} onPressedChange={() => setTab("modules")} />
        <GoalFilterChip label="Sponsored roles" pressed={tab === "sponsored"} onPressedChange={() => setTab("sponsored")} count={sponsorships.length} />
      </div>

      {tab === "modules" ? (
        <>
          <GoalNextStep reason="A new slot is saved inactive-ready and shows in seeker feeds as soon as it is active.">
            <form className="mt-3 grid gap-3 gdesk:grid-cols-2" onSubmit={event => { event.preventDefault(); if (!create.isPending) create.mutate(form); }}>
              <Field label="Partner name">
                <input required value={form.partnerName} onChange={event => setForm(current => ({ ...current, partnerName: event.target.value }))} className={CONTROL} />
              </Field>
              <Field label="Category">
                <select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value as NewPartnerModule["category"] }))} className={CONTROL}>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Headline">
                <input required value={form.headline} onChange={event => setForm(current => ({ ...current, headline: event.target.value }))} className={CONTROL} />
              </Field>
              <Field label="Target roles (comma-separated keywords)">
                <input value={form.targetRoles} onChange={event => setForm(current => ({ ...current, targetRoles: event.target.value }))} placeholder="frontend, react, node" className={CONTROL} />
              </Field>
              <Field label="Description">
                <textarea rows={2} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className="mt-1.5 block w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 py-2 text-g-body text-g-ink" />
              </Field>
              <div className="grid gap-3 gdesk:grid-cols-2">
                <Field label="CTA label">
                  <input required value={form.ctaLabel} onChange={event => setForm(current => ({ ...current, ctaLabel: event.target.value }))} className={CONTROL} />
                </Field>
                <Field label="CTA URL">
                  <input required type="url" value={form.ctaUrl} onChange={event => setForm(current => ({ ...current, ctaUrl: event.target.value }))} placeholder="https://partner.example/tool" className={CONTROL} />
                </Field>
              </div>
              <div className="gdesk:col-span-2">
                <GoalButton variant="primary" type="submit" busy={create.isPending} busyLabel="Creating…">Create module</GoalButton>
              </div>
              {create.error ? <p role="alert" className="text-g-meta text-g-crimson gdesk:col-span-2">{create.error.message}</p> : null}
            </form>
          </GoalNextStep>

          {updateError ? <p role="alert" className="mt-4 border border-g-hairline p-3 text-g-meta text-g-crimson">{updateError}</p> : null}

          <section aria-label="Partner modules" className="mt-6 border border-g-hairline bg-g-surface">
            {inventory.error ? (
              <GoalErrorState title={inventory.error.message} body="Nothing is shown as saved while the inventory failed to load." retry={{ label: "Try again", onClick: () => void inventory.refetch() }} />
            ) : loading && !inventory.data ? (
              <GoalSkeletonRows density="ask" count={2} className="py-4" />
            ) : modules.length === 0 ? (
              <GoalEmptyState title="No partner modules yet." body="Add the first contextual slot with the form in Your next step." />
            ) : (
              <ul>
                {modules.map(module => (
                  <li key={module.id} className="border-b border-g-hairline p-4 last:border-b-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-g-label text-g-ink">{module.headline}</p>
                        <p className="mt-1 text-g-meta text-g-ink-2">{moduleMeta(module)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <GoalStatus status={module.isActive ? "referred" : "withdrawn"} label={module.isActive ? "Active" : "Paused"} />
                        <GoalButton variant="outline" size="sm" busy={toggle.isPending && toggle.variables?.id === module.id} busyLabel={module.isActive ? "Pausing…" : "Activating…"} onClick={() => toggle.mutate(module)}>
                          {module.isActive ? "Pause module" : "Activate module"}
                        </GoalButton>
                      </div>
                    </div>
                    <p className="mt-2 text-g-meta text-g-ink-3"><span className="g-num">{module.impressions}</span> views · <span className="g-num">{module.clicks}</span> clicks</p>
                    <p className="mt-1 truncate text-g-meta text-g-ink-3"><span className="g-num">{module.ctaUrl}</span></p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <>
          <GoalNextStep reason="Ending a sponsorship stops its paid placement at once; the role's seeker requests are untouched. Choose the role first — nothing ends until you commit.">
            {endError ? <p role="alert" className="mt-3 text-g-meta text-g-crimson">{endError}</p> : null}
            {sponsorships.length === 0 ? (
              <>
                <p className="mt-3 text-g-meta text-g-ink-2">No active sponsorships.</p>
                <p className="mt-1 text-g-meta text-g-ink-2">Employer-sponsored roles appear here for audit and early termination.</p>
              </>
            ) : (
              <fieldset className="mt-3" disabled={end.isPending}>
                <legend className="text-g-label text-g-ink-2">Sponsored roles</legend>
                <div className="mt-2 grid gap-2">
                  {sponsorships.map(item => (
                    <label key={item.id} className={cn("flex cursor-pointer items-start gap-3 border p-3", chosen === item.id ? "border-g-ink" : "border-g-hairline")}>
                      <input type="radio" name="sponsorship" value={item.id} checked={chosen === item.id} onChange={() => { setChosen(item.id); setEndError(""); }} className="mt-1 size-4 shrink-0 accent-g-ink" />
                      <span className="min-w-0">
                        <span className="block text-g-label text-g-ink">{item.roleTitle}</span>
                        <span className="mt-1 block text-g-meta text-g-ink-2">{sponsorshipMeta(item)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <GoalButton
              variant="primary"
              className="mt-4"
              busy={end.isPending}
              busyLabel="Ending…"
              {...(chosenSponsorship ? {} : { disabledReason: "Choose a sponsored role first." })}
              onClick={() => { if (chosenSponsorship) end.mutate(chosenSponsorship); }}
            >
              End sponsorship
            </GoalButton>
          </GoalNextStep>

          <section aria-label="Sponsored role audit" className="mt-6 border border-g-hairline bg-g-surface">
            {inventory.error ? (
              <GoalErrorState title={inventory.error.message} body="Nothing is shown as ended while the inventory failed to load." retry={{ label: "Try again", onClick: () => void inventory.refetch() }} />
            ) : loading && !inventory.data ? (
              <GoalSkeletonRows density="ask" count={2} className="py-4" />
            ) : (
              <p className="p-4 text-g-meta text-g-ink-2">Sponsorships are self-serve placements bought by employers. {sponsorships.length ? "Each one stays listed here until its term ends or an administrator ends it early." : "None is live right now."}</p>
            )}
          </section>
        </>
      )}
    </AdminGoalFrame>
  );
}
