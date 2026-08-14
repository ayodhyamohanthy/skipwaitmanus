import { LogOut, UserRound } from "lucide-react";
import { useAuth } from "@clerk/react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function AccountMenu() {
  const { isLoaded, isSignedIn, signOut } = useAuth();

  if (!isLoaded || !isSignedIn) return null;

  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label="Account menu" title="Account" className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-[#0B57D0] focus:outline-none focus:ring-2 focus:ring-[#0B57D0] focus:ring-offset-2"><UserRound className="h-4 w-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-32 border-slate-200 bg-white p-1.5 shadow-lg"><DropdownMenuItem onSelect={() => { void signOut(); }} className="cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-slate-700 focus:bg-slate-100 focus:text-slate-950"><LogOut className="h-4 w-4 text-slate-500" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}
