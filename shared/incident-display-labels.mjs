// Presentation-only vocabulary. Source categories and incident types remain
// unchanged for filtering, exports, original reports, and audit evidence.
export function displayIncidentLabel(value) {
  if (value == null) return value;
  return String(value)
    .replace(/\b(?:medication|med) refusal\b/gi, "Passed on meds")
    .replace(/\baggressive behavio(?:u)?r\b/gi, "Difficult interaction");
}
