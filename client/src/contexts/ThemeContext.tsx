import React, { createContext, useContext, useLayoutEffect, useState } from "react";
import { usePathname } from "wouter/use-browser-location";

export type Theme = "light" | "dark";

const STORAGE_KEY = "sw-theme";
// Keep this exact policy in sync with client/index.html. /request redirects to /ask.
const DARK_READY_ROUTES = new Set(["/", "/explore", "/ask", "/requests", "/request"]);

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

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A denied or full storage must not block the in-memory choice.
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const pathname = usePathname();
  const routeSwitchable = switchable && DARK_READY_ROUTES.has(pathname.replace(/\/+$/, "") || "/");
  const [preferredTheme, setPreferredTheme] = useState<Theme>(() =>
    switchable ? readStoredTheme() ?? defaultTheme : defaultTheme,
  );
  const theme: Theme = routeSwitchable ? preferredTheme : "light";

  useLayoutEffect(() => {
    const root = document.documentElement;
    const dark = theme === "dark";
    if (root.classList.contains("dark") === dark) return;
    root.classList.add("g-theme-switching");
    root.classList.toggle("dark", dark);
    // Flush the new colours while only goal transitions are suppressed, then
    // restore hover/focus transitions synchronously before the next paint.
    void root.offsetHeight;
    root.classList.remove("g-theme-switching");
  }, [theme]);

  const toggleTheme = routeSwitchable
    ? () => {
        const next: Theme = theme === "light" ? "dark" : "light";
        writeStoredTheme(next);
        setPreferredTheme(next);
      }
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable: routeSwitchable }}>
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

/** For shared goal chrome that also renders without a provider (menus, previews). */
export function useThemeOptional(): ThemeContextType | null {
  return useContext(ThemeContext) ?? null;
}
