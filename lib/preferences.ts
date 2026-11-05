"use client";

import { useSyncExternalStore } from "react";

export const languages = ["English", "Yoruba", "Hausa", "Igbo"] as const;
export type Language = (typeof languages)[number];
const key = "farmhack-language";
const eventName = "farmhack-language-change";
function read(): Language {
  if (typeof window === "undefined") return "English";
  const value = localStorage.getItem(key);
  return languages.find((language) => language === value) ?? "English";
}
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener("storage", callback); };
}
export function usePreferredLanguage() {
  return useSyncExternalStore(subscribe, read, () => "English");
}
export function setPreferredLanguage(value: Language) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event(eventName));
}
