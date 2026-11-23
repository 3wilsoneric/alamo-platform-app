// Match a displayed quotation to the exact retained field and offsets. Never
// infer structured content by parsing a text original that happens to be JSON.
export function selectedSourcePassage(source) {
  const selected = source.selection;
  if (!selected || !source.citation) return null;
  for (const key of ['nodeId', 'snapshotId', 'fingerprint', 'pointer', 'draftId', 'revision', 'publicationId', 'questionId']) {
    if (selected.citation[key] !== source.citation[key]) return null;
  }
  if (selected.citation.original?.digest !== source.citation.original?.digest || selected.citation.original?.section !== source.citation.original?.section || selected.citation.original?.attachmentId !== source.citation.original?.attachmentId || selected.citation.original?.kind !== source.citation.original?.kind) return null;
  let field = source.excerpt;
  if (source.format === 'record') {
    field = source.value;
    if (selected.location && !selected.location.startsWith('/')) return null;
    for (const token of selected.location.split('/').slice(1)) {
      if (/~(?![01])/.test(token)) return null;
      const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
      if (!field || typeof field !== 'object' || !Object.hasOwn(field, key)) return null;
      field = field[key];
    }
  }
  if (typeof field !== 'string' || !Number.isSafeInteger(selected.start) || !Number.isSafeInteger(selected.end) || selected.start < 0 || selected.end <= selected.start || selected.end > field.length || field.slice(selected.start, selected.end) !== selected.excerpt) return null;
  const quote = source.quote ?? selected.excerpt;
  if (!quote || !selected.excerpt.includes(quote)) return null;
  return { quote, start: selected.start + selected.excerpt.indexOf(quote), location: selected.location, field: selected.field };
}
