// The /admin/activity event table (ADMIN-activity-log, D-393): time, person, action, context, outcome.
// A sign-in row's metadata reads as one line (reason · method · network · device); a row with no account shows
// the masked email it was attempted with. "Follow" narrows the log to that person.
import { GoalStatus, type GoalStatusValue } from "@/components/goal/GoalStatus";
import type { ActivityEvent } from "./adminOpsApi";

/** Outcome keeps the kit page's meaning: emerald did it, amber was refused, crimson failed. */
const OUTCOME_STATUS: Record<string, { status: GoalStatusValue; label: string }> = {
  success: { status: "referred", label: "Success" },
  failure: { status: "expired", label: "Failure" },
  denied: { status: "waiting", label: "Denied" },
};

type Metadata = Record<string, unknown>;
function parseMetadata(raw: string | null | undefined): Metadata | undefined {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Metadata) : undefined;
  } catch { return undefined; }
}

const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : undefined);

/** One readable line for a sign-in row; any other row keeps its raw metadata. */
export function describeMetadata(raw: string | null | undefined): string {
  const meta = parseMetadata(raw);
  if (!meta || !("ip" in meta || "method" in meta || "reason" in meta || "device" in meta)) return raw ?? "";
  const network = [text(meta.ip), text(meta.country)].filter(Boolean).join(" ");
  const device = [text(meta.browser), text(meta.os), text(meta.device)].filter(Boolean).join(" · ");
  return [text(meta.reason)?.replace(/_/g, " "), text(meta.method), network, device].filter(Boolean).join(" · ");
}

export function maskedEmailOf(raw: string | null | undefined): string | undefined {
  return text(parseMetadata(raw)?.maskedEmail);
}

export function ActivityTable({ events, onFollow }: { events: ActivityEvent[]; onFollow: (person: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="border-b border-g-hairline text-g-label text-g-ink-3">
            <th scope="col" className="px-4 py-3 font-medium">Time</th>
            <th scope="col" className="px-4 py-3 font-medium">Person</th>
            <th scope="col" className="px-4 py-3 font-medium">Action</th>
            <th scope="col" className="px-4 py-3 font-medium">Context</th>
            <th scope="col" className="px-4 py-3 font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {events.map(item => {
            const mark = OUTCOME_STATUS[item.outcome] ?? { status: "withdrawn" as GoalStatusValue, label: item.outcome };
            const masked = item.actorUserId ? undefined : maskedEmailOf(item.metadata);
            const context = describeMetadata(item.metadata);
            return (
              <tr key={item.id} className="border-b border-g-hairline last:border-b-0">
                <td className="px-4 py-3 align-top"><span className="g-num text-g-ink-2">{new Date(item.createdAt).toLocaleString()}</span></td>
                <td className="px-4 py-3 align-top">
                  <span className="block text-g-label text-g-ink">{item.actorName || (item.actorUserId ? `Account ${item.actorUserId}` : masked ? "No account" : "System")}</span>
                  <span className="block text-g-meta text-g-ink-3">{item.actorEmail || masked || ""}</span>
                  {item.actorUserId ? (
                    <button type="button" className="mt-1 text-g-meta text-g-ink-2 underline underline-offset-2 hover:text-g-ink" onClick={() => onFollow(String(item.actorUserId))}>
                      Follow this person
                    </button>
                  ) : null}
                </td>
                <td className="px-4 py-3 align-top"><span className="g-num break-all text-g-ink">{item.action}</span></td>
                <td className="px-4 py-3 align-top">
                  <span className="block text-g-meta text-g-ink-2">{item.companyDomain || item.resourceType || "—"}{item.resourceId ? ` · ${item.resourceId}` : ""}</span>
                  <span className="block max-w-60 break-words text-g-meta text-g-ink-3" title={item.metadata ?? undefined}>{context}</span>
                </td>
                <td className="px-4 py-3 align-top"><GoalStatus status={mark.status} label={mark.label} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
