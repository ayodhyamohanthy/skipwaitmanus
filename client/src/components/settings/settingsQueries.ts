// React Query hooks shared by more than one Settings section.
import { useQuery } from "@tanstack/react-query";
import { fetchCompanyAccess, settingsKeys, type TokenSource } from "./settingsApi";

/** Work-email access: Account shows it, Notifications gates Slack on it. */
export function useCompanyAccess(getToken: TokenSource) {
  return useQuery({ queryKey: settingsKeys.access, retry: false, queryFn: () => fetchCompanyAccess(getToken) });
}
