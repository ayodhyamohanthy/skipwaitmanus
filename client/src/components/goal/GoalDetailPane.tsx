// GoalDetailPane (spec §4.6): the reading column next to a list. The queue
// role is the screen's one display title; My referrals uses heading size.
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type GoalDetailPaneProps = {
  labelledBy: string;
  eyebrow?: ReactNode;
  refId?: string;
  title: ReactNode;
  titleSize: "display" | "heading";
  meta?: ReactNode[];
  children: ReactNode;
  dock?: ReactNode;
  phoneBack?: { href: string; label: string };
  phonePosition?: ReactNode;
  className?: string;
};

export function GoalDetailPane({ labelledBy, eyebrow, refId, title, titleSize, meta, children, dock, phoneBack, phonePosition, className }: GoalDetailPaneProps) {
  return (
    <article aria-labelledby={labelledBy} data-testid="goal-detail-pane" className={cn("flex h-full flex-col", className)}>
      {(phoneBack || phonePosition) ? (
        <div className="gdesk:hidden flex h-12 items-center gap-2 border-b border-g-hairline px-2">
          {phoneBack ? (
            <a href={phoneBack.href} className="flex min-h-11 items-center gap-1 px-1 text-g-label text-g-ink">
              <ChevronLeft aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
              {phoneBack.label}
            </a>
          ) : null}
          {phonePosition ? <span className="ml-auto pr-2">{phonePosition}</span> : null}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col px-10 pt-9 max-gdesk:px-4 max-gdesk:pt-5" style={{ width: "100%", maxWidth: "calc(var(--g-detail-max) + 80px)" }}>
        {eyebrow ? <p className="text-g-meta text-g-ink-3">{eyebrow}</p> : null}
        {refId ? <p className="g-num text-g-ink-3">{refId}</p> : null}
        <h2 id={labelledBy} className={titleSize === "display" ? "text-g-display text-g-ink" : "text-g-heading text-g-ink"}>{title}</h2>
        {meta?.length ? (
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-g-meta text-g-ink-3">
            {meta.map((item, index) => <span key={index}>{item}</span>)}
          </div>
        ) : null}
        <div className="mt-6 flex-1">{children}</div>
        {dock ? <div className="mt-auto pt-8 max-gdesk:pt-7">{dock}</div> : null}
      </div>
    </article>
  );
}
