import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";
export type Lang = "en" | "ar";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "myndlab:theme";
const LANG_KEY = "myndlab:lang";

function readStored<T extends string>(key: string, fallback: T, valid: T[]): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v && (valid as string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStored("myndlab:theme", "dark", ["dark", "light"]));
  const [lang, setLangState] = useState<Lang>(() => readStored("myndlab:lang", "en", ["en", "ar"]));

  // Reflect theme on the document root so CSS variables can swap.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (theme === "light") root.classList.add("light");
    else root.classList.remove("light");
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  // Reflect language on the document root for future RTL handling.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    try { window.localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggleLang = useCallback(() => setLangState((l) => (l === "en" ? "ar" : "en")), []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, lang, setLang, toggleLang }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Sensible no-op fallback so components rendered outside the provider
    // (e.g. legacy studio shells) still mount cleanly.
    return {
      theme: "dark",
      setTheme: () => {},
      toggleTheme: () => {},
      lang: "en",
      setLang: () => {},
      toggleLang: () => {},
    };
  }
  return ctx;
}
