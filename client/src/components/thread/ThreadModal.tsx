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
      {/* Never taller than the screen: on a 640–667px phone the seven pass reasons pushed the
          Pass button below the fold with no way to scroll to it. The 105px on mobile covers the
          backdrop padding plus the dialog's 65px clearance above the tab bar (kit.css). */}
      <section className="app-dialog max-h-[calc(100dvh-40px)] overflow-y-auto max-md:max-h-[calc(100dvh-105px)]" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event => event.stopPropagation()}>
        <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={onClose}><X /></Button>
        {children(titleId)}
      </section>
    </div>
  );
}

export function ModalError({ message }: { message: string }) {
  return message ? <div role="alert" className="mt-4 text-sm text-destructive">{message}</div> : null;
}
