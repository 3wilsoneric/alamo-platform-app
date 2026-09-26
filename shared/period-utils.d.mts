export function formatMonthLabel(
  value: string | null | undefined,
  options?: {
    fallback?: string;
    month?: "numeric" | "2-digit" | "long" | "short" | "narrow";
  }
): string;

export function findClosestMonthWindow(requestedMonths?: string[], availableMonths?: string[]): string[];

export function parseRequestedMonthBuckets(content: string, availableMonths?: string[]): string[];
