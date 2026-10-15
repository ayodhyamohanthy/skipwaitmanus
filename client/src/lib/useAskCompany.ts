import { useEffect, useState } from "react";
import { askCompanyFromCompany, askCompanyFromUrl, type AskCompany } from "@shared/askCompany";
import { fetchCompany, fetchCompanyDirectory } from "@/lib/companyDirectory";
import type { PublicCompany } from "@shared/companies";

let directory: Promise<PublicCompany[]> | undefined;
const loadDirectory = () => (directory ??= fetchCompanyDirectory().then(result => result.companies).catch(error => { directory = undefined; throw error; }));

/**
 * The company an ask is for: the door the seeker came from (slug), else a listed
 * company matching a valid job link. Any failure leaves it undefined, so the
 * composer falls back to the plain eyebrow and placeholder.
 */
export function useAskCompany(slug: string | undefined, url: string, urlIsValid: boolean): AskCompany | undefined {
  const [fromSlug, setFromSlug] = useState<AskCompany>();
  const [fromUrl, setFromUrl] = useState<AskCompany>();
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchCompany(slug).then(company => { if (!cancelled) setFromSlug(askCompanyFromCompany(company)); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [slug]);
  useEffect(() => {
    if (!urlIsValid) { setFromUrl(undefined); return; }
    let cancelled = false;
    loadDirectory().then(companies => { if (!cancelled) setFromUrl(askCompanyFromUrl(companies, url)); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [url, urlIsValid]);
  return fromUrl ?? fromSlug;
}
