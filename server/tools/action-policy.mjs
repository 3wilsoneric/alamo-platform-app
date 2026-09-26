/** @typedef {Record<string, any>} ToolRecord */

export function createActionPolicyTools(dependencies) {
  const {
    findFacility,
    getFacilityLabel,
    isExportIntent,
    makeTrace,
    normalizeText,
    sanitizeDisplayString
  } = dependencies;

  function normalizeToolActions(actions) {
    if (!Array.isArray(actions)) return [];
    return actions
      .filter((action) => action && typeof action === "object" && String(action.label ?? "").trim())
      .map((action) => ({
        ...action,
        label: sanitizeDisplayString(action.label),
        kind: action.kind ?? (action.route ? "route" : action.tool ? "tool" : action.url ? "external" : "tool")
      }))
      .filter((action) => {
        if (action.kind === "route") return Boolean(action.route);
        if (action.kind === "tool") return Boolean(action.tool || action.prompt);
        if (action.kind === "external") return Boolean(action.url);
        if (action.kind === "download") return Boolean(action.href || action.url || action.filename);
        return true;
      });
  }

  function getClosestRecoveryActions(content, communities, result = {}) {
    const text = normalizeText(content);
    const facility = findFacility(content, communities);
    const label = getFacilityLabel(facility);
    const actions = [];
    const add = (action) => {
      if (!actions.some((existing) => existing.label === action.label)) actions.push(action);
    };

    if (/\b(incident|incidents|awol|elopement|fall|refusal|medical emergency|aggressive|substance)\b/.test(text) || result.tool?.includes("incident")) {
      add({ label: facility ? `Open ${label} incidents` : "Open Incident Center", kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=incidents` : "/incidents" });
      add({ label: "Check incident freshness", kind: "tool", tool: "data_availability", prompt: "are incidents current today" });
      add({ label: "Show loaded incident periods", kind: "tool", tool: "data_availability", prompt: "what data periods are available for incident detail" });
    }

    if (/\b(census|occupancy|population|headcount)\b/.test(text) || result.tool?.includes("census")) {
      add({ label: facility ? `Open ${label} census` : "Open Communities Overview", kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=census` : "/communities" });
      add({ label: `Show ${label} census trend`, kind: "tool", tool: "run_analysis", prompt: `${label} census trend` });
    }

    if (/\b(medication|meds|emar|compliance|refusal|refused|not given)\b/.test(text) || result.tool?.includes("medication")) {
      add({ label: `Show ${label} medication profile`, kind: "tool", tool: "run_analysis", prompt: `${label} medication profile` });
      add({ label: "Show medication compliance", kind: "tool", tool: "run_analysis", prompt: `${label} medication compliance` });
    }

    if (/\b(resident|residents|client|clients|profile|name)\b/.test(text) || result.tool?.includes("resident")) {
      add({ label: facility ? `Search ${label} residents` : "Search residents", kind: "tool", tool: "run_analysis", prompt: `${label} resident search` });
    }

    if (!actions.length) {
      add({ label: "Show available analytical slices", kind: "tool", tool: "tool_context_catalog", prompt: "show available analytical slices" });
      add({ label: "Show data availability", kind: "tool", tool: "data_availability", prompt: "show loaded data availability" });
    }

    return actions.slice(0, 3);
  }

  /**
   * @param {{
   *   content: string,
   *   communities: any,
   *   result?: ToolRecord,
   *   tool?: string | null,
   *   reason?: string,
   *   detail?: string,
   *   trace?: ToolRecord,
   *   actions?: ToolRecord[]
   * }} input
   */
  function buildRecoveryResult({ content, communities, result = {}, tool = null, reason, detail, trace = {}, actions = [] }) {
    const facility = findFacility(content, communities);
    const recoveryActions = (actions.length ? actions : getClosestRecoveryActions(content, communities, result))
      .filter((action) => action?.kind !== "tool" || !/^export\b/i.test(String(action?.label ?? "")))
      .slice(0, 1);

    return {
      handled: true,
      tool: tool ?? result.tool ?? "data_recovery",
      safeRefusal: true,
      truthState: trace.truthState ?? "plan_rejected",
      text: [
        reason || "That exact slice is not verified in the active snapshot.",
        detail,
        recoveryActions.length
          ? "verified fallback: I kept the answer on verified data and surfaced the closest vetted path below."
          : "No vetted fallback path is available for this exact request."
      ].filter(Boolean).join("\n"),
      trace: makeTrace({
        tool: tool ?? result.tool ?? "data_recovery",
        dataSource: trace.dataSource ?? "analysis recovery",
        rowCount: 0,
        facility,
        period: trace.period ?? null,
        note: trace.note ?? "recovery path",
        truthState: trace.truthState ?? "plan_rejected"
      }),
      actions: recoveryActions
    };
  }

  /** @param {ToolRecord} [action] */
  function isExportAction(action = {}) {
    return action?.tool === "export_csv" || /^export\b/i.test(String(action?.label ?? ""));
  }

  /** @param {ToolRecord} [action] */
  function isExplorerAction(action = {}) {
    return action?.kind === "external" && /\/explorer\//.test(String(action?.url ?? ""));
  }

  /** @param {ToolRecord} [result] */
  function isStrongDirectAnswer(result = {}) {
    const truthState = result.truthState ?? result.trace?.truthState;
    if (result.safeRefusal || ["not_loaded", "plan_rejected", "stale", "summary_not_shown"].includes(truthState)) {
      return false;
    }
    if (result.artifact) return false;

    return [
      "census_movement",
      "census_trend",
      "community_history",
      "community_profile",
      "compare_periods",
      "incident_breakdown",
      "incident_category_comparison",
      "incident_rate_change",
      "medication_compliance",
      "medication_orders_current",
      "medication_exception_detail",
      "medication_profile",
      "medication_refusals_by_community",
      "resident_lookup"
    ].includes(result.tool);
  }

  /**
   * @param {ToolRecord} [result]
   * @param {boolean} [allowExport]
   */
  function actionLimitForResult(result = {}, allowExport = false) {
    if (allowExport) return 3;
    if (result.safeRefusal) return 2;
    if (result.artifact) return 1;
    if (isStrongDirectAnswer(result)) return 1;
    return 2;
  }

  function pruneActionNoise(result, content) {
    if (!result?.actions?.length) return result;
    const allowExport = isExportIntent(content);
    const artifactBackedDetail = Boolean(result.artifact) &&
      ["detail_list", "incident_detail_list", "medication_exception_detail", "medication_orders_current"].includes(String(result.tool ?? "")) &&
      !result.safeRefusal;
    const actions = result.actions
      .filter((action) => !isExplorerAction(action))
      .filter((action) => allowExport || !isExportAction(action))
      .filter((action) => !artifactBackedDetail || isExportAction(action))
      .slice(0, actionLimitForResult(result, allowExport));
    return {
      ...result,
      actions
    };
  }

  return Object.freeze({
    buildRecoveryResult,
    normalizeToolActions,
    pruneActionNoise
  });
}
