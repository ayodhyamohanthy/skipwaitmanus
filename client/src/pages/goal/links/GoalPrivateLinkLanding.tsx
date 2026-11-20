// Goal /fast/:linkCode and /refer/:companySlug/:vanityAlias (D-048-p3-links;
// packet docs/plans/D-048-public.md). A verified employee's private referral
// link, opened signed out. Same fetch and the same /start handoff as the kit
// pages (the link's intent survives sign-in through /start, D-153); the
// answer is runtime-validated, so a malformed one fails closed to the honest
// unavailable state instead of loading forever.
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { z } from "zod";
import { GoalButton } from "@/components/goal";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { readApiJson } from "@/lib/apiResponse";
import { LinkEyebrow, LinkFrame, LinkLoading, LinkUnavailable, loadFailureMessage } from "./LinkFrame";

const UNAVAILABLE = "This private referral link is unavailable";

const PrivateLinkSchema = z.object({
  link: z.object({ companyDomain: z.string().trim().min(1), isActive: z.literal(true) }),
});

export const goalLineFor = (companyDomain: string) => `Get referred at ${companyDomain}.`;

export function GoalPrivateLinkLanding({ screen, apiPath, startHref }: { screen: string; apiPath: string; startHref: string }) {
  const [, go] = useLocation();
  const [companyDomain, setCompanyDomain] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => { setError(""); setCompanyDomain(null); setReloadKey(key => key + 1); };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(apiPath, { cache: "no-store" });
        const payload = await readApiJson<Record<string, unknown>>(response, UNAVAILABLE);
        if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : UNAVAILABLE);
        const parsed = PrivateLinkSchema.safeParse(payload);
        if (!parsed.success) throw new Error(UNAVAILABLE);
        if (active) setCompanyDomain(parsed.data.link.companyDomain);
      } catch (reason) {
        if (active) setError(loadFailureMessage(reason, UNAVAILABLE));
      }
    })();
    return () => { active = false; };
  }, [apiPath, reloadKey]);

  if (error) {
    return (
      <LinkUnavailable
        screen={screen}
        eyebrow="Private referral link"
        title="This private link isn’t available."
        message={error}
        detail="The link may have expired or been paused. Nothing was changed."
        onRetry={retry}
      />
    );
  }
  if (!companyDomain) return <LinkLoading screen={screen} label="Opening the private referral link" />;

  return (
    <LinkFrame screen={screen}>
      <LinkEyebrow>Private referral link</LinkEyebrow>
      <h1 className="mt-3 text-g-display">{goalLineFor(companyDomain)}</h1>
      <p className="mt-2 text-g-body text-g-ink-2">
        A verified employee at {companyDomain} shared this link. They choose whether to review your request, and their identity stays private.
      </p>
      <ol className="mt-5 grid gap-2 border-t border-g-hairline pt-4 text-g-meta text-g-ink-2">
        <li className="flex gap-3"><span className="font-g-mono text-g-ink">1</span>Add the job link you want a referral for.</li>
        <li className="flex gap-3"><span className="font-g-mono text-g-ink">2</span>Add your resume and a short note.</li>
        <li className="flex gap-3"><span className="font-g-mono text-g-ink">3</span>The employee reviews it and decides privately.</li>
      </ol>
      <div className="mt-5">
        <GoalNextStep reason="Start with the job link. This private link stays attached through sign-in.">
          <div className="mt-3">
            <GoalButton variant="primary" className="w-full" onClick={() => go(startHref)}>Start your referral request</GoalButton>
          </div>
        </GoalNextStep>
      </div>
      <p className="mt-4 text-g-meta text-g-ink-3">This does not bypass the employer’s application process or guarantee a referral.</p>
    </LinkFrame>
  );
}

export function GoalFastTrackLink() {
  const [, params] = useRoute("/fast/:linkCode");
  const linkCode = encodeURIComponent(params?.linkCode || "");
  return <GoalPrivateLinkLanding screen="fast-track-link" apiPath={`/api/referrer-fast-track/${linkCode}`} startHref={`/start?fast=${linkCode}`} />;
}

export function GoalVanityFastTrackLink() {
  const [, params] = useRoute("/refer/:companySlug/:vanityAlias");
  const companySlug = encodeURIComponent(params?.companySlug || "");
  const vanityAlias = encodeURIComponent(params?.vanityAlias || "");
  return (
    <GoalPrivateLinkLanding
      screen="vanity-fast-track-link"
      apiPath={`/api/referrer-fast-track/vanity/${companySlug}/${vanityAlias}`}
      startHref={`/start?referCompany=${companySlug}&referAlias=${vanityAlias}`}
    />
  );
}
