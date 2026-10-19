import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField
} from "pdf-lib";
import {
  LIC624_FORM_DEFINITION,
  LIC624_INCIDENT_TYPE_FIELDS
} from "../shared/lic624-contracts.mjs";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function joinLines(readText, names) {
  return names.map(readText).map(clean).filter(Boolean).join(" ");
}

function numberedFields(first, count, { firstSuffix = "" } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return `${first}${number === 1 ? firstSuffix : number}`;
  });
}

function ocrRequired(reason) {
  return {
    form: LIC624_FORM_DEFINITION.id,
    method: "ocr_required",
    status: "ocr_required",
    confidence: null,
    extractedFieldCount: 0,
    reviewIssues: [reason],
    data: null
  };
}

export async function extractLic624Report(bytes, contentType) {
  if (contentType !== "application/pdf") {
    return ocrRequired("Image uploads require the server-side OCR stage.");
  }

  let document;
  try {
    document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch {
    return ocrRequired("The PDF could not be read as a fillable LIC 624 form and requires OCR.");
  }

  let fields;
  try {
    fields = document.getForm().getFields();
  } catch {
    return ocrRequired("No readable form fields were found; the report requires OCR.");
  }
  if (!fields.length) return ocrRequired("No fillable fields were found; the report requires OCR.");

  const values = new Map();
  const checked = new Map();
  for (const field of fields) {
    const name = field.getName();
    try {
      if (field instanceof PDFTextField) values.set(name, clean(field.getText()));
      else if (field instanceof PDFCheckBox) checked.set(name, field.isChecked());
      else if (field instanceof PDFRadioGroup) values.set(name, clean(field.getSelected()));
      else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        values.set(name, clean(field.getSelected().join(", ")));
      }
    } catch {
      // A malformed optional field should not prevent extraction of the rest of the report.
    }
  }

  const readText = (name) => values.get(name) ?? "";
  const residents = Array.from({ length: 4 }, (_, index) => {
    const row = index + 1;
    const suffix = row === 1 ? "" : String(row);
    return {
      name: readText(`Name of client's residents involved${row}`),
      dateOccurred: readText(`Date Occurred${suffix}`),
      age: readText(`Age${suffix}`),
      sex: readText(`Sex${suffix}`),
      admissionDate: readText(`Date of Admission${suffix}`)
    };
  }).filter((resident) => Object.values(resident).some(Boolean));

  const incidentTypes = LIC624_INCIDENT_TYPE_FIELDS
    .filter((item) => checked.get(item.source) === true)
    .map(({ key, label }) => ({ key, label }));
  const notifications = [
    { key: "licensing", label: "Licensing", selected: checked.get("Agency icensing Name") === true, detail: readText("Agency Licensing Name1") },
    { key: "protective_services", label: "Adult/Child Protective Services", selected: checked.get("Adult/Child") === true, detail: readText("Adult/Child Protective Services Name2") },
    { key: "ombudsman", label: "Long Term Care Ombudsman", selected: checked.get("Agency Leasing2") === true, detail: readText("Long term care obmbudsman agency name3") },
    { key: "law_enforcement", label: "Law enforcement", selected: checked.get("Agency Leasing3") === true, detail: readText("Law enforcement agency name5") },
    { key: "guardian", label: "Parent/Guardian/Conservator", selected: checked.get("Adult/Child2") === true, detail: readText("Parent/Guardian/Conservator Agency Name4") },
    { key: "placement_agency", label: "Placement agency", selected: checked.get("Adult/Child3") === true, detail: readText("Placement Agency name6") }
  ].filter((notification) => notification.selected || notification.detail);

  const data = {
    facility: {
      name: readText("Facility"),
      fileNumber: readText("Facility File Number"),
      telephone: [readText("Phone"), readText("Phone Number")].filter(Boolean).join(" "),
      address: readText("Address"),
      cityStateZip: readText("City State")
    },
    residents,
    incidentTypes,
    eventNarrative: joinLines(readText, numberedFields("Describe event or incident. include time, date, perpetrator, nature of incident, any antecedents leading up to incident and how clients were affected including any injuries", 5)),
    observers: joinLines(readText, numberedFields("Person(s) who observed the incident/injury", 5, { firstSuffix: "1" })),
    immediateAction: joinLines(readText, numberedFields("Explain what immediate action was taken, (include persons contacted)", 5)),
    treatment: {
      necessary: checked.get("Medical Treatment Necessary") === true
        ? true
        : checked.get("Med Treatment No") === true
          ? false
          : null,
      nature: joinLines(readText, numberedFields("If yes, give nature of treatment", 4)),
      whereAdministered: readText("Where Administered"),
      administeredBy: readText("Administered By"),
      followUp: joinLines(readText, numberedFields("FOLLOW-UP TREATMENT, IF ANY", 5))
    },
    plannedAction: joinLines(readText, numberedFields("Action Taken Planned, By Whom and Anticipated Results", 6)),
    supervisorComments: joinLines(readText, numberedFields("License/Supervisor Comments", 13)),
    attendingPhysician: readText("Attending Physician"),
    submission: {
      submittedBy: readText("Name and title section1"),
      submittedDate: readText("Name and Date1"),
      reviewedBy: readText("Name and Title section2"),
      reviewedDate: readText("Name and Date2")
    },
    notifications
  };

  const reviewIssues = [];
  if (!data.facility.name) reviewIssues.push("Facility name is missing.");
  if (!data.facility.fileNumber) reviewIssues.push("Facility file number is missing.");
  if (!data.residents.length) reviewIssues.push("No involved client or resident was extracted.");
  if (!data.residents.some((resident) => resident.dateOccurred)) reviewIssues.push("Date occurred is missing.");
  if (!data.incidentTypes.length) reviewIssues.push("No incident type is selected.");
  if (!data.eventNarrative) reviewIssues.push("Event narrative is missing.");
  if (!data.immediateAction) reviewIssues.push("Immediate action is missing.");
  if (!data.submission.submittedBy || !data.submission.submittedDate) reviewIssues.push("Submitter or submission date is missing.");
  if (!data.submission.reviewedBy || !data.submission.reviewedDate) reviewIssues.push("Reviewer or review date is missing.");

  const extractedFieldCount = [...values.values()].filter(Boolean).length +
    [...checked.values()].filter(Boolean).length;
  return {
    form: LIC624_FORM_DEFINITION.id,
    method: "pdf_acroform",
    status: "needs_review",
    confidence: reviewIssues.length ? "medium" : "high",
    extractedFieldCount,
    reviewIssues,
    data
  };
}

export function summarizeLic624Extraction(extraction) {
  return {
    form: extraction.form,
    method: extraction.method,
    status: extraction.status,
    confidence: extraction.confidence,
    extractedFieldCount: extraction.extractedFieldCount,
    reviewIssueCount: extraction.reviewIssues.length
  };
}
