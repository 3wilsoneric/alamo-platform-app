const BASE_TERMS = [
  ["january", "january", "month"], ["february", "february", "month"], ["march", "march", "month"],
  ["april", "april", "month"], ["may", "may", "month"], ["june", "june", "month"],
  ["july", "july", "month"], ["august", "august", "month"], ["september", "september", "month"],
  ["october", "october", "month"], ["november", "november", "month"], ["december", "december", "month"],
  ["incidents", "incidents", "metric"], ["incident", "incident", "metric"],
  ["census", "census", "metric"], ["residents", "residents", "metric"], ["resident", "resident", "metric"],
  ["medication", "medication", "metric"], ["compliance", "compliance", "metric"],
  ["refusals", "refusals", "metric"], ["refusal", "refusal", "metric"],
  ["documentation", "documentation", "metric"], ["diagnosis", "diagnosis", "metric"],
  ["community", "community", "dimension"], ["communities", "communities", "dimension"],
  ["category", "category", "dimension"], ["categories", "categories", "dimension"],
  ["monthly", "monthly", "dimension"], ["breakdown", "breakdown", "command"],
  ["compare", "compare", "command"], ["comparison", "comparison", "command"],
  ["average", "average", "command"], ["highest", "highest", "command"], ["lowest", "lowest", "command"],
  ["trend", "trend", "command"], ["trends", "trends", "command"], ["export", "export", "command"],
  ["risk", "risk", "command"], ["watchlist", "watchlist", "command"],
  ["profile", "profile", "command"], ["search", "search", "command"],
  ["elopement", "elopement", "category"], ["aggressive", "aggressive", "category"],
  ["substance", "substance", "category"], ["emergency", "emergency", "category"]
];

const QUERY_ALIASES = [
  ["incdient", "incident", "metric"], ["incdients", "incidents", "metric"], ["inciidents", "incidents", "metric"],
  ["censis", "census", "metric"], ["censsus", "census", "metric"], ["censs", "census", "metric"],
  ["medcation", "medication", "metric"], ["medciation", "medication", "metric"],
  ["communty", "community", "dimension"], ["comunity", "community", "dimension"], ["comunitys", "communities", "dimension"],
  ["comunities", "communities", "dimension"], ["facilty", "facility", "dimension"], ["faciltiy", "facility", "dimension"],
  ["catagory", "category", "dimension"], ["catagories", "categories", "dimension"],
  ["trnd", "trend", "command"], ["breakdwon", "breakdown", "command"], ["comparision", "comparison", "command"],
  ["emergncy", "emergency", "category"], ["emerency", "emergency", "category"], ["agressive", "aggressive", "category"],
  ["elopment", "elopement", "category"], ["awols", "awol", "category"],
  ["janurary", "january", "month"], ["januarry", "january", "month"],
  ["frebruary", "february", "month"], ["febuary", "february", "month"],
  ["aprill", "april", "month"], ["apirl", "april", "month"],
  ["novemeber", "november", "month"], ["decemeber", "december", "month"]
];

const PHRASE_ALIASES = [
  ["santa clartia", "santa clarita", "community"],
  ["snta clarita", "santa clarita", "community"],
  ["santa claritta", "santa clarita", "community"],
  ["san pabllo", "san pablo", "community"],
  ["sna pablo", "san pablo", "community"],
  ["jc wallce", "jc wallace", "community"],
  ["jc wallas", "jc wallace", "community"],
  ["wallce house", "wallace house", "community"],
  ["victoria place", "victoria's house", "community"],
  ["victoria's place", "victoria's house", "community"],
  ["med refusal", "medication refusal", "category"],
  ["med refusals", "medication refusals", "category"],
  ["medical emergncy", "medical emergency", "category"],
  ["medical emerency", "medical emergency", "category"],
  ["agressive behavior", "aggressive behavior", "category"],
  ["subtance use", "substance use", "category"]
];

const SAFE_SHORT_TOKENS = new Set(["awol", "emar", "census", "may", "fall", "falls"]);
const NATURAL_LANGUAGE_TOKENS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "between", "both", "by", "can", "could", "did", "do", "does",
  "each", "for", "from", "give", "had", "has", "have", "how", "in", "into", "is", "it", "last",
  "latest", "many", "me", "month", "months", "most", "of", "on", "or", "our", "over", "show", "than", "that", "the",
  "their", "then", "this", "through", "to", "versus", "vs", "was", "were", "what", "when", "where", "which",
  "data", "exact", "exactly", "full", "include", "including", "row", "rows", "same",
  "who", "why", "with", "year", "years", "name", "names", "description", "descriptions", "involved",
  "against", "all", "every", "other", "historical", "current", "roster", "house", "list", "total", "totals",
  "went", "people", "person", "client", "clients", "break", "down", "card", "cards"
]);

const DOMAIN_RULES = {
  category: { candidate: 0.74, auto: 0.82 },
  command: { candidate: 0.74, auto: 0.82 },
  community: { candidate: 0.74, auto: 0.84 },
  dimension: { candidate: 0.74, auto: 0.82 },
  metric: { candidate: 0.74, auto: 0.82 },
  month: { candidate: 0.74, auto: 0.82 },
  resident: { candidate: 0.74, auto: 1.01 }
};

export function normalizeQueryText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(leftValue, rightValue) {
  const left = String(leftValue ?? "");
  const right = String(rightValue ?? "");
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, (_, row) => {
    const values = new Array(right.length + 1).fill(0);
    values[0] = row;
    return values;
  });
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
      if (
        row > 1 && column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }

  return matrix[left.length][right.length];
}

export function tokenSimilarity(left, right) {
  const maximumLength = Math.max(String(left).length, String(right).length, 1);
  return 1 - editDistance(left, right) / maximumLength;
}

function termFromEntry(entry) {
  if (Array.isArray(entry)) {
    const [token, replacement, domain, options = {}] = entry;
    return {
      token: normalizeQueryText(token),
      replacement: normalizeQueryText(replacement),
      domain,
      requiresConfirmation: Boolean(options.requiresConfirmation),
      alias: normalizeQueryText(token) !== normalizeQueryText(replacement)
    };
  }
  const token = normalizeQueryText(entry?.token ?? "");
  const replacement = normalizeQueryText(entry?.replacement ?? token);
  return {
    token,
    replacement,
    domain: entry?.domain ?? "general",
    requiresConfirmation: Boolean(entry?.requiresConfirmation),
    alias: Boolean(entry?.alias ?? token !== replacement)
  };
}

function makeTerms({ communities = [], extraTerms = [] } = {}) {
  const terms = [...BASE_TERMS, ...QUERY_ALIASES, ...extraTerms];
  communities.forEach((community) => {
    const name = normalizeQueryText(community.community_name ?? community.name ?? "");
    if (name) terms.push([name, name, "community"]);
    name.split(" ").filter((token) => token.length >= 3).forEach((token) => {
      terms.push([token, token, "community"]);
    });
    if (/victoria/i.test(name)) {
      terms.push(
        ["victoria", "victoria", "community"],
        ["victorias", "victorias", "community"],
        ["victoria's", "victoria's", "community"]
      );
    }
  });
  const keyed = new Map();
  terms.map(termFromEntry).filter((term) => term.token && term.replacement).forEach((term) => {
    const key = `${term.token}::${term.replacement}::${term.domain}`;
    if (!keyed.has(key)) keyed.set(key, term);
  });
  return [...keyed.values()];
}

function applyPhraseAliases(normalized, corrections) {
  let corrected = normalized;
  PHRASE_ALIASES.map(termFromEntry).forEach((term) => {
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(term.token)}(?=\\s|$)`, "g");
    corrected = corrected.replace(pattern, (match, prefix) => {
      corrections.push({
        original: term.token,
        suggestion: term.replacement,
        alternatives: [term.replacement],
        domain: term.domain,
        kind: "phrase",
        confidence: 1,
        requiresConfirmation: false
      });
      return `${prefix}${term.replacement}`;
    });
  });
  return corrected.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function domainRules(domain) {
  return DOMAIN_RULES[domain] ?? { candidate: 0.74, auto: 0.82 };
}

export function understandQuery(value, options = {}) {
  const normalized = normalizeQueryText(value);
  const terms = makeTerms(options);
  const corrections = [];
  const phraseCorrected = applyPhraseAliases(normalized, corrections);
  const exactAliases = new Map(
    terms
      .filter((term) => term.alias || term.token !== term.replacement)
      .map((term) => [term.token, term])
  );
  const knownTokens = new Set(terms
    .filter((term) => !term.alias && term.token === term.replacement)
    .map((term) => term.token));
  const correctedTokens = phraseCorrected.split(" ").map((token) => {
    const possessiveBase = token.replace(/'s$/, "");
    if (possessiveBase !== token && (knownTokens.has(possessiveBase) || NATURAL_LANGUAGE_TOKENS.has(possessiveBase))) {
      return possessiveBase;
    }

    const exactAlias = exactAliases.get(token);
    if (exactAlias) {
      const requiresConfirmation = exactAlias.requiresConfirmation || exactAlias.domain === "resident";
      corrections.push({
        original: token,
        suggestion: exactAlias.replacement,
        alternatives: [exactAlias.replacement],
        domain: exactAlias.domain,
        kind: "alias",
        confidence: 1,
        requiresConfirmation
      });
      return exactAlias.replacement;
    }

    const allowShortResidentFuzzy = token.length >= 3 && terms.some((term) => term.domain === "resident");
    if (
      !token ||
      knownTokens.has(token) ||
      NATURAL_LANGUAGE_TOKENS.has(token) ||
      /^\d+$/.test(token) ||
      (token.length < 4 && !allowShortResidentFuzzy) ||
      SAFE_SHORT_TOKENS.has(token)
    ) return token;

    const candidates = terms
      .filter((term) => Math.abs(term.token.length - token.length) <= 2 || (term.token.startsWith(token) && token.length >= 4))
      .map((term) => {
        const similarity = tokenSimilarity(token, term.token);
        const prefixSimilarity = term.token.startsWith(token) && token.length >= 4 ? 0.76 : 0;
        return { ...term, similarity: Math.max(similarity, prefixSimilarity) };
      })
      .filter((term) => term.similarity >= domainRules(term.domain).candidate)
      .sort((left, right) => right.similarity - left.similarity);
    const best = candidates[0];
    if (!best) return token;

    const alternatives = [...new Set(candidates
      .filter((candidate) => best.similarity - candidate.similarity < 0.08)
      .map((candidate) => candidate.replacement))]
      .slice(0, 3);
    const isAmbiguous = alternatives.length > 1;
    const requiresConfirmation = isAmbiguous || best.domain === "resident" || best.similarity < domainRules(best.domain).auto;
    corrections.push({
      original: token,
      suggestion: best.replacement,
      alternatives,
      domain: best.domain,
      kind: "fuzzy",
      confidence: Number(best.similarity.toFixed(2)),
      requiresConfirmation
    });
    return best.replacement;
  });

  const correctedText = correctedTokens.join(" ");
  const uncertainCorrections = corrections.filter((correction) => correction.requiresConfirmation);
  return {
    originalText: String(value ?? ""),
    normalizedText: normalized,
    correctedText,
    corrections,
    uncertainCorrections,
    changed: corrections.length > 0,
    requiresConfirmation: uncertainCorrections.length > 0
  };
}
