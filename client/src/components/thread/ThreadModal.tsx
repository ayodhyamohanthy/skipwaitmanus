import { X } from "lucide-react";
import { useEffect, useId, type ReactNode } from "react";
import { Button } from "@/components/kit/button";

/** Kit v4 thread dialog (`modal-backdrop` + `app-dialog`), ported from app/src/routes/thread.tsx. */
export function ThreadModal({ onClose, children }: { onClose: () => void; children: (titleId: string) => ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
        <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={onClose}><X /></Button>
        {children(titleId)}
      </section>
    </div>
  );
}

export function ModalError({ message }: { message: string }) {
  return message ? <div role="alert" className="mt-4 text-sm text-destructive">{message}</div> : null;
}
