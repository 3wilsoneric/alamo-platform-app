const METRIC_GRAIN_DEFINITIONS = Object.freeze({
  distinct_residents: Object.freeze({
    id: "distinct_residents",
    label: "Unique residents",
    valueLabel: "Residents",
    definition: "This count is unique residents, not total incident events.",
    promptNoun: "unique resident incidents",
    aliases: Object.freeze([
      "people",
      "person",
      "persons",
      "residents",
      "resident",
      "clients",
      "client",
      "who"
    ])
  }),
  incident_events: Object.freeze({
    id: "incident_events",
    label: "Incident events",
    valueLabel: "Incidents",
    definition: "This count is incident events unless the question asks for people/residents.",
    promptNoun: "incident events",
    aliases: Object.freeze([
      "events",
      "event",
      "rows",
      "row",
      "incident",
      "incidents"
    ])
  })
});

const COUNT_INTENT_PATTERN = /\b(how many|count|total|number of)\b/;

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9'\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAlias(text, aliases) {
  return aliases.some((alias) => new RegExp(`\\b${alias}\\b`, "i").test(text));
}

export function getMetricGrainDefinition(metricGrain) {
  return METRIC_GRAIN_DEFINITIONS[metricGrain] ?? null;
}

export function inferIncidentCountGrain(content) {
  const text = normalize(content);
  if (/\b(unique|distinct)\s+(resident|residents|client|clients|people|persons?)\b/.test(text)) return "distinct_residents";
  if (/\b(incident rows?|incident events?|event rows?)\b/.test(text)) return "incident_events";
  if (!COUNT_INTENT_PATTERN.test(text)) return null;

  if (hasAlias(text, METRIC_GRAIN_DEFINITIONS.distinct_residents.aliases)) return "distinct_residents";
  if (hasAlias(text, METRIC_GRAIN_DEFINITIONS.incident_events.aliases)) return "incident_events";
  return null;
}

export function getMetricGrainDefinitionForResult(result = {}) {
  const note = normalize(result?.trace?.note);
  const valueLabel = normalize(result?.visual?.valueLabel);

  if (/\bmetricgrain distinct residents\b|\bdistinct residents\b|\bunique residents?\b/.test(note)) {
    return METRIC_GRAIN_DEFINITIONS.distinct_residents;
  }
  if (/\bmetricgrain incident events\b|\bincident events\b|\bincident rows\b/.test(note)) {
    return METRIC_GRAIN_DEFINITIONS.incident_events;
  }
  if (/\bresidents?\b/.test(valueLabel)) return METRIC_GRAIN_DEFINITIONS.distinct_residents;
  if (/\bincidents?\b|\brows?\b/.test(valueLabel)) return METRIC_GRAIN_DEFINITIONS.incident_events;
  return null;
}
