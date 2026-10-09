// Kit v4 "WHO CAN SEE THIS" option cards (app/src/routes/p.$handle.tsx), wired
// to the live profiles.profileVisibility enum. Used by the owner panel on
// /p/:handle and by the /profile form.
import { Globe, Link2, LockKeyhole, type LucideIcon } from "lucide-react";

export type ProfileVisibility = "public" | "link" | "private";

export const VISIBILITY_OPTIONS: ReadonlyArray<readonly [ProfileVisibility, LucideIcon, string, string]> = [
  ["public", Globe, "Public", "Anyone, and search engines"],
  ["link", Link2, "Link only", "People with the link"],
  ["private", LockKeyhole, "Private", "Only referrers you ask"],
];

export function asProfileVisibility(value: string | null | undefined): ProfileVisibility {
  return value === "public" || value === "link" ? value : "private";
}

export function VisibilityOptions({ value, onChange, disabled = false, className = "mt-4 grid gap-2 sm:grid-cols-3" }: {
  value: ProfileVisibility;
  onChange: (next: ProfileVisibility) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className} role="radiogroup" aria-label="Profile visibility">
      {VISIBILITY_OPTIONS.map(([option, Icon, label, hint]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={`flex items-start gap-3 rounded-2xl border p-3 text-left ${value === option ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span><strong className="block text-sm">{label}</strong><small className="text-muted-foreground">{hint}</small></span>
        </button>
      ))}
    </div>
  );
}
