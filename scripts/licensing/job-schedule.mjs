export const LICENSING_SCHEDULE = Object.freeze({
  owner: "platform", timezone: "America/Los_Angeles", cadence: "weekly", weekday: "Monday",
  weekdays: Object.freeze(["Monday", "Wednesday"]), hour: 9
});

function pacificParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: LICENSING_SCHEDULE.timezone, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "numeric", hourCycle: "h23"
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return parts;
}

export function licensingScheduleSlot(date = new Date()) {
  const parts = pacificParts(date);
  if (!LICENSING_SCHEDULE.weekdays.includes(parts.weekday)) return null;
  if (Number(parts.hour) === LICENSING_SCHEDULE.hour) return "primary";
  if (Number(parts.hour) === LICENSING_SCHEDULE.hour + 1) return "retry";
  return null;
}

export function isLicensingScheduledTime(date = new Date()) {
  return licensingScheduleSlot(date) !== null;
}

export function licensingCheckedToday(lastSuccessful, date = new Date()) {
  if (!lastSuccessful || !Number.isFinite(Date.parse(lastSuccessful))) return false;
  const current = pacificParts(date);
  const prior = pacificParts(new Date(lastSuccessful));
  return current.year === prior.year && current.month === prior.month && current.day === prior.day;
}
