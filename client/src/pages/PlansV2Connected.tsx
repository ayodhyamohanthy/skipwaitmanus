// D-148: wires the plans page to the seeker's own picked level (flag-gated by the route in App.tsx).
import { useAuth } from "@/_core/auth";
import { browserPaymentRoute } from "@/lib/paymentRoute";
import { usePlansCatalog } from "@/components/plans/plansCatalogApi";
import { trpc } from "@/lib/trpc";
import PlansV2 from "./PlansV2";

export default function PlansV2Connected() {
  const { isSignedIn } = useAuth();
  const utils = trpc.useUtils();
  const level = trpc.profile.level.useQuery(undefined, { enabled: Boolean(isSignedIn), retry: false, staleTime: 60_000 });
  const save = trpc.profile.setLevel.useMutation({ onSuccess: () => utils.profile.level.invalidate() });
  // Same currency rule as the live Plans page: ?currency= wins, then the server's region answer, then the browser guess.
  const param = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("currency");
  const catalog = usePlansCatalog(true).data ?? null;
  const book: "INR" | "USD" = param === "INR" || param === "USD" ? param : ((catalog?.currency ?? browserPaymentRoute()) === "USD" ? "USD" : "INR");
  if (!isSignedIn) return <PlansV2 book={book} />;
  return <PlansV2 book={book} seekerLevel={level.data ?? null} onPickLevel={next => save.mutate({ level: next })} />;
}
