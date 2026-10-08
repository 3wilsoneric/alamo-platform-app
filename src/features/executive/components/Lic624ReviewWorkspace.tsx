import {
  AlertTriangle,
  Check,
  FileCheck2,
  PencilLine,
  RotateCcw,
  Save,
  UserRoundPlus,
  X
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  ExecutiveDirectorSubmissionDetail,
  Lic624FormContract,
  Lic624ReviewData
} from "../data/executiveDirectorApi";

interface Lic624ReviewWorkspaceProps {
  submission: ExecutiveDirectorSubmissionDetail;
  form: Lic624FormContract;
  onClose: () => void;
  onSave: (data: Lic624ReviewData, confirm: boolean) => Promise<ExecutiveDirectorSubmissionDetail>;
}

const INPUT_CLASS = "min-h-12 w-full rounded-[12px] border-2 border-[#9ca7a1] bg-white px-3.5 py-2.5 text-[16px] leading-6 text-[#171b19] outline-none transition focus:border-[#08725d] focus:ring-4 focus:ring-[#08725d]/10";
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-[132px] resize-y`;
const EMPTY_RESIDENT = { name: "", dateOccurred: "", age: "", sex: "", admissionDate: "" };

function copyData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function dataEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getReviewIssues(data: Lic624ReviewData) {
  const issues: string[] = [];
  if (!data.facility.name.trim()) issues.push("Facility name");
  if (!data.facility.fileNumber.trim()) issues.push("Facility file number");
  if (!data.residents.some((resident) => resident.name.trim())) issues.push("Person involved");
  if (!data.residents.some((resident) => resident.dateOccurred.trim())) issues.push("Date occurred");
  if (!data.incidentTypes.length) issues.push("Incident type");
  if (!data.eventNarrative.trim()) issues.push("Event narrative");
  if (!data.immediateAction.trim()) issues.push("Immediate action");
  if (!data.submission.submittedBy.trim() || !data.submission.submittedDate.trim()) issues.push("Submitted by and date");
  if (!data.submission.reviewedBy.trim() || !data.submission.reviewedDate.trim()) issues.push("Reviewed by and date");
  return issues;
}

function Field({
  label,
  changed = false,
  required = false,
  wide = false,
  asGroup = false,
  children
}: {
  label: string;
  changed?: boolean;
  required?: boolean;
  wide?: boolean;
  asGroup?: boolean;
  children: ReactNode;
}) {
  const labelNode = (
    <span className="mb-2 flex min-h-5 items-center gap-2 text-[13px] font-bold uppercase tracking-[0.075em] text-[#36403b]">
        {label}
        {required ? <span className="text-[#a04435]" aria-label="required">Required</span> : null}
        {changed ? (
          <span className="rounded-full bg-[#f5e8c9] px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-[#755618]">Edited</span>
        ) : null}
    </span>
  );
  return asGroup ? (
    <fieldset className={wide ? "sm:col-span-2" : undefined}>
      <legend className="w-full">{labelNode}</legend>
      {children}
    </fieldset>
  ) : (
    <label className={wide ? "sm:col-span-2" : undefined}>
      {labelNode}
      {children}
    </label>
  );
}

function Section({ number, title, note, children }: { number: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-[#34413b] px-4 py-7 sm:px-7 sm:py-8 lg:px-9">
      <div className="mb-6 flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border-2 border-[#08725d] bg-[#edf5f1] text-[15px] font-extrabold text-[#08725d]">{number}</span>
        <div>
          <h3 className="text-[23px] font-bold tracking-[-0.035em] text-[#151a17] sm:text-[26px]">{title}</h3>
          <p className="mt-1 text-[14px] leading-6 text-[#5c6661]">{note}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Lic624ReviewWorkspace({ submission, form, onClose, onSave }: Lic624ReviewWorkspaceProps) {
  const savedData = submission.draftData;
  const sourceData = submission.sourceData;
  const [draft, setDraft] = useState<Lic624ReviewData | null>(savedData ? copyData(savedData) : null);
  const [saving, setSaving] = useState<"draft" | "confirm" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(savedData ? copyData(savedData) : null);
    setMessage(null);
    setError(null);
  }, [submission.submissionId, submission.reviewRevision, savedData]);

  const issues = useMemo(() => draft ? getReviewIssues(draft) : [], [draft]);
  const unsaved = Boolean(draft && savedData && !dataEqual(draft, savedData));
  const changedFromSource = Boolean(draft && sourceData && !dataEqual(draft, sourceData));

  if (!draft || !sourceData) return null;

  const updateFacility = (key: keyof Lic624ReviewData["facility"], value: string) => {
    setDraft((current) => current ? { ...current, facility: { ...current.facility, [key]: value } } : current);
  };
  const updateNarrative = (key: "eventNarrative" | "observers" | "immediateAction" | "plannedAction" | "supervisorComments" | "attendingPhysician", value: string) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };
  const updateTreatment = (key: keyof Lic624ReviewData["treatment"], value: string | boolean | null) => {
    setDraft((current) => current ? { ...current, treatment: { ...current.treatment, [key]: value } } : current);
  };
  const updateSubmission = (key: keyof Lic624ReviewData["submission"], value: string) => {
    setDraft((current) => current ? { ...current, submission: { ...current.submission, [key]: value } } : current);
  };
  const updateResident = (index: number, key: keyof Lic624ReviewData["residents"][number], value: string) => {
    setDraft((current) => {
      if (!current) return current;
      const residents = current.residents.map((resident, row) => row === index ? { ...resident, [key]: value } : resident);
      return { ...current, residents };
    });
  };
  const toggleIncident = (key: string, label: string) => {
    setDraft((current) => {
      if (!current) return current;
      const selected = current.incidentTypes.some((item) => item.key === key);
      return {
        ...current,
        incidentTypes: selected
          ? current.incidentTypes.filter((item) => item.key !== key)
          : [...current.incidentTypes, { key, label }]
      };
    });
  };
  const updateNotification = (key: string, field: "selected" | "detail", value: boolean | string) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        notifications: current.notifications.map((item) => item.key === key ? { ...item, [field]: value } : item)
      };
    });
  };
  const changed = (current: unknown, source: unknown) => !dataEqual(current, source);

  const save = async (confirm: boolean) => {
    if (saving || (confirm && issues.length)) return;
    setSaving(confirm ? "confirm" : "draft");
    setMessage(null);
    setError(null);
    try {
      const updated = await onSave(draft, confirm);
      setMessage(confirm ? "Review complete. This record is ready for the filing workflow." : "Draft saved securely.");
      setDraft(updated.draftData ? copyData(updated.draftData) : draft);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The review could not be saved.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <article
      data-lic624-review-workspace="true"
      className="mt-10 overflow-hidden rounded-[26px] border-2 border-[#34413b] bg-[#fbfaf6] shadow-[0_24px_70px_rgba(35,48,42,0.16)]"
    >
      <div className="border-b-2 border-[#34413b] bg-[#eadfc7] px-4 py-5 sm:px-7 lg:px-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[13px] border-2 border-[#34413b] bg-white text-[#08725d] shadow-[3px_3px_0_#bcae8e]">
              <PencilLine size={23} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#52605a]">Digital LIC 624</p>
                <span className="rounded-full border-2 border-[#08725d] bg-white px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#08725d]">
                  {submission.status === "ready_to_file" ? "Reviewed" : "Check extraction"}
                </span>
              </div>
              <h2 className="mt-1 truncate text-[27px] font-bold tracking-[-0.04em] text-[#151a17] sm:text-[34px]">{submission.originalFileName}</h2>
              <p className="mt-1 text-[14px] leading-6 text-[#58635e]">The uploaded original stays unchanged. Edits below are versioned as the review record.</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <div className="text-left lg:text-right">
              <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#65706b]">Review revision</p>
              <p className="mt-0.5 text-[18px] font-bold text-[#19201c]">{submission.reviewRevision || "Original"}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close digital form" className="grid h-12 w-12 place-items-center rounded-full border-2 border-[#34413b] bg-white text-[#252c28] transition hover:bg-[#f4f1e9]">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid border-b-2 border-[#34413b] bg-white sm:grid-cols-3">
        <div className="border-b-2 border-[#34413b] px-5 py-4 sm:border-b-0 sm:border-r-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#6a746f]">Extraction</p>
          <p className="mt-1 text-[17px] font-bold text-[#1b211e]">{submission.extractionSummary?.extractedFieldCount ?? 0} populated fields</p>
        </div>
        <div className="border-b-2 border-[#34413b] px-5 py-4 sm:border-b-0 sm:border-r-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#6a746f]">Required check</p>
          <p className={`mt-1 text-[17px] font-bold ${issues.length ? "text-[#9c3f31]" : "text-[#08725d]"}`}>{issues.length ? `${issues.length} item${issues.length === 1 ? "" : "s"} remaining` : "Complete"}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#6a746f]">Review state</p>
          <p className="mt-1 text-[17px] font-bold text-[#1b211e]">{unsaved ? "Unsaved changes" : changedFromSource ? "Edits saved" : "Matches extraction"}</p>
        </div>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void save(false); }}>
        <Section number="01" title="Facility and people involved" note="Confirm the community information and every person named on the report.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Facility name" required changed={changed(draft.facility.name, sourceData.facility.name)}>
              <input className={INPUT_CLASS} value={draft.facility.name} onChange={(event) => updateFacility("name", event.target.value)} />
            </Field>
            <Field label="Facility file number" required changed={changed(draft.facility.fileNumber, sourceData.facility.fileNumber)}>
              <input className={INPUT_CLASS} value={draft.facility.fileNumber} onChange={(event) => updateFacility("fileNumber", event.target.value)} />
            </Field>
            <Field label="Telephone" changed={changed(draft.facility.telephone, sourceData.facility.telephone)}>
              <input className={INPUT_CLASS} value={draft.facility.telephone} onChange={(event) => updateFacility("telephone", event.target.value)} inputMode="tel" />
            </Field>
            <Field label="Address" changed={changed(draft.facility.address, sourceData.facility.address)}>
              <input className={INPUT_CLASS} value={draft.facility.address} onChange={(event) => updateFacility("address", event.target.value)} />
            </Field>
            <Field label="City, state, ZIP" wide changed={changed(draft.facility.cityStateZip, sourceData.facility.cityStateZip)}>
              <input className={INPUT_CLASS} value={draft.facility.cityStateZip} onChange={(event) => updateFacility("cityStateZip", event.target.value)} />
            </Field>
          </div>

          <div className="mt-7 border-t-2 border-[#c7cfca] pt-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-[18px] font-bold text-[#1c231f]">People involved</h4>
              {draft.residents.length < 4 ? (
                <button type="button" onClick={() => setDraft((current) => current ? { ...current, residents: [...current.residents, { ...EMPTY_RESIDENT }] } : current)} className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[#08725d] bg-white px-4 text-[13px] font-bold text-[#08725d] hover:bg-[#eef7f3]">
                  <UserRoundPlus size={17} aria-hidden="true" /> Add person
                </button>
              ) : null}
            </div>
            <div className="mt-4 space-y-4">
              {draft.residents.map((resident, index) => (
                <div key={index} className="rounded-[16px] border-2 border-[#7f8b85] bg-white p-4 shadow-[4px_4px_0_#e3ded2]">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-[13px] font-extrabold uppercase tracking-[0.09em] text-[#08725d]">Person {index + 1}</p>
                    {draft.residents.length > 1 ? <button type="button" onClick={() => setDraft((current) => current ? { ...current, residents: current.residents.filter((_, row) => row !== index) } : current)} className="text-[12px] font-bold text-[#9a3e32] hover:underline">Remove</button> : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <Field label="Name" required={index === 0} changed={changed(resident.name, sourceData.residents[index]?.name ?? "")}><input className={INPUT_CLASS} value={resident.name} onChange={(event) => updateResident(index, "name", event.target.value)} /></Field>
                    <Field label="Date occurred" required={index === 0} changed={changed(resident.dateOccurred, sourceData.residents[index]?.dateOccurred ?? "")}><input className={INPUT_CLASS} value={resident.dateOccurred} onChange={(event) => updateResident(index, "dateOccurred", event.target.value)} placeholder="MM/DD/YYYY" /></Field>
                    <Field label="Age" changed={changed(resident.age, sourceData.residents[index]?.age ?? "")}><input className={INPUT_CLASS} value={resident.age} onChange={(event) => updateResident(index, "age", event.target.value)} inputMode="numeric" /></Field>
                    <Field label="Sex" changed={changed(resident.sex, sourceData.residents[index]?.sex ?? "")}><input className={INPUT_CLASS} value={resident.sex} onChange={(event) => updateResident(index, "sex", event.target.value)} /></Field>
                    <Field label="Admission date" changed={changed(resident.admissionDate, sourceData.residents[index]?.admissionDate ?? "")}><input className={INPUT_CLASS} value={resident.admissionDate} onChange={(event) => updateResident(index, "admissionDate", event.target.value)} placeholder="MM/DD/YYYY" /></Field>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section number="02" title="Incident details" note="Select the incident category and verify the report narrative against the uploaded original.">
          <Field label="Incident type" required asGroup changed={changed(draft.incidentTypes, sourceData.incidentTypes)}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {form.incidentTypes.map((option) => {
                const selected = draft.incidentTypes.some((item) => item.key === option.key);
                return (
                  <button key={option.key} type="button" aria-pressed={selected} onClick={() => toggleIncident(option.key, option.label)} className={`flex min-h-12 items-center gap-3 rounded-[12px] border-2 px-3 text-left text-[14px] font-semibold transition ${selected ? "border-[#08725d] bg-[#e9f4ef] text-[#075d4c]" : "border-[#aab4af] bg-white text-[#353d39] hover:border-[#65736c]"}`}>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border-2 ${selected ? "border-[#08725d] bg-[#08725d] text-white" : "border-[#87928c]"}`}>{selected ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}</span>
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Field label="What happened" required changed={changed(draft.eventNarrative, sourceData.eventNarrative)}><textarea className={TEXTAREA_CLASS} value={draft.eventNarrative} onChange={(event) => updateNarrative("eventNarrative", event.target.value)} /></Field>
            <Field label="Observers or witnesses" changed={changed(draft.observers, sourceData.observers)}><textarea className={TEXTAREA_CLASS} value={draft.observers} onChange={(event) => updateNarrative("observers", event.target.value)} /></Field>
          </div>
          <div className="mt-5"><Field label="Immediate action taken" required changed={changed(draft.immediateAction, sourceData.immediateAction)}><textarea className={TEXTAREA_CLASS} value={draft.immediateAction} onChange={(event) => updateNarrative("immediateAction", event.target.value)} /></Field></div>
        </Section>

        <Section number="03" title="Treatment and follow-up" note="Confirm whether treatment was necessary, what was provided, and the next action planned.">
          <Field label="Medical treatment necessary" asGroup changed={changed(draft.treatment.necessary, sourceData.treatment.necessary)}>
            <div className="grid max-w-xl grid-cols-3 gap-2">
              {([{ label: "Yes", value: true }, { label: "No", value: false }, { label: "Not recorded", value: null }] as const).map((option) => (
                <button key={option.label} type="button" aria-pressed={draft.treatment.necessary === option.value} onClick={() => updateTreatment("necessary", option.value)} className={`min-h-12 rounded-[12px] border-2 px-3 text-[13px] font-bold ${draft.treatment.necessary === option.value ? "border-[#08725d] bg-[#e9f4ef] text-[#075d4c]" : "border-[#aab4af] bg-white text-[#4b5550]"}`}>{option.label}</button>
              ))}
            </div>
          </Field>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Nature of treatment" wide changed={changed(draft.treatment.nature, sourceData.treatment.nature)}><textarea className={TEXTAREA_CLASS} value={draft.treatment.nature} onChange={(event) => updateTreatment("nature", event.target.value)} /></Field>
            <Field label="Where administered" changed={changed(draft.treatment.whereAdministered, sourceData.treatment.whereAdministered)}><input className={INPUT_CLASS} value={draft.treatment.whereAdministered} onChange={(event) => updateTreatment("whereAdministered", event.target.value)} /></Field>
            <Field label="Administered by" changed={changed(draft.treatment.administeredBy, sourceData.treatment.administeredBy)}><input className={INPUT_CLASS} value={draft.treatment.administeredBy} onChange={(event) => updateTreatment("administeredBy", event.target.value)} /></Field>
            <Field label="Follow-up treatment" wide changed={changed(draft.treatment.followUp, sourceData.treatment.followUp)}><textarea className={TEXTAREA_CLASS} value={draft.treatment.followUp} onChange={(event) => updateTreatment("followUp", event.target.value)} /></Field>
            <Field label="Planned action" wide changed={changed(draft.plannedAction, sourceData.plannedAction)}><textarea className={TEXTAREA_CLASS} value={draft.plannedAction} onChange={(event) => updateNarrative("plannedAction", event.target.value)} /></Field>
          </div>
        </Section>

        <Section number="04" title="Notifications and supervisor review" note="Record who was notified and preserve management comments with the incident record.">
          <div className="grid gap-3 lg:grid-cols-2">
            {draft.notifications.map((notification) => (
              <div key={notification.key} className={`rounded-[15px] border-2 p-4 ${notification.selected ? "border-[#08725d] bg-[#eff7f3]" : "border-[#aab4af] bg-white"}`}>
                <label className="flex cursor-pointer items-center gap-3 text-[15px] font-bold text-[#202622]">
                  <input type="checkbox" checked={notification.selected} onChange={(event) => updateNotification(notification.key, "selected", event.target.checked)} className="h-5 w-5 accent-[#08725d]" />
                  {notification.label}
                </label>
                {notification.selected ? <input className={`${INPUT_CLASS} mt-3`} value={notification.detail} onChange={(event) => updateNotification(notification.key, "detail", event.target.value)} placeholder="Name, date, or reference" /> : null}
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Field label="Supervisor comments" changed={changed(draft.supervisorComments, sourceData.supervisorComments)}><textarea className={TEXTAREA_CLASS} value={draft.supervisorComments} onChange={(event) => updateNarrative("supervisorComments", event.target.value)} /></Field>
            <Field label="Attending physician" changed={changed(draft.attendingPhysician, sourceData.attendingPhysician)}><input className={INPUT_CLASS} value={draft.attendingPhysician} onChange={(event) => updateNarrative("attendingPhysician", event.target.value)} /></Field>
          </div>
        </Section>

        <Section number="05" title="Submit and confirm" note="Save at any time. Mark reviewed only after required fields match the original report.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Submitted by" required changed={changed(draft.submission.submittedBy, sourceData.submission.submittedBy)}><input className={INPUT_CLASS} value={draft.submission.submittedBy} onChange={(event) => updateSubmission("submittedBy", event.target.value)} /></Field>
            <Field label="Submitted date" required changed={changed(draft.submission.submittedDate, sourceData.submission.submittedDate)}><input className={INPUT_CLASS} value={draft.submission.submittedDate} onChange={(event) => updateSubmission("submittedDate", event.target.value)} placeholder="MM/DD/YYYY" /></Field>
            <Field label="Reviewed by" required changed={changed(draft.submission.reviewedBy, sourceData.submission.reviewedBy)}><input className={INPUT_CLASS} value={draft.submission.reviewedBy} onChange={(event) => updateSubmission("reviewedBy", event.target.value)} /></Field>
            <Field label="Reviewed date" required changed={changed(draft.submission.reviewedDate, sourceData.submission.reviewedDate)}><input className={INPUT_CLASS} value={draft.submission.reviewedDate} onChange={(event) => updateSubmission("reviewedDate", event.target.value)} placeholder="MM/DD/YYYY" /></Field>
          </div>

          {issues.length ? (
            <div role="status" className="mt-6 flex items-start gap-3 rounded-[16px] border-2 border-[#bb685a] bg-[#fff5f1] p-4 text-[#7e352b]">
              <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <div>
                <p className="text-[14px] font-extrabold">Complete before marking reviewed</p>
                <p className="mt-1 text-[14px] leading-6">{issues.join(" · ")}</p>
              </div>
            </div>
          ) : null}
        </Section>

        <div className="sticky bottom-0 z-10 border-t-2 border-[#34413b] bg-[#f1eadb]/95 px-4 py-4 shadow-[0_-12px_35px_rgba(35,48,42,0.12)] backdrop-blur sm:px-7 lg:px-9">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-h-6 text-[14px] font-semibold">
              {error ? <p role="alert" className="text-[#a13c30]">{error}</p> : null}
              {message ? <p role="status" className="text-[#08725d]">{message}</p> : null}
              {!error && !message ? <p className="text-[#59645f]">{unsaved ? "You have unsaved changes." : "All current changes are saved."}</p> : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" disabled={!unsaved || Boolean(saving)} onClick={() => { setDraft(copyData(savedData)); setMessage(null); setError(null); }} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-[#69766f] bg-white px-5 text-[14px] font-bold text-[#39423d] disabled:opacity-40">
                <RotateCcw size={17} aria-hidden="true" /> Reset
              </button>
              <button type="submit" disabled={Boolean(saving)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-[#08725d] bg-white px-5 text-[14px] font-bold text-[#08725d] hover:bg-[#eef7f3] disabled:opacity-50">
                <Save size={17} aria-hidden="true" /> {saving === "draft" ? "Saving" : "Save draft"}
              </button>
              <button type="button" disabled={Boolean(saving) || Boolean(issues.length)} onClick={() => void save(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-[#075f4e] bg-[#08725d] px-5 text-[14px] font-bold text-white shadow-[3px_3px_0_#34413b] hover:bg-[#075f4e] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none">
                <FileCheck2 size={18} aria-hidden="true" /> {saving === "confirm" ? "Confirming" : "Mark reviewed"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </article>
  );
}
