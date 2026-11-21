// D-174 jobs-list: only the separately accepted release may enable this mount.
export const COMPANY_JOBS_ENABLED = false;

export interface CompanyJobsFilters {
  location: string;
  level: string;
  function: string;
}
