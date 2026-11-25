// Goal /share-card/:token (D-048-p3-links; packet docs/plans/D-048-public.md).
// A seeker's voluntary milestone card, opened by someone they shared it with.
// The visitor's goal leads ("Get your own referral."); the card states only
// the fact it carries and implies no hiring outcome. Same anonymous fetch
// (credentials omitted) and the same /start?invite= handoff as the kit card;
// the answer is runtime-validated and fails closed to the unavailable state.
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { z } from "zod";
import { GoalButton } from "@/components/goal";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { LinkEyebrow, LinkFrame, LinkLoading, LinkUnavailable } from "./LinkFrame";

export const GOAL_PAGE = { goalLine: "Get your own referral." };
const SCREEN = "share-card";

const ShareCardSchema = z.object({
  card: z.object({
    companyDomain: z.string().trim().min(1),
    status: z.literal("accepted"),
    inviteCode: z.string().trim().min(1).optional(),
  }),
});
type ShareCardData = z.infer<typeof ShareCardSchema>["card"];

export default function GoalShareCard() {
  const [, params] = useRoute("/share-card/:token");
  const token = params?.token || "";
  const [card, setCard] = useState<ShareCardData | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => { setUnavailable(false); setCard(null); setReloadKey(key => key + 1); };

  useEffect(() => {
    if (!token) { setUnavailable(true); return; }
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/referral-share-cards/public/${encodeURIComponent(token)}`, { credentials: "omit" });
        const payload: unknown = await response.json().catch(() => ({}));
        const parsed = ShareCardSchema.safeParse(payload);
        if (!response.ok || !parsed.success) throw new Error("unavailable");
        if (active) setCard(parsed.data.card);
      } catch {
        if (active) setUnavailable(true);
      }
    })();
    return () => { active = false; };
  }, [token, reloadKey]);

  if (unavailable) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <LinkUnavailable
        screen={SCREEN}
        eyebrow="Shared referral milestone"
        title="This share card isn’t available."
        message={offline ? "You’re offline. Reconnect, then try again." : "This voluntary milestone card may have been removed."}
        detail="Nothing was changed."
        onRetry={retry}
      />
    );
  }
  if (!card) return <LinkLoading screen={SCREEN} label="Opening the share card" />;

  const startHref = card.inviteCode ? `/start?invite=${encodeURIComponent(card.inviteCode)}` : "/start";
  return (
    <LinkFrame screen={SCREEN}>
      <LinkEyebrow>Shared referral milestone</LinkEyebrow>
      <h1 className="mt-3 text-g-display">{GOAL_PAGE.goalLine}</h1>
      <div className="mt-4 rounded-g-tile border border-g-hairline p-4">
        <p className="text-g-body text-g-ink">A private referral request was accepted at <strong className="font-semibold">{card.companyDomain}</strong>.</p>
        <p className="mt-2 text-g-meta text-g-ink-2">Shared voluntarily. No hiring outcome is implied.</p>
      </div>
      <p className="mt-4 text-g-body text-g-ink-2">
        On SkipWait.me you send a referral request with the job link and your resume. Only verified employees at that company can see it, and they choose whether to accept.
      </p>
      <div className="mt-5">
        <GoalNextStep reason="Start with the job link you want a referral for.">
          <div className="mt-3">
            <GoalButton variant="primary" asChild className="w-full">
              <Link href={startHref}>Start your referral request</Link>
            </GoalButton>
          </div>
        </GoalNextStep>
      </div>
    </LinkFrame>
  );
}
