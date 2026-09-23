import { Share2 } from "lucide-react";
import { OneTapShareActions } from "@/components/OneTapShareActions";

type ZeroActivityAudience = "job_seeker" | "referrer";

type ZeroActivityShareCardProps = {
  audience: ZeroActivityAudience;
};

export function ZeroActivityShareCard({ audience }: ZeroActivityShareCardProps) {
  const origin = typeof window === "undefined" ? "https://skipwait.me" : window.location.origin;
  const isJobSeeker = audience === "job_seeker";
  const link = isJobSeeker ? `${origin}/start` : `${origin}/referrer`;
  const message = isJobSeeker
    ? "A role link can become a private referral request. See if this is useful for you:"
    : "Know a colleague at your company who could help privately? Share private referral coverage — they verify a work email and choose whether to help:";
  const title = isJobSeeker ? "Private referral requests" : "Strengthen private coverage at your company";

  return <section data-skipwait-zero-action={audience} className="mt-6 w-full max-w-sm"><p className="mb-2 text-center text-xs font-bold uppercase tracking-[.13em] text-[#505050]">Share this useful next step</p><OneTapShareActions title={title} message={message} link={link} /></section>;
}
