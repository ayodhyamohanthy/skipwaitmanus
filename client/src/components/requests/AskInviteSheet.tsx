import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState } from "react";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalIconButton } from "@/components/goal/GoalIconButton";
import { AskInviteApiError, createAskInvite, revokeAskInvite, type CreatedAskInvite } from "./askInviteApi";
import type { AskInviteMine } from "@shared/askInvites";

type AskInviteSheetProps = {
  requestId: number;
  companyName: string;
  roleTitle: string;
  waitingForInvite: boolean;
  invite?: AskInviteMine;
  getToken: () => Promise<string | null | undefined>;
  onChanged: () => void | Promise<unknown>;
};

function createErrorCopy(error: unknown): string {
  if (error instanceof AskInviteApiError && error.code === "weekly_link_cap") return "You’ve reached the weekly invite-link limit. Try again after a link leaves the seven-day window.";
  if (error instanceof AskInviteApiError && error.code === "ask_not_waiting") return "This referral request is no longer waiting, so it can’t have a new invite link.";
  if (error instanceof AskInviteApiError && error.code === "link_active") return "This referral request already has an active link. Refresh your requests to see its status.";
  return "We couldn’t create the invite link. Your referral request is unchanged; try again.";
}

export function AskInviteSheet({ requestId, companyName, roleTitle, waitingForInvite, invite, getToken, onChanged }: AskInviteSheetProps) {
  const [open, setOpen] = useState(false);
  const [issuedLink, setIssuedLink] = useState<CreatedAskInvite | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeConfirmation, setRevokeConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const dismissed = invite?.state === "revoked" || invite?.state === "expired";
  const active = !dismissed && (Boolean(issuedLink) || invite?.state === "active");
  const finished = invite?.state === "claimed" || invite?.state === "delivered";
  const linkToShare = issuedLink?.url ?? null;
  const canCreate = !active && !finished;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const openForRevoke = () => {
    setError("");
    setRevokeConfirmation(true);
    setOpen(true);
  };

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const result = await createAskInvite(requestId, getToken);
      setIssuedLink(result);
      setCopied(false);
      await onChanged();
    } catch (reason) {
      setError(createErrorCopy(reason));
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!linkToShare) return;
    setError("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(linkToShare);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Copy isn’t available here. The one-time link is still visible above so you can select it.");
    }
  };

  const share = async () => {
    if (!linkToShare || !canNativeShare) return;
    try {
      await navigator.share({
        title: `Invite someone to review your referral request at ${companyName}`,
        text: `Could you take a look at my ${roleTitle || "referral request"} at ${companyName}?`,
        url: linkToShare,
      });
    } catch {
      // Native share cancellation is a user choice; the link remains available to copy.
    }
  };

  const revoke = async () => {
    setRevoking(true);
    setError("");
    try {
      await revokeAskInvite(requestId, getToken);
      setIssuedLink(null);
      setRevokeConfirmation(false);
      setOpen(false);
      await onChanged();
    } catch {
      setError("We couldn’t revoke the invite link. Your referral request is unchanged; try again.");
    } finally {
      setRevoking(false);
    }
  };

  if (finished) return <p role="status" className="px-3 pb-2 text-g-meta text-g-ink-2">Your insider has your referral request.</p>;
  if (!waitingForInvite) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 px-1 pb-1">
        {active ? (
          <>
            <GoalButton size="sm" variant="ghost" onClick={() => { setError(""); setOpen(true); }}>{issuedLink ? "Link active · copy" : "Link active"}</GoalButton>
            <GoalButton size="sm" variant="ghost" onClick={openForRevoke}>Revoke</GoalButton>
          </>
        ) : canCreate ? (
          <GoalButton size="sm" variant="ghost" onClick={() => { setError(""); setOpen(true); }}>Invite someone you know</GoalButton>
        ) : null}
      </div>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="animate-g-fade-in fixed inset-0 z-40 bg-g-scrim data-[state=closed]:animate-g-fade-out motion-reduce:animate-none" />
          <Dialog.Content className="g-scope animate-g-sheet-in fixed bottom-0 left-1/2 z-50 flex max-h-[min(88dvh,760px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-t-[12px] bg-g-surface shadow-g-drawer data-[state=closed]:animate-g-sheet-out motion-reduce:animate-none max-gdesk:inset-x-0 max-gdesk:top-2 max-gdesk:bottom-0 max-gdesk:left-0 max-gdesk:w-full max-gdesk:max-h-none max-gdesk:translate-x-0 max-gdesk:rounded-t-[12px]">
            <header className="flex items-start gap-3 border-b border-g-hairline px-5 py-4">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-g-heading text-g-ink">Invite someone you know</Dialog.Title>
                <Dialog.Description className="mt-1 text-g-meta text-g-ink-2">A private link for your waiting referral request at {companyName}.</Dialog.Description>
              </div>
              <Dialog.Close asChild><GoalIconButton icon={X} aria-label="Close invite sheet" /></Dialog.Close>
            </header>

            <div className="grid flex-1 content-start gap-4 overflow-y-auto px-5 py-5">
              {revokeConfirmation ? (
                <section role="alertdialog" aria-labelledby={`ask-invite-revoke-title-${requestId}`} className="grid content-start gap-4 rounded-g-tile border border-g-hairline p-4">
                  <div className="grid gap-2">
                    <h2 id={`ask-invite-revoke-title-${requestId}`} className="text-g-label text-g-ink">Revoke this invite link?</h2>
                    <p className="text-g-meta text-g-ink-2">The link stops working right away. Your referral request stays open, and you can create a new link to share instead.</p>
                  </div>
                  {error ? <p role="alert" className="text-g-meta text-g-ink">{error}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <GoalButton size="sm" variant="ghost" disabledReason={revoking ? "Revoking this link" : undefined} onClick={() => setRevokeConfirmation(false)}>Keep link</GoalButton>
                    <GoalButton variant="primary" busy={revoking} busyLabel="Revoking…" onClick={() => { void revoke(); }}>Revoke link</GoalButton>
                  </div>
                </section>
              ) : (
                <>
                  <ul className="grid gap-2 text-g-meta text-g-ink-2">
                    <li>This link works once and expires in seven days.</li>
                    <li>Your insider must sign in with a verified work email at {companyName}.</li>
                    <li>Your name and files stay hidden until the insider accepts your referral request.</li>
                    <li>Your referral allowance is only used when someone can see your request.</li>
                  </ul>

                  {error ? <p role="alert" className="rounded-g-tile border border-g-hairline px-3 py-2 text-g-meta text-g-ink">{error}</p> : null}

                  {issuedLink ? (
                    <div className="grid gap-2 rounded-g-tile border border-g-hairline bg-g-surface-sunken p-3">
                      <label htmlFor={`ask-invite-url-${requestId}`} className="text-g-label text-g-ink">Your one-time link</label>
                      <input id={`ask-invite-url-${requestId}`} aria-label="One-time invite link" readOnly value={issuedLink.url} className="min-h-11 w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-meta text-g-ink" onFocus={event => event.currentTarget.select()} />
                      <p className="text-g-meta text-g-ink-2">Save or share this URL now. For your privacy, we don’t show it again after you leave this page.</p>
                      <div className="flex flex-wrap gap-2">
                        <GoalButton variant="primary" onClick={() => { void copy(); }}>{copied ? "Copied" : "Copy link"}</GoalButton>
                        {canNativeShare ? <GoalButton variant="outline" onClick={() => { void share(); }}>Share</GoalButton> : null}
                      </div>
                    </div>
                  ) : active ? (
                    <p role="status" className="rounded-g-tile bg-g-surface-sunken px-3 py-3 text-g-meta text-g-ink-2">This referral request link is already active, but its one-time URL is not saved in this browser. Revoke it and create a new link if you need another copy.</p>
                  ) : (
                    <div className="grid gap-2">
                      <p className="text-g-meta text-g-ink-2">Only create a link when you’re ready to share it. Your referral request continues to wait for normal coverage until your insider claims it.</p>
                      <GoalButton variant="primary" busy={creating} busyLabel="Creating link…" onClick={() => { void create(); }}>Create one-time link</GoalButton>
                    </div>
                  )}
                </>
              )}
            </div>

            {active && !revokeConfirmation ? (
              <footer className="border-t border-g-hairline px-5 py-3">
                <GoalButton variant="ghost" size="sm" onClick={openForRevoke}>Revoke this link</GoalButton>
              </footer>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
