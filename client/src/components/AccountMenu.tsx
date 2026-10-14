import { BarChart3, Bell, Bookmark, BriefcaseBusiness, FileText, LogOut, MessageSquare, Settings, Share2, UserRound, Building2 } from "lucide-react";
import { useAuth, useUser } from "@/_core/auth";
import { useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/NotificationBell";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { clearPrivateReferralBrowserData } from "@/lib/logoutPrivacy";
import { useState } from "react";

/**
 * Referrer links follow the server's verified-referrer verdict (shared predicate), never the session's own
 * emails: a Google sign-in that verified a work email by code is a referrer. Rendered inside the open menu
 * only, so the check runs when the menu opens (cached per account), not on every page that shows the menu.
 */
function ReferrerMenuItems() {
  const [, setLocation] = useLocation();
  const access = useReferrerAccess();
  if (access.status !== "verified") return null;
  return <><DropdownMenuItem onSelect={() => setLocation("/inbox")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><BriefcaseBusiness className="h-4 w-4 text-[#505050]" />My Company Inbox</DropdownMenuItem><DropdownMenuItem onSelect={() => setLocation("/referrer/impact")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><BarChart3 className="h-4 w-4 text-[#505050]" />My impact</DropdownMenuItem></>;
}

export function AccountMenu() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [signingOut,setSigningOut]=useState(false);
  const [signOutError,setSignOutError]=useState("");
  const handleSignOut=async()=>{if(signingOut)return;setSigningOut(true);setSignOutError("");try{await clearPrivateReferralBrowserData();await signOut()}catch{setSignOutError("Sign out failed. Try again.")}finally{setSigningOut(false)}};

  if (!isLoaded || !isSignedIn) return null;

  return <div className="flex items-center gap-2"><NotificationBell /><DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Account menu" title="Account" className="grid h-9 w-9 overflow-hidden place-items-center rounded-full border border-[#e5e5e5] bg-white text-[#505050] transition hover:border-[#141414] hover:text-black focus:outline-none focus:ring-2 focus:ring-[#141414] focus:ring-offset-2">{user?.imageUrl ? <img src={user.imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <UserRound className="h-4 w-4" />}</button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-52 border-[#e5e5e5] bg-white p-1.5"><DropdownMenuItem onSelect={() => setLocation("/notifications")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><Bell className="h-4 w-4 text-[#505050]" />Notifications</DropdownMenuItem><DropdownMenuItem onSelect={() => setLocation("/messages")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><MessageSquare className="h-4 w-4 text-[#505050]" />Direct messages</DropdownMenuItem><DropdownMenuItem onSelect={() => setLocation("/requests")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><FileText className="h-4 w-4 text-[#505050]" />My requests</DropdownMenuItem><DropdownMenuItem onSelect={() => setLocation("/wall")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><Bookmark className="h-4 w-4 text-[#505050]" />Internal openings</DropdownMenuItem><DropdownMenuItem onSelect={() => setLocation("/employer")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><Building2 className="h-4 w-4 text-[#505050]" />Employer dashboard</DropdownMenuItem><DropdownMenuItem onSelect={() => setLocation("/share")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><Share2 className="h-4 w-4 text-[#505050]" />Share skipwait.me</DropdownMenuItem><DropdownMenuItem onSelect={() => setLocation("/settings")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><Settings className="h-4 w-4 text-[#505050]" />Settings</DropdownMenuItem><ReferrerMenuItems /><DropdownMenuSeparator className="bg-[#f0f0f0]" />{signOutError&&<p role="alert" className="px-3 py-2 text-xs font-semibold text-[#B91C1C]">{signOutError}</p>}<DropdownMenuItem disabled={signingOut} onSelect={(event) => { event.preventDefault(); void handleSignOut(); }} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-[#505050] focus:bg-[#f0f0f0] focus:text-black"><LogOut className="h-4 w-4 text-[#505050]" />{signingOut?"Signing out…":"Sign out"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>;
}
