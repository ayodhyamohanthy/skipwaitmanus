// D-093.picker (packet docs/plans/D-093-language.md §5.4): the endonym language picker.
// No flags, no country names, no icon-only control; each option carries its own `lang` attribute so the
// browser renders the endonym in its own script. It renders nothing while fewer than two languages are
// visible ("unreviewed languages stay hidden", D-093), so today it is invisible in production by design.
import { useAuth } from "@/_core/auth";
import { useLanguage, setLanguage } from "@/lib/i18n";
import { visibleLanguages, type LanguageCode } from "@shared/languages";

const CONTROL = "min-h-11 rounded-g-tile border border-g-hairline bg-g-surface px-3 text-g-small text-g-ink";

/**
 * D-093.picker (packet §5.4, C5): the footnote is conditional. While English is the only visible language it
 * says exactly that and that only currency follows the device; it never claims the language follows the device
 * or that the reader can choose one, and it promises no future languages. With two or more visible languages it
 * says the language follows the reader's choice while currency still follows the device.
 */
export function regionFootnote(languageCount: number): string {
  if (languageCount >= 2) return "Language follows your choice. Currency follows this device. Dates and times in your requests and alerts use your time zone and date format.";
  return "English is the language available today. Currency follows this device. Dates and times in your requests and alerts use your time zone and date format.";
}

type Props = { variant?: "bar" | "settings"; className?: string };

/** Saves the choice to the account when signed in; the device copy is written by `setLanguage`. Best effort. */
function saveToAccount(code: LanguageCode, signedIn: boolean, getToken: () => Promise<string | null>) {
  if (!signedIn) return;
  void (async () => {
    try {
      const token = await getToken();
      await fetch("/api/account/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ language: code }),
      });
    } catch {
      /* the device keeps the choice; the account catches up on the next mount */
    }
  })();
}

export function GoalLanguagePicker({ variant = "bar", className }: Props) {
  const active = useLanguage();
  const { isSignedIn, getToken } = useAuth();
  const languages = visibleLanguages();
  if (languages.length < 2) return null;
  const choose = (value: string) => {
    const code = languages.find(entry => entry.code === value)?.code as LanguageCode | undefined;
    if (!code) return;
    setLanguage(code);
    saveToAccount(code, Boolean(isSignedIn), getToken);
  };
  const options = languages.map(entry => (
    <option key={entry.code} value={entry.code} lang={entry.code} dir={entry.dir}>
      {entry.endonym}
    </option>
  ));
  if (variant === "settings") {
    return (
      <label className={`block text-g-label text-g-ink ${className ?? ""}`}>
        Language
        <select aria-label="Language" className={`${CONTROL} mt-1 w-full`} value={active} onChange={event => choose(event.target.value)}>
          {options}
        </select>
      </label>
    );
  }
  return (
    <select aria-label="Language" className={`${CONTROL} ${className ?? ""}`} value={active} onChange={event => choose(event.target.value)}>
      {options}
    </select>
  );
}
