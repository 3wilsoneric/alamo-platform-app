export type SearchEntryType =
  | "page"
  | "community"
  | "report"
  | "definition"
  | "saved-view"
  | "admin"
  | "document";

export interface SearchEntry {
  id: string;
  type: SearchEntryType;
  title: string;
  subtitle?: string;
  keywords: string[];
  route?: string;
  tags?: string[];
  rank?: number;
}

export interface SearchResultGroup {
  label: string;
  type: SearchEntryType;
  results: SearchEntry[];
}
