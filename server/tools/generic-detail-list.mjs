export function isAdmissionIntent(content, normalizeText = defaultNormalizeText) {
  const text = normalizeText(content);
  return /\b(admissions?|admitted|admits?|admit|intakes?|move[\s-]?ins?|move[\s-]?in|new residents?|new clients?)\b/.test(text);
}

export function hasDateRangeIntent(content, normalizeText = defaultNormalizeText) {
  const text = normalizeText(content);
  return /\b(20\d{2}|last month|prior month|previous month|current month|this month|from|through|thru|between|since|until|to|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december)\b/.test(text);
}

function defaultNormalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSortableDate(value) {
  if (!value) return "";
  const text = String(value);
  const isoDate = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (isoDate) return `${isoDate[1]}-${String(Number(isoDate[2])).padStart(2, "0")}-${String(Number(isoDate[3])).padStart(2, "0")}`;
  const dateParts = text.match(/\b(\d{1,4})[!/.](\d{1,2})[!/.](\d{1,4})\b/);
  if (dateParts) {
    const [, first, second, third] = dateParts;
    if (!first || !second || !third) return text;
    const isYearFirst = first.length === 4;
    const year = isYearFirst ? first : third;
    const month = second;
    const day = isYearFirst ? third : first;
    if (/^20\d{2}$/.test(year)) return `${year}-${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  }
  return text;
}

export function createDatasetRowNormalizer({
  firstPresent,
  getFacilityNameById,
  normalizeMonthBucket
}) {
  return function normalizeDatasetRows(dataset, rows, communities) {
    return rows.map((row) => {
      const communityName = firstPresent(row, ["community_name", "facility_name", "Facility_Name"]) ||
        getFacilityNameById(communities, firstPresent(row, ["facility_id", "Facility", "facility"]));

      if (dataset === "incidents") {
        return {
          incident_date: firstPresent(row, ["incident_date", "received_at", "event_date"]),
          month_bucket: normalizeMonthBucket(firstPresent(row, ["month_bucket", "reporting_month"])),
          facility_id: firstPresent(row, ["facility_id", "Facility", "facility"]),
          community_name: communityName,
          resident_id: firstPresent(row, ["resident_id", "res_number", "client_id"]),
          client_name: firstPresent(row, ["client_name", "resident_name"]),
          unit: firstPresent(row, ["unit_number", "unit", "room"]),
          category: firstPresent(row, ["category", "incident_category"]),
          incident_type: firstPresent(row, ["incident_type", "type"]),
          description: firstPresent(row, ["description", "incident_description", "narrative", "email_body"]),
          assistance_given: firstPresent(row, ["assistance_given", "action_taken"])
        };
      }

      if (dataset === "residents") {
        const firstName = firstPresent(row, ["first_name", "First_Name"]);
        const lastName = firstPresent(row, ["last_name", "Last_Name"]);
        return {
          facility_id: firstPresent(row, ["facility_id", "Facility", "facility"]),
          community_name: communityName,
          resident_id: firstPresent(row, ["res_number", "resident_id", "client_id"]),
          resident_name: firstPresent(row, ["resident_name", "client_name"]) || [firstName, lastName].filter(Boolean).join(" "),
          unit: firstPresent(row, ["unit_number", "unit", "room"]),
          age: firstPresent(row, ["age"]),
          admit_date: firstPresent(row, ["admit_date", "admission_date"]),
          los_days: firstPresent(row, ["los_days", "length_of_stay"]),
          primary_diagnosis: firstPresent(row, ["primary_diagnosis", "diagnosis"]),
          care_level: firstPresent(row, ["care_level"]),
          payor: firstPresent(row, ["payor", "payer"]),
          physician: firstPresent(row, ["physician", "attending_physician"]),
          incident_count_all_time: Number(firstPresent(row, ["incident_count_all_time"]) || 0),
          incident_count_30d: Number(firstPresent(row, ["incident_count_30d"]) || 0),
          incident_count_90d: Number(firstPresent(row, ["incident_count_90d"]) || 0),
          incident_count_180d: Number(firstPresent(row, ["incident_count_180d"]) || 0),
          last_incident_date: firstPresent(row, ["last_incident_date"]),
          last_incident_category: firstPresent(row, ["last_incident_category"]),
          last_note_date: firstPresent(row, ["last_note_date"]),
          days_since_last_note: firstPresent(row, ["days_since_last_note"]),
          active_medication_count: Number(firstPresent(row, ["active_medication_count"]) || 0),
          active_psychotropic_count: Number(firstPresent(row, ["active_psychotropic_count"]) || 0),
          active_narcotic_count: Number(firstPresent(row, ["active_narcotic_count"]) || 0),
          active_prn_count: Number(firstPresent(row, ["active_prn_count"]) || 0),
          mar_compliance_pct_30d: firstPresent(row, ["mar_compliance_pct_30d", "compliance_pct_30d"]),
          mar_refusals_7d: Number(firstPresent(row, ["mar_refusals_7d", "refusals_7d"]) || 0),
          mar_refusals_30d: Number(firstPresent(row, ["mar_refusals_30d", "refusals_30d"]) || 0),
          mar_refusals_90d: Number(firstPresent(row, ["mar_refusals_90d", "refusals_90d"]) || 0),
          mar_prn_given_30d: Number(firstPresent(row, ["mar_prn_given_30d", "prn_given_30d"]) || 0),
          mar_prn_followup_30d: Number(firstPresent(row, ["mar_prn_followup_30d", "prn_followup_30d"]) || 0)
        };
      }

      if (dataset === "admissions") {
        return {
          episode_id: firstPresent(row, ["episode_id"]),
          facility_id: firstPresent(row, ["facility_id", "Facility", "facility"]),
          community_name: communityName,
          resident_id: firstPresent(row, ["resident_id", "res_number", "Res_Number", "client_id"]),
          resident_name: firstPresent(row, ["resident_name", "client_name"]),
          admit_date: firstPresent(row, ["admit_date", "admission_date", "move_in_date", "intake_date"]),
          discharge_date: firstPresent(row, ["discharge_date", "move_out_date", "exit_date"]),
          discharge_reason: firstPresent(row, ["discharge_reason", "reason"]),
          discharge_destination: firstPresent(row, ["discharge_destination", "destination"]),
          episode_status: firstPresent(row, ["episode_status", "status"]),
          month_bucket: normalizeMonthBucket(firstPresent(row, ["month_bucket", "reporting_month", "month", "admit_date"]))
        };
      }

      if (dataset === "census") {
        return {
          month_bucket: normalizeMonthBucket(firstPresent(row, ["month_bucket", "reporting_month", "month"])),
          facility_id: firstPresent(row, ["facility_id", "Facility", "facility"]),
          community_name: communityName,
          census: Number(firstPresent(row, ["census", "resident_count", "active_residents"]) || 0)
        };
      }

      if (dataset === "medicationCompliance") {
        return {
          month_bucket: normalizeMonthBucket(firstPresent(row, ["month_bucket", "reporting_month", "month"])),
          facility_id: firstPresent(row, ["facility_id", "Facility", "facility"]),
          community_name: communityName,
          total_scheduled: Number(firstPresent(row, ["total_scheduled", "scheduled", "scheduled_count"]) || 0),
          total_given: Number(firstPresent(row, ["total_given", "given", "given_count"]) || 0),
          compliance_pct: Number(firstPresent(row, ["compliance_pct", "compliance", "compliance_rate"]) || 0)
        };
      }

      if (dataset === "refusals") {
        return {
          month_bucket: normalizeMonthBucket(firstPresent(row, ["month_bucket", "reporting_month", "month"])),
          facility_id: firstPresent(row, ["facility_id", "Facility", "facility"]),
          community_name: communityName,
          medication: firstPresent(row, ["medication", "medication_name", "drug_name"]),
          total_scheduled: Number(firstPresent(row, ["total_scheduled", "scheduled", "scheduled_count"]) || 0),
          refusals: Number(firstPresent(row, ["refusals", "refusal_count", "refused"]) || 0),
          refusal_pct: Number(firstPresent(row, ["refusal_pct", "refusal_rate"]) || 0)
        };
      }

      if (dataset === "documentationGaps") {
        return {
          facility_id: firstPresent(row, ["facility_id", "Facility", "facility"]),
          community_name: communityName,
          resident_id: firstPresent(row, ["resident_id", "res_number", "client_id"]),
          resident_name: firstPresent(row, ["resident_name", "client_name"]),
          last_note_date: firstPresent(row, ["last_note_date", "latest_note_date"]),
          days_since_last_note: Number(firstPresent(row, ["days_since_last_note", "documentation_gap_days"]) || 0)
        };
      }

      return row;
    });
  };
}

export function createGenericDetailListTools({
  buildUnavailablePeriodResult,
  displayValue,
  filterByFacility,
  filterIncidentsByCategory,
  findFacility,
  fingerprintRows,
  firstPresent,
  formatDateLabel,
  formatIncidentCategoryFilterLabel,
  formatMonthLabel,
  getFacilityMaps,
  getFacilityNameById,
  getIncidentCategoryFilter,
  getIncidentDetailRows,
  getIncidentRows,
  getRequestedMonthBuckets,
  getResidentRows,
  makePreviewTableVisual,
  makeTrace,
  normalizeMonthBucket,
  normalizeText,
  rowsToCsv
}) {
  const normalizeDatasetRows = createDatasetRowNormalizer({
    firstPresent,
    getFacilityNameById,
    normalizeMonthBucket
  });

  function getDatasetMonthBucket(dataset, row, content) {
    if (dataset === "admissions") {
      return normalizeMonthBucket(firstPresent(row, ["admit_date", "admission_date", "move_in_date", "intake_date", "month_bucket"]));
    }
    if (dataset === "residents" && isAdmissionIntent(content, normalizeText)) {
      return normalizeMonthBucket(firstPresent(row, ["admit_date", "admission_date", "move_in_date", "intake_date"]));
    }
    return normalizeMonthBucket(firstPresent(row, ["month_bucket", "reporting_month", "month"]));
  }

  function enrichRowsWithFacilityName(rows, communities) {
    const { byId } = getFacilityMaps(communities);
    return rows.map((row) => ({
      ...row,
      community_name: row.community_name ?? row.facility_name ?? byId.get(row.facility_id)?.community_name ?? row.facility_id
    }));
  }

  function getRequestedDataset(content) {
    const text = normalizeText(content);
    if (/\b(incident|incidents|awol|elopement|sentinel|police|injury|category)\b/.test(text)) return "incidents";
    if (isAdmissionIntent(content, normalizeText)) return "admissions";
    if (/\b(resident|residents|roster|age|los|length of stay|diagnosis|payor|physician)\b/.test(text)) return "residents";
    if (/\b(census|occupancy|headcount|population)\b/.test(text)) return "census";
    if (/\b(refusal|refused)\b/.test(text)) return "refusals";
    if (/\b(medication|meds|emar|compliance)\b/.test(text)) return "medicationCompliance";
    if (/\b(documentation|note gap|doc gap)\b/.test(text)) return "documentationGaps";
    return "summary";
  }

  function getExportRows(dataset, communities, reportsSummary, facility) {
    if (dataset === "residents") {
      return filterByFacility(enrichRowsWithFacilityName(getResidentRows(communities, reportsSummary), communities), facility);
    }
    if (dataset === "admissions") {
      const tables = reportsSummary?.toolContext?.tables ?? {};
      const rows = [
        ...(tables.resident_episode_history ?? []),
        ...(reportsSummary?.residentEpisodeHistory ?? [])
      ];
      const sourceRows = rows.length ? rows : getResidentRows(communities, reportsSummary);
      return filterByFacility(enrichRowsWithFacilityName(sourceRows, communities), facility);
    }
    if (dataset === "incidents") {
      return filterByFacility(enrichRowsWithFacilityName(getIncidentDetailRows(communities, reportsSummary), communities), facility).map((row) => ({
        ...row,
        resident_name: row.client_name ?? row.resident_name ?? row.resident_id,
        description: firstPresent(row, ["description", "incident_description", "narrative", "email_body"])
      }));
    }
    if (dataset === "census") return filterByFacility(enrichRowsWithFacilityName(communities.census, communities), facility);
    if (dataset === "medicationCompliance") return filterByFacility(reportsSummary.medicationCompliance, facility);
    if (dataset === "refusals") return filterByFacility(enrichRowsWithFacilityName(reportsSummary.refusalByMedication, communities), facility);
    if (dataset === "documentationGaps") return filterByFacility(reportsSummary.documentationGaps, facility);
    return communities.facilities.map((facilityRow) => ({
      facility_id: facilityRow.facility_id,
      community_name: facilityRow.community_name,
      total_residents: facilityRow.total_residents
    }));
  }

  function selectDatasetRows(content, communities, reportsSummary) {
    const dataset = getRequestedDataset(content);
    const facility = findFacility(content, communities);
    const portfolioSourceRows = getExportRows(dataset, communities, reportsSummary, null);
    const sourceRows = getExportRows(dataset, communities, reportsSummary, facility);
    const availableMonths = [...new Set(sourceRows.map((row) => getDatasetMonthBucket(dataset, row, content)).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    const categoryFilter = dataset === "incidents" ? getIncidentCategoryFilter(content, sourceRows) : null;
    const portfolioRowsForRequest = categoryFilter ? filterIncidentsByCategory(portfolioSourceRows, categoryFilter) : portfolioSourceRows;
    const portfolioAvailableMonths = [...new Set(portfolioRowsForRequest.map((row) => getDatasetMonthBucket(dataset, row, content)).filter(Boolean))].sort();
    let rows = requestedMonths.length ? sourceRows.filter((row) => requestedMonths.includes(getDatasetMonthBucket(dataset, row, content))) : sourceRows;
    if (categoryFilter) rows = filterIncidentsByCategory(rows, categoryFilter);
    rows = normalizeDatasetRows(dataset, rows, communities);
    if (dataset === "incidents") rows = rows.sort((left, right) => String(right.incident_date ?? "").localeCompare(String(left.incident_date ?? "")));
    else if ((dataset === "admissions" || (dataset === "residents" && isAdmissionIntent(content, normalizeText)))) rows = rows.sort((left, right) => normalizeSortableDate(left.admit_date).localeCompare(normalizeSortableDate(right.admit_date)));
    return {
      dataset,
      facility,
      sourceRows,
      rows,
      availableMonths,
      portfolioAvailableMonths,
      requestedMonths,
      missingMonths,
      categoryFilter,
      categoryLabel: formatIncidentCategoryFilterLabel(categoryFilter),
      rowSetId: fingerprintRows(rows)
    };
  }

  function buildExportTool(content, communities, reportsSummary) {
    const selection = selectDatasetRows(content, communities, reportsSummary);
    const { dataset, facility, rows, requestedMonths, missingMonths, categoryFilter, categoryLabel, availableMonths, portfolioAvailableMonths, rowSetId } = selection;
    const aggregateCategoryTotal = dataset === "incidents" && categoryFilter && requestedMonths.length
      ? filterIncidentsByCategory(filterByFacility(getIncidentRows(communities, reportsSummary), facility).filter((row) => requestedMonths.includes(row.month_bucket)), categoryFilter).reduce((total, row) => total + Number(row.incident_count || 0), 0)
      : 0;

    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "export_csv",
        label: facility?.community_name ?? "Portfolio",
        subject: `${categoryLabel ? `${categoryLabel} ` : ""}${dataset} export`,
        dataSource: `${dataset} export records`,
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: facility ? [{ label: "Portfolio", availableMonths: portfolioAvailableMonths }] : [],
        facility,
        note: categoryLabel ? `category=${categoryLabel}` : null
      });
    }
    if (aggregateCategoryTotal > 0 && rows.length !== aggregateCategoryTotal) {
      return {
        handled: true,
        tool: "export_csv",
        safeRefusal: true,
        truthState: "plan_rejected",
        text: `I stopped this export because the incident detail count (${rows.length.toLocaleString("en-US")}) does not match the structured ${categoryLabel} category total (${aggregateCategoryTotal.toLocaleString("en-US")}) for the same scope.`,
        contractViolation: `detail count ${rows.length} does not match aggregate category total ${aggregateCategoryTotal}`,
        trace: makeTrace({ tool: "export_csv", dataSource: "incident export grain validation", rowCount: rows.length, facility, period: requestedMonths.join(", "), note: categoryLabel ? `category=${categoryLabel}; grain mismatch` : "grain mismatch", truthState: "plan_rejected" })
      };
    }
    const csv = rowsToCsv(rows);
    const label = facility?.community_name ?? "portfolio";
    const datasetLabel = dataset === "admissions" || (dataset === "residents" && isAdmissionIntent(content, normalizeText))
      ? "admission"
      : dataset === "incidents"
        ? "incident"
        : dataset === "residents"
          ? "resident"
          : dataset === "documentationGaps"
            ? "documentation"
            : dataset === "refusals"
              ? "medication refusal"
              : dataset === "compliance"
                ? "medication compliance"
                : dataset;
    const scopeSlug = [label, datasetLabel, categoryFilter === "awol" ? "awol-elopement" : categoryFilter, requestedMonths.join("-")].filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const filename = `${scopeSlug}.csv`;

    return {
      handled: true,
      tool: "export_csv",
      text: `Prepared ${rows.length.toLocaleString("en-US")} ${datasetLabel} entr${rows.length === 1 ? "y" : "ies"} for ${label}${requestedMonths.length ? ` across ${requestedMonths.map(formatMonthLabel).join(" and ")}` : ""}${categoryLabel ? ` filtered to ${categoryLabel}` : ""}.`,
      trace: makeTrace({ tool: "export_csv", dataSource: `${dataset} export records`, rowCount: rows.length, facility, period: requestedMonths.join(", ") || null, note: categoryLabel ? `category=${categoryLabel}` : null }),
      artifact: { type: "csv", filename, mimeType: "text/csv", content: csv, rowSetId, rowCount: rows.length },
      provenance: { rowSetId, rowCount: rows.length, dataset }
    };
  }

  function buildDetailListTool(content, communities, reportsSummary) {
    const selection = selectDatasetRows(content, communities, reportsSummary);
    const { dataset, facility, rows, requestedMonths, missingMonths, availableMonths, portfolioAvailableMonths, rowSetId } = selection;
    const label = facility?.community_name ?? "Portfolio";
    const admissionIntent = dataset === "admissions" || (dataset === "residents" && isAdmissionIntent(content, normalizeText));

    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "detail_list",
        label,
        subject: `${dataset} detail`,
        dataSource: `${dataset} detail`,
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: facility ? [{ label: "Portfolio", availableMonths: portfolioAvailableMonths }] : [],
        facility,
        note: "requested period unavailable"
      });
    }

    const presentations = {
      residents: {
        title: "Resident Roster Detail",
        columns: ["Community", "Resident", "Unit", "Age", "Admit date", "LOS days", "Diagnosis"],
        cells: (row) => [row.community_name, row.resident_name, row.unit, row.age, formatDateLabel(row.admit_date), row.los_days, row.primary_diagnosis]
      },
      admissions: {
        title: "Admission Detail",
        columns: ["Admit date", "Community", "Resident", "Discharge date", "Status", "Outcome"],
        cells: (row) => [formatDateLabel(row.admit_date), row.community_name, row.resident_name, formatDateLabel(row.discharge_date), row.episode_status, row.discharge_reason ?? row.discharge_destination]
      },
      census: { title: "Census Detail", columns: ["Month", "Community", "Census"], cells: (row) => [formatMonthLabel(row.month_bucket), row.community_name, row.census] },
      medicationCompliance: { title: "Medication Compliance Detail", columns: ["Month", "Community", "Scheduled", "Given", "Compliance %"], cells: (row) => [formatMonthLabel(row.month_bucket), row.community_name, row.total_scheduled, row.total_given, row.compliance_pct] },
      refusals: { title: "Medication Refusal Detail", columns: ["Month", "Community", "Medication", "Scheduled", "Refusals", "Refusal %"], cells: (row) => [formatMonthLabel(row.month_bucket), row.community_name, row.medication, row.total_scheduled, row.refusals, row.refusal_pct] },
      documentationGaps: { title: "Documentation Gap Detail", columns: ["Community", "Resident", "Last note", "Days since last note"], cells: (row) => [row.community_name, row.resident_name, formatDateLabel(row.last_note_date), row.days_since_last_note] },
      summary: { title: "Community Summary Detail", columns: ["Community", "Residents"], cells: (row) => [row.community_name, row.total_residents] }
    };
    const presentation = presentations[dataset] ?? presentations.summary;
    const visualRows = rows.map((row, index) => ({
      label: String(admissionIntent ? (row.resident_name ?? `Row ${index + 1}`) : (presentation.cells(row)[1] ?? presentation.cells(row)[0] ?? `Row ${index + 1}`)),
      value: 0,
      cells: presentation.cells(row).map(displayValue)
    }));
    const periodLabel = requestedMonths.length ? requestedMonths.map(formatMonthLabel).join(" and ") : "available data";
    const detailLabel = admissionIntent ? "admissions" : dataset;
    const filename = `${label}-${detailLabel}-${requestedMonths.join("-") || "current"}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const scopeLabel = facility?.community_name ?? "portfolio";
    const subjectLabels = {
      residents: "resident roster entries",
      census: "census entries",
      medicationCompliance: "medication compliance entries",
      refusals: "medication refusal entries",
      documentationGaps: "documentation gap entries",
      summary: "community summary entries"
    };
    const subjectLabel = subjectLabels[dataset] ?? "matching entries";
    const detailAnswer = admissionIntent
      ? `There are ${rows.length.toLocaleString("en-US")} admissions for ${scopeLabel} with admit dates in ${periodLabel}.`
      : `There are ${rows.length.toLocaleString("en-US")} ${scopeLabel} ${subjectLabel} for ${periodLabel}.`;

    return {
      handled: true,
      tool: "detail_list",
      text: detailAnswer,
      trace: makeTrace({
        tool: "detail_list",
        dataSource: admissionIntent ? "resident episode history" : `${dataset} detail records`,
        rowCount: rows.length,
        facility,
        period: requestedMonths.join(", ") || null,
        note: admissionIntent ? `dataset=resident_episode_history; dateField=admit_date; rowSetId=${rowSetId}` : `dataset=${dataset}; rowSetId=${rowSetId}`
      }),
      visual: rows.length ? makePreviewTableVisual({ title: `${label} ${presentation.title}`, subtitle: `${periodLabel} · ${rows.length.toLocaleString("en-US")} entries`, valueLabel: "Entries", columns: presentation.columns, rows: visualRows, totalRows: rows.length }) : undefined,
      artifact: rows.length ? { type: "csv", filename: `${filename}.csv`, mimeType: "text/csv", content: rowsToCsv(rows), rowSetId, rowCount: rows.length } : undefined,
      provenance: { rowSetId, rowCount: rows.length, dataset },
      actions: []
    };
  }

  return Object.freeze({ buildDetailListTool, buildExportTool });
}
