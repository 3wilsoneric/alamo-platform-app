import {
  createContext,
  useEffect,
  useMemo,
  type PropsWithChildren
} from "react";

type ThemeMode = "light";

type ThemeContextValue = {
  mode: ThemeMode;
  effectiveTheme: "light";
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const mode: ThemeMode = "light";
  const effectiveTheme: "light" = "light";

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
  }, [effectiveTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      effectiveTheme,
      setMode: () => undefined
    }),
    [mode, effectiveTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
