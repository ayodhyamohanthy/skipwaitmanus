// One ask in the kit v4 Requests list, ported from app/src/routes/requests.tsx:
// a single link card (company mark, role, company · next step, pill, arrow)
// that opens the thread, where the seeker can withdraw an unclaimed ask.
import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { StatusPill } from "@/components/kit/status-pill";
import { companyIdentity } from "@/components/inbox/inboxThreads";
import { isUrgentExpiry, requestNote, requestPillStatus } from "./requestModel";
import type { ReferralRequest } from "./requestsApi";

type RequestRowProps = {
  request: ReferralRequest;
  nowMs: number;
};

export function RequestRow({ request, nowMs }: RequestRowProps) {
  const pill = requestPillStatus(request);
  const company = companyIdentity(request.companyDomain);
  const urgent = isUrgentExpiry(request, nowMs);
  return (
    <li>
      <Link href={`/conversation/${request.id}`} aria-label={`${company.name} request, ${pill}`} className="flex min-h-20 items-center gap-3 rounded-3xl border border-border p-4 hover:border-foreground/40">
        <span className="company-mark" aria-hidden="true">{company.mark}</span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate">{request.title || "Referral request"}</strong>
          <small className={urgent ? "font-semibold text-destructive" : "text-muted-foreground"}>{company.name} · {requestNote(request, nowMs)}</small>
        </span>
        <StatusPill status={pill} />
        <ArrowRight className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
      </Link>
    </li>
  );
}
