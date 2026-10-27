// Account menu (D-048-F-shell-parts): the shell's menu on the goal system.
// Behaviour is unchanged - the same entries and destinations, the same
// server-verdict gate on the referrer links, and the same guarded sign-out -
// and it is the same Radix menu the kit wrapper used, imported directly as
// GoalDrawer and GoalSheet import their own primitives, so no kit base class
// survives on a moved surface. The trigger is the shell's own avatar slot: the
// circle GoalShell draws for a signed-out visitor (GoalShell.tsx Avatar), with
// the profile image inside it. The sign-out failure alert is plain ink: the
// status hues are audited away outside components/goal (R3).
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BarChart3, Bell, Bookmark, BriefcaseBusiness, Building2, FileText, LogOut, MessageSquare, Settings, Share2, UserRound, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth, useUser } from "@/_core/auth";
import { NotificationBell } from "@/components/NotificationBell";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { clearPrivateReferralBrowserData } from "@/lib/logoutPrivacy";

/** One menu row: the goal label type in ink-2, tinted on hover and on keyboard highlight. */
function MenuItem({ icon: Icon, label, disabled = false, onSelect }: { icon: LucideIcon; label: string; disabled?: boolean; onSelect: (event: Event) => void }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-g-control px-3 py-2 text-g-label text-g-ink-2 outline-none select-none transition-colors duration-(--g-dur-hover) ease-g-out data-[disabled]:pointer-events-none data-[disabled]:text-g-ink-3 data-[highlighted]:bg-g-surface-hover data-[highlighted]:text-g-ink"
    >
      <Icon aria-hidden="true" className="size-4 text-g-ink-3" strokeWidth={1.75} />
      {label}
    </DropdownMenu.Item>
  );
}

/**
 * Referrer links follow the server's verified-referrer verdict (shared predicate), never the session's own
 * emails: a Google sign-in that verified a work email by code is a referrer. Rendered inside the open menu
 * only, so the check runs when the menu opens (cached per account), not on every page that shows the menu.
 */
function ReferrerMenuItems() {
  const [, setLocation] = useLocation();
  const access = useReferrerAccess();
  if (access.status !== "verified") return null;
  return <>
    <MenuItem icon={BriefcaseBusiness} label="My Company Inbox" onSelect={() => setLocation("/inbox")} />
    <MenuItem icon={BarChart3} label="My impact" onSelect={() => setLocation("/referrer/impact")} />
  </>;
}

export function AccountMenu() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try { await clearPrivateReferralBrowserData(); await signOut(); }
    catch { setSignOutError("Sign out failed. Try again."); }
    finally { setSigningOut(false); }
  };

  if (!isLoaded || !isSignedIn) return null;

  return (
    <div className="flex items-center gap-2">
      <NotificationBell />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            title="Account"
            className="g-hit grid size-8 overflow-hidden place-items-center rounded-full bg-g-surface-selected text-g-ink-2 ring-1 ring-inset ring-g-hairline transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink max-gdesk:size-11"
          >
            {user?.imageUrl
              ? <img src={user.imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              : <UserRound aria-hidden="true" className="size-4" strokeWidth={1.75} />}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={4}
            className="g-scope z-50 min-w-52 rounded-g-popover border border-g-hairline bg-g-surface p-1.5 text-g-ink shadow-g-popover data-[state=closed]:animate-g-fade-out data-[state=open]:animate-g-fade-in"
          >
            <MenuItem icon={Bell} label="Notifications" onSelect={() => setLocation("/notifications")} />
            <MenuItem icon={MessageSquare} label="Direct messages" onSelect={() => setLocation("/messages")} />
            <MenuItem icon={FileText} label="My requests" onSelect={() => setLocation("/requests")} />
            <MenuItem icon={Bookmark} label="Internal openings" onSelect={() => setLocation("/wall")} />
            <MenuItem icon={Building2} label="Employer dashboard" onSelect={() => setLocation("/employer")} />
            <MenuItem icon={Share2} label="Share skipwait.me" onSelect={() => setLocation("/share")} />
            <MenuItem icon={Settings} label="Settings" onSelect={() => setLocation("/settings")} />
            <ReferrerMenuItems />
            <DropdownMenu.Separator className="my-1 h-px bg-g-hairline" />
            {signOutError && <p role="alert" className="px-3 py-2 text-g-label text-g-ink">{signOutError}</p>}
            <MenuItem
              icon={LogOut}
              label={signingOut ? "Signing out..." : "Sign out"}
              disabled={signingOut}
              onSelect={event => { event.preventDefault(); void handleSignOut(); }}
            />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
