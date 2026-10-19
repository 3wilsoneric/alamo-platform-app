import { LICENSING_COMMUNITIES } from "./licensing-contracts.mjs";

// Small, explicit query vocabulary; the result is document retrieval, not an AI opinion.
export function licensingSearchPlan(question) {
  let remaining = question.toLowerCase().replace(/[?.,!]/g, " ");
  remaining = remaining.replace(/\bnot substantiated\b/g, "unsubstantiated");
  const noDeficienciesOnly = /\bno deficiencies\b/.test(remaining);
  remaining = remaining.replace(/\bno deficiencies\b/g, " ").replace(/\bfollow[ -]?up\b/g, "corrections");
  const community = LICENSING_COMMUNITIES.find((c) => remaining.includes(c.name.toLowerCase()) || remaining.includes(c.licenseNumber) || (c.facilityId === "343" && /\bjcwh\b/.test(remaining)));
  if (community) remaining = remaining.replace(community.name.toLowerCase(), " ").replace(community.licenseNumber, " ").replace(/\bjcwh\b/g, " ");
  let outcome = "";
  const finding = remaining.match(/\b(unsubstantiated|substantiated|unfounded|inconclusive)\b/);
  if (finding) { outcome = finding[1][0].toUpperCase() + finding[1].slice(1); remaining = remaining.replace(finding[0], " "); }
  const citationsOnly = /\b(citations?|cited|deficiencies|violations?)\b/.test(remaining);
  const correctionsOnly = /\b(corrections?|pocs?)\b/.test(remaining);
  const year = remaining.match(/\b20\d{2}\b/)?.[0] ?? "";
  if (year) remaining = remaining.replace(year, " ");
  remaining = remaining.replace(/\b(show|find|search|tell|me|about|what|which|were|was|are|is|the|a|an|any|all|reports?|at|in|on|for|from|with|and|of|issues?|findings?|complaints?|please|citations?|cited|deficiencies|violations?|plans?|corrections?|pocs?)\b/g, " ");
  const terms = remaining.split(/\s+/).filter(Boolean).map((term) => term.replace(/s$/, ""));
  return { community: community?.facilityId ?? "", outcome, citationsOnly, correctionsOnly, noDeficienciesOnly, year, terms };
}
