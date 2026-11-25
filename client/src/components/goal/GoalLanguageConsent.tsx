// D-093.picker (packet §5.4): the one-time consent line. It appears only when the device's primary language
// is visible, differs from the active language, and nothing is stored for this device. It never navigates and
// never changes the URL (D-093: "never a silent redirect"); both buttons store the decision for this device.
import { useEffect, useState } from "react";
import { resolveDeviceLocale, type DeviceLocaleSource } from "@/lib/device";
import { setLanguage, useLanguage } from "@/lib/i18n";
import { isVisibleLanguage, signupLanguageOf, visibleLanguages, type LanguageCode } from "@shared/languages";

export const LANGUAGE_CONSENT_STORAGE_KEY = "sw:language-consent";

function storedDecision(): boolean {
  try {
    return Boolean(globalThis.localStorage?.getItem(LANGUAGE_CONSENT_STORAGE_KEY));
  } catch {
    return true;
  }
}

function remember() {
  try {
    globalThis.localStorage?.setItem(LANGUAGE_CONSENT_STORAGE_KEY, "1");
  } catch {
    /* storage unavailable: the line stays dismissed for this mount only */
  }
}

/** The endonym of the language the device asks for, or null when it is not a visible language. */
export function consentLanguage(active: LanguageCode, device: string | null): { code: LanguageCode; endonym: string } | null {
  const primary = signupLanguageOf(device);
  if (!primary || !isVisibleLanguage(primary)) return null;
  const entry = visibleLanguages().find(language => language.code === primary);
  if (!entry || entry.code === active) return null;
  return { code: entry.code, endonym: entry.endonym };
}

type Props = { deviceLanguages?: readonly string[] };

export function GoalLanguageConsent({ deviceLanguages }: Props) {
  const active = useLanguage();
  const [dismissed, setDismissed] = useState(() => storedDecision());
  const [pending, setPending] = useState<{ code: LanguageCode; endonym: string } | null>(null);

  useEffect(() => {
    if (dismissed) return;
    const source = deviceLanguages ? ({ languages: deviceLanguages } as DeviceLocaleSource) : (globalThis.navigator as unknown as DeviceLocaleSource);
    setPending(consentLanguage(active, resolveDeviceLocale(source)));
  }, [active, deviceLanguages, dismissed]);

  if (dismissed || !pending) return null;
  const current = visibleLanguages().find(language => language.code === active)?.endonym ?? "English";
  const close = () => { remember(); setDismissed(true); };
  return (
    <div role="region" aria-label="Language suggestion" className="mx-4 my-3 flex flex-wrap items-center gap-3 border border-g-hairline bg-g-surface px-4 py-3 text-g-small text-g-ink">
      <p className="min-w-0 flex-1">
        <span lang={pending.code}>Use skipwait.me in {pending.endonym}?</span>
      </p>
      <button
        type="button"
        className="min-h-11 text-g-label font-semibold text-g-ink underline decoration-g-control-edge underline-offset-[3px]"
        onClick={() => { setLanguage(pending.code); close(); }}
      >
        Switch
      </button>
      <button type="button" className="min-h-11 text-g-label text-g-ink-2" onClick={close}>
        Keep {current}
      </button>
    </div>
  );
}
