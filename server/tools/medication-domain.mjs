import {
  createMedicationExceptionTools,
  createMedicationToolDefinitions
} from "./medications.mjs";
import { createMedicationOrderTools } from "./medication-orders.mjs";
import { createMedicationSummaryTools } from "./medication-summaries.mjs";
import { createMedicationWatchTools } from "./medication-watch.mjs";

export function createMedicationDomainDefinitions(dependencies) {
  const medicationExceptionTools = createMedicationExceptionTools(dependencies);
  const medicationOrderTools = createMedicationOrderTools(dependencies);
  const medicationSummaryTools = createMedicationSummaryTools(dependencies);
  const medicationWatchTools = createMedicationWatchTools(dependencies);

  return createMedicationToolDefinitions({
    ad_hoc_medication_chart: ({ content }, { communities, reportsSummary }) => medicationSummaryTools.buildAdHocMedicationVisual(content, communities, reportsSummary),
    medication_profile: ({ content }, { communities, reportsSummary }) => medicationSummaryTools.buildMedicationProfileTool(content, communities, reportsSummary),
    medication_watch: ({ content }, { communities, reportsSummary }) => medicationWatchTools.buildMedicationWatchTool(content, communities, reportsSummary),
    medication_compliance: ({ content }, { communities, reportsSummary }) => medicationSummaryTools.buildMedicationComplianceTool(content, communities, reportsSummary),
    medication_refusals_by_community: ({ content }, { communities, reportsSummary }) => medicationSummaryTools.buildMedicationRefusalsByCommunityTool(content, communities, reportsSummary),
    medication_orders_current: ({ content }, { communities, reportsSummary }) => medicationOrderTools.buildMedicationOrdersTool(content, communities, reportsSummary),
    medication_exception_detail: ({ content }, { communities, reportsSummary }) => medicationExceptionTools.buildMedicationExceptionDetailTool(content, communities, reportsSummary)
  });
}
