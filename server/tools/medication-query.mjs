export function createMedicationQueryTools({ normalizeText }) {
  const MEDICATION_QUERY_STOPWORDS = new Set([
    "about",
    "against",
    "breakdown",
    "community",
    "communities",
    "compare",
    "count",
    "counts",
    "did",
    "does",
    "for",
    "from",
    "give",
    "given",
    "had",
    "have",
    "how",
    "many",
    "med",
    "medication",
    "medications",
    "meds",
    "month",
    "most",
    "not",
    "refusal",
    "refusals",
    "refused",
    "show",
    "summary",
    "the",
    "top",
    "total",
    "what",
    "which",
    "with"
  ]);

  const MEDICATION_UNIT_TOKENS = new Set([
    "caps",
    "chew",
    "dose",
    "liqd",
    "mcg",
    "misc",
    "oral",
    "pack",
    "powd",
    "soln",
    "susp",
    "tabs",
    "tb24",
    "tbdp",
    "unit"
  ]);

  function normalizeMedicationName(value) {
    return normalizeText(value)
      .replace(/\b\d+(?:\s+\d+)?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getMedicationTokens(value) {
    return normalizeMedicationName(value)
      .split(" ")
      .filter((token) => token.length >= 4 && !MEDICATION_UNIT_TOKENS.has(token));
  }

  function medicationMatches(row, medicationName) {
    if (!medicationName) return true;
    return normalizeMedicationName(row.medication) === normalizeMedicationName(medicationName);
  }

  function getRequestedMedicationName(content, rows = []) {
    const text = normalizeText(content);
    const medicationNames = [...new Set(rows.map((row) => row.medication).filter(Boolean))];
    const directTokenMatches = medicationNames
      .map((medication) => ({
        medication,
        tokens: getMedicationTokens(medication).filter((token) => token.length >= 6 && text.includes(token))
      }))
      .filter((candidate) => candidate.tokens.length > 0)
      .sort((left, right) => right.tokens.join("").length - left.tokens.join("").length);
    if (directTokenMatches.length === 1 || directTokenMatches[0]?.tokens.join(" ") !== directTokenMatches[1]?.tokens.join(" ")) {
      return directTokenMatches[0]?.medication ?? null;
    }

    const queryTokens = text
      .split(" ")
      .filter((token) => token.length >= 4 && !MEDICATION_QUERY_STOPWORDS.has(token) && !MEDICATION_UNIT_TOKENS.has(token));
    if (!queryTokens.length) return null;

    const candidates = medicationNames
      .map((medication) => {
        const normalizedMedication = normalizeMedicationName(medication);
        const medicationTokens = getMedicationTokens(medication);
        const exactPhrase = normalizedMedication.length >= 4 && text.includes(normalizedMedication);
        const matchedTokens = medicationTokens.filter((token) => queryTokens.includes(token));
        const strongSingleToken = matchedTokens.some((token) => token.length >= 6);
        const score = (exactPhrase ? 100 : 0) + matchedTokens.length * 10 + (strongSingleToken ? 5 : 0);
        return {
          medication,
          normalizedMedication,
          score,
          matchedTokens
        };
      })
      .filter((candidate) => candidate.score >= 10 && (candidate.matchedTokens.length >= 2 || candidate.matchedTokens.some((token) => token.length >= 6)))
      .sort((left, right) => right.score - left.score || left.normalizedMedication.length - right.normalizedMedication.length);

    const best = candidates[0];
    const second = candidates[1];
    if (!best) return null;
    if (second && best.score === second.score && best.normalizedMedication !== second.normalizedMedication) return null;
    return best.medication;
  }

  return {
    medicationMatches,
    getRequestedMedicationName
  };
}
