export function formatExecutiveNumber(value: number | null | undefined, suffix = "") {
  return value == null ? "—" : `${new Intl.NumberFormat("en-US").format(value)}${suffix}`;
}

export function formatExecutiveDate(value: string | null, withTime = false) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {})
  }).format(date);
}
