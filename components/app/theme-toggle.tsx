"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  useEffect(() => {
    const saved = localStorage.getItem("farmhack-theme");
    const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  }, []);
  function toggle() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("farmhack-theme", dark ? "dark" : "light");
  }
  return <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle light and dark theme" title="Toggle light and dark theme"><Moon className="size-4 dark:hidden" /><Sun className="hidden size-4 dark:block" /></Button>;
}
