// Settings > Notifications: the one email preference that already exists and is enforced server-side
// (profiles.notifyNewAsk, honoured when review emails are prepared). Default stays on. Nothing new is sent.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toggle } from "@/components/kit/preview-kit";
import { fetchReferrerPreferences, saveReferrerPreferences } from "@/components/referrer-home/referrerData";
import { ErrorNotice } from "./settingsUi";
import type { TokenSource } from "./settingsApi";

const KEY = ["settings", "referrer-preferences"] as const;

export function NewAskEmailRow({ getToken }: { getToken: TokenSource }) {
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: KEY, retry: false, queryFn: () => fetchReferrerPreferences(getToken) });
  const save = useMutation({
    mutationFn: (notifyNewAsk: boolean) => saveReferrerPreferences(getToken, { notifyNewAsk }),
    onSuccess: next => queryClient.setQueryData(KEY, next),
  });
  if (prefs.isPending) return null;
  if (prefs.isError) return <ErrorNotice message="We could not load your email setting." onRetry={() => void prefs.refetch()} />;
  return <div className="border-b border-border py-3 last:border-0">
    <Toggle on={prefs.data.notifyNewAsk} disabled={save.isPending} onChange={value => save.mutate(value)} label="Email when a new ask arrives" hint="Off means no review emails while you stay verified." />
    {save.isError ? <ErrorNotice message="We could not save that. Try again." /> : null}
  </div>;
}
