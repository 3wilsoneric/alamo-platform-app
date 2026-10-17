import type { LicensingEvidence } from "./licensing-analysis.mjs";
export interface LicensingReadingBlock { kind: "heading" | "paragraph" | "list-item"; text: string }
export interface LicensingReadingPage { page: number | null; blocks: LicensingReadingBlock[] }
export function licensingReadingBlocks(text: string): LicensingReadingBlock[];
export function licensingReadingPages(narratives: LicensingEvidence[]): LicensingReadingPage[];
