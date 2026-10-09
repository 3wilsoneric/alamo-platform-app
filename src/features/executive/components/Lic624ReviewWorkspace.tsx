import {
  AlertTriangle,
  Check,
  FileCheck2,
  FileText,
  PencilLine,
  RotateCcw,
  Save,
  UserRoundPlus,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ExecutiveDirectorSubmissionDetail,
  Lic624FormContract,
  Lic624ReviewData
} from "../data/executiveDirectorApi";
import "../lic624Review.css";

interface Lic624ReviewWorkspaceProps {
  submission: ExecutiveDirectorSubmissionDetail;
  form: Lic624FormContract;
  onClose: () => void;
  onSave: (data: Lic624ReviewData, confirm: boolean) => Promise<ExecutiveDirectorSubmissionDetail>;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onOpenOriginal?: () => void;
}

const INPUT_CLASS = "lic624-review__input";
const TEXTAREA_CLASS = `${INPUT_CLASS} lic624-review__textarea`;
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
    <span className="lic624-review__label">
        {label}
        {required ? <span className="lic624-review__required" aria-label="required">Required</span> : null}
        {changed ? (
          <span className="lic624-review__edited">Edited</span>
        ) : null}
    </span>
  );
  return asGroup ? (
    <fieldset className={`lic624-review__field${wide ? " sm:col-span-2" : ""}`}>
      <legend className="w-full">{labelNode}</legend>
      {children}
    </fieldset>
  ) : (
    <label className={`lic624-review__field${wide ? " sm:col-span-2" : ""}`}>
      {labelNode}
      {children}
    </label>
  );
}

function Section({ number, title, note, children }: { number: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="lic624-review__section" data-lic624-section={number}>
      <div className="lic624-review__section-heading">
        <span className="lic624-review__section-number">{number}</span>
        <div>
          <h3 tabIndex={-1}>{title}</h3>
          <p>{note}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function Lic624ReviewWorkspace({ submission, form, onClose, onSave, onDirtyChange, onBusyChange, onOpenOriginal }: Lic624ReviewWorkspaceProps) {
  const savedData = submission.draftData;
  const sourceData = submission.sourceData;
  const [draft, setDraft] = useState<Lic624ReviewData | null>(savedData ? copyData(savedData) : null);
  const [saving, setSaving] = useState<"draft" | "confirm" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    setDraft(savedData ? copyData(savedData) : null);
  }, [submission.submissionId, submission.reviewRevision, savedData]);

  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [submission.submissionId]);

  const issues = useMemo(() => draft ? getReviewIssues(draft) : [], [draft]);
  const unsaved = Boolean(draft && savedData && !dataEqual(draft, savedData));
  const changedFromSource = Boolean(draft && sourceData && !dataEqual(draft, sourceData));

  useEffect(() => {
    onDirtyChange?.(unsaved);
  }, [onDirtyChange, unsaved]);

  useEffect(() => {
    onBusyChange?.(Boolean(saving));
  }, [onBusyChange, saving]);

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
    if (savingRef.current || (confirm && issues.length)) return;
    savingRef.current = true;
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
      savingRef.current = false;
      setSaving(null);
    }
  };

  return (
    <article
      ref={reviewRef}
      data-lic624-review-workspace="true"
      className="lic624-review"
    >
      <header className="lic624-review__header">
        <div className="lic624-review__identity">
          <span className="lic624-review__document-icon"><PencilLine size={22} aria-hidden="true" /></span>
          <div className="min-w-0">
            <div className="lic624-review__eyebrow">
              <p>Digital LIC 624</p>
              <span className={`lic624-review__status${submission.status === "ready_to_file" ? " is-reviewed" : ""}`}>
                {submission.status === "ready_to_file" ? "Reviewed" : "Check extraction"}
              </span>
            </div>
            <h2>{submission.originalFileName}</h2>
            <p className="lic624-review__preservation">The uploaded original stays unchanged.</p>
          </div>
        </div>
        <div className="lic624-review__header-actions">
          <div className="lic624-review__revision">
            <span>Review revision</span>
            <strong>{submission.reviewRevision || "Original"}</strong>
          </div>
          {onOpenOriginal ? <button type="button" onClick={onOpenOriginal} className="lic624-review__button"><FileText size={17} aria-hidden="true" /> Original</button> : null}
          <button type="button" disabled={Boolean(saving)} onClick={() => { if (!savingRef.current) onClose(); }} aria-label="Close digital form" className="lic624-review__close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="lic624-review__summary">
        <div>
          <span>Extraction</span>
          <strong>{submission.extractionSummary?.extractedFieldCount ?? 0} populated fields</strong>
        </div>
        <div>
          <span>Required check</span>
          <strong className={issues.length ? "lic624-review__warning-text" : "lic624-review__success-text"}>{issues.length ? `${issues.length} item${issues.length === 1 ? "" : "s"} remaining` : "Complete"}</strong>
        </div>
        <div>
          <span>Review state</span>
          <strong>{unsaved ? "Unsaved changes" : changedFromSource ? "Edits saved" : "Matches extraction"}</strong>
        </div>
      </div>

      <nav className="lic624-review__section-nav" aria-label="Review sections">
        <label>
          <span>Section</span>
          <select aria-label="Jump to review section" value="" onChange={(event) => {
            const section = reviewRef.current?.querySelector<HTMLElement>(`[data-lic624-section="${event.target.value}"]`);
            section?.scrollIntoView({ behavior: "instant", block: "start" });
            section?.querySelector("h3")?.focus({ preventScroll: true });
          }}>
            <option value="" disabled>Jump to section</option>
            <option value="01">1. Facility and people</option>
            <option value="02">2. Incident details</option>
            <option value="03">3. Treatment and follow-up</option>
            <option value="04">4. Notifications and review</option>
            <option value="05">5. Submit and confirm</option>
          </select>
        </label>
      </nav>

      <form aria-busy={Boolean(saving)} onSubmit={(event) => { event.preventDefault(); void save(false); }} onChange={() => setMessage(null)} onClick={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".lic624-review__fields button")) setMessage(null);
      }}>
        <fieldset disabled={Boolean(saving)} className="lic624-review__fields" aria-label="LIC 624 fields">
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

          <div className="lic624-review__people">
            <div className="lic624-review__subheading">
              <h4>People involved</h4>
              {draft.residents.length < 4 ? (
                <button type="button" onClick={() => setDraft((current) => current ? { ...current, residents: [...current.residents, { ...EMPTY_RESIDENT }] } : current)} className="lic624-review__button">
                  <UserRoundPlus size={17} aria-hidden="true" /> Add person
                </button>
              ) : null}
            </div>
            <div className="mt-4 space-y-4">
              {draft.residents.map((resident, index) => (
                <div key={index} className="lic624-review__person">
                  <div className="lic624-review__person-heading">
                    <p>Person {index + 1}</p>
                    {draft.residents.length > 1 ? <button type="button" onClick={() => setDraft((current) => current ? { ...current, residents: current.residents.filter((_, row) => row !== index) } : current)} className="lic624-review__remove">Remove</button> : null}
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
                  <button key={option.key} type="button" aria-pressed={selected} onClick={() => toggleIncident(option.key, option.label)} className="lic624-review__choice">
                    <span className="lic624-review__check">{selected ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}</span>
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
                <button key={option.label} type="button" aria-pressed={draft.treatment.necessary === option.value} onClick={() => updateTreatment("necessary", option.value)} className="lic624-review__choice lic624-review__choice--centered">{option.label}</button>
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
              <div key={notification.key} className={`lic624-review__notification${notification.selected ? " is-selected" : ""}`}>
                <label className="lic624-review__notification-label">
                  <input type="checkbox" checked={notification.selected} onChange={(event) => updateNotification(notification.key, "selected", event.target.checked)} />
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
            <div role="status" className="lic624-review__validation">
              <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <div>
                <p className="font-semibold">Complete before marking reviewed</p>
                <p className="mt-1 text-[14px] leading-6">{issues.join(" · ")}</p>
              </div>
            </div>
          ) : null}
        </Section>
        </fieldset>

        <div className="lic624-review__footer">
          <div className="lic624-review__footer-inner">
            <div className="lic624-review__save-status">
              {error ? <p role="alert" className="lic624-review__warning-text">{error}</p> : null}
              {message ? <p role="status" className="lic624-review__success-text">{message}</p> : null}
              {!error && !message ? <p>{saving ? "Saving review…" : unsaved ? "Unsaved changes" : "All changes saved"}</p> : null}
            </div>
            <div className="lic624-review__save-actions">
              <button type="button" disabled={!unsaved || Boolean(saving)} onClick={() => { if (savingRef.current) return; setDraft(copyData(savedData)); setMessage(null); setError(null); }} className="lic624-review__button">
                <RotateCcw size={17} aria-hidden="true" /> Reset
              </button>
              <button type="submit" disabled={Boolean(saving)} className="lic624-review__button">
                <Save size={17} aria-hidden="true" /> {saving === "draft" ? "Saving" : "Save draft"}
              </button>
              <button type="button" disabled={Boolean(saving) || Boolean(issues.length)} onClick={() => void save(true)} className="lic624-review__button lic624-review__button--primary">
                <FileCheck2 size={18} aria-hidden="true" /> {saving === "confirm" ? "Confirming" : "Mark reviewed"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </article>
  );
}
