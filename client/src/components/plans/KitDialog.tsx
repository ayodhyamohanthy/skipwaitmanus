// Kit v4 modal (modal-backdrop + app-dialog), as authored in app/src/routes/plans.tsx
// and billing.tsx. Adds the keyboard contract the kit preview omits: Escape
// closes, focus moves into the dialog on open and returns on close.
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/kit/button";

type KitDialogProps = {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label?: string;
  labelledBy?: string;
  as?: "div" | "section";
};

export function KitDialog({ onClose, children, className = "", label, labelledBy, as = "div" }: KitDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialogRef.current;
    const focusTarget = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node;
    focusTarget?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previous?.focus(); };
  }, []);

  const Tag = as;
  return <div className="modal-backdrop" onClick={onClose}>
    <Tag ref={(node: HTMLElement | null) => { dialogRef.current = node; }} tabIndex={-1} className={`app-dialog focus:outline-none ${className}`.trim()} role="dialog" aria-modal="true" aria-label={label} aria-labelledby={labelledBy} onClick={event => event.stopPropagation()}>
      <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={onClose}><X /></Button>
      {children}
    </Tag>
  </div>;
}
