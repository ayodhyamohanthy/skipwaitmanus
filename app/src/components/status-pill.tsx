import { Check, Clock3, CircleDot } from "lucide-react";

export function StatusPill({ status }: { status: string }) {
  const done = ["Accepted", "Referred", "Interviewing", "Offer", "Hired", "Closed"].includes(status);
  const Icon = done ? Check : status === "Requested" ? Clock3 : CircleDot;
  return <span className={`status-pill status-${status.toLowerCase()}`}><Icon />{status}</span>;
}