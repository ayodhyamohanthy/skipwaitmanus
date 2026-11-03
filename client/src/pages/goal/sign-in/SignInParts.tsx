// Small pieces both goal sign-in forms share: the dot-and-text "code sent"
// status, the input error line and the "Not you?" control (D-048-p3-signin).
import { CircleAlert } from "lucide-react";

/** Status is a dot plus text (DESIGN.md rule 5); ink, because nothing has gone wrong or ended. */
export function CodeSentLine({ email }: { email: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-g-meta text-g-ink">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-g-ink" />
      <span className="min-w-0 break-words">Code sent to {email}</span>
    </p>
  );
}

/** Input errors are crimson text with an icon, announced as they appear; the words are the server's when it sent any. */
export function FieldError({ id, message }: { id: string; message: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="-mt-2 flex items-start gap-2 text-g-meta text-g-crimson">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
      <span>{message}</span>
    </p>
  );
}

/** The device remembered this address (FIX-device-signin); one tap forgets it. */
export function ForgetEmail({ onForget }: { onForget: () => void }) {
  return (
    <button type="button" onClick={onForget}
      className="-mt-2 justify-self-start text-g-meta text-g-ink-2 underline decoration-g-control-edge underline-offset-[3px] transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink hover:decoration-g-ink">
      Not you? Forget this email
    </button>
  );
}
