export const LICENSING_SCHEDULE = Object.freeze({
  owner: "platform", timezone: "America/Los_Angeles", cadence: "weekly", weekday: "Monday",
  weekdays: Object.freeze(["Monday", "Wednesday"]), hour: 9
});

export function isLicensingScheduledTime(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: LICENSING_SCHEDULE.timezone, weekday: "long", hour: "numeric", hourCycle: "h23"
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return LICENSING_SCHEDULE.weekdays.includes(parts.weekday) && Number(parts.hour) === LICENSING_SCHEDULE.hour;
}
