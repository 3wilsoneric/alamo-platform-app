import { readPlatformSnapshot } from "./platform-snapshot.mjs";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";

const FACILITIES = new Set(ALAMO_FACILITIES.map((row) => row.facilityId));
const COUNTS = ["scheduled_count", "given_count", "not_given_count", "pending_count", "missed_count", "late_given_count", "refused_count", "held_count", "other_not_given_count", "prn_given_count"];
const emptyCounts = () => Object.fromEntries(COUNTS.map((key) => [key, 0]));
const count = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const validCount = (value) => Number.isSafeInteger(Number(value)) && Number(value) >= 0;
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const isoDay = (value) => new Date(value).toISOString().slice(0, 10);
const daysAgo = (asOf, days) => isoDay(Date.parse(`${asOf}T00:00:00Z`) - (days - 1) * 86_400_000);
const sumInto = (target, source) => { for (const key of COUNTS) target[key] += count(source[key]); return target; };

// Only portfolio aggregates cross this boundary. No resident, medication, order,
// administration, or narrative fields from the protected snapshot are returned.
export function buildMedroomDashboard(snapshot) {
  const asOf = snapshot?.snapshot?.as_of_date;
  const tool = snapshot?.reportsSummary?.toolContext;
  const manifest = tool?.manifest ?? [];
  const tables = tool?.tables ?? {};
  const dailyManifest = manifest.find((row) => row.slice_name === "mar_daily_by_community_90d");
  const rawDaily = tables.mar_daily_by_community_90d;
  const dailyKeys = new Set();
  const dailyAvailable = Boolean(validDate(asOf) && Array.isArray(rawDaily) && dailyManifest &&
    count(dailyManifest.row_count) === rawDaily.length && rawDaily.every((row) => {
      const key = `${row.facility_id}|${row.administration_date}`;
      if (!FACILITIES.has(String(row.facility_id)) || !validDate(row.administration_date) || row.administration_date > asOf ||
          row.administration_date < daysAgo(asOf, 90) || dailyKeys.has(key) || !COUNTS.every((field) => validCount(row[field])) ||
          count(row.given_count) + count(row.not_given_count) + count(row.pending_count) !== count(row.scheduled_count) ||
          count(row.missed_count) > count(row.not_given_count)) return false;
      dailyKeys.add(key);
      return true;
    }));
  const daily = dailyAvailable ? rawDaily : [];
  const latestAdministrationDate = daily.length ? daily.map((row) => row.administration_date).sort().at(-1) : null;
  const windows = Object.fromEntries([7, 30, 60, 90].map((days) => {
    if (!dailyAvailable) return [days, null];
    const from = daysAgo(asOf, days);
    const totals = daily.filter((row) => row.administration_date >= from).reduce(sumInto, emptyCounts());
    return [days, { from, through: asOf, ...totals, completion_pct: totals.scheduled_count ? +(totals.given_count / totals.scheduled_count * 100).toFixed(1) : null }];
  }));
  const month = validDate(asOf) ? asOf.slice(0, 7) : null;
  const currentMonth = dailyAvailable && month ? daily.filter((row) => row.administration_date.startsWith(month)).reduce(sumInto, emptyCounts()) : null;
  const monthlyRows = (snapshot?.reportsSummary?.medicationCompliance ?? []).filter((row) => row.month_bucket === month && FACILITIES.has(String(row.facility_id)));
  const monthlyReconciliation = currentMonth && monthlyRows.length === FACILITIES.size ? {
    matches: monthlyRows.reduce((sum, row) => sum + count(row.total_scheduled), 0) === currentMonth.scheduled_count &&
      monthlyRows.reduce((sum, row) => sum + count(row.given), 0) === currentMonth.given_count,
    monthly_scheduled: monthlyRows.reduce((sum, row) => sum + count(row.total_scheduled), 0),
    daily_scheduled: currentMonth.scheduled_count,
    monthly_given: monthlyRows.reduce((sum, row) => sum + count(row.given), 0),
    daily_given: currentMonth.given_count
  } : null;
  const communityMonth = ALAMO_FACILITIES.map((facility) => {
    const rows = daily.filter((row) => String(row.facility_id) === facility.facilityId && row.administration_date.startsWith(month ?? ""));
    const totals = dailyAvailable ? rows.reduce(sumInto, emptyCounts()) : null;
    return { facility_id: facility.facilityId, name: facility.shortName, ...totals,
      completion_pct: totals?.scheduled_count ? +(totals.given_count / totals.scheduled_count * 100).toFixed(1) : null };
  });

  const prnManifest = manifest.find((row) => row.slice_name === "mar_prn_effectiveness_90d");
  const prn = Array.isArray(tables.mar_prn_effectiveness_90d) && prnManifest &&
    count(prnManifest.row_count) === tables.mar_prn_effectiveness_90d.length
    ? tables.mar_prn_effectiveness_90d : null;
  const prnFollowup = prn && month ? {
    administrations: prn.filter((row) => String(row.administration_date).startsWith(month)).length,
    documented: prn.filter((row) => String(row.administration_date).startsWith(month) && row.has_effectiveness_followup === true).length
  } : null;

  const orderManifest = manifest.find((row) => row.slice_name === "mar_medication_orders_current");
  const orders = Array.isArray(tables.mar_medication_orders_current) && orderManifest &&
    count(orderManifest.row_count) === tables.mar_medication_orders_current.length
    ? tables.mar_medication_orders_current : null;
  const seen = new Set();
  const possibleDuplicateOrders = orders && orders.reduce((total, row) => {
    if (!FACILITIES.has(String(row.facility_id)) || !row.resident_id || !row.medication_name || !row.medication_order_id) return total;
    const key = [row.facility_id, row.resident_id, String(row.medication_name).trim().toLowerCase(), String(row.dosage ?? "").trim().toLowerCase(), String(row.route ?? "").trim().toLowerCase(), String(row.schedule ?? "").trim().toLowerCase()].join("|");
    if (seen.has(key)) return total + 1;
    seen.add(key);
    return total;
  }, 0);

  const watch = [];
  if (monthlyReconciliation && !monthlyReconciliation.matches) watch.push({ code: "source_reconciliation", count: 1, label: "Monthly and daily MAR definitions do not reconcile" });
  if (currentMonth?.pending_count) watch.push({ code: "pending_outcome", count: currentMonth.pending_count, label: "Unresolved administration outcomes" });
  if (currentMonth?.late_given_count) watch.push({ code: "late_given", count: currentMonth.late_given_count, label: "Given over 60 minutes late" });
  if (prnFollowup && prnFollowup.administrations > prnFollowup.documented) watch.push({ code: "prn_followup", count: prnFollowup.administrations - prnFollowup.documented, label: "PRN administrations without documented effectiveness follow-up" });
  if (possibleDuplicateOrders) watch.push({ code: "possible_duplicate_order", count: possibleDuplicateOrders, label: "Possible duplicate active orders to verify" });

  return {
    as_of_date: validDate(asOf) ? asOf : null,
    medication_month: month,
    daily_available: Boolean(dailyAvailable),
    latest_administration_date: latestAdministrationDate,
    source_coverage: dailyAvailable ? `${daily.length} community-day rows; ${dailyManifest.row_count} published` : "Daily MAR aggregate has not been published or is incomplete",
    windows,
    current_month: currentMonth,
    monthly_reconciliation: monthlyReconciliation,
    community_month: communityMonth,
    prn_followup: prnFollowup,
    possible_duplicate_orders: possibleDuplicateOrders,
    watch,
    definitions: { late: "Given more than 60 minutes after scheduled time", duplicate: "Matching active orders for one resident, medication, dose, route, and schedule; requires human verification", survey: "No approved survey-readiness rubric", prediction: "No validated prediction model", inventory: "No connected stock/on-hand feed" }
  };
}

export async function getMedroomDashboard() {
  const snapshot = await readPlatformSnapshot();
  if (!snapshot) throw new Error("Governed Platform snapshot unavailable.");
  return buildMedroomDashboard(snapshot);
}
