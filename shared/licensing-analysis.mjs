export const LICENSING_TOPICS = Object.freeze([
  { name: "Resident rights & safety", pattern: /abus|personal rights|sexual|assault|neglect|rough handl|restrain/i },
  { name: "Care & supervision", pattern: /supervis|care plan|needs and services|hygiene|bathing|elop|wander|fall/i },
  { name: "Medication", pattern: /medicat|prescri|dosage|pharmacy/i },
  { name: "Buildings & equipment", pattern: /building|repair|physical plant|door|hot water|temperature|furnish|fire|smoke detector/i },
  { name: "Staffing & training", pattern: /staffing|training|background|fingerprint|personnel|criminal record/i },
  { name: "Records & reporting", pattern: /record|document|reporting|report incident|incident report|appraisal/i },
  { name: "Food & sanitation", pattern: /food|sanit|kitchen|pest|infection|cleanliness/i }
]);

export const LICENSING_OUTCOMES = Object.freeze(["Substantiated", "Unsubstantiated", "Unfounded", "Inconclusive", "Mixed findings", "Pending", "Not stated", "Not applicable"]);

function cleanLines(text) {
  // Consecutive numeric-only cells are form gutters; preserve individual numbers.
  const lines = text.split("\n").map((line) => line.trim());
  return lines.filter((line, index) => {
    if (!/^\d{1,2}$/.test(line)) return true;
    let start = index; let end = index;
    while (start > 0 && Number(lines[start - 1]) === Number(lines[start]) - 1 && /^\d{1,2}$/.test(lines[start - 1])) start--;
    while (end < lines.length - 1 && Number(lines[end + 1]) === Number(lines[end]) + 1 && /^\d{1,2}$/.test(lines[end + 1])) end++;
    return end - start < 3;
  });
}

function sourcePages(text) {
  const pages = []; let start = 0;
  for (const match of text.matchAll(/Page:\s*(\d+)\s+of\s+\d+/g)) {
    pages.push({ page: Number(match[1]), lines: cleanLines(text.slice(start, match.index)) });
    start = match.index + match[0].length;
  }
  if (text.slice(start).trim()) pages.push({ page: null, lines: cleanLines(text.slice(start)) });
  return pages;
}

const footer = /^(?:SUPERVISOR'?S? NAME|LICENSING EVALUATOR|LICENSING PROGRAM .* SIGNATURE|NAME OF LICENSING|FACILITY REPRESENTATIVE|I acknowledge receipt|Failure to correct|Estimated Days of Completion|This report must be available|LIC\d+\s*\()/i;
const transition = /^(?:\(?Cont(?:inue|inued)?[\s'.]*(?:on|from|d on)|Document Has Been Signed|Created By:|Link to Parent Document)/i;
const outcomeLine = /^(Substantiated|Unsubstantiated|Unfounded|Inconclusive|Pending)[.\s]*$/i;
const normalCase = (value) => value[0].toUpperCase() + value.slice(1).toLowerCase();
const unique = (values) => [...new Set(values)];
function narrativeLines(lines, start) {
  const result = [];
  for (const line of lines.slice(start)) {
    if (/^DATE:/.test(line)) {
      while (result.length && /^[A-Z][a-z'-]+(?: [A-Z][a-z'-]+){1,4}$/.test(result[result.length - 1])) result.pop();
      break;
    }
    if (footer.test(line)) break;
    if (line && !transition.test(line) && !outcomeLine.test(line)) result.push(line);
  }
  return result;
}

function parseCitation(block, page, disposition = null) {
  const sectionIndex = block.findIndex((line) => line === "Section Cited");
  const code = block.slice(sectionIndex + 1).find((line) => /^\d{4,6}(?:\.\d+)?(?:\([a-z0-9]+\))*$/i.test(line)) ?? "Section not extracted";
  const modern = block.indexOf("Deficient Practice Statement");
  const dueIndex = block.findIndex((line) => /^POC Due Date:/.test(line));
  const planIndex = block.indexOf("Plan of Correction");
  const dateText = (dueIndex >= 0 ? block[dueIndex] : block.slice(0, sectionIndex).join(" ")).match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  const dueDate = dateText ? `${dateText[3]}-${dateText[1].padStart(2, "0")}-${dateText[2].padStart(2, "0")}` : null;
  let description = ""; let correction = "";
  if (modern >= 0 && dueIndex > modern) {
    description = block.slice(modern + 1, dueIndex).join(" ");
    if (planIndex >= 0) correction = block.slice(planIndex + 1).join(" ");
  } else {
    // Legacy forms alternate deficiency and correction columns. Only label
    // explicit practice statements and explicit commitments; keep the excerpt.
    description = block.filter((line) => /^Based on\b/i.test(line)).join(" ");
    const commitment = block.findIndex((line) => /^(?:The )?(?:Licensee|Administrator|Executive Director|Director|Facility|License|ADM)\b.*\b(?:agreed?|will|shall|submit|ensure|provide|conduct|correct)/i.test(line));
    if (commitment >= 0) correction = block.slice(commitment).filter((line) => !/^Based on\b/i.test(line) && !/^THIS REQUIREMENT/i.test(line) && !/^Administrator failed\b/i.test(line)).join(" ");
  }
  return { type: block[0], regulation: code, description, correction, dueDate, page,
    disposition, excerpt: [disposition, ...block].filter(Boolean).join("\n"), needsReview: !description || !correction || code === "Section not extracted" };
}

export function analyzeLicensingReport(report) {
  const allegations = []; const narratives = []; const citations = []; const findings = []; const outcomes = [];
  for (const { page, lines } of sourcePages(report.text)) {
    for (const line of lines) {
      const match = line.match(outcomeLine);
      if (match) outcomes.push(normalCase(match[1]));
    }
    const allegationStart = lines.findIndex((line) => line === "ALLEGATION(S):");
    const findingStart = lines.findIndex((line) => line === "INVESTIGATION FINDINGS:");
    if (allegationStart >= 0 && findingStart > allegationStart) {
      allegations.push(...lines.slice(allegationStart + 1, findingStart).filter(Boolean).map((text) => ({ text, page })));
    }
    const start = findingStart >= 0 ? findingStart : lines.findIndex((line) => line === "NARRATIVE");
    if (start >= 0) {
      for (const text of narrativeLines(lines, start + 1)) {
        narratives.push({ text, page });
        const findingPattern = /\b(?:unsubstantiated|substantiated|unfounded|inconclusive|no deficiencies)\b/i;
        if (findingPattern.test(text)) for (const sentence of text.split(/(?<=[.!?])\s+/).filter((s) => findingPattern.test(s))) {
          if (!findings.some((f) => f.text === sentence)) findings.push({ text: sentence, page });
        }
      }
    }
    if (lines.includes("DEFICIENCY INFORMATION FOR THIS PAGE:")) {
      let block = null; let disposition = null;
      for (const line of lines) {
        if (/^Deficiency Dismissed$/i.test(line)) {
          if (block) citations.push(parseCitation(block, page, disposition));
          block = null; disposition = line;
        } else if (/^Type [AB]$/i.test(line)) {
          if (block) { citations.push(parseCitation(block, page, disposition)); disposition = null; }
          block = [line];
        } else if (block && (footer.test(line) || (line === "Section Cited" && block.includes("Section Cited")))) {
          citations.push(parseCitation(block, page, disposition)); block = null; disposition = null;
        } else if (block && line) block.push(line);
      }
      if (block) citations.push(parseCitation(block, page, disposition));
    }
  }
  const stated = unique(outcomes);
  const outcome = report.reportType !== "Complaint" ? "Not applicable" : stated.length > 1 ? "Mixed findings" : stated[0] ?? "Not stated";
  const noDeficiencies = citations.length === 0 && findings.some((f) => /\bno deficiencies\b/i.test(f.text));
  const topicText = [...allegations.map((a) => a.text), ...citations.map((c) => c.description || c.excerpt), ...(!allegations.length && !citations.length ? narratives.map((n) => n.text) : [])].join(" ");
  const topics = LICENSING_TOPICS.filter((topic) => topic.pattern.test(topicText)).map((topic) => topic.name);
  const correctionsCount = citations.filter((c) => c.correction).length;
  const followUps = narratives.filter((n) => /\b(?:will return|not (?:able to be )?completed|submit.{0,150}\bby\b|updated and submitted|no later th[ae]n)\b/i.test(n.text));
  const reviewNeeded = !narratives.length || citations.some((c) => c.needsReview) || (report.reportType === "Complaint" && !stated.length);
  const headline = report.reportType === "Complaint"
    ? outcome === "Not stated" ? "Complaint finding needs review" : outcome === "Mixed findings" ? "Different findings recorded in this report" : `${outcome} complaint finding`
    : citations.length ? `${citations.length} cited ${citations.length === 1 ? "deficiency" : "deficiencies"}` : noDeficiencies ? "No deficiencies cited" : followUps.some((f) => /will return|not.*completed/i.test(f.text)) ? "Follow-up visit planned" : "Facility visit";
  const summary = { version: "licensing-analysis-v1", outcome, outcomes: stated, headline, topics, citationCount: citations.length,
    correctionsCount, noDeficiencies, reviewNeeded, allegationCount: allegations.length };
  return { summary, allegations, findings, narratives, citations, followUps };
}
