import { searchIndex } from "./searchIndex";
import type { SearchEntry, SearchEntryType, SearchResultGroup } from "./types";

const groupOrder: SearchEntryType[] = [
  "page",
  "community",
  "report",
  "definition",
  "saved-view",
  "admin",
  "document"
];

const groupLabels: Record<SearchEntryType, string> = {
  page: "Pages",
  community: "Communities",
  report: "Reports",
  definition: "Definitions",
  "saved-view": "Saved Views",
  admin: "Admin",
  document: "Documents"
};

function scoreEntry(entry: SearchEntry, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const title = entry.title.toLowerCase();
  const subtitle = entry.subtitle?.toLowerCase() || "";
  const keywords = entry.keywords.map((keyword) => keyword.toLowerCase());
  const tags = (entry.tags || []).map((tag) => tag.toLowerCase());

  let score = entry.rank || 0;

  if (title === normalizedQuery) score += 1000;
  else if (title.startsWith(normalizedQuery)) score += 700;
  else if (title.includes(normalizedQuery)) score += 500;

  if (subtitle.includes(normalizedQuery)) score += 180;

  keywords.forEach((keyword) => {
    if (keyword === normalizedQuery) score += 420;
    else if (keyword.startsWith(normalizedQuery)) score += 240;
    else if (keyword.includes(normalizedQuery)) score += 120;
  });

  tags.forEach((tag) => {
    if (tag.includes(normalizedQuery)) score += 70;
  });

  return score;
}

export function searchEntries(query: string) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  return searchIndex
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, normalizedQuery)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry);
}

export function getGroupedSearchResults(query: string, limitPerGroup = 4): SearchResultGroup[] {
  const results = searchEntries(query);
  const grouped = new Map<SearchEntryType, SearchEntry[]>();

  results.forEach((result) => {
    const existing = grouped.get(result.type) || [];
    if (existing.length < limitPerGroup) {
      grouped.set(result.type, [...existing, result]);
    }
  });

  return groupOrder
    .filter((type) => grouped.has(type))
    .map((type) => ({
      type,
      label: groupLabels[type],
      results: grouped.get(type) || []
    }));
}

export function getTopSearchResult(query: string) {
  return searchEntries(query)[0] || null;
}
