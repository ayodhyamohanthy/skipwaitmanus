// D-148: wires the plans page to the seeker's own picked level (flag-gated by the route in App.tsx).
import { useAuth } from "@/_core/auth";
import { trpc } from "@/lib/trpc";
import PlansV2 from "./PlansV2";

export default function PlansV2Connected() {
  const { isSignedIn } = useAuth();
  const utils = trpc.useUtils();
  const level = trpc.profile.level.useQuery(undefined, { enabled: Boolean(isSignedIn), retry: false, staleTime: 60_000 });
  const save = trpc.profile.setLevel.useMutation({ onSuccess: () => utils.profile.level.invalidate() });
  if (!isSignedIn) return <PlansV2 />;
  return <PlansV2 seekerLevel={level.data ?? null} onPickLevel={next => save.mutate({ level: next })} />;
}
