import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ThemeInit } from "@/components/layout/ThemeInit";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowOS — Personal Productivity Operating System",
  description: "A calm, intelligent personal productivity command center.",
};

// Runs before React hydrates, directly in <head>, so a returning dark-mode
// user's screen never flashes light-then-dark on load. ThemeInit.tsx still
// runs afterward too — this script only sets the attribute early; the
// localStorage key it reads must stay in sync with lib/services/themeService.ts.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("flowos.theme.v1");
    document.documentElement.dataset.theme = t === "dark" ? "dark" : "light";
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeInit />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
