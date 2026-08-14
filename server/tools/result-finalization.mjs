function normalizeToolVisual(visual, { sanitizeDisplayString }) {
  if (!visual || typeof visual !== "object") return undefined;
  const rows = Array.isArray(visual.rows) ? visual.rows : [];
  const columns = Array.isArray(visual.columns) ? visual.columns : undefined;
  return {
    ...visual,
    type: visual.type || "table",
    title: sanitizeDisplayString(visual.title || "Data module"),
    subtitle: visual.subtitle == null ? visual.subtitle : sanitizeDisplayString(visual.subtitle),
    valueLabel: visual.valueLabel == null ? visual.valueLabel : sanitizeDisplayString(visual.valueLabel),
    columns,
    rows
  };
}

function normalizeToolArtifact(artifact) {
  if (!artifact || typeof artifact !== "object") return undefined;
  if (!artifact.content && !artifact.href && !artifact.url) return undefined;
  return artifact;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeModuleSelectionReason(spec, fallbackReason = { code: "direct_answer", label: "Direct answer to the question" }, result = {}) {
  if (!spec || typeof spec !== "object") return spec;
  const visualRows = Array.isArray(spec.visual?.rows) ? spec.visual.rows.length : null;
  const originalRowCount = numberOrNull(spec.provenance?.originalRowCount ?? spec.visual?.originalRowCount ?? result.artifact?.rowCount);
  const artifactRowCount = numberOrNull(spec.provenance?.artifactRowCount ?? result.artifact?.rowCount);
  const rowCount = numberOrNull(spec.provenance?.rowCount ?? result.provenance?.rowCount ?? result.trace?.rowCount ?? originalRowCount ?? visualRows);
  return {
    ...spec,
    provenance: {
      ...(spec.provenance && typeof spec.provenance === "object" ? spec.provenance : {}),
      rowCount,
      visibleRowCount: numberOrNull(spec.provenance?.visibleRowCount ?? visualRows),
      originalRowCount,
      artifactRowCount,
      rowSetId: stringOrNull(spec.provenance?.rowSetId ?? result.provenance?.rowSetId ?? result.artifact?.rowSetId),
      dataset: stringOrNull(spec.provenance?.dataset ?? result.provenance?.dataset),
      tool: spec.provenance?.tool ?? result.tool ?? null,
      dataSource: spec.provenance?.dataSource ?? result.trace?.dataSource ?? null,
      engineVersion: spec.provenance?.engineVersion ?? result.trace?.engineVersion ?? null
    },
    selectionReason: spec.selectionReason?.code && spec.selectionReason?.label
      ? spec.selectionReason
      : fallbackReason
  };
}

export function createResultFinalizationTools({
  addAnalystTakeaway,
  attachToolResultSchemaValidation,
  enforceAnswerInvariants,
  makeTrace,
  normalizeKnownNamesDeep,
  normalizeText,
  normalizeToolActions,
  planAdHocModule,
  pruneActionNoise,
  sanitizeDisplayString,
  toolTruthStates
}) {
  function normalizeTruthState(value, result = {}) {
    const candidate = String(value ?? result.truthState ?? result.trace?.truthState ?? "").trim();
    if (toolTruthStates.has(candidate)) return candidate;
    if (result.safeRefusal || result.contractViolation) return "plan_rejected";
    if (
      result.tool === "resident_lookup" &&
      (
        Number(result.trace?.rowCount ?? 0) > 0 ||
        (Array.isArray(result.visual?.rows) && result.visual.rows.length > 0)
      )
    ) {
      return "valid_rows";
    }
    const text = normalizeText(result.text);
    if (/\bverified zero\b/.test(text) || /\b0 verified\b/.test(text)) return "verified_zero";
    if (/\bnot loaded\b|\bnot available\b|\bunavailable\b/.test(text)) return "not_loaded";
    if (/\bstale\b|\bnot current\b|\bfeed has not delivered\b/.test(text)) return "stale";
    if (/\bnot shown in (?:the )?loaded summary\b|\bsummary does not show\b/.test(text)) return "summary_not_shown";
    return "valid_rows";
  }

  /**
   * @param {any} result
   * @param {{ tool?: string | null, content?: string }} [options]
   */
  function normalizeToolResultContract(result, options = {}) {
    const { tool, content } = options;
    if (!result || typeof result !== "object") {
      result = {
        handled: true,
        tool: tool ?? "data_recovery",
        text: "I could not run that analysis safely."
      };
    }

    const normalizedTool = String(result.tool ?? tool ?? "data_recovery");
    const truthState = normalizeTruthState(result.truthState, result);
    const normalized = {
      ...result,
      handled: typeof result.handled === "boolean" ? result.handled : true,
      tool: normalizedTool,
      truthState,
      text: String(result.text ?? "").trim() || "I could not run that analysis safely.",
      trace: normalizeKnownNamesDeep({
        ...makeTrace({
          tool: normalizedTool,
          dataSource: "normalized tool result",
          rowCount: 0,
          truthState
        }),
        ...(result.trace && typeof result.trace === "object" ? result.trace : {}),
        tool: result.trace?.tool ?? normalizedTool,
        truthState,
        rowCount: Number.isFinite(Number(result.trace?.rowCount)) ? Number(result.trace.rowCount) : result.trace?.rowCount ?? 0
      }),
      actions: normalizeToolActions(result.actions),
      visual: normalizeToolVisual(result.visual, { sanitizeDisplayString }),
      artifact: normalizeToolArtifact(result.artifact),
      moduleSpec: normalizeModuleSelectionReason(result.moduleSpec, undefined, result),
      moduleSpecs: Array.isArray(result.moduleSpecs) ? result.moduleSpecs.map((spec) => normalizeModuleSelectionReason(spec, undefined, result)) : result.moduleSpecs
    };

    if (!normalized.visual) delete normalized.visual;
    if (!normalized.artifact) delete normalized.artifact;
    const pruned = pruneActionNoise(enforceAnswerInvariants(normalized), content ?? "");
    const validated = attachToolResultSchemaValidation(pruned);
    if (validated.runtimeSchema.valid) return validated;

    console.warn("Copilot tool result schema warning", {
      tool: validated.tool,
      errors: validated.runtimeSchema.errors,
      warnings: validated.runtimeSchema.warnings
    });

    const errors = validated.runtimeSchema.errors ?? [];
    const degraded = { ...pruned };
    if (errors.some((error) => /^visual\b|^table visual\b/.test(error))) {
      delete degraded.visual;
      delete degraded.moduleSpec;
      delete degraded.moduleSpecs;
    }
    if (errors.some((error) => /^moduleSpec/.test(error))) delete degraded.moduleSpec;
    if (errors.some((error) => /^moduleSpecs/.test(error))) delete degraded.moduleSpecs;
    if (errors.some((error) => /^actions\[|^actions\b/.test(error))) degraded.actions = [];
    if (errors.some((error) => /^artifact\b|^csv artifact\b/.test(error))) {
      delete degraded.artifact;
      delete degraded.provenance;
    }

    const degradedValidation = attachToolResultSchemaValidation(degraded);
    if (degradedValidation.runtimeSchema.valid) return degradedValidation;

    const fallbackTool = "data_recovery";
    return attachToolResultSchemaValidation({
      handled: true,
      tool: fallbackTool,
      truthState: "plan_rejected",
      text: "I could not safely render that result. Please run the question again.",
      trace: makeTrace({
        tool: fallbackTool,
        dataSource: "tool result schema recovery",
        rowCount: 0,
        truthState: "plan_rejected"
      }),
      actions: []
    });
  }

  function enhanceVisualForIntent(content, result) {
    if (!result?.handled || !result.visual?.rows?.length) return result;

    const text = normalizeText(content);
    const visual = { ...result.visual };
    const isComparison = /\b(compare|comparison|versus| vs |change from|between)\b/.test(text);
    const isComposition = /\b(mix|share|composition|distribution|donut|pie)\b/.test(text);
    const isTrend = /\b(trends?|over time|history|historical|monthly|month by month|trajectory)\b/.test(text);
    const hasTemporalRows = visual.rows.every((row) =>
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+20\d{2}\b/i.test(String(row.label ?? "")) ||
      /^20\d{2}-\d{2}(?:-\d{2})?$/.test(String(row.label ?? ""))
    );

    // Purpose-built tools own their chart type. A word such as "compare" in
    // the question must not turn an explicit trend chart into a different
    // visualization after the tool has selected it.
    if (["line_chart", "multi_line_chart", "heatmap"].includes(visual.type)) {
      return { ...result, visual };
    }

    if (result.tool === "incident_rate_change") {
      visual.type = "table";
    } else if (isComparison && (visual.columns?.length ?? 0) >= 3 && visual.rows.some((row) => (row.cells?.length ?? 0) >= 3)) {
      visual.type = "comparison_chart";
    } else if (isTrend && hasTemporalRows && visual.rows.length >= 3 && visual.type !== "table") {
      visual.type = "line_chart";
    } else if (
      result.tool !== "resident_demographics" &&
      isComposition &&
      visual.type !== "table" &&
      visual.rows.length >= 2 &&
      visual.rows.length <= 8 &&
      visual.rows.every((row) => Number.isFinite(Number(row.value)))
    ) {
      visual.type = "donut_chart";
    }

    return { ...result, visual };
  }

  function finalizeToolResult(content, result) {
    const enhanced = enhanceVisualForIntent(content, addAnalystTakeaway(content, result));
    const moduleSpec = planAdHocModule(content, enhanced);
    return enforceAnswerInvariants(moduleSpec ? { ...enhanced, moduleSpec } : enhanced);
  }

  /**
   * @param {string} content
   * @param {any} result
   * @param {{ tool?: string | null }} [options]
   */
  function finalizeCachedToolResult(content, result, options = {}) {
    const { tool } = options;
    // Cached entries already contain the final deterministic answer. Running
    // the analyst formatter again can reinterpret compact visual rows without
    // the original source context and silently change a correct answer.
    return enforceAnswerInvariants(
      normalizeToolResultContract(result, tool === undefined ? { content } : { tool, content })
    );
  }

  return Object.freeze({
    finalizeCachedToolResult,
    finalizeToolResult,
    normalizeToolResultContract,
    normalizeTruthState
  });
}
