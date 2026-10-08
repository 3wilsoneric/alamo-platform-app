import { createHttpError } from "./http-errors.mjs";
import {
  LIC624_INCIDENT_TYPE_FIELDS,
  LIC624_NOTIFICATION_FIELDS
} from "../shared/lic624-contracts.mjs";

const INCIDENT_TYPES = new Map(LIC624_INCIDENT_TYPE_FIELDS.map((item) => [item.key, item.label]));
const NOTIFICATION_TYPES = new Map(LIC624_NOTIFICATION_FIELDS.map((item) => [item.key, item.label]));
const SUBMISSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, "lic624_review_invalid", `${label} is invalid.`);
  }
  return value;
}

function text(value, label, maximum = 8_000) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") {
    throw createHttpError(400, "lic624_review_invalid", `${label} must be text.`);
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (normalized.length > maximum) {
    throw createHttpError(400, "lic624_review_invalid", `${label} is too long.`);
  }
  return normalized;
}

function optionalBoolean(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") {
    throw createHttpError(400, "lic624_review_invalid", `${label} must be yes, no, or not recorded.`);
  }
  return value;
}

function sanitizeResidents(value) {
  if (!Array.isArray(value)) throw createHttpError(400, "lic624_review_invalid", "People involved is invalid.");
  if (value.length > 4) throw createHttpError(400, "lic624_review_invalid", "LIC 624 supports up to four people involved.");
  return value.map((row, index) => {
    const resident = object(row, `Person ${index + 1}`);
    return {
      name: text(resident.name, `Person ${index + 1} name`, 240),
      dateOccurred: text(resident.dateOccurred, `Person ${index + 1} date occurred`, 80),
      age: text(resident.age, `Person ${index + 1} age`, 40),
      sex: text(resident.sex, `Person ${index + 1} sex`, 80),
      admissionDate: text(resident.admissionDate, `Person ${index + 1} admission date`, 80)
    };
  });
}

function sanitizeIncidentTypes(value) {
  if (!Array.isArray(value)) throw createHttpError(400, "lic624_review_invalid", "Incident types are invalid.");
  const keys = [...new Set(value.map((item) => text(object(item, "Incident type").key, "Incident type", 80)))];
  for (const key of keys) {
    if (!INCIDENT_TYPES.has(key)) throw createHttpError(400, "lic624_review_invalid", "An incident type is not recognized.");
  }
  return keys.map((key) => ({ key, label: INCIDENT_TYPES.get(key) }));
}

function sanitizeNotifications(value) {
  if (!Array.isArray(value)) throw createHttpError(400, "lic624_review_invalid", "Notifications are invalid.");
  const byKey = new Map();
  for (const item of value) {
    const notification = object(item, "Notification");
    const key = text(notification.key, "Notification", 80);
    if (!NOTIFICATION_TYPES.has(key)) throw createHttpError(400, "lic624_review_invalid", "A notification type is not recognized.");
    byKey.set(key, {
      key,
      label: NOTIFICATION_TYPES.get(key),
      selected: Boolean(notification.selected),
      detail: text(notification.detail, `${NOTIFICATION_TYPES.get(key)} detail`, 500)
    });
  }
  return LIC624_NOTIFICATION_FIELDS.map(({ key, label }) => byKey.get(key) ?? ({ key, label, selected: false, detail: "" }));
}

export function validateLic624ReviewData(value) {
  const root = object(value, "LIC 624 review");
  const facility = object(root.facility, "Facility");
  const treatment = object(root.treatment, "Treatment");
  const submission = object(root.submission, "Submission");
  return {
    facility: {
      name: text(facility.name, "Facility name", 240),
      fileNumber: text(facility.fileNumber, "Facility file number", 120),
      telephone: text(facility.telephone, "Telephone", 120),
      address: text(facility.address, "Address", 500),
      cityStateZip: text(facility.cityStateZip, "City, state, ZIP", 240)
    },
    residents: sanitizeResidents(root.residents),
    incidentTypes: sanitizeIncidentTypes(root.incidentTypes),
    eventNarrative: text(root.eventNarrative, "Event narrative", 12_000),
    observers: text(root.observers, "Observers", 2_000),
    immediateAction: text(root.immediateAction, "Immediate action", 8_000),
    treatment: {
      necessary: optionalBoolean(treatment.necessary, "Medical treatment necessary"),
      nature: text(treatment.nature, "Nature of treatment", 4_000),
      whereAdministered: text(treatment.whereAdministered, "Where administered", 500),
      administeredBy: text(treatment.administeredBy, "Administered by", 500),
      followUp: text(treatment.followUp, "Follow-up treatment", 4_000)
    },
    plannedAction: text(root.plannedAction, "Planned action", 8_000),
    supervisorComments: text(root.supervisorComments, "Supervisor comments", 8_000),
    attendingPhysician: text(root.attendingPhysician, "Attending physician", 500),
    submission: {
      submittedBy: text(submission.submittedBy, "Submitted by", 500),
      submittedDate: text(submission.submittedDate, "Submission date", 80),
      reviewedBy: text(submission.reviewedBy, "Reviewed by", 500),
      reviewedDate: text(submission.reviewedDate, "Review date", 80)
    },
    notifications: sanitizeNotifications(root.notifications)
  };
}

export function getLic624ReviewIssues(data) {
  const issues = [];
  if (!data.facility.name) issues.push("Facility name is missing.");
  if (!data.facility.fileNumber) issues.push("Facility file number is missing.");
  if (!data.residents.length || !data.residents.some((resident) => resident.name)) issues.push("An involved client or resident is missing.");
  if (!data.residents.some((resident) => resident.dateOccurred)) issues.push("Date occurred is missing.");
  if (!data.incidentTypes.length) issues.push("Select at least one incident type.");
  if (!data.eventNarrative) issues.push("Event narrative is missing.");
  if (!data.immediateAction) issues.push("Immediate action is missing.");
  if (!data.submission.submittedBy || !data.submission.submittedDate) issues.push("Submitter or submission date is missing.");
  if (!data.submission.reviewedBy || !data.submission.reviewedDate) issues.push("Reviewer or review date is missing.");
  return issues;
}

export function validateLic624ReviewRequest(value) {
  const root = object(value, "Review request");
  const submissionId = text(root.submissionId, "Submission ID", 64);
  if (!SUBMISSION_ID_PATTERN.test(submissionId)) {
    throw createHttpError(400, "lic624_review_submission_invalid", "The licensing submission is invalid.");
  }
  const expectedRevision = Number(root.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > 10_000) {
    throw createHttpError(400, "lic624_review_revision_invalid", "The review revision is invalid.");
  }
  return {
    submissionId,
    expectedRevision,
    confirm: root.confirm === true,
    data: validateLic624ReviewData(root.data)
  };
}

export function assertLic624SubmissionId(value) {
  const submissionId = text(value, "Submission ID", 64);
  if (!SUBMISSION_ID_PATTERN.test(submissionId)) {
    throw createHttpError(400, "lic624_review_submission_invalid", "The licensing submission is invalid.");
  }
  return submissionId;
}
