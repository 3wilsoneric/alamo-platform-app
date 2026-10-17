const MEDICATION_CONTEXT = /\b(?:medication|medications|meds?|mar|emar)\b/i;
const NON_GIVEN_BREAKDOWN = /\b(?:refusal|refusals|refused|not[ -]given|missed|held|hold|late|exceptions?)\b/i;

export function isRetiredMedicationBreakdownRequest(content) {
  const text = String(content ?? "");
  return MEDICATION_CONTEXT.test(text) && NON_GIVEN_BREAKDOWN.test(text);
}

export function isRetiredMedicationCategory(category) {
  return /^(?:medication refusal|med refusal)$/i.test(String(category ?? "").trim());
}
