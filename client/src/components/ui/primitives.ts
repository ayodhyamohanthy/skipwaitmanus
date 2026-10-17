/**
 * src/components/ui/primitives.tsx
 * SkipWait Kinetic · UI Primitives
 */
import {forwardRef, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode} from "react";
import { createPortal } from "react-dom";

export type ClassValue = string | false | null | undefined;
export function cx(...values: ClassValue[]): string { return values.filter(Boolean).join(" "); }

export interface SvgIconProps { className?: string; strokeWidth?: number; children: ReactNode; }
export function SvgIcon({ className, strokeWidth = 2, children }: SvgIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cx("shrink-0", className)}>
      {children}
    </svg>
  );
}

export interface IconProps { className?: string; }
export function CheckIcon({ className }: IconProps) { return <SvgIcon className={className} strokeWidth={2.5}><path d="M20 6 9 17l-5-5" /></SvgIcon>; }
export function ClockIcon({ className }: IconProps) { return <SvgIcon className={className}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></SvgIcon>; }
export function TimerIcon({ className }: IconProps) { return <SvgIcon className={className}><path d="M10 2h4" /><path d="m12 14 3-3" /><circle cx="12" cy="14" r="8" /></SvgIcon>; }
export function XIcon({ className }: IconProps) { return <SvgIcon className={className}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></SvgIcon>; }
export function ChevronDownIcon({ className }: IconProps) { return <SvgIcon className={className}><path d="m6 9 6 6 6-6" /></SvgIcon>; }

export type ButtonSize = "md" | "lg";
const BUTTON_LAYOUT = "inline-flex min-w-0 select-none items-center justify-center gap-2 whitespace-nowrap transition-colors duration-150 ease-standard";
const BUTTON_SIZE: Record<ButtonSize, string> = { md: "min-h-11 px-5 text-label-ui", lg: "min-h-12 px-6 text-body-primary" };
const PRIMARY_SURFACE = "bg-action font-semibold text-ink-inverse hover:bg-action-hover active:bg-action-pressed disabled:cursor-not-allowed disabled:bg-action-disabled disabled:text-ink-disabled";
const SECONDARY_SURFACE = "bg-transparent font-medium text-ink-muted hover:bg-surface-hover hover:text-ink active:bg-surface-pressed disabled:cursor-not-allowed disabled:text-ink-disabled";

export interface KineticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const PrimaryButton = forwardRef<HTMLButtonElement, KineticButtonProps>(function PrimaryButton({ size = "md", fullWidth = false, loading, loadingLabel, leadingIcon, trailingIcon, className, children, ...rest }, ref) {
  return (
    <button ref={ref} {...rest} className={cx(BUTTON_LAYOUT, BUTTON_SIZE[size], PRIMARY_SURFACE, "rounded-control", fullWidth && "w-full", className)}>
      {loading ? <span className="animate-spin">⏳</span> : leadingIcon}
      <span className="truncate">{loading && loadingLabel ? loadingLabel : children}</span>
      {!loading && trailingIcon}
    </button>
  );
});

export const SecondaryButton = forwardRef<HTMLButtonElement, KineticButtonProps>(function SecondaryButton({ size = "md", fullWidth = false, loading, loadingLabel, leadingIcon, trailingIcon, className, children, ...rest }, ref) {
  return (
    <button ref={ref} {...rest} className={cx(BUTTON_LAYOUT, BUTTON_SIZE[size], SECONDARY_SURFACE, "rounded-control", fullWidth && "w-full", className)}>
      {leadingIcon}
      <span className="truncate">{loading && loadingLabel ? loadingLabel : children}</span>
      {trailingIcon}
    </button>
  );
});

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  selected?: boolean;
  count?: number;
  leadingIcon?: ReactNode;
}
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip({ label, selected, count, leadingIcon, className, ...rest }, ref) {
  return (
    <button ref={ref} {...rest} aria-pressed={selected} className={cx("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-label-ui transition-colors", selected ? "border-hairline-strong bg-surface-selected text-ink" : "border-hairline bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink", className)}>
      {selected ? <CheckIcon className="size-4" /> : leadingIcon}
      <span>{label}</span>
      {count !== undefined && <span className="type-mono-data text-ink-subtle">{count}</span>}
    </button>
  );
});

export interface SplitActionMenuItem { id: string; label: string; onSelect: () => void; tone?: "neutral" | "critical"; disabled?: boolean; }
export interface SplitActionButtonProps {
  label: string;
  onAction: () => void;
  menuItems: readonly SplitActionMenuItem[];
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
}
export function SplitActionButton({ label, onAction, menuItems, loading, loadingLabel, disabled, fullWidth, className }: SplitActionButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx("relative inline-flex", fullWidth && "w-full flex")} >
      <PrimaryButton onClick={onAction} disabled={disabled} loading={loading} loadingLabel={loadingLabel} fullWidth={fullWidth} className={cx("rounded-r-none", fullWidth && "flex-1")}>
        {label}
      </PrimaryButton>
      <button type="button" onClick={() => setOpen(!open)} disabled={disabled} className="bg-action text-ink-inverse px-3 rounded-r-control hover:bg-action-hover border-l border-white/20">
        <ChevronDownIcon className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 min-w-56 rounded-card border border-hairline bg-surface p-1 shadow-popover z-20">
          {menuItems.map((item) => (
            <button key={item.id} onClick={() => { setOpen(false); item.onSelect(); }} className="flex w-full items-center rounded-control px-3 py-2.5 text-label-ui text-ink hover:bg-surface-hover">
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function VerifiedBadge({ domain, className }: { domain: string; className?: string }) {
  const clean = domain.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (!clean) return null;
  return (
    <span className={cx("inline-flex h-6 items-center gap-1 rounded-full border border-trust-border bg-trust-surface px-2 text-label-ui text-trust-text", className)}>
      <CheckIcon className="size-3.5" />
      <span className="truncate">Verified @{clean}</span>
    </span>
  );
}

export type ReferralStatus = "referred" | "approved" | "pending" | "expiring" | "declined" | "expired";
export function StatusPill({ status, meta, className }: { status: ReferralStatus; meta?: string; className?: string }) {
  const styles: Record<ReferralStatus, string> = {
    referred: "bg-success-surface text-success-text border-success-border",
    approved: "bg-success-surface text-success-text border-success-border",
    pending: "bg-caution-surface text-caution-text border-caution-border",
    expiring: "bg-caution-surface text-caution-text border-caution-border",
    declined: "bg-critical-surface text-critical-text border-critical-border",
    expired: "bg-critical-surface text-critical-text border-critical-border",
  };
  return (
    <span className={cx("inline-flex h-6 items-center gap-1 rounded-full border px-2 text-label-ui capitalize", styles[status], className)}>
      <span>{status}</span>
      {meta && <span className="type-mono-data opacity-75">· {meta}</span>}
    </span>
  );
}

export interface ResponsiveDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footerHint?: string;
  primaryAction?: { label: string; onClick?: () => void; loading?: boolean; loadingLabel?: string; type?: "button" | "submit"; form?: string; };
  secondaryAction?: { label: string; onClick?: () => void; };
}
export function ResponsiveDrawer({ open, onOpenChange, title, description, children, footerHint, primaryAction, secondaryAction }: ResponsiveDrawerProps) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-scrim" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-[480px] bg-surface border-l border-hairline flex flex-col shadow-sheet h-full z-10">
        <div className="p-6 border-b border-hairline flex items-center justify-between">
          <div>
            <h2 className="type-heading-section">{title}</h2>
            {description && <p className="text-body-primary text-ink-muted mt-1">{description}</p>}
          </div>
          <button onClick={() => onOpenChange(false)} className="p-2"><XIcon className="size-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {(primaryAction || secondaryAction) && (
          <div className="p-6 border-t border-hairline bg-surface">
            {footerHint && <p className="mb-3 text-label-ui text-ink-muted">{footerHint}</p>}
            <div className="flex gap-3 justify-end">
              {secondaryAction && <SecondaryButton onClick={secondaryAction.onClick}>{secondaryAction.label}</SecondaryButton>}
              {primaryAction && <PrimaryButton onClick={primaryAction.onClick} loading={primaryAction.loading} loadingLabel={primaryAction.loadingLabel} type={primaryAction.type} form={primaryAction.form}>{primaryAction.label}</PrimaryButton>}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}