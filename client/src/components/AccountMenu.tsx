import { BriefcaseBusiness, LogOut, Settings, UserRound } from "lucide-react";
import { useAuth, useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const personalEmailDomains = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com"]);

export function AccountMenu() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const hasVerifiedWorkEmail = Boolean(user?.emailAddresses.some(address => {
    const domain = address.emailAddress.trim().toLowerCase().split("@")[1];
    return address.verification?.status === "verified" && domain && !personalEmailDomains.has(domain);
  }));

  if (!isLoaded || !isSignedIn) return null;

  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Account menu" title="Account" className="grid h-9 w-9 overflow-hidden place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-[#0B57D0] focus:outline-none focus:ring-2 focus:ring-[#0B57D0] focus:ring-offset-2">{user?.imageUrl ? <img src={user.imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <UserRound className="h-4 w-4" />}</button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-52 border-slate-200 bg-white p-1.5 shadow-lg"><DropdownMenuItem onSelect={() => setLocation("/settings")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-slate-700 focus:bg-slate-100 focus:text-slate-950"><Settings className="h-4 w-4 text-slate-500" />Settings</DropdownMenuItem>{hasVerifiedWorkEmail && <DropdownMenuItem onSelect={() => setLocation("/referrer")} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-slate-700 focus:bg-slate-100 focus:text-slate-950"><BriefcaseBusiness className="h-4 w-4 text-slate-500" />Switch to Job Referrer mode</DropdownMenuItem>}<DropdownMenuSeparator className="bg-slate-100" /><DropdownMenuItem onSelect={() => { void signOut(); }} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-slate-700 focus:bg-slate-100 focus:text-slate-950"><LogOut className="h-4 w-4 text-slate-500" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
