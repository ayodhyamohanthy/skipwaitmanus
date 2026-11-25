// Goal /admin/users/:id/support (ADMIN-support-view, D-393): "Fix one person's problem." One account's
// identity, wallet and keyed ledger, referral requests with the reason each waits or failed, the referrer
// side, blocks and the last 90 days of activity — with the plain-words cause and the existing audited admin
// action that fixes it. Read-only: nothing here signs in as the person, edits their data or opens a money path.
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { GoalVerifiedMark } from "@/components/goal/GoalVerifiedMark";
import { ADMIN_ACCESS_MESSAGE, AdminAccessError } from "@/components/admin/adminApi";
import { usePersistFn } from "@/hooks/usePersistFn";
import { saveAskPrefill } from "@/lib/askPrefill";
import { AdminGoalFrame, AdminGoalHeading } from "./AdminGoalFrame";
import { activityHref, loadSupportView, supportStamp, supportStatusOf } from "./adminSupportData";
import type { SupportActivityRow, SupportRequest, SupportView } from "@shared/adminSupport";

export const GOAL_PAGE = { goalLine: "Fix one person's problem." } as const;
const BODY = "Everything this account has done, what went wrong in plain words, and the existing admin action that fixes it. Read-only: nothing here signs in as them or edits their data.";
const CARD = "border border-g-hairline bg-g-surface";
const HEAD = "border-b border-g-hairline px-4 py-3 text-g-label text-g-ink";
const CELL = "px-4 py-3 align-top";

function Section({ title, children, label }: { title: string; children: ReactNode; label?: string }) {
  return (
    <section aria-label={label ?? title} className={`${CARD} mt-6`}>
      <h2 className={HEAD}>{title}</h2>
      {children}
    </section>
  );
}

function Identity({ view }: { view: SupportView }) {
  const { account } = view;
  const rows: Array<[string, string]> = [
    ["Account", `#${account.id}${account.email ? ` · ${account.email}` : ""}`],
    ["Name", account.name || "No name on the account"],
    ["Role", account.role === "admin" ? "Administrator" : account.accountType ? account.accountType.replace(/_/g, " ") : "No profile"],
    ["Company", account.company || "None recorded"],
    ["Sign-in methods", account.signInMethods.length ? account.signInMethods.join(", ") : "None linked"],
    ["Work email", account.workEmailVerifiedAt ? `${account.workEmailDomain ?? "verified"} · verified ${supportStamp(account.workEmailVerifiedAt)}` : "Not verified"],
    ["Canonical person", account.canonicalPersonId ? `#${account.canonicalPersonId}` : "Not linked"],
    ["Joined", supportStamp(account.createdAt)],
  ];
  return (
    <Section title="Identity">
      <dl className="grid gap-x-6 gap-y-3 px-4 py-4 gdesk:grid-cols-2">
        {rows.map(([term, value]) => (
          <div key={term}>
            <dt className="text-g-meta text-g-ink-3">{term}</dt>
            <dd className="mt-0.5 text-g-body text-g-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-3 border-t border-g-hairline px-4 py-3">
        <GoalStatus status={account.suspended ? "expired" : "queue_new"} label={account.suspended ? "Suspended" : "Active"} />
        {account.workEmailVerifiedAt ? <GoalVerifiedMark as="span">Work email verified</GoalVerifiedMark> : null}
        <a className="text-g-meta text-g-ink-2 underline decoration-g-hairline underline-offset-4 hover:text-g-ink" href={activityHref(account.id)}>Open their activity log</a>
      </div>
      {account.aliases.length ? (
        <ul className="border-t border-g-hairline">
          {account.aliases.map(alias => (
            <li key={`${alias.provider}-${alias.email ?? "none"}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-g-hairline px-4 py-2 last:border-b-0">
              <span className="text-g-meta text-g-ink">{alias.provider}{alias.email ? ` · ${alias.email}` : ""}</span>
              <span className="g-num text-g-meta text-g-ink-3">{alias.verifiedAt ? supportStamp(alias.verifiedAt) : "no verification stamp"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function Wallet({ view }: { view: SupportView }) {
  const wallet = view.wallet;
  if (!wallet) return <Section title="Wallet"><GoalEmptyState title="No wallet yet." body="This account has not been given a referral balance." /></Section>;
  return (
    <Section title="Wallet and ledger">
      <dl className="grid gap-x-6 gap-y-3 px-4 py-4 gdesk:grid-cols-4">
        {([["Available", wallet.totalAvailable], ["In this cycle", wallet.monthlyCreditsRemaining], ["Purchased", wallet.purchasedCreditsRemaining], ["Promo", wallet.promoCreditsRemaining]] as const).map(([term, value]) => (
          <div key={term}>
            <dt className="text-g-meta text-g-ink-3">{term}</dt>
            <dd className="mt-0.5 g-num text-g-body text-g-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-g-hairline px-4 py-3 text-g-meta text-g-ink-2">
        {`Plan ${wallet.plan}${wallet.subscriptionStatus ? ` · ${wallet.subscriptionStatus}` : ""}${wallet.subscriptionCurrentTermEnd ? ` · term ends ${supportStamp(wallet.subscriptionCurrentTermEnd)}` : ""}${wallet.cardValidated ? " · card validated" : ""}${wallet.freeCreditsLocked ? " · free referrals locked until a card is validated" : ""}`}
      </p>
      {wallet.ledger.length ? (
        <div className="overflow-x-auto border-t border-g-hairline">
          <table className="w-full min-w-[520px] text-left">
            <thead><tr className="border-b border-g-hairline text-g-label text-g-ink-3">
              <th scope="col" className="px-4 py-3 font-medium">When</th>
              <th scope="col" className="px-4 py-3 font-medium">Kind</th>
              <th scope="col" className="px-4 py-3 font-medium">Bucket</th>
              <th scope="col" className="px-4 py-3 font-medium">Referrals</th>
            </tr></thead>
            <tbody>
              {wallet.ledger.map(row => (
                <tr key={row.id} className="border-b border-g-hairline last:border-b-0">
                  <td className={CELL}><span className="g-num text-g-ink-2">{supportStamp(row.createdAt)}</span></td>
                  <td className={CELL}><span className="g-num text-g-ink">{row.kind}</span></td>
                  <td className={CELL}><span className="text-g-meta text-g-ink-2">{row.bucket ?? "—"}</span></td>
                  <td className={CELL}><span className="g-num text-g-ink">{row.credits > 0 ? `+${row.credits}` : row.credits}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <GoalEmptyState title="No ledger rows yet." body="Every referral move writes a keyed row here." />}
    </Section>
  );
}

function SandboxControl({ request }: { request: SupportRequest }) {
  const ready = request.sandbox.available && Boolean(request.sandbox.targetRoleUrl);
  const open = () => {
    if (!ready) return;
    saveAskPrefill({ companySlug: request.sandbox.companySlug, targetRoleUrl: request.sandbox.targetRoleUrl ?? "", note: "" });
    window.location.assign("/ask");
  };
  return (
    <div className="mt-2">
      <GoalButton variant="outline" onClick={open} disabledReason={ready ? undefined : "Sandbox requests arrive with QA-sandbox-requests; until then a demo send would reach a real company."}>
        Try this in the sandbox
      </GoalButton>
      <p className="mt-1 text-g-meta text-g-ink-3">Opens the same company and job link for the demo seeker. Use it in the demo seeker's own session; this page never signs in as anyone.</p>
    </div>
  );
}

function Requests({ view }: { view: SupportView }) {
  if (view.requests.length === 0) return <Section title="Referral requests"><GoalEmptyState title="No referral requests yet." body="Requests this person sends appear here with the reason each waits." /></Section>;
  return (
    <Section title={`Referral requests · ${view.requests.length}`}>
      <ul>
        {view.requests.map(request => {
          const status = supportStatusOf(request);
          return (
            <li key={request.id} className="border-b border-g-hairline px-4 py-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-g-body text-g-ink">{request.title || "Untitled role"}</p>
                  <p className="mt-0.5 text-g-meta text-g-ink-2">{`#${request.id} · ${request.companyDomain ?? "unknown company"} · updated ${supportStamp(request.updatedAt)}`}</p>
                </div>
                <GoalStatus status={status.status} label={status.label} />
              </div>
              <p className="mt-2 max-w-2xl text-g-meta text-g-ink-2">{request.state.reason}</p>
              {request.timeline.length ? (
                <ol className="mt-2 space-y-1">
                  {request.timeline.slice(0, 6).map(step => (
                    <li key={step.id} className="text-g-meta text-g-ink-3">
                      <span className="g-num">{supportStamp(step.createdAt)}</span>{` · ${step.action} · ${step.fromStatus} → ${step.resultingStatus}`}
                    </li>
                  ))}
                </ol>
              ) : null}
              <SandboxControl request={request} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Activity({ view }: { view: SupportView }) {
  return (
    <Section title="Last 90 days">
      {view.activity.length === 0 ? <GoalEmptyState title="No activity recorded yet." body="Sign-ins, sends and billing events appear here." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead><tr className="border-b border-g-hairline text-g-label text-g-ink-3">
              <th scope="col" className="px-4 py-3 font-medium">When</th>
              <th scope="col" className="px-4 py-3 font-medium">Event</th>
              <th scope="col" className="px-4 py-3 font-medium">Outcome</th>
            </tr></thead>
            <tbody>
              {view.activity.map(row => (
                <tr key={row.id} className="border-b border-g-hairline last:border-b-0">
                  <td className={CELL}><span className="g-num text-g-ink-2">{supportStamp(row.createdAt)}</span></td>
                  <td className={CELL}><span className="g-num text-g-ink">{row.action}</span></td>
                  <td className={CELL}><GoalStatus status={row.outcome === "success" ? "referred" : row.outcome === "denied" ? "expired" : "waiting"} label={row.outcome} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Failures({ view }: { view: SupportView }) {
  const rows: Array<SupportActivityRow & { cause: { cause: string; fix: string; adminAction: { label: string; href: string } | null } | null }> = view.newestFailures;
  return (
    <Section title="What went wrong">
      {rows.length === 0 ? <GoalEmptyState title="Nothing is failing for this person." body="The newest failures and their fix appear here." /> : (
        <ul>
          {rows.map(row => (
            <li key={row.id} className="border-b border-g-hairline px-4 py-3 last:border-b-0">
              <p className="g-num text-g-meta text-g-ink-3">{supportStamp(row.createdAt)} · {row.action} · {row.outcome}</p>
              {row.cause ? (
                <>
                  <p className="mt-1 text-g-body text-g-ink">{row.cause.cause}</p>
                  <p className="mt-1 text-g-meta text-g-ink-2">{row.cause.fix}</p>
                  {row.cause.adminAction ? <a className="mt-1 inline-block text-g-meta text-g-ink underline decoration-g-hairline underline-offset-4" href={row.cause.adminAction.href}>{row.cause.adminAction.label}</a> : null}
                </>
              ) : <p className="mt-1 text-g-meta text-g-ink-2">No plain-words cause is recorded for this event yet; the activity log has the raw row.</p>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export default function GoalAdminSupport() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [, params] = useRoute("/admin/users/:id/support");
  const userId = Number(params?.id ?? "");
  const valid = Number.isInteger(userId) && userId > 0;
  const view = useQuery({ queryKey: ["admin-support", userId], enabled: Boolean(isSignedIn) && valid, retry: false, queryFn: () => loadSupportView(fetchToken, userId) });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-support-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with an administrator account. A person's support view is never shown to other accounts." />
        <GoalNextStep><GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton></GoalNextStep>
      </AdminGoalFrame>
    );
  }

  if (!valid) {
    return (
      <AdminGoalFrame screen="admin-support-invalid">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
        <GoalEmptyState title="That account reference is not valid." body="Open a person from the people directory." action={{ label: "Open the people directory", href: "/admin/users" }} />
      </AdminGoalFrame>
    );
  }

  if (view.error instanceof AdminAccessError) {
    return (
      <AdminGoalFrame screen="admin-support-forbidden">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="A person's support view is never shown to other accounts." />
        <section role="alert" className={`${CARD} p-5`}>
          <p className="text-g-label text-g-ink">{ADMIN_ACCESS_MESSAGE}</p>
          <p className="mt-1 text-g-meta text-g-ink-2">Sign in with the designated administrator account.</p>
        </section>
      </AdminGoalFrame>
    );
  }

  const newest = view.data?.newestFailures[0] ?? null;
  return (
    <AdminGoalFrame screen="admin-support">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
      {view.isPending ? <GoalSkeletonRows density="queue" count={4} className="px-0" /> : null}
      {view.error ? <GoalErrorState title={view.error.message} body="Nothing is shown as clear while this person's view failed to load." retry={{ label: "Try again", onClick: () => void view.refetch() }} /> : null}
      {view.data ? (
        <>
          <GoalNextStep reason={newest?.cause ? newest.cause.fix : newest ? `Newest failure: ${newest.action}.` : "Nothing is failing for this person right now."}>
            <GoalButton variant="primary" asChild className="mt-3">
              <a href={newest?.cause?.adminAction?.href ?? activityHref(view.data.account.id)}>{newest?.cause?.adminAction?.label ?? "Open their activity log"}</a>
            </GoalButton>
          </GoalNextStep>
          <Failures view={view.data} />
          <Identity view={view.data} />
          <Wallet view={view.data} />
          <Requests view={view.data} />
          {view.data.referrer ? (
            <Section title="Referrer side">
              <p className="px-4 py-3 text-g-body text-g-ink">{`Verified at ${view.data.referrer.verifiedDomain ?? "an unknown domain"}${view.data.referrer.verifiedAt ? ` since ${supportStamp(view.data.referrer.verifiedAt)}` : ""} · ${view.data.referrer.openClaims} open claim${view.data.referrer.openClaims === 1 ? "" : "s"} · ${view.data.referrer.available ? "available for new requests" : "at the open-claim limit"}`}</p>
            </Section>
          ) : null}
          {view.data.blocks.length ? (
            <Section title="Blocks">
              <ul>
                {view.data.blocks.map(block => (
                  <li key={`${block.otherUserId}-${block.direction}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-g-hairline px-4 py-2 last:border-b-0">
                    <span className="text-g-meta text-g-ink">{`Account #${block.otherUserId} · ${block.direction === "blocked_by_them" ? "this person blocked them" : "they blocked this person"}`}</span>
                    <span className="g-num text-g-meta text-g-ink-3">{supportStamp(block.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <Activity view={view.data} />
        </>
      ) : null}
    </AdminGoalFrame>
  );
}
