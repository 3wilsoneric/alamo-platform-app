import type { AdmissionsBoardCard } from "../../../shared/types/platformSnapshot";
import { formatExecutiveDate } from "./executiveDashboardFormatters";

export function isImpendingAdmissionCard(card: AdmissionsBoardCard) {
  if (card.plannedAdmissionDate) return true;
  const status = card.status.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return status.startsWith("accept") || status === "awaiting admit" || status === "meet the client not sent";
}

export function impendingAdmissionCards(cards: AdmissionsBoardCard[]) {
  return cards
    .filter(isImpendingAdmissionCard)
    .sort((left, right) => {
      if (left.plannedAdmissionDate && right.plannedAdmissionDate) {
        const dateOrder = left.plannedAdmissionDate.localeCompare(right.plannedAdmissionDate);
        if (dateOrder) return dateOrder;
      } else if (left.plannedAdmissionDate) {
        return -1;
      } else if (right.plannedAdmissionDate) {
        return 1;
      }
      return left.clientName.localeCompare(right.clientName);
    });
}

export function impendingAdmissionReadiness(card: AdmissionsBoardCard) {
  const profile = card.managementProfile;
  if (profile.blockingRequirements > 0) {
    return `${profile.blockingRequirements} blocking ${profile.blockingRequirements === 1 ? "requirement" : "requirements"}`;
  }
  if (!profile.assessmentSigned) return "Assessment not signed";
  if (profile.documentStatus !== "Reviewed") return "Documents not reviewed";
  if (profile.openRequirements > 0) {
    return `${profile.openRequirements} open ${profile.openRequirements === 1 ? "requirement" : "requirements"}`;
  }
  return "Ready for admission";
}

export function formatImpendingAdmissionDate(value: string, includeTime = true) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return formatExecutiveDate(dateOnly ? `${value}T12:00:00` : value, dateOnly ? false : includeTime);
}
