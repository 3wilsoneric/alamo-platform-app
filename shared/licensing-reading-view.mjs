// Presentation only: source evidence, analysis, hashes, and downloads stay intact.
const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
const continuation = /(?:\s*[({*]*\s*(?:report\s+)?cont(?:inue[ds]?)?\.?\s*(?:on|from)\s+(?:the\s+)?(?:next\s+page(?:,?\s*LIC\s*[\d -]+[A-Z]?)?|(?:LIC\s*)?\d{3,4}[- ]?[A-Z])\s*[.\s)}*]*)$/i;

export function licensingReadingBlocks(text) {
  let cleaned = text.trim().replace(continuation, "").trim();
  if (!cleaned) return [];
  const sourceLabel = cleaned.match(/^((?:allegation\s*\d*|investigation finding)\s*:)\s*/i);
  if ((sourceLabel && cleaned.length < 220)
    || (cleaned.length < 100 && /^[A-Z][A-Z\s/&(),–-]+:?$/.test(cleaned))) {
    return [{ kind: "heading", text: cleaned }];
  }
  const bullet = cleaned.match(/^[•●▪]\s*(.+)$/s);
  if (bullet) return [{ kind: "list-item", text: bullet[1] }];
  const blocks = []; let paragraph = "";
  if (sourceLabel) {
    blocks.push({ kind: "heading", text: sourceLabel[1] });
    cleaned = cleaned.slice(sourceLabel[0].length);
  }
  // Break only at sentence boundaries; never paraphrase or truncate a sentence.
  for (const { segment } of sentences.segment(cleaned)) {
    const sentence = segment.trim();
    if (paragraph && paragraph.length + sentence.length > 600) {
      blocks.push({ kind: "paragraph", text: paragraph }); paragraph = "";
    }
    paragraph = paragraph ? `${paragraph} ${sentence}` : sentence;
  }
  if (paragraph) blocks.push({ kind: "paragraph", text: paragraph });
  return blocks;
}

export function licensingReadingPages(narratives) {
  const pages = new Map();
  for (const { page, text } of narratives) {
    const blocks = licensingReadingBlocks(text);
    if (!blocks.length) continue;
    if (!pages.has(page)) pages.set(page, { page, blocks: [] });
    pages.get(page).blocks.push(...blocks);
  }
  return [...pages.values()];
}
