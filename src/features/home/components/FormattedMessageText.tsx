import { memo, useMemo } from "react";

type MessageBlock =
  | { type: "paragraph"; text: string }
  | { type: "answer"; text: string }
  | { type: "section"; text: string }
  | { type: "fact"; label: string; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "list"; rows: string[] };

function isNumericDisplay(value: string) {
  return /^[-+]?[\d,]+(?:\.\d+)?%?$/.test(value.trim());
}

function isNumericHeader(value: string) {
  return /\b(count|total|incidents?|census|change|delta|rate|records?|days?|age|los|value|%|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|20\d{2})\b/i.test(value);
}

function getDeltaDisplayTone(value: string) {
  const text = value.trim();
  if (!/^[-+]/.test(text)) return "text-[#3e3429]";
  return text.startsWith("+") ? "text-[#0f7a65]" : "text-[#a04436]";
}

function splitMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function isMessageSectionLine(line: string) {
  const text = line.trim();
  if (!text || /[.!?]$/.test(text)) return false;
  if (/^(key facts|context|definition|source|next|rows checked|supporting facts)$/i.test(text)) return true;
  return /^[A-Z0-9&'’.,/() -]{3,80}$/.test(text) && !/[a-z]/.test(text);
}

function splitFactLine(line: string) {
  const match = line.trim().match(/^([A-Za-z][A-Za-z0-9 /&'-]{1,42}):\s+(.+)$/);
  const label = match?.[1];
  const text = match?.[2];
  return label && text ? { label, text } : null;
}

function splitReadableFactValues(text: string) {
  const value = text.trim();
  const separator = value.includes(";")
    ? /;\s*/
    : (value.match(/,/g)?.length ?? 0) >= 2
      ? /,\s+(?=[A-Z0-9])/
      : null;

  if (!separator) return [];
  const values = value.split(separator).map((item) => item.trim()).filter(Boolean);
  return values.length >= 3 ? values : [];
}

function parseMessageBlocks(text: string): MessageBlock[] {
  const lines = text.split("\n");
  const blocks: MessageBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const nextLine = lines[index + 1];
    const inlineAnswer = line.trim().match(/^answer\s+(.+)$/i);

    if (inlineAnswer?.[1]) {
      blocks.push({ type: "answer", text: inlineAnswer[1].trim() });
      index += 1;
      continue;
    }

    if (/^answer$/i.test(line.trim()) && nextLine?.trim()) {
      blocks.push({ type: "answer", text: nextLine.trim() });
      index += 2;
      continue;
    }

    if (isMessageSectionLine(line) && nextLine?.trim()) {
      blocks.push({ type: "section", text: line.trim() });
      index += 1;
      continue;
    }

    const fact = splitFactLine(line);
    if (fact) {
      blocks.push({ type: "fact", ...fact });
      index += 1;
      continue;
    }

    if (line.includes("|") && nextLine && isMarkdownTableSeparator(nextLine)) {
      const headers = splitMarkdownTableRow(line);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length) {
        const rowLine = lines[index];
        if (!rowLine?.includes("|") || !rowLine.trim()) break;
        rows.push(splitMarkdownTableRow(rowLine));
        index += 1;
      }

      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (/^\s*[-•]\s+/.test(line)) {
      const rows: string[] = [];
      while (index < lines.length) {
        const rowLine = lines[index];
        if (!rowLine || !/^\s*[-•]\s+/.test(rowLine)) break;
        rows.push(rowLine.replace(/^\s*[-•]\s+/, "").trim());
        index += 1;
      }
      blocks.push({ type: "list", rows });
      continue;
    }

    if (line.trim()) {
      const paragraphRows = [line.trim()];
      index += 1;
      while (index < lines.length) {
        const paragraphLine = lines[index];
        const paragraphNextLine = lines[index + 1];
        if (
          !paragraphLine?.trim() ||
          (paragraphLine.includes("|") && Boolean(paragraphNextLine) && isMarkdownTableSeparator(paragraphNextLine ?? "")) ||
          /^\s*[-•]\s+/.test(paragraphLine) ||
          isMessageSectionLine(paragraphLine) ||
          splitFactLine(paragraphLine)
        ) {
          break;
        }
        paragraphRows.push(paragraphLine.trim());
        index += 1;
      }
      blocks.push({ type: blocks.length === 0 ? "answer" : "paragraph", text: paragraphRows.join(" ") });
      continue;
    }

    index += 1;
  }

  return blocks;
}

function cleanInlineMarkdown(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/;\s+/g, ". ");
}

function splitConversationalParagraphs(text: string) {
  const cleaned = cleanInlineMarkdown(text);
  if (cleaned.length < 240) return [cleaned];

  const sentences = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length < 3) return [cleaned];

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(" "));
  }
  return paragraphs;
}

function getActiveSection(blocks: MessageBlock[], blockIndex: number) {
  for (let index = blockIndex - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (!block) continue;
    if (block.type === "section") return block.text.toLowerCase();
    if (block.type === "answer" || block.type === "paragraph" || block.type === "table") return "";
  }
  return "";
}

function isHiddenMetaSection(section: string) {
  return /definition|rows checked|source detail|source$/i.test(section);
}

export const FormattedMessageText = memo(function FormattedMessageText({ text }: { text: string }) {
  const blocks = useMemo(() => parseMessageBlocks(text), [text]);

  if (!blocks.length) return null;

  return (
    <div data-formatted-message-text="true" className="w-full space-y-3">
      {blocks.map((block, blockIndex) => {
        if (block.type === "table") {
          return (
            <div key={`table-${blockIndex}`} className="overflow-hidden border-y border-[#111111] bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-[12px] leading-5">
                  <thead>
                    <tr className="bg-white text-[10px] uppercase tracking-[0.14em] text-[#595959]">
                      {block.headers.map((header, headerIndex) => (
                        <th
                          key={`${header}-${headerIndex}`}
                          className={`whitespace-nowrap px-3 py-2.5 font-semibold ${
                            isNumericHeader(header) ? "text-right" : "text-left"
                          }`}
                        >
                          {cleanInlineMarkdown(header)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d9d9d9]">
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`row-${blockIndex}-${rowIndex}`} className="bg-white">
                        {row.map((cell, cellIndex) => {
                          const cleaned = cleanInlineMarkdown(cell);
                          return (
                            <td
                              key={`${cleaned}-${cellIndex}`}
                              className={`px-3 py-2.5 ${
                                isNumericDisplay(cleaned)
                                  ? `whitespace-nowrap text-right tabular-nums ${getDeltaDisplayTone(cleaned)}`
                                  : "max-w-[340px] whitespace-normal font-medium text-[#111111]"
                              }`}
                            >
                              {cleaned || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        if (block.type === "list") {
          const activeSection = getActiveSection(blocks, blockIndex);

          if (isHiddenMetaSection(activeSection)) return null;

          return (
            <ul key={`list-${blockIndex}`} className="max-w-[104ch] space-y-1.5 pl-1">
              {block.rows.map((row, rowIndex) => (
                <li key={`${row}-${rowIndex}`} className="flex gap-2.5 text-[14px] leading-6 text-[#111111]">
                  <span className="mt-[0.72em] h-1.5 w-1.5 shrink-0 bg-[#0f8b73]" />
                  <span>{cleanInlineMarkdown(row)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === "fact") {
          const activeSection = getActiveSection(blocks, blockIndex);
          if (isHiddenMetaSection(activeSection)) return null;
          const values = splitReadableFactValues(block.text);
          return (
            <div key={`fact-${blockIndex}`} className="max-w-[104ch] text-[14px] leading-6 text-[#111111]">
              {values.length ? (
                <ul className="space-y-1.5 pl-1">
                  {values.map((value) => (
                    <li key={value} className="flex gap-2.5">
                      <span className="mt-[0.72em] h-1.5 w-1.5 shrink-0 bg-[#0f8b73]" />
                      <span>{cleanInlineMarkdown(value)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  <span className="font-semibold text-[#111111]">{cleanInlineMarkdown(block.label)}:</span>{" "}
                  {cleanInlineMarkdown(block.text)}
                </p>
              )}
            </div>
          );
        }

        if (block.type === "answer") {
          const paragraphs = splitConversationalParagraphs(block.text);
          return (
            <div key={`answer-${blockIndex}`} className="max-w-[112ch] space-y-3">
              {paragraphs.map((paragraph, paragraphIndex) => (
                <p
                  key={`${paragraph}-${paragraphIndex}`}
                  className="text-[15px] font-normal leading-7 tracking-normal text-[#2f2f2f] sm:text-[16px] sm:leading-7"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          );
        }

        if (block.type === "section") {
          const normalizedSection = block.text.toLowerCase();
          if (isHiddenMetaSection(normalizedSection)) return null;
          return null;
        }

        if (isHiddenMetaSection(getActiveSection(blocks, blockIndex))) return null;

        return (
          <p key={`paragraph-${blockIndex}`} className="max-w-[112ch] text-[15px] font-normal leading-7 tracking-normal text-[#2f2f2f] sm:text-[16px] sm:leading-7">
            {cleanInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
});
