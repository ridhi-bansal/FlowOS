"use client";

export type Theme = "light" | "dark";
const THEME_KEY = "flowos.theme.v1";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return (window.localStorage.getItem(THEME_KEY) as Theme) || "light";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_KEY, theme);
}
