// GoalSearchInput (find-a-referral.css:15-22): leading search icon, ink caret
// (via .g-scope), 44px (48px phone). Stays usable offline for client-side
// filtering; result loading shows as skeleton rows, never a disabled input.
import { Search } from "lucide-react";

export function GoalSearchInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange(value: string): void; placeholder?: string }) {
  return (
    <div data-testid="goal-search-input" className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-g-ink-3" strokeWidth={1.75} />
      <input
        type="search"
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        className="h-11 w-full rounded-g-control border border-g-control-edge bg-g-surface pl-11 pr-3 text-g-body text-g-ink placeholder:text-g-ink-3 max-gdesk:h-12"
      />
    </div>
  );
}
