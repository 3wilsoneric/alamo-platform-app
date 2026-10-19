import type {
  AdmissionsPipelineBriefingMoveIn,
  AdmissionsReferralPipeline,
  AdmissionsWeeklyBriefing
} from "../../shared/types/platformSnapshot";

type ConnectedAdmissionsPipeline = Extract<AdmissionsReferralPipeline, { status: "connected" }>;

export type AdmissionsScheduleEvent = {
  key: string;
  referralId: number;
  kind: "Assessment" | "Move-in";
  date: string;
  clientName: string;
  community: string;
  facilityId: string | null;
  owner: string;
  detail: string;
};

export function isAcceptedReferral(status: string) {
  const normalized = status.trim().toLowerCase();
  return normalized.startsWith("accept") || normalized === "awaiting admit" || normalized === "meet the client not sent";
}

export function isDeclinedReferral(status: string) {
  return status.trim().toLowerCase() === "declined";
}

export function buildAdmissionsMoveInSchedule(
  pipeline: ConnectedAdmissionsPipeline | null,
  briefing: AdmissionsWeeklyBriefing | null,
  today: string
): AdmissionsScheduleEvent[] {
  const publishedMoveIns = briefing?.coverage.moveIns
    ? briefing.plannedMoveIns.filter((item) => item.plannedAt.slice(0, 10) >= today)
    : [];
  const publishedByReferral = new Map(publishedMoveIns.map((item) => [item.referralId, item]));

  const events = pipeline
    ? pipeline.board.cards
        .filter((card) => isAcceptedReferral(card.status) && card.plannedAdmissionDate && card.plannedAdmissionDate >= today)
        .map((card) => moveInEventFromCard(card, publishedByReferral.get(card.referralId)))
    : publishedMoveIns.map(moveInEventFromBriefing);

  return events.sort((left, right) => left.date.localeCompare(right.date) || left.clientName.localeCompare(right.clientName));
}

function moveInEventFromCard(
  card: ConnectedAdmissionsPipeline["board"]["cards"][number],
  published: AdmissionsPipelineBriefingMoveIn | undefined
): AdmissionsScheduleEvent {
  const date = card.plannedAdmissionDate!;
  return {
    key: `move-in:${card.referralId}:${date}`,
    referralId: card.referralId,
    kind: "Move-in",
    date,
    clientName: card.clientName,
    community: card.facilityId ? card.community : "Community not assigned",
    facilityId: card.facilityId,
    owner: card.owner,
    detail: published && published.plannedAt.slice(0, 10) === date
      ? moveInDetail(published)
      : card.status
  };
}

function moveInEventFromBriefing(item: AdmissionsPipelineBriefingMoveIn): AdmissionsScheduleEvent {
  return {
    key: `move-in:${item.referralId}:${item.plannedAt}`,
    referralId: item.referralId,
    kind: "Move-in",
    date: item.plannedAt,
    clientName: item.clientName,
    community: item.facilityId ? item.community : "Community not assigned",
    facilityId: item.facilityId,
    owner: item.owner,
    detail: moveInDetail(item)
  };
}

function moveInDetail(item: AdmissionsPipelineBriefingMoveIn) {
  return item.readiness === "unknown" ? item.status : `${item.status} · ${item.readiness}`;
}
