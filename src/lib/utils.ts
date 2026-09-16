import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Defense-in-depth for user-submitted link fields (event url_externo, business
// website) rendered as <a href>: backend already rejects non-http(s) schemes
// on write, this blocks javascript:/data: at render time too.
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const scheme = new URL(url, window.location.origin).protocol;
    return scheme === "http:" || scheme === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
