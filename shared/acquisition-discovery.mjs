function serviceText(record, ...codes) {
  return codes.flatMap((code) => record.services?.[code] || []).join("; ");
}

export function screenAcquisitionDirectoryFacility(record) {
  const operation = serviceText(record, "FOP").toLowerCase();
  const settings = serviceText(record, "SET", "FT").toLowerCase();
  const ages = serviceText(record, "AGE").toLowerCase();
  const clinical = serviceText(record, "TC", "SG", "TAP", "EMS", "AS").toLowerCase();
  const ownershipAmbiguous = operation.includes("for-profit/non-profit") || !operation;
  const privateForProfit = !ownershipAmbiguous && operation.includes("private for-profit");
  const nonprofit = /private non.?profit/.test(operation);
  const government = operation.includes("government") || operation.includes("department of veterans affairs");
  const residential = settings.includes("residential");
  const adult = /(^|; )adults(;|$)/.test(ages) || ages.includes("young adults") || ages.includes("seniors");
  const youth = ages.includes("children") || ages.includes("adolescents");
  const youthOnly = youth && !adult;
  const mentalHealth = record.typeFacilities?.includes("MH") || clinical.includes("mental health");
  const substanceUse = record.typeFacilities?.includes("SA") || clinical.includes("substance use");
  const coOccurring = clinical.includes("co-occurring") || clinical.includes("integrated mental");
  const seriousMentalIllness = clinical.includes("serious mental illness") || clinical.includes("smi");
  const crisis = clinical.includes("crisis");
  const hardExcluded = nonprofit || government || youthOnly;
  let disposition = "exclude";
  if (!hardExcluded && privateForProfit && residential && adult && (mentalHealth || coOccurring)) disposition = "include";
  else if (!hardExcluded && residential && (adult || !ages) && (mentalHealth || coOccurring || substanceUse)) disposition = "review";

  const reasons = [];
  if (nonprofit) reasons.push("nonprofit ownership signal");
  if (government) reasons.push("government ownership signal");
  if (youthOnly) reasons.push("youth-only age signal");
  if (!residential) reasons.push("no residential setting signal");
  if (!adult && ages) reasons.push("no adult age signal");
  if (ownershipAmbiguous) reasons.push("ownership requires resolution");
  if (disposition === "include") reasons.push("private for-profit, adult, residential, and mental-health signal");
  if (disposition === "review" && !reasons.length) reasons.push("residential record requires human review");

  const tags = [
    privateForProfit && "private_for_profit_signal",
    ownershipAmbiguous && "ownership_unknown",
    adult && "adult_signal",
    youth && adult && "mixed_age_signal",
    residential && "residential_signal",
    settings.includes("inpatient") && "inpatient_signal",
    mentalHealth && "mental_health_signal",
    substanceUse && "substance_use_signal",
    coOccurring && "co_occurring_signal",
    seriousMentalIllness && "high_acuity_smi_signal",
    seriousMentalIllness && residential && "psychiatric_residential_signal",
    crisis && "crisis_or_subacute_signal",
    substanceUse && !mentalHealth && "sud_primary_signal",
    "license_match_pending",
    "parent_owner_unknown"
  ].filter(Boolean);
  return { disposition, reasons, tags };
}
