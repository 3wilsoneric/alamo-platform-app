import { formatDisplayDate } from './display-date.mjs';
import { formatMonthLabel } from './period-utils.mjs';

// Presentation only: keys, saved evidence, scope and measure bindings stay intact.
const labels = {
  bedDays: 'Occupied bed-days', bed_days: 'Occupied bed-days', occupied_bed_days: 'Occupied bed-days',
  net: 'Net change', operatingCapacity: 'Operating capacity', availableBeds: 'Available beds',
  capacityAsOf: 'Capacity recorded', as_of_date: 'As of', facility_id: 'Community ID',
  Facility: 'Community ID', facility: 'Community ID', FacilityID: 'Community ID', facility_name: 'Community', Facility_Name: 'Community',
  community_name: 'Community', resident_rows: 'Resident records', result: 'Result',
};
const acronyms = new Set(['id', 'prn', 'mar', 'adl', 'ssn', 'dob', 'mrn']);
export function reportColumnLabel(column) {
  const value = column.label?.trim() || column.key.trim();
  // Preserve source-authored wording; normalize labels that still look like keys.
  if (value !== column.key && !/[_]|[a-z\d][A-Z]/.test(value)) return value;
  if (Object.hasOwn(labels, value)) return labels[value];
  return value.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
    .split(/\s+/).map((word, i) => acronyms.has(word.toLowerCase()) ? word.toUpperCase()
      : i === 0 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()).join(' ');
}
export function reportCellValue(value) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-US');
  if (/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) return formatMonthLabel(value, {fallback:value});
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDisplayDate(value, {month:'short',fallback:value}) : value;
}
