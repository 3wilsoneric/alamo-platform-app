import type { PropsWithChildren } from "react";
import { ThemeProvider } from "../../shared/theme/AppTheme";

export function AppProviders({ children }: PropsWithChildren) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
