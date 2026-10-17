export const licensingQuestions = [
  { id: "latest", prompt: "What do the latest state reports say?", title: "Latest state reports", filter: {} },
  { id: "findings", prompt: "Which complaints were substantiated?", title: "Substantiated complaint findings", filter: { outcome: "Substantiated" } },
  { id: "citations", prompt: "What deficiencies did the state cite?", title: "Cited deficiencies", filter: { focus: "citations" } },
  { id: "corrections", prompt: "What correction plans were recorded?", title: "Recorded correction plans", filter: { focus: "corrections" } },
  { id: "all", prompt: "Show me the report library", title: "State report library", filter: {} }
] as const;

export function licensingQuestionQuery(question: string, community: string, q: string) {
  const query = new URLSearchParams();
  if (community) query.set("community", community);
  if (q) query.set("q", q);
  const selected = licensingQuestions.find(item => item.id === question);
  for (const [key, value] of Object.entries(selected?.filter ?? {})) if (typeof value === "string") query.set(key, value);
  return query.toString();
}
