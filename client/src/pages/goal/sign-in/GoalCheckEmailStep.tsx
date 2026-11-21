import { GoalButton } from "@/components/goal/GoalButton";
import { referrerSignInHref } from "@/lib/referrerSignIn";

export function GoalCheckEmailStep({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  return <div data-testid="seeker-check-email" className="mt-4 grid gap-3">
    <h2 className="text-g-label text-g-ink">Check your email</h2>
    <p className="text-g-meta text-g-ink-2">If this address can use a password, a link to set it is on its way to <span className="break-all text-g-ink">{email}</span>. Use the newest email.</p>
    <p className="text-g-meta text-g-ink-2">Already have an account? The link uses the same account. Nothing new is created for an existing address.</p>
    <p className="text-g-meta text-g-ink-2">Give referrals? Referrers have no password: <a href={referrerSignInHref()} className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">sign in with your work email</a>.</p>
    <GoalButton variant="primary" className="w-full" onClick={onChangeEmail}>Use a different email</GoalButton>
  </div>;
}
