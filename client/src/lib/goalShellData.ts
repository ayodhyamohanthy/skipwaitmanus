// Data for the goal app shell (client/src/components/AppShell.tsx): the seeker's credit balance and the unread
// alert count. Parsed at the edge; a failed or malformed read is an error state, never a fabricated number
// (DESIGN.md rule 13: a balance that failed to load says so and never shows 0).
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type TokenSource = () => Promise<string | null | undefined>;

async function authedJson(path: string, getToken: TokenSource, fallback: string): Promise<Record<string, unknown>> {
  const token = await getToken();
  const response = await fetch(path, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const payload = await readApiJson<Record<string, unknown>>(response, fallback);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : fallback);
  return payload;
}

const creditBalanceSchema = z.object({ summary: z.object({ totalAvailable: z.number().int().min(0) }) });
export const creditBalanceKey = (userId: string | null) => ["credits", "balance", "job_seeker", userId] as const;

/** The seeker's spendable credits (GET /api/credits/summary?role=job_seeker, totalAvailable). */
export async function fetchCreditBalance(getToken: TokenSource): Promise<number> {
  const payload = await authedJson("/api/credits/summary?role=job_seeker", getToken, "We could not load your credits");
  const parsed = creditBalanceSchema.safeParse(payload);
  if (!parsed.success) throw new Error("We could not load your credits");
  return parsed.data.summary.totalAvailable;
}

export function useCreditBalance(enabled: boolean) {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  return useQuery({
    queryKey: creditBalanceKey(userId ?? null),
    queryFn: () => fetchCreditBalance(fetchToken),
    enabled: enabled && Boolean(isSignedIn),
    staleTime: 30_000,
    retry: 1,
  });
}

const notificationsSchema = z.object({ notifications: z.array(z.object({ readAt: z.string().nullish() })).optional().transform(value => value ?? []) });

/** Unread alerts from GET /api/notifications (there is no count endpoint). A failed read shows no dot. */
export function useUnreadAlerts(enabled: boolean) {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  return useQuery({
    queryKey: ["notifications", "unread", userId ?? null],
    queryFn: async () => {
      const parsed = notificationsSchema.safeParse(await authedJson("/api/notifications", fetchToken, "Your private updates are unavailable right now."));
      return parsed.success ? parsed.data.notifications.filter(item => !item.readAt).length : 0;
    },
    enabled: enabled && Boolean(isSignedIn),
    staleTime: 60_000,
    retry: false,
  });
}
