// Custom-link sheet opened from the /work owner card (kit v4 work.tsx shows
// the public link there). Saves profiles.handle through the partial
// PUT /api/profile/me; visibility stays on the /p/:handle owner panel.
import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/kit/button";

export function ProfileLinkSheet({ current, busy, error, onClose, onSubmit }: {
  current: string | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (handle: string) => void;
}) {
  const [handle, setHandle] = useState(current ?? "");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="app-dialog work-sheet" role="dialog" aria-modal="true" aria-label="Profile link" onClick={event => event.stopPropagation()}>
        <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={onClose}><X /></Button>
        <span className="eyebrow">YOUR PUBLIC PAGE</span><h2>{current ? "Change your profile link" : "Choose your profile link"}</h2>
        <label>Profile link
          <span className="flex items-center gap-2">
            <span className="shrink-0 font-normal text-muted-foreground">skipwait.me/p/</span>
            <input autoFocus value={handle} maxLength={40} onChange={event => setHandle(event.target.value)} placeholder="yourname" />
          </span>
          <small className="font-normal text-muted-foreground">3–40 lowercase letters, numbers, or dashes. Choose who can see the page on the page itself.</small>
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <Button className="brand-button" disabled={busy || handle.trim() === ""} onClick={() => onSubmit(handle.trim().toLowerCase())}>{busy ? "Saving…" : "Save link"}<ArrowRight /></Button>
      </div>
    </div>
  );
}
