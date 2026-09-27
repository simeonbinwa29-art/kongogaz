import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

const THEME_KEY = "bellagaz.theme";

type ThemeCtx = { theme: Theme; toggleTheme: () => void };

const ThemeContext = createContext<ThemeCtx | null>(null);

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return raw === "dark" || raw === "light" ? raw : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    return "dark";
  return "light";
}

/** Applique (ou retire) la classe `dark` sur l'élément racine `<html>`. */
function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = readStoredTheme() ?? systemTheme();
    applyTheme(t);
    return t;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Synchronise le thème entre plusieurs onglets du même navigateur.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && (e.newValue === "dark" || e.newValue === "light")) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        /* stockage indisponible : le thème reste actif pour la session courante */
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeCtx>(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme doit être utilisé sous <ThemeProvider>.");
  return ctx;
}

/**
 * Bouton Soleil / Lune de la barre de navigation supérieure.
 * `className` remplace le style par défaut (taille / forme) : passez
 * par exemple `h-10 w-10 rounded-full` dans l'en-tête client.
 */
export function ThemeToggle({ className = "h-9 w-9 rounded-xl" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}
      title={isDark ? "Mode clair" : "Mode sombre"}
      className={`grid place-items-center bg-white/10 backdrop-blur transition hover:bg-white/20 ${className}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
