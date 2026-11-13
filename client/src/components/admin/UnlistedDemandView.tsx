// D-086.admit (packet §5.5): the admission queue of unlisted company domains,
// read-only. It shows what GET /api/admin/company-demand/unlisted already
// returns — a domain and how many people are asking there — and nothing that
// creates, lists or pre-fills a company: listing stays a manual authenticated
// POST /api/admin/companies (D-101). No identity, request id or request text
// is read; the response schema is a strict object of { domain, people }.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";
import { unlistedDemandAdminResponseSchema } from "@shared/companyDemand";
import { adminRetry } from "./adminApi";

/** Local to this view: adminApi.ts belongs to other rows (packet §6). */
const UNLISTED_QUEUE_KEY = ["admin", "company-demand", "unlisted"] as const;

export const UNLISTED_QUEUE_PATH = "/api/admin/company-demand/unlisted";
export const QUEUE_NOT_SWITCHED_ON = "Not switched on yet";
export const QUEUE_LOAD_FAILED = "Couldn't load the queue";
export const QUEUE_EMPTY = "No unlisted companies with requests";
export const QUEUE_LISTING_HELP = "To list a company, an admin sends an authenticated POST to /api/admin/companies.";

/** A 404 means the queue switch is off; that is a state, not a failure. */
export class DemandQueueOffError extends Error {}
class DemandQueueAccessError extends Error {}

async function loadUnlistedQueue(getToken: () => Promise<string | null | undefined>) {
  const token = await getToken();
  let response: Response;
  try {
    response = await fetch(UNLISTED_QUEUE_PATH, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error(QUEUE_LOAD_FAILED);
  }
  if (response.status === 404) throw new DemandQueueOffError(QUEUE_NOT_SWITCHED_ON);
  if (response.status === 401 || response.status === 403) throw new DemandQueueAccessError("Administrator access is required.");
  const payload = await readApiJson<Record<string, unknown>>(response, QUEUE_LOAD_FAILED);
  if (!response.ok) throw new Error(QUEUE_LOAD_FAILED);
  const parsed = unlistedDemandAdminResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(QUEUE_LOAD_FAILED);
  return parsed.data.domains;
}

export function UnlistedDemandView() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queue = useQuery({ queryKey: UNLISTED_QUEUE_KEY, enabled: isSignedIn, retry: adminRetry, queryFn: () => loadUnlistedQueue(fetchToken) });
  const off = queue.error instanceof DemandQueueOffError;
  const body = queue.isLoading
    ? "Loading the unlisted queue…"
    : off ? QUEUE_NOT_SWITCHED_ON
      : queue.error ? QUEUE_LOAD_FAILED
        : queue.data?.length ? "Domains people asked for that are not in the company directory. Read-only." : QUEUE_EMPTY;
  return <>
    <section aria-labelledby="unlisted-demand" className="border-t border-g-hairline pt-5">
      <h2 id="unlisted-demand" className="text-g-label text-g-ink">Requests for unlisted companies</h2>
      <p className="mt-1 text-g-meta text-g-ink-2">{body}</p>
    </section>
    {queue.error && !off ? <p role="alert" className="mt-3 text-g-meta text-g-ink-2"><button type="button" className="underline underline-offset-[3px]" onClick={() => { void queue.refetch(); }}>Try again</button></p> : null}
    {queue.data?.length ? (
      <section className="mt-4 border border-g-hairline bg-g-surface" aria-label="Unlisted companies">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-g-hairline px-4 py-2 text-g-meta text-g-ink-3"><span>Domain</span><span>People asking</span></header>
        {queue.data.map(row => <div key={row.domain} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-g-hairline px-4 py-3 last:border-b-0"><span className="min-w-0 truncate text-g-label text-g-ink">{row.domain}</span><span className="text-g-label text-g-ink">{row.people}</span></div>)}
      </section>
    ) : null}
    <p className="mt-3 text-g-meta text-g-ink-3">{QUEUE_LISTING_HELP}</p>
  </>;
}
