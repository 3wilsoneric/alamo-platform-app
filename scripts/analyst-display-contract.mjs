const ABBREVIATED_MONTH_YEAR_PATTERN = /\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+20\d{2}\b/;
const RAW_ELDERMARK_DATE_PATTERN = /\b\d{1,4}!\d{1,2}!\d{1,4}\b/;
const INTERNAL_DATE_KEY_PATTERN = /\b20\d{2}-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?\b/;

function collectVisualDisplayStrings(visual) {
  if (!visual || typeof visual !== "object") return [];
  return [
    visual.title,
    visual.subtitle,
    visual.valueLabel,
    ...(visual.columns ?? []),
    ...(visual.rows ?? []).flatMap((row) => [
      row?.label,
      row?.meta,
      ...(row?.cells ?? [])
    ])
  ];
}

export function collectUserFacingResultStrings(result) {
  const moduleSpecs = [result?.moduleSpec, ...(result?.moduleSpecs ?? [])].filter(Boolean);
  return [
    result?.text,
    result?.structuredAnswer?.answer,
    result?.structuredAnswer?.definition,
    ...(result?.structuredAnswer?.facts ?? []),
    ...(result?.structuredAnswer?.warnings ?? []),
    ...collectVisualDisplayStrings(result?.visual),
    ...moduleSpecs.flatMap((moduleSpec) => [
      moduleSpec?.title,
      moduleSpec?.filters?.note,
      moduleSpec?.selectionReason?.label,
      ...collectVisualDisplayStrings(moduleSpec?.visual)
    ]),
    ...(result?.actions ?? []).map((action) => action?.label),
    result?.trace?.communityName,
    result?.trace?.dataSource,
    result?.trace?.note
  ].filter((value) => value != null && String(value).trim()).map(String);
}

export function findUserFacingDateContractViolations(result) {
  const violations = [];
  const uniqueValues = [...new Set(collectUserFacingResultStrings(result))];
  for (const value of uniqueValues) {
    if (ABBREVIATED_MONTH_YEAR_PATTERN.test(value)) {
      violations.push(`visible copy abbreviates a calendar month: ${JSON.stringify(value)}`);
    }
    if (RAW_ELDERMARK_DATE_PATTERN.test(value)) {
      violations.push(`visible copy exposes a raw ElderMark date: ${JSON.stringify(value)}`);
    }
    if (INTERNAL_DATE_KEY_PATTERN.test(value)) {
      violations.push(`visible copy exposes an internal date key: ${JSON.stringify(value)}`);
    }
  }
  return violations;
}
