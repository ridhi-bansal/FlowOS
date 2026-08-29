"use client";

import { useEffect } from "react";
import { getStoredTheme, applyTheme } from "@/lib/services/themeService";

export function ThemeInit() {
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);
  return null;
}
