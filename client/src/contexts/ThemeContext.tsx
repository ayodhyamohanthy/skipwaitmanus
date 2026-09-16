import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

/**
 * Shared with the pre-paint script in `client/index.html`. They MUST agree: the
 * script reads this key to restore an explicit choice, and this provider writes
 * it. A mismatch was half of why dark mode never worked.
 */
export const THEME_STORAGE_KEY = "skipwait-theme";

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    // The pre-paint script has already resolved the theme and put `.dark` on
    // <html>. Read THAT first. Initialising to `defaultTheme` unconditionally
    // meant the mount effect immediately ran classList.remove("dark"), stripping
    // the class the script had just added — so dark mode could never appear,
    // whatever the system preference said.
    if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) return "dark";
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "dark" || stored === "light") return stored;
    } catch {
      // Private mode / storage disabled: fall through to the default.
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    // Deliberately NOT persisted here. Writing on mount would freeze the theme at
    // whatever the system preference happened to be on first load. Persistence
    // belongs to an explicit toggle, so the system preference keeps working until
    // the user actually chooses.
  }, [theme]);

  // Follow live system changes while the user has expressed no preference.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      } catch {
        // Storage unavailable: treat as no explicit choice.
      }
      setTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = switchable
    ? () => {
        setTheme(prev => {
          const next = prev === "light" ? "dark" : "light";
          try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
          } catch {
            // Private mode: the toggle still applies for this session.
          }
          return next;
        });
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
