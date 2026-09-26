export interface QueryCorrection {
  original: string;
  suggestion: string;
  alternatives: string[];
  domain: string;
  kind?: "alias" | "fuzzy" | "phrase";
  confidence: number;
  requiresConfirmation: boolean;
}

export interface QueryUnderstanding {
  originalText: string;
  normalizedText: string;
  correctedText: string;
  corrections: QueryCorrection[];
  uncertainCorrections: QueryCorrection[];
  changed: boolean;
  requiresConfirmation: boolean;
}

export function normalizeQueryText(value: unknown): string;
export function tokenSimilarity(left: string, right: string): number;
export function understandQuery(
  value: unknown,
  options?: {
    communities?: Array<{ community_name?: string; name?: string }>;
    extraTerms?: Array<
      | [string, string, string]
      | [string, string, string, { requiresConfirmation?: boolean }]
      | {
          token: string;
          replacement?: string;
          domain?: string;
          requiresConfirmation?: boolean;
          alias?: boolean;
        }
    >;
  }
): QueryUnderstanding;
