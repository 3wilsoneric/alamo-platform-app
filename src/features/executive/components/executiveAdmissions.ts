import type { AdmissionsBoardCard } from "../../../shared/types/platformSnapshot";
import { formatExecutiveDate } from "./executiveDashboardFormatters";

export function isImpendingAdmissionCard(card: AdmissionsBoardCard) {
  const status = card.status.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (/^(?:declined|denied|rejected|cancelled|canceled|withdrawn|closed|admitted|discharged|deceased|archived|moved in|admission completed?)(?:\b|$)/.test(status)) return false;
  if (card.plannedAdmissionDate) return true;
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

export function formatImpendingAdmissionDate(value: string, includeTime = true) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return formatExecutiveDate(dateOnly ? `${value}T12:00:00` : value, dateOnly ? false : includeTime);
}
