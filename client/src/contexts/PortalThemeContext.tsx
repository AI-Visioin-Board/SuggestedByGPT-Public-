/**
 * PortalThemeContext — Light/dark mode toggle for Portal V2.
 * Persists preference in localStorage.
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type PortalMode = "dark" | "light";

interface PortalThemeContextValue {
  mode: PortalMode;
  toggleMode: () => void;
  isDark: boolean;
}

const PortalThemeContext = createContext<PortalThemeContextValue>({
  mode: "dark",
  toggleMode: () => {},
  isDark: true,
});

const STORAGE_KEY = "portal-theme-mode";

export function PortalThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PortalMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return "dark"; // default
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, [mode]);

  const toggleMode = () => setMode((m) => (m === "dark" ? "light" : "dark"));
  const isDark = mode === "dark";

  return (
    <PortalThemeContext.Provider value={{ mode, toggleMode, isDark }}>
      {children}
    </PortalThemeContext.Provider>
  );
}

export function usePortalTheme() {
  return useContext(PortalThemeContext);
}
