// D-094 item 2 (D-264 (2)): one honest line under the job-link field, shared
// by the ask drawer and /ask. It says only what a preview we actually fetched
// showed; it is text, never an input, and the field stays editable. Ships
// silent because the switch in jobLinkPrefill.ts is false.
import { jobLinkLine, jobLinkPrefillEnabled, useJobLinkPreview, type JobLinkCompany } from "./jobLinkPrefill";

export function JobLinkFromPosting({ url, company, companies }: { url: string; company: JobLinkCompany | null; companies?: readonly JobLinkCompany[] }) {
  const enabled = jobLinkPrefillEnabled();
  const { preview, pending } = useJobLinkPreview(url, { enabled });
  if (!enabled || pending) return null;
  const line = jobLinkLine({ url, preview, company, companies });
  if (!line) return null;
  return <p data-testid="job-link-from-posting" className="-mt-3 text-pretty text-g-meta text-g-ink-2">{line}</p>;
}
