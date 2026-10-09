export function formatExecutiveNumber(value: number | null | undefined, suffix = "") {
  return value == null
    ? "—"
    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}${suffix}`;
}

export function formatExecutiveDate(value: string | null, withTime = false) {
  if (!value) return "Not scheduled";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12)
    : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {})
  }).format(date);
}
