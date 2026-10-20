import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn/ui utility for merging Tailwind classes without conflicts.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a date string or Date object into standard clinical format:
 * "17 Oct 2026" (Day Month Year).
 * Returns fallback (default "Not set") if date is missing or invalid.
 */
export function formatClinicalDate(
  dateInput: string | Date | null | undefined,
  fallback = "Not set"
): string {
  if (!dateInput) return fallback;
  // If YYYY-MM-DD string, parse parts directly to avoid UTC timezone off-by-one shifts
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return fallback;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Calculates human-readable age of a clinical date (e.g. "5 months ago", "yesterday", "today").
 */
export function getDateAge(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "";
  let date: Date;
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split("-").map(Number);
    date = new Date(year, month - 1, day);
  } else {
    date = typeof dateInput === "string" ? new Date(dateInput) : (dateInput as Date);
  }

  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "in future";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30.4375);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? "s" : ""} ago`;
  const diffYears = Math.floor(diffDays / 365.25);
  return `${diffYears} year${diffYears > 1 ? "s" : ""} ago`;
}

