import { getReportingDayTimestamp } from "../../shared/reporting-date.mjs";
import { buildResidentMedicationPresentation } from "./resident-medications.mjs";

export function createResidentTools(dependencies) {
  const {
    average,
    countBy,
    countBySum,
    displayValue,
    filterByFacility,
    findFacility,
    findResident,
    formatDateLabel,
    formatMonthLabel,
    formatNumber,
    formatPercent,
    getFacilityLabel,
    getIncidentDetailRows,
    getMarMedicationOrderRows,
    getRequestedMonthBuckets,
    getResidentRows,
    limitRowsForRequest,
    makeTrace,
    normalizeMonthBucket,
    normalizeText
  } = dependencies;

  function countRecentIncidentDetails(details, days) {
    const businessDay = getReportingDayTimestamp(Date.now());
    const cutoffDay = businessDay - Math.max(0, days - 1) * 24 * 60 * 60 * 1000;

    return details.filter((incident) => {
      const timestamp = Date.parse(incident.incident_date ?? incident.received_at ?? "");
      if (!Number.isFinite(timestamp)) return false;
      const incidentDate = new Date(timestamp);
      const incidentDay = Date.UTC(
        incidentDate.getUTCFullYear(),
        incidentDate.getUTCMonth(),
        incidentDate.getUTCDate()
      );
      return incidentDay >= cutoffDay;
    }).length;
  }

  function getResidentSearchTerms(content) {
    return normalizeText(content)
      .replace(/\b(a|an|and|are|at|about|browse|by|can|census|client|clients|community|complete|could|current|data|diagnosis|dice|directory|display|entire|every|everyone|exact|filter|filtered|find|for|from|full|get|give|had|has|have|if|in|is|just|like|list|lookup|match|matches|me|name|names|need|named|of|on|only|or|person|people|please|profile|pull|resident|residents|roster|row|rows|search|show|slice|the|there|to|unit|want|who|with|would|all)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .filter((term) => term.length >= 2);
  }

  function getResidentName(resident) {
    return `${resident.first_name ?? ""} ${resident.last_name ?? ""}`.trim() || resident.resident_name || resident.client_name || resident.res_number || "Unknown resident";
  }

  function formatResidentList(items) {
    const values = items.filter(Boolean);
    if (values.length <= 1) return values[0] ?? "";
    if (values.length === 2) return `${values[0]} and ${values[1]}`;
    return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
  }

  function getFacilitySearchTerms(facility) {
    if (!facility) return new Set();
    const aliases = [
      facility.community_name,
      facility.community_code,
      facility.facility_id
    ];
    const name = normalizeText(facility.community_name);
    if (/san pablo/.test(name)) aliases.push("san pablo", "pablo");
    if (/santa clarita/.test(name)) aliases.push("santa clarita", "clarita");
    if (/wallace/.test(name)) aliases.push("jc wallace", "wallace");
    if (/turlock/.test(name)) aliases.push("turlock");
    if (/victoria/.test(name)) aliases.push("victoria", "victoria house", "victorias house");

    return new Set(
      aliases
        .flatMap((alias) => normalizeText(alias).split(" "))
        .filter((term) => term.length >= 2)
    );
  }

  function isBroadResidentBrowseIntent(content, searchTerms = getResidentSearchTerms(content)) {
    const text = normalizeText(content);
    const rosterLanguage = /\b(census search|search census|resident search|search residents|search clients|resident roster|client roster|resident directory|client directory|browse residents|browse clients|show residents|show clients|list residents|list clients|current residents|current clients|all residents|all clients|every resident|every client|everyone on census|who is on census|full roster|complete roster)\b/.test(text) ||
      /\b(list|show|give me|pull|display)\b.*\b(residents?|clients?|people|persons|roster)\b/.test(text);
    if (!searchTerms.length) return rosterLanguage || /\b(residents?|clients?|people|persons|roster|census search|search census)\b/.test(text);
    return rosterLanguage &&
      !/\b(named|called|unit|diagnosis|with|resident\s+#|resident number|client\s+#|client number)\b/.test(text);
  }

  function findPartialResidentMatches(content, communities, limit = 8) {
    const terms = getResidentSearchTerms(content);
    if (!terms.length) return [];
    const requiredMatches = terms.length > 1 ? Math.min(2, terms.length) : 1;

    return (communities.residents ?? [])
      .map((resident) => {
        const first = normalizeText(resident.first_name);
        const last = normalizeText(resident.last_name);
        const fullName = `${first} ${last}`.trim();
        const matchedTerms = terms.filter((term) =>
          fullName.split(" ").some((namePart) => namePart === term || namePart.startsWith(term) || term.startsWith(namePart))
        );
        return { resident, matchedTerms };
      })
      .filter(({ matchedTerms }) => matchedTerms.length >= requiredMatches)
      .sort((left, right) => right.matchedTerms.length - left.matchedTerms.length ||
        String(left.resident.last_name ?? "").localeCompare(String(right.resident.last_name ?? "")))
      .slice(0, limit);
  }

  function buildResidentRecoveryResult(content, communities) {
    const terms = getResidentSearchTerms(content);
    const requestedName = terms.join(" ");
    const matches = findPartialResidentMatches(content, communities);
    const requestedLabel = requestedName
      ? requestedName.split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
      : "the requested resident";
    const exactLimit = matches.length
      ? `The current roster has no verified exact match for ${requestedLabel}. Review the possible roster matches before opening a profile.`
      : `The current roster has no verified exact match for ${requestedLabel} after exact and partial name checks. Try a different spelling, resident number, unit, or community.`;
    const matchLine = matches.length
      ? "No profile was opened because none of the partial matches cleared the exact-match threshold."
      : "No resident profile was opened from an unverified identity.";

    return {
      handled: true,
      tool: "data_recovery",
      safeRefusal: true,
      truthState: matches.length ? "summary_not_shown" : "verified_zero",
      text: [
        exactLimit,
        ...(matches.length ? [matchLine, "Try a different spelling, resident number, unit, or community to narrow the search."] : [])
      ].join("\n"),
      trace: makeTrace({
        tool: "data_recovery",
        dataSource: "current resident roster",
        rowCount: matches.length,
        note: requestedName ? `unresolved resident: ${requestedName}` : "unresolved resident request",
        truthState: matches.length ? "summary_not_shown" : "verified_zero"
      }),
      visual: matches.length
        ? {
            type: "table",
            title: "Possible Roster Matches",
            subtitle: "Partial name matches only — no exact resident was verified",
            valueLabel: "Matches",
            columns: ["Resident", "Community", "Unit", "Resident #"],
            rows: matches.map(({ resident }) => ({
              label: `${resident.first_name} ${resident.last_name}`.trim(),
              value: 0,
              cells: [
                `${resident.first_name} ${resident.last_name}`.trim(),
                resident.facility_name || resident.facility_id || "—",
                resident.unit_number ?? "—",
                resident.res_number ?? "—"
              ]
            }))
          }
        : undefined,
      actions: [
        ...(requestedName ? [{
          label: `Search roster for "${requestedName}"`,
          kind: "tool",
          tool: "resident_search",
          prompt: `search residents named ${requestedName}`
        }] : [])
      ]
    };
  }

  function getLosBucket(days) {
    const value = Number(days || 0);
    if (value < 30) return "<30 days";
    if (value < 90) return "30-89 days";
    if (value < 180) return "90-179 days";
    if (value < 365) return "180-364 days";
    return "365+ days";
  }

  function getAgeBucket(age) {
    const value = Number(age || 0);
    if (!value) return "Unknown";
    if (value < 35) return "<35";
    if (value < 45) return "35-44";
    if (value < 55) return "45-54";
    if (value < 65) return "55-64";
    return "65+";
  }

  function median(values) {
    const sorted = values
      .map(Number)
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (!sorted.length) return 0;
    const midpoint = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[midpoint]
      : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }

  function groupResidentsByCommunity(communities) {
    const facilities = communities.facilities ?? [];
    const groups = new Map();

    for (const resident of communities.residents ?? []) {
      const facility = facilities.find((candidate) =>
        String(candidate.facility_id ?? candidate.facilityId ?? "") === String(resident.facility_id ?? resident.facilityId ?? "")
      );
      const key = String(resident.facility_id ?? resident.facilityId ?? resident.facility_name ?? "Unknown community");
      const current = groups.get(key) ?? {
        label: resident.facility_name || getFacilityLabel(facility),
        residents: []
      };
      current.residents.push(resident);
      groups.set(key, current);
    }

    return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  function firstPresent(row, keys) {
    for (const key of keys) {
      if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
    }
    return null;
  }

  function parseDateValue(value) {
    if (!value) return null;
    const text = String(value).trim();
    const iso = text.match(/^(20\d{2})-(\d{2})-(\d{2})/);
    if (iso) {
      const date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const parts = text.match(/^(\d{1,4})[!/.](\d{1,2})[!/.](\d{1,4})/);
    if (!parts) return null;
    const [, first, second, third] = parts;
    if (!first || !second || !third) return null;
    const yearFirst = first.length === 4;
    const year = Number(yearFirst ? first : third);
    const month = Number(second);
    const day = Number(yearFirst ? third : first);
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function toWeekStartIso(date) {
    const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayOffset = (weekStart.getUTCDay() + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - dayOffset);
    return toIsoDate(weekStart);
  }

  function parseRequestedWeekCount(content) {
    const text = normalizeText(content);
    const match = text.match(/\b(?:last|past|prior|previous)\s+(\d{1,2})\s+weeks?\b/);
    if (match) return Math.min(52, Math.max(1, Number(match[1])));
    return 12;
  }

  function getResidentFlowSourceRows(communities, reportsSummary) {
    const tables = reportsSummary?.toolContext?.tables ?? {};
    return [
      ...(tables.resident_flow_weekly_by_community ?? []),
      ...(tables.resident_movement_weekly_by_community ?? []),
      ...(tables.admission_discharge_weekly_by_community ?? []),
      ...(tables.admissions_discharges ?? []),
      ...(reportsSummary?.residentFlowWeeklyByCommunity ?? []),
      ...(reportsSummary?.admissionsDischarges ?? []),
      ...(communities.admissions_discharges ?? []),
      ...(communities.admissionDischarges ?? [])
    ];
  }

  function getFlowFacility(row, communities) {
    const facilityId = String(firstPresent(row, ["facility_id", "Facility", "facility", "community_id"]) ?? "").trim();
    const facilityName = firstPresent(row, ["facility_name", "community_name", "Community", "community", "name"]);
    return communities.facilities.find((facility) => String(facility.facility_id) === facilityId) ??
      communities.facilities.find((facility) => normalizeText(facility.community_name) === normalizeText(facilityName)) ??
      null;
  }

  function getMovementCount(row) {
    const value = Number(firstPresent(row, ["count", "resident_count", "movement_count", "rows"]) ?? 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function addFlowEntry(bucket, entry) {
    if (!entry.weekStart || !entry.facilityId) return;
    const key = `${entry.weekStart}|${entry.facilityId}`;
    const current = bucket.get(key) ?? {
      weekStart: entry.weekStart,
      facilityId: entry.facilityId,
      communityName: entry.communityName,
      intakes: 0,
      discharges: 0,
      sourceRows: 0
    };
    current.intakes += Number(entry.intakes || 0);
    current.discharges += Number(entry.discharges || 0);
    current.sourceRows += Number(entry.sourceRows || 0);
    bucket.set(key, current);
  }

  function buildMovementFlowRows(movementRows, communities, facility) {
    const bucket = new Map();
    let dischargeRows = 0;
    let intakeRows = 0;
    let hasDischargeColumn = false;

    movementRows.forEach((row) => {
      const rowFacility = getFlowFacility(row, communities);
      if (facility && String(rowFacility?.facility_id) !== String(facility.facility_id)) return;
      const facilityId = rowFacility?.facility_id ?? String(firstPresent(row, ["facility_id", "Facility", "facility"]) ?? "").trim();
      if (!facilityId) return;
      const communityName = rowFacility?.community_name ?? firstPresent(row, ["facility_name", "community_name", "Community", "community"]) ?? facilityId;
      const weekValue = firstPresent(row, ["week_start", "week_start_date", "week_bucket", "movement_week", "report_week"]);
      const type = normalizeText(firstPresent(row, ["movement_type", "event_type", "type", "movement", "status"]));
      const count = getMovementCount(row);

      const preAggregatedIntakesValue = firstPresent(row, ["intakes", "admissions", "admission_count", "admit_count", "move_ins", "move_in_count"]);
      const preAggregatedDischargesValue = firstPresent(row, ["discharges", "discharge_count", "move_outs", "move_out_count"]);
      const preAggregatedIntakes = Number(preAggregatedIntakesValue ?? 0);
      const preAggregatedDischarges = Number(preAggregatedDischargesValue ?? 0);
      if (preAggregatedIntakesValue !== null || preAggregatedDischargesValue !== null) {
        const date = parseDateValue(weekValue ?? firstPresent(row, ["movement_date", "event_date", "date", "admit_date", "admission_date", "discharge_date"]));
        if (!date) return;
        hasDischargeColumn ||= preAggregatedDischargesValue !== null;
        intakeRows += preAggregatedIntakes;
        dischargeRows += preAggregatedDischarges;
        addFlowEntry(bucket, {
          weekStart: toWeekStartIso(date),
          facilityId,
          communityName,
          intakes: preAggregatedIntakes,
          discharges: preAggregatedDischarges,
          sourceRows: 1
        });
        return;
      }

      const admissionDate = parseDateValue(firstPresent(row, ["admit_date", "admission_date", "intake_date", "move_in_date"]));
      const dischargeDate = parseDateValue(firstPresent(row, ["discharge_date", "discharged_date", "move_out_date", "exit_date", "termination_date"]));
      const eventDate = parseDateValue(weekValue ?? firstPresent(row, ["movement_date", "event_date", "date"]));

      if (admissionDate || /\b(admission|admit|intake|move in|movein|new resident|new client)\b/.test(type)) {
        const date = admissionDate ?? eventDate;
        if (date) {
          intakeRows += count;
          addFlowEntry(bucket, {
            weekStart: toWeekStartIso(date),
            facilityId,
            communityName,
            intakes: count,
            sourceRows: 1
          });
        }
      }

      if (dischargeDate || /\b(discharge|discharged|move out|moveout|exit|termination)\b/.test(type)) {
        const date = dischargeDate ?? eventDate;
        if (date) {
          dischargeRows += count;
          addFlowEntry(bucket, {
            weekStart: toWeekStartIso(date),
            facilityId,
            communityName,
            discharges: count,
            sourceRows: 1
          });
        }
      }
    });

    return {
      rows: [...bucket.values()],
      intakeRows,
      dischargeRows,
      hasDischargeData: hasDischargeColumn || dischargeRows > 0,
      sourceRowCount: movementRows.length
    };
  }

  function buildRosterAdmissionFlowRows(communities, reportsSummary, facility) {
    const bucket = new Map();
    const residents = filterByFacility(getResidentRows(communities, reportsSummary), facility);
    residents.forEach((resident) => {
      const date = parseDateValue(resident.admit_date ?? resident.admission_date);
      if (!date) return;
      addFlowEntry(bucket, {
        weekStart: toWeekStartIso(date),
        facilityId: resident.facility_id,
        communityName: resident.facility_name || getFacilityLabel(communities.facilities.find((item) => item.facility_id === resident.facility_id)),
        intakes: 1,
        sourceRows: 1
      });
    });
    return {
      rows: [...bucket.values()],
      intakeRows: residents.length,
      dischargeRows: 0,
      hasDischargeData: false,
      sourceRowCount: residents.length
    };
  }

  function filterFlowRowsByRequestedWindow(rows, content) {
    const availableMonths = [...new Set(rows.map((row) => normalizeMonthBucket(row.weekStart)).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    if (requestedMonths.length) {
      return {
        rows: rows.filter((row) => requestedMonths.includes(normalizeMonthBucket(row.weekStart))),
        periodLabel: requestedMonths.map(formatMonthLabel).join(" through "),
        period: requestedMonths.join(", "),
        requestedMonths
      };
    }

    const latestDate = rows
      .map((row) => parseDateValue(row.weekStart))
      .filter(Boolean)
      .sort((left, right) => left - right)
      .at(-1);
    if (!latestDate) {
      return { rows: [], periodLabel: "latest loaded weeks", period: null, requestedMonths: [] };
    }

    const weeks = parseRequestedWeekCount(content);
    const cutoff = new Date(latestDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - (weeks - 1) * 7);
    return {
      rows: rows.filter((row) => {
        const date = parseDateValue(row.weekStart);
        return date && date >= cutoff && date <= latestDate;
      }),
      periodLabel: `last ${weeks} weeks through ${formatDateLabel(toIsoDate(latestDate))}`,
      period: `${toIsoDate(cutoff)} to ${toIsoDate(latestDate)}`,
      requestedMonths: []
    };
  }

  function buildResidentFlowWeeklyTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = getFacilityLabel(facility);
    const wantsDischarge = /\b(dischar(?:ge|ged|ges|ging)?|dischare|move outs?|move-outs?|exits?|terminations?)\b/i.test(content);
    const movementRows = getResidentFlowSourceRows(communities, reportsSummary);
    const movementFlow = buildMovementFlowRows(movementRows, communities, facility);
    const rosterFlow = buildRosterAdmissionFlowRows(communities, reportsSummary, facility);
    const baseRows = movementFlow.rows.length ? movementFlow.rows : rosterFlow.rows;
    const sourceKind = movementFlow.rows.length ? "resident movement records" : "current resident admit dates";
    const hasDischargeData = movementFlow.rows.length ? movementFlow.hasDischargeData : false;
    const filtered = filterFlowRowsByRequestedWindow(baseRows, content);
    const sortedRows = filtered.rows
      .sort((left, right) => String(right.weekStart).localeCompare(String(left.weekStart)) || String(left.communityName).localeCompare(String(right.communityName)));
    const rows = limitRowsForRequest(sortedRows, content, 80, 300);
    const totalIntakes = sortedRows.reduce((total, row) => total + Number(row.intakes || 0), 0);
    const totalDischarges = sortedRows.reduce((total, row) => total + Number(row.discharges || 0), 0);
    const truthState = wantsDischarge && !hasDischargeData ? "summary_not_shown" : rows.length ? "valid_rows" : "verified_zero";
    const dischargeLimit = !hasDischargeData
      ? "Discharges are not populated in the published movement data, so this view should be read as intake only."
      : null;
    const rosterLimit = !movementFlow.rows.length
      ? "Intake uses admit dates for residents present in the current roster. It can miss people who were admitted and discharged before the current roster."
      : null;

    return {
      handled: true,
      tool: "resident_flow_weekly",
      text: [
        `${label} weekly intake and discharge`,
        hasDischargeData
          ? `${filtered.periodLabel}: ${formatNumber(totalIntakes)} intakes, ${formatNumber(totalDischarges)} discharges, net ${formatNumber(totalIntakes - totalDischarges)}.`
          : `${filtered.periodLabel}: ${formatNumber(totalIntakes)} intakes found from current-roster admit dates. Discharge figures are not populated.`,
        dischargeLimit ? `Data limit: ${dischargeLimit}` : null,
        rosterLimit ? `Data limit: ${rosterLimit}` : null
      ].filter(Boolean).join("\n"),
      truthState,
      trace: makeTrace({
        tool: "resident_flow_weekly",
        dataSource: sourceKind,
        rowCount: movementFlow.rows.length ? movementFlow.sourceRowCount : rosterFlow.sourceRowCount,
        facility,
        period: filtered.period,
        note: [
          hasDischargeData ? "discharge data loaded" : "discharge data not loaded",
          movementFlow.rows.length ? "movement source" : "current roster only"
        ].join("; "),
        truthState
      }),
      visual: {
        type: "table",
        title: `${label} Weekly Intake and Discharge`,
        subtitle: filtered.periodLabel,
        valueLabel: hasDischargeData ? "Net" : "Intakes",
        originalRowCount: sortedRows.length,
        columns: ["Week", "Community", "Intakes", "Discharges", "Net"],
        rows: rows.map((row) => ({
          label: `${formatDateLabel(row.weekStart)} · ${row.communityName}`,
          value: hasDischargeData ? Number(row.intakes || 0) - Number(row.discharges || 0) : Number(row.intakes || 0),
          cells: [
            `Week of ${formatDateLabel(row.weekStart)}`,
            row.communityName,
            formatNumber(row.intakes),
            hasDischargeData ? formatNumber(row.discharges) : "Not loaded",
            hasDischargeData ? formatNumber(Number(row.intakes || 0) - Number(row.discharges || 0)) : "—"
          ]
        }))
      },
      actions: []
    };
  }

  function buildAdHocResidentVisual(content, communities) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const incidentIntent = /\b(incident|incidents)\b/i.test(content);
    const rows = filterByFacility(communities.residents ?? [], facility);

    if (incidentIntent) {
      const detailRows = filterByFacility(communities.incidentDetails ?? [], facility);
      const ranked = countBySum(detailRows, (row) => row.client_name || row.resident_id || "Unknown resident").slice(0, 8);
      return {
        handled: true,
        tool: "ad_hoc_resident_list",
        text: `${label} residents ranked by matched incidents.`,
        visual: {
          type: "ranked_list",
          title: `${label} Residents by Incidents`,
          subtitle: "Based on available incident history",
          valueLabel: "Incidents",
          rows: ranked.map(([rowLabel, value]) => ({
            label: rowLabel,
            value: Number(value)
          }))
        },
        actions: [
          { label: `Open ${facility ? `${label} residents` : "resident search"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=residents` : "/resident-search" },
          { label: `Export ${facility ? label : "resident roster"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} residents to csv` }
        ]
      };
    }

    const ranked = [...rows]
      .sort((left, right) => Number(right.los_days || 0) - Number(left.los_days || 0))
      .slice(0, 8);
    return {
      handled: true,
      tool: "ad_hoc_resident_list",
      text: `${label} residents ranked by length of stay.`,
      visual: {
        type: "ranked_list",
        title: `${label} Longest Stay Residents`,
        subtitle: "Current residents",
        valueLabel: "LOS days",
        rows: ranked.map((resident) => ({
          label: `${resident.first_name} ${resident.last_name}`.trim() || resident.res_number,
          value: Number(resident.los_days || 0),
          meta: `Unit ${resident.unit_number ?? "—"}`
        }))
      },
      actions: [
        { label: `Open ${facility ? `${label} residents` : "resident search"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=residents` : "/resident-search" },
        { label: `Export ${facility ? label : "resident roster"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} residents to csv` }
      ]
    };
  }

  function getResidentIncidentDetails(resident, communities, reportsSummary) {
    const residentName = normalizeText(`${resident.first_name} ${resident.last_name}`);
    return getIncidentDetailRows(communities, reportsSummary)
      .filter((incident) => {
        const incidentName = normalizeText(incident.client_name);
        return incident.facility_id === resident.facility_id && (
          incident.resident_id === resident.res_number ||
          (incidentName && residentName && incidentName === residentName)
        );
      })
      .sort((left, right) => String(right.incident_date ?? right.received_at ?? "").localeCompare(String(left.incident_date ?? left.received_at ?? "")));
  }

  function buildResidentLookupTool(content, communities, reportsSummary) {
    const residentRows = getResidentRows(communities, reportsSummary);
    const toolCommunities = { ...communities, residents: residentRows };
    const resident = findResident(content, toolCommunities);
    if (!resident) {
      return buildResidentRecoveryResult(content, toolCommunities);
    }
    const facility = communities.facilities.find((item) => item.facility_id === resident.facility_id);
    const details = getResidentIncidentDetails(resident, communities, reportsSummary);
    const recentIncident = details[0];
    const categories = countBy(details, (incident) => incident.category || incident.incident_type || "Uncategorized").slice(0, 6);
    const label = `${resident.first_name} ${resident.last_name}`.trim();
    const communityLabel = resident.facility_name || facility?.community_name || resident.facility_id;
    const medicationPresentation = buildResidentMedicationPresentation({
      orders: getMarMedicationOrderRows(reportsSummary)
        .filter((order) => order.facility_id === resident.facility_id && order.resident_id === resident.res_number),
      displayValue,
      formatNumber
    });
    const hasIncidentRollup = resident.last_incident_date || Number(resident.incident_count_all_time || 0) > 0;
    const hasDocumentationStatus = resident.last_note_date || resident.days_since_last_note != null;
    const hasMarSummary =
      resident.last_mar_recorded_date ||
      resident.mar_compliance_pct_30d != null ||
      Number(resident.active_medication_count || 0) > 0 ||
      Number(resident.mar_scheduled_30d || 0) > 0 ||
      Number(resident.mar_refusals_90d || 0) > 0;
    const incidentRollup = {
      total: hasIncidentRollup ? Number(resident.incident_count_all_time || 0) : details.length,
      days30: hasIncidentRollup ? Number(resident.incident_count_30d || 0) : countRecentIncidentDetails(details, 30),
      days90: hasIncidentRollup ? Number(resident.incident_count_90d || 0) : countRecentIncidentDetails(details, 90),
      days180: hasIncidentRollup ? Number(resident.incident_count_180d || 0) : countRecentIncidentDetails(details, 180),
      lastDate: resident.last_incident_date ?? recentIncident?.incident_date ?? recentIncident?.received_at ?? null,
      lastCategory: resident.last_incident_category ?? recentIncident?.category ?? recentIncident?.incident_type ?? null
    };
    const incidentHistoryLabel = hasIncidentRollup ? "all history" : "available history";
    const profileRows = [
      ["Community", communityLabel],
      ["Resident #", displayValue(resident.res_number)],
      ["Unit", displayValue(resident.unit_number)],
      ["Age", displayValue(resident.age)],
      ["Length of stay", resident.los_days != null ? `${formatNumber(resident.los_days)} days` : "—"],
      ["Admitted", formatDateLabel(resident.admit_date)],
      ["Primary diagnosis", displayValue(resident.primary_diagnosis)],
      ["Care level", displayValue(resident.care_level)],
      ["Payor", displayValue(resident.payor)],
      ["Physician", displayValue(resident.physician)],
      ["Diet", displayValue(resident.diet)],
      ["Active medications", hasMarSummary ? formatNumber(resident.active_medication_count || 0) : "—"],
      ["Active psychotropics", hasMarSummary ? formatNumber(resident.active_psychotropic_count || 0) : "—"],
      ["Active narcotics", hasMarSummary ? formatNumber(resident.active_narcotic_count || 0) : "—"],
      ["Active PRNs", hasMarSummary ? formatNumber(resident.active_prn_count || 0) : "—"],
      ["MAR compliance, 30 days", hasMarSummary && resident.mar_compliance_pct_30d != null ? formatPercent(resident.mar_compliance_pct_30d) : "—"],
      ["MAR scheduled, 30 days", hasMarSummary ? formatNumber(resident.mar_scheduled_30d || 0) : "—"],
      ["MAR not given, 30 days", hasMarSummary ? formatNumber(resident.mar_not_given_30d || 0) : "—"],
      ["MAR refusals, 7 days", hasMarSummary ? formatNumber(resident.mar_refusals_7d || 0) : "—"],
      ["MAR refusals, 30 days", hasMarSummary ? formatNumber(resident.mar_refusals_30d || 0) : "—"],
      ["MAR refusals, 90 days", hasMarSummary ? formatNumber(resident.mar_refusals_90d || 0) : "—"],
      ["PRN given, 30 days", hasMarSummary ? formatNumber(resident.mar_prn_given_30d || 0) : "—"],
      ["PRN follow-up, 30 days", hasMarSummary ? formatNumber(resident.mar_prn_followup_30d || 0) : "—"],
      ["Last MAR record", hasMarSummary && resident.last_mar_recorded_date ? formatDateLabel(resident.last_mar_recorded_date) : "—"],
      [`Incidents, ${incidentHistoryLabel}`, formatNumber(incidentRollup.total)],
      ["Incidents, 30 days", formatNumber(incidentRollup.days30)],
      ["Incidents, 90 days", formatNumber(incidentRollup.days90)],
      ["Incidents, 180 days", formatNumber(incidentRollup.days180)],
      ["Last incident", incidentRollup.lastDate ? `${displayValue(incidentRollup.lastCategory)} · ${formatDateLabel(incidentRollup.lastDate)}` : "—"],
      ["Last documentation note", resident.last_note_date ? formatDateLabel(resident.last_note_date) : "—"],
      ["Days since last note", hasDocumentationStatus ? displayValue(resident.days_since_last_note) : "—"]
    ];
    const incidentRows = details.slice(0, 8).map((incident) => ({
      label: incident.incident_type || incident.category || "Incident",
      value: 0,
      cells: [
        formatDateLabel(incident.incident_date ?? incident.received_at),
        incident.incident_type || incident.category || "Incident",
        displayValue(incident.location || incident.site || incident.description || incident.summary || incident.notes)
      ]
    }));
    return {
      handled: true,
      tool: "resident_lookup",
      text: [
        `${label} profile`,
        `Community: ${communityLabel}. Unit: ${displayValue(resident.unit_number)}. Resident #: ${displayValue(resident.res_number)}.`,
        `Age: ${displayValue(resident.age)}. Length of stay: ${resident.los_days != null ? `${formatNumber(resident.los_days)} days` : "—"}. Admitted: ${formatDateLabel(resident.admit_date)}.`,
        `Primary diagnosis: ${displayValue(resident.primary_diagnosis)}. Care level: ${displayValue(resident.care_level)}. Payor: ${displayValue(resident.payor)}.`,
        `Physician: ${displayValue(resident.physician)}. Diet: ${displayValue(resident.diet)}.`,
        `Incident rollup (${incidentHistoryLabel}): ${formatNumber(incidentRollup.total)} total; ${formatNumber(incidentRollup.days30)} in 30 days; ${formatNumber(incidentRollup.days90)} in 90 days; ${formatNumber(incidentRollup.days180)} in 180 days.${incidentRollup.lastDate ? ` Last incident: ${displayValue(incidentRollup.lastCategory)} on ${formatDateLabel(incidentRollup.lastDate)}.` : ""}`,
        hasMarSummary
          ? `MAR summary: ${resident.mar_compliance_pct_30d == null ? "30-day compliance not calculated" : `${formatPercent(resident.mar_compliance_pct_30d)} 30-day compliance`}. ${formatNumber(resident.active_medication_count || 0)} active medications and ${formatNumber(resident.mar_refusals_30d || 0)} refusals were recorded in 30 days. The latest MAR record is ${resident.last_mar_recorded_date ? formatDateLabel(resident.last_mar_recorded_date) : "not dated"}.`
          : "Resident-level MAR summary is unavailable.",
        medicationPresentation.summary,
        hasDocumentationStatus
          ? `Documentation: last note ${resident.last_note_date ? formatDateLabel(resident.last_note_date) : "not dated"}; ${displayValue(resident.days_since_last_note)} days since last note.`
          : "Resident-level documentation status is unavailable.",
        `Matched incidents: ${formatNumber(details.length)}${recentIncident ? `. Most recent: ${recentIncident.incident_type || recentIncident.category || "Incident"} on ${formatDateLabel(recentIncident.incident_date ?? recentIncident.received_at)}.` : "."}`,
        categories.length ? `Matched incident categories: ${categories.map(([name, count]) => `${name} (${formatNumber(count)})`).join(", ")}.` : "No incident category mix is available for this resident in the incident history."
      ].join("\n"),
      trace: makeTrace({
        tool: "resident_lookup",
        dataSource: "enriched resident profile and incident detail history",
        rowCount: details.length,
        facility,
        note: resident.res_number ? `resident ${resident.res_number}` : null
      }),
      visual: {
        type: "profile_card",
        title: `${label} Resident Profile`,
        subtitle: details.length ? `${formatNumber(details.length)} matched incidents` : "Current resident profile",
        valueLabel: "Profile",
        rows: [
          ...profileRows.map(([field, value]) => ({
              label: field,
              value: 0,
              cells: [field, value]
          })),
          ...categories.map(([category, count]) => ({
            label: category,
            value: Number(count),
            meta: "category",
            cells: [category, formatNumber(count)]
          })),
          ...medicationPresentation.rows,
          ...incidentRows.map((row) => ({
            ...row,
            meta: "recent_incident"
          }))
        ]
      },
      actions: [
        { label: `Show ${label} incident history`, kind: "tool", tool: "resident_incident_history", prompt: `${label} incident history` }
      ]
    };
  }

  function buildResidentIncidentHistoryTool(content, communities, reportsSummary) {
    const residentRows = getResidentRows(communities, reportsSummary);
    const toolCommunities = { ...communities, residents: residentRows };
    const resident = findResident(content, toolCommunities);
    if (!resident) {
      return buildResidentLookupTool(content, communities, reportsSummary);
    }

    const facility = communities.facilities.find((item) => item.facility_id === resident.facility_id);
    const details = getResidentIncidentDetails(resident, communities, reportsSummary);
    const categories = countBy(details, (incident) => incident.category || incident.incident_type || "Uncategorized").slice(0, 8);
    const label = `${resident.first_name} ${resident.last_name}`.trim();
    const hasIncidentRollup = resident.last_incident_date || Number(resident.incident_count_all_time || 0) > 0;
    const incidentRollup = {
      total: hasIncidentRollup ? Number(resident.incident_count_all_time || 0) : details.length,
      days30: hasIncidentRollup ? Number(resident.incident_count_30d || 0) : countRecentIncidentDetails(details, 30),
      days90: hasIncidentRollup ? Number(resident.incident_count_90d || 0) : countRecentIncidentDetails(details, 90),
      days180: hasIncidentRollup ? Number(resident.incident_count_180d || 0) : countRecentIncidentDetails(details, 180)
    };

    return {
      handled: true,
      tool: "resident_incident_history",
      text: [
        `${label} incident history`,
        `Community: ${resident.facility_name || facility?.community_name || resident.facility_id}; unit ${resident.unit_number ?? "—"}.`,
        `Matched incidents: ${formatNumber(details.length)}.`,
        `${hasIncidentRollup ? "Historical" : "Loaded-history"} rollup: ${formatNumber(incidentRollup.total)} total; ${formatNumber(incidentRollup.days30)} in 30 days; ${formatNumber(incidentRollup.days90)} in 90 days; ${formatNumber(incidentRollup.days180)} in 180 days.`,
        details.length
          ? `Recent incidents: ${details.slice(0, 6).map((incident) => `${incident.category || incident.incident_type || "Incident"}${incident.incident_date || incident.received_at ? ` on ${formatDateLabel(incident.incident_date ?? incident.received_at)}` : ""}`).join("; ")}.`
          : "No incident records matched this resident in the loaded snapshot.",
        categories.length
          ? `Category mix: ${categories.map(([name, count]) => `${name} (${formatNumber(count)})`).join(", ")}.`
          : "Category mix is not available for this resident."
      ].join("\n"),
      trace: makeTrace({
        tool: "resident_incident_history",
        dataSource: "enriched resident profile and incident detail history",
        rowCount: details.length,
        facility,
        note: resident.res_number ? `resident ${resident.res_number}` : null
      }),
      visual: categories.length
        ? {
            type: "bar_chart",
            title: `${label} Incident Categories`,
            subtitle: "Matched incidents",
            valueLabel: "Incidents",
            rows: categories.map(([rowLabel, value]) => ({
              label: rowLabel,
              value: Number(value)
            }))
          }
        : undefined,
      actions: [
        { label: `Open ${resident.facility_name || facility?.community_name || "community"} residents`, kind: "route", route: `/communities/${resident.facility_id}?focus=residents` },
        { label: `Export ${resident.facility_name || facility?.community_name || "community"} incidents`, kind: "tool", tool: "export_csv", prompt: `export ${resident.facility_name || facility?.community_name || resident.facility_id} incidents to csv` }
      ]
    };
  }

  function buildDiagnosisMixTool(content, communities) {
    const facility = findFacility(content, communities);
    const label = getFacilityLabel(facility);
    const residents = filterByFacility(communities.residents ?? [], facility);
    const groupedByCommunity = !facility && /\b(by|across|for|each|all)\s+(?:each |all )?(community|communities|facility|facilities)\b|\bcommunity mix\b/i.test(content);

    if (groupedByCommunity) {
      const communityRows = groupResidentsByCommunity(communities).map((group) => {
        const diagnoses = countBy(group.residents, (resident) => resident.primary_diagnosis || "Unspecified");
        const [topDiagnosis = "No diagnosis loaded", topCount = 0] = diagnoses[0] ?? [];
        const share = group.residents.length ? topCount / group.residents.length * 100 : 0;
        const nextDiagnoses = diagnoses.slice(1, 3).map(([name, count]) => `${name} (${formatNumber(count)})`).join(", ") || "—";
        return {
          label: group.label,
          value: Number(topCount),
          cells: [
            group.label,
            formatNumber(group.residents.length),
            topDiagnosis,
            formatNumber(topCount),
            formatPercent(share),
            nextDiagnoses
          ]
        };
      });

      return {
        handled: true,
        tool: "diagnosis_mix",
        text: [
          "Diagnosis mix by community",
          communityRows.length
            ? `${formatNumber(communityRows.length)} communities compared across ${formatNumber(residents.length)} current residents.`
            : "No diagnosis values are loaded for this slice."
        ].join("\n"),
        trace: makeTrace({
          tool: "diagnosis_mix",
          dataSource: "current resident roster",
          rowCount: residents.length,
          note: "group=community"
        }),
        visual: {
          type: "table",
          title: "Diagnosis Mix by Community",
          subtitle: "Current residents",
          valueLabel: "Residents",
          columns: ["Community", "Residents", "Leading diagnosis", "Count", "Share", "Next diagnoses"],
          rows: communityRows
        },
        actions: [
          { label: "Export resident roster", kind: "tool", tool: "export_csv", prompt: "export Portfolio residents to csv" }
        ]
      };
    }

    const rows = limitRowsForRequest(countBy(residents, (resident) => resident.primary_diagnosis || "Unspecified"), content, 10);

    return {
      handled: true,
      tool: "diagnosis_mix",
      text: [
        `${label} diagnosis mix`,
        `Residents counted: ${formatNumber(residents.length)}.`,
        rows.length ? `Top diagnoses: ${rows.slice(0, 5).map(([name, count]) => `${name} (${formatNumber(count)})`).join(", ")}.` : "No diagnosis values are loaded for this slice."
      ].join("\n"),
      trace: makeTrace({
        tool: "diagnosis_mix",
        dataSource: "current resident roster",
        rowCount: residents.length,
        facility
      }),
      visual: {
        type: "bar_chart",
        title: `${label} Diagnosis Mix`,
        subtitle: "Current residents",
        valueLabel: "Residents",
        rows: rows.map(([rowLabel, value]) => ({
          label: rowLabel,
          value: Number(value)
        }))
      },
      actions: [
        { label: `Export ${facility ? label : "resident roster"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} residents to csv` }
      ]
    };
  }

  function buildLengthOfStayMixTool(content, communities) {
    const facility = findFacility(content, communities);
    const label = getFacilityLabel(facility);
    const residents = filterByFacility(communities.residents ?? [], facility);
    const groupedByCommunity = !facility && /\b(by|across|for|each|all)\s+(?:each |all )?(community|communities|facility|facilities)\b|\bcommunity mix\b/i.test(content);

    if (groupedByCommunity) {
      const communityRows = groupResidentsByCommunity(communities).map((group) => {
        const losValues = group.residents.map((resident) => Number(resident.los_days)).filter(Number.isFinite);
        const longest = Math.max(0, ...losValues);
        const oneYearPlus = losValues.filter((value) => value >= 365).length;
        return {
          label: group.label,
          value: Math.round(average(losValues)),
          cells: [
            group.label,
            formatNumber(group.residents.length),
            formatNumber(Math.round(average(losValues))),
            formatNumber(Math.round(median(losValues))),
            formatNumber(oneYearPlus),
            formatPercent(group.residents.length ? oneYearPlus / group.residents.length * 100 : 0),
            formatNumber(longest)
          ]
        };
      });

      return {
        handled: true,
        tool: "length_of_stay_mix",
        text: [
          "Length of stay by community",
          communityRows.length
            ? `${formatNumber(communityRows.length)} communities compared across ${formatNumber(residents.length)} current residents.`
            : "No resident LOS data is loaded."
        ].join("\n"),
        trace: makeTrace({
          tool: "length_of_stay_mix",
          dataSource: "current resident roster",
          rowCount: residents.length,
          note: "group=community"
        }),
        visual: {
          type: "table",
          title: "Length of Stay by Community",
          subtitle: "Current residents",
          valueLabel: "Average LOS days",
          columns: ["Community", "Residents", "Average LOS", "Median LOS", "365+ days", "365+ share", "Longest stay"],
          rows: communityRows
        },
        actions: [
          { label: "Open resident search", kind: "route", route: "/resident-search" }
        ]
      };
    }

    const buckets = countBy(residents, (resident) => getLosBucket(resident.los_days));
    const longest = [...residents].sort((left, right) => Number(right.los_days || 0) - Number(left.los_days || 0)).slice(0, 5);

    return {
      handled: true,
      tool: "length_of_stay_mix",
      text: [
        `${label} length of stay mix`,
        `Average LOS: ${Math.round(average(residents.map((resident) => resident.los_days)))} days across ${formatNumber(residents.length)} residents.`,
        longest.length ? `Longest stays: ${longest.map((resident) => `${resident.first_name} ${resident.last_name} (${formatNumber(resident.los_days)} days)`).join(", ")}.` : "No resident LOS data is loaded."
      ].join("\n"),
      trace: makeTrace({
        tool: "length_of_stay_mix",
        dataSource: "current resident roster",
        rowCount: residents.length,
        facility
      }),
      visual: {
        type: "donut_chart",
        title: `${label} Length of Stay Mix`,
        subtitle: "Current residents",
        valueLabel: "Residents",
        rows: buckets.map(([rowLabel, value]) => ({
          label: rowLabel,
          value: Number(value)
        }))
      },
      actions: [
        { label: `Open ${facility ? `${label} residents` : "resident search"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=residents` : "/resident-search" }
      ]
    };
  }

  function buildResidentDemographicsTool(content, communities) {
    const facility = findFacility(content, communities);
    const label = getFacilityLabel(facility);
    const residents = filterByFacility(communities.residents ?? [], facility);
    const averageAge = average(residents.map((resident) => resident.age));
    const ageBuckets = countBy(residents, (resident) => getAgeBucket(resident.age));
    const oldest = [...residents].sort((left, right) => Number(right.age || 0) - Number(left.age || 0)).slice(0, 5);

    return {
      handled: true,
      tool: "resident_demographics",
      text: [
        `${label} resident demographics`,
        `Average age: ${averageAge.toFixed(1)} across ${formatNumber(residents.length)} residents.`,
        oldest.length ? `Oldest residents: ${oldest.map((resident) => `${resident.first_name} ${resident.last_name} (${resident.age})`).join(", ")}.` : "No resident age data is loaded."
      ].join("\n"),
      trace: makeTrace({
        tool: "resident_demographics",
        dataSource: "current resident roster",
        rowCount: residents.length,
        facility
      }),
      visual: {
        type: "bar_chart",
        title: `${label} Age Mix`,
        subtitle: "Current residents",
        valueLabel: "Residents",
        rows: ageBuckets.map(([rowLabel, value]) => ({
          label: rowLabel,
          value: Number(value)
        }))
      },
      actions: [
        { label: `Export ${facility ? label : "resident roster"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} residents to csv` }
      ]
    };
  }

  function buildResidentSearchTool(content, communities, reportsSummary = {}) {
    const facility = findFacility(content, communities);
    const rawSearchTerms = getResidentSearchTerms(content);
    const facilityTerms = getFacilitySearchTerms(facility);
    const searchTerms = rawSearchTerms.filter((term) => !facilityTerms.has(term));
    const residents = filterByFacility(getResidentRows(communities, reportsSummary), facility);
    const broadBrowse = isBroadResidentBrowseIntent(content, searchTerms);
    const rankedMatches = residents
      .map((resident) => {
        const haystack = normalizeText([
          resident.first_name,
          resident.last_name,
          resident.res_number,
          resident.unit_number,
          resident.primary_diagnosis,
          resident.facility_name
        ].filter(Boolean).join(" "));
        const score = searchTerms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { resident, score };
      })
      .filter((item) => searchTerms.length ? item.score > 0 : true)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        if (broadBrowse) {
          return String(left.resident.facility_name ?? "").localeCompare(String(right.resident.facility_name ?? "")) ||
            String(left.resident.last_name ?? "").localeCompare(String(right.resident.last_name ?? "")) ||
            String(left.resident.first_name ?? "").localeCompare(String(right.resident.first_name ?? ""));
        }
        return Number(right.resident.los_days || 0) - Number(left.resident.los_days || 0);
      });
    const defaultLimit = 1000;
    const matches = limitRowsForRequest(rankedMatches, content, defaultLimit, 1000);

    if (!matches.length && searchTerms.length) {
      return buildResidentRecoveryResult(content, communities);
    }

    const displayedCount = matches.length;
    const totalMatches = rankedMatches.length;
    const scopeLabel = facility ? ` in ${getFacilityLabel(facility)}` : "";
    const resultLabel = facility ? `${getFacilityLabel(facility)} resident roster` : "Resident roster";
    const filterLabel = searchTerms.length ? ` matching ${searchTerms.join(", ")}` : "";
    const compactMatchLine = searchTerms.length && matches.length <= 8
      ? `Matches: ${matches.map(({ resident }) => getResidentName(resident)).join("; ")}.`
      : null;
    return {
      handled: true,
      tool: "resident_search",
      text: [
        `${resultLabel}.`,
        `${formatNumber(totalMatches)} current resident${totalMatches === 1 ? "" : "s"} are loaded${scopeLabel}${filterLabel}.`,
        compactMatchLine,
        displayedCount < totalMatches
          ? `Showing ${formatNumber(displayedCount)} of ${formatNumber(totalMatches)} residents below. Narrow the search to reduce the list.`
          : `All ${formatNumber(displayedCount)} matching resident${displayedCount === 1 ? " is" : "s are"} shown below.`
      ].filter(Boolean).join("\n"),
      trace: makeTrace({
        tool: "resident_search",
        dataSource: "current resident roster",
        rowCount: totalMatches,
        facility,
        note: [
          searchTerms.length ? `terms: ${searchTerms.join(", ")}` : "browse roster",
          rawSearchTerms.length !== searchTerms.length ? "facility terms removed from search filters" : null,
          displayedCount < totalMatches ? `showing ${displayedCount} of ${totalMatches}` : null
        ].filter(Boolean).join("; ")
      }),
      visual: {
        type: "table",
        title: facility ? `${getFacilityLabel(facility)} Resident Roster` : "Resident Roster",
        subtitle: [
          facility ? getFacilityLabel(facility) : "Current roster",
          displayedCount < totalMatches ? `showing ${formatNumber(displayedCount)} of ${formatNumber(totalMatches)}` : null
        ].filter(Boolean).join(" · "),
        valueLabel: "Residents",
        originalRowCount: totalMatches,
        columns: ["Resident", "Community", "Unit", "Age", "LOS", "Admit date", "Diagnosis", "Care level", "Payor", "Resident #"],
        rows: matches.map(({ resident }) => ({
          label: getResidentName(resident),
          value: Number(resident.los_days || 0),
          cells: [
            getResidentName(resident),
            resident.facility_name || resident.facility_id,
            resident.unit_number ?? "—",
            resident.age ?? "—",
            `${formatNumber(resident.los_days)} days`,
            resident.admit_date ? formatDateLabel(resident.admit_date) : "—",
            resident.primary_diagnosis || "—",
            resident.care_level || "—",
            resident.payor || resident.payor_text || "—",
            resident.res_number ?? "—"
          ]
        }))
      },
      actions: []
    };
  }

  function buildDocumentationGapsTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = getFacilityLabel(facility);
    const sourceRows = filterByFacility(reportsSummary.documentationGaps ?? [], facility)
      .sort((left, right) => Number(right.days_since_last_note || 0) - Number(left.days_since_last_note || 0));
    const rows = limitRowsForRequest(sourceRows, content, 12);

    return {
      handled: true,
      tool: "documentation_gaps",
      text: [
        `${label} documentation gaps`,
        rows.length ? `Largest gaps: ${rows.slice(0, 5).map((row) => `${row.resident_name} (${formatNumber(row.days_since_last_note)} days)`).join(", ")}.` : "Documentation gap data is unavailable for this scope."
      ].join("\n"),
      trace: makeTrace({
        tool: "documentation_gaps",
        dataSource: "documentation gap rows",
        rowCount: sourceRows.length,
        facility
      }),
      visual: {
        type: "table",
        title: `${label} Documentation Gaps`,
        subtitle: "Largest days since last note",
        columns: ["Resident", "Community", "Last note", "Days"],
        rows: rows.map((row) => ({
          label: row.resident_name,
          value: Number(row.days_since_last_note || 0),
          cells: [
            row.resident_name,
            row.facility_name || row.facility_id,
            row.last_note_date ?? "—",
            formatNumber(row.days_since_last_note)
          ]
        }))
      },
      actions: [
        { label: `Export ${facility ? label : "documentation gaps"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} documentation gaps to csv` }
      ]
    };
  }

  function buildResidentRiskSummaryTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const residents = filterByFacility(communities.residents ?? [], facility);
    const details = filterByFacility(communities.incidentDetails ?? [], facility);
    const gaps = filterByFacility(reportsSummary.documentationGaps ?? [], facility);
    const incidentCounts = new Map(countBy(details, (incident) => incident.resident_id || incident.client_name));
    const gapMap = new Map(gaps.map((row) => [String(row.resident_id ?? row.resident_name), row]));
    const rankedRows = residents
      .map((resident) => {
        const name = `${resident.first_name} ${resident.last_name}`.trim();
        const gap = gapMap.get(String(resident.res_number)) ?? gapMap.get(name);
        return {
          resident,
          name,
          incidents: incidentCounts.get(resident.res_number) ?? incidentCounts.get(name) ?? 0,
          daysSinceLastNote: Number(gap?.days_since_last_note || 0),
          score: (incidentCounts.get(resident.res_number) ?? incidentCounts.get(name) ?? 0) * 5 + Number(gap?.days_since_last_note || 0) / 30
        };
      })
      .sort((left, right) => right.score - left.score);
    const rows = limitRowsForRequest(rankedRows, content, 12);
    const label = getFacilityLabel(facility);
    const loadedMonths = [...new Set(details.map((row) => row.month_bucket).filter(Boolean))].sort();
    const loadedPeriod = loadedMonths.join(", ") || null;

    return {
      handled: true,
      tool: "resident_risk_summary",
      text: [
        `${label} resident review queue`,
        "Operational prioritization from available incidents and current documentation gaps. This is not a clinical risk score.",
        rows.length ? `Top residents: ${formatResidentList(rows.slice(0, 5).map((row) => `${row.name} (${formatNumber(row.incidents)} incidents, ${formatNumber(row.daysSinceLastNote)} gap days)`))}.` : "No residents matched this summary."
      ].join("\n"),
      trace: makeTrace({
        tool: "resident_risk_summary",
        dataSource: "resident roster, incident records, documentation gaps",
        rowCount: rows.length,
        facility,
        period: loadedPeriod
      }),
      visual: {
        type: "table",
        title: `${label} Resident Review Queue`,
        subtitle: "Available incident activity + current documentation gaps · not a clinical risk score",
        columns: ["Resident", "Community", "Unit", "Incidents", "Documentation gap days", "LOS"],
        rows: rows.map((row) => ({
          label: row.name,
          value: row.score,
          cells: [
            row.name,
            row.resident.facility_name || row.resident.facility_id,
            row.resident.unit_number ?? "—",
            formatNumber(row.incidents),
            formatNumber(row.daysSinceLastNote),
            `${formatNumber(row.resident.los_days)} days`
          ]
        }))
      },
      actions: [
        { label: `Open ${facility ? label : "resident search"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=residents` : "/resident-search" }
      ]
    };
  }

  return {
    buildAdHocResidentVisual,
    buildDiagnosisMixTool,
    buildDocumentationGapsTool,
    buildLengthOfStayMixTool,
    buildResidentDemographicsTool,
    buildResidentFlowWeeklyTool,
    buildResidentIncidentHistoryTool,
    buildResidentLookupTool,
    buildResidentRiskSummaryTool,
    buildResidentSearchTool
  };
}

export function createResidentToolDefinitions(handlers) {
  return [
    { name: "ad_hoc_resident_list", domain: "residents", handler: handlers.ad_hoc_resident_list },
    { name: "resident_lookup", domain: "residents", handler: handlers.resident_lookup },
    { name: "resident_search", domain: "residents", handler: handlers.resident_search },
    { name: "resident_flow_weekly", domain: "residents", handler: handlers.resident_flow_weekly },
    { name: "resident_incident_history", domain: "residents", handler: handlers.resident_incident_history },
    { name: "resident_risk_summary", domain: "residents", handler: handlers.resident_risk_summary },
    { name: "resident_demographics", domain: "residents", handler: handlers.resident_demographics },
    { name: "diagnosis_mix", domain: "residents", handler: handlers.diagnosis_mix },
    { name: "length_of_stay_mix", domain: "residents", handler: handlers.length_of_stay_mix },
    { name: "documentation_gaps", domain: "residents", handler: handlers.documentation_gaps }
  ];
}
