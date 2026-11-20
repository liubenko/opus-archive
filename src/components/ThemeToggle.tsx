"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    try {
      localStorage.setItem("opus-theme", nextDark ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#191714] text-stone-700 dark:text-[#d4af6a] hover:bg-stone-100 dark:hover:bg-[#24201b] transition-colors cursor-pointer"
    >
      {mounted ? (
        isDark ? (
          <Sun className="w-4 h-4" />
        ) : (
          <Moon className="w-4 h-4" />
        )
      ) : (
        <Sun className="w-4 h-4 opacity-70" />
      )}
    </button>
  );
}
