export function parseDisplayDate(value: unknown): Date | null;

export function parseDisplayTimestamp(value: unknown): Date | null;

export function normalizeDisplayDateKey(value: unknown): string | null;

export function normalizeDisplayTimestamp(value: unknown): string | null;
export function formatDisplayDate(
  value: unknown,
  options?: { fallback?: string; month?: "short" | "long" | "narrow" | "numeric" | "2-digit" }
): string;
export function formatDisplayDateTime(
  value: unknown,
  options?: { fallback?: string; month?: "short" | "long" | "narrow" | "numeric" | "2-digit" }
): string;
export function cleanDisplayDateText(value: unknown): string;
