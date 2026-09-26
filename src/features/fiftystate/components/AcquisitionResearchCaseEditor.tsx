import { ExternalLink, Plus, Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  addAcquisitionResearchEvidence,
  saveAcquisitionResearchCase,
  type AcquisitionEvidenceInput,
  type AcquisitionResearchCase,
  type AcquisitionResearchCaseUpdate
} from "../data/acquisitionResearchApi";

const FIELD_CLASS = "mt-1 h-9 w-full border border-[#b3b3b3] bg-white px-2.5 text-[12px] outline-none focus:border-[#0f8b73]";
const LABEL_CLASS = "text-[10px] font-bold uppercase tracking-[0.08em] text-[#595959]";

function inputValue(value: string | number | null) {
  return value === null ? "" : String(value);
}

function draftFromCase(record: AcquisitionResearchCase): AcquisitionResearchCaseUpdate {
  return {
    status: record.status,
    priority: record.priority,
    assignee: record.assignee,
    notes: record.notes,
    scope: { ...record.scope },
    ownership: {
      status: record.ownership.status,
      operatorName: record.ownership.operatorName,
      parentName: record.ownership.parentName,
      sourceUrl: record.ownership.sourceUrl
    },
    license: {
      status: record.license.status,
      legalEntity: record.license.legalEntity,
      licenseNumber: record.license.licenseNumber,
      licensedBeds: record.license.licensedBeds,
      sourceUrl: record.license.sourceUrl
    }
  };
}

function nullable(value: string) {
  return value.trim() || null;
}

export default function AcquisitionResearchCaseEditor({
  record,
  onChanged
}: {
  record: AcquisitionResearchCase;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<AcquisitionResearchCaseUpdate>(() => draftFromCase(record));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<AcquisitionEvidenceInput>({
    kind: "ownership",
    title: "",
    url: null,
    note: "",
    observedAt: null
  });

  useEffect(() => {
    setDraft(draftFromCase(record));
  }, [record]);

  useEffect(() => {
    setMessage(null);
  }, [record.facilityId]);

  async function saveCase(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await saveAcquisitionResearchCase(record.facilityId, draft);
      await onChanged();
      setMessage("Case saved to the persistent research store.");
    } catch {
      setMessage("The case was not saved. Verified cases require complete fields and evidence for ownership, license, capacity, adult population, residential setting, and private ownership.");
    } finally {
      setSaving(false);
    }
  }

  async function addEvidence(event: FormEvent) {
    event.preventDefault();
    if (!evidence.title.trim()) {
      setMessage("Evidence needs a source title.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await addAcquisitionResearchEvidence(record.facilityId, evidence);
      setEvidence({ kind: "ownership", title: "", url: null, note: "", observedAt: null });
      await onChanged();
      setMessage("Evidence added to the case history.");
    } catch {
      setMessage("The evidence was not saved. Source URLs must use HTTPS and all fields must stay within their limits.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article data-acquisition-case-editor="true" className="border-t-2 border-[#111111] pt-3 lg:border-l lg:border-t-0 lg:pl-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d9d9d9] pb-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#0f8b73]">Research case</p>
          <h3 className="mt-1 font-serif text-[20px] font-semibold leading-6">{record.facility.name}</h3>
          {record.facility.secondaryName ? <p className="text-[11px] text-[#595959]">{record.facility.secondaryName}</p> : null}
          <p className="mt-1 text-[11px] text-[#737373]">
            {[record.facility.address.street1, record.facility.address.city, record.facility.address.stateCode, record.facility.address.zip]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="font-serif text-[21px] font-semibold">{record.evidencePriorityScore}</p>
          <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">Evidence priority</p>
        </div>
      </div>

      <form onSubmit={saveCase} className="pt-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className={LABEL_CLASS}>Case status</span>
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AcquisitionResearchCaseUpdate["status"] })} className={FIELD_CLASS}>
              <option value="new">New</option>
              <option value="researching">Researching</option>
              <option value="blocked">Blocked</option>
              <option value="ready_for_review">Ready for review</option>
              <option value="verified">Verified</option>
              <option value="excluded">Excluded</option>
            </select>
          </label>
          <label>
            <span className={LABEL_CLASS}>Priority</span>
            <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as AcquisitionResearchCaseUpdate["priority"] })} className={FIELD_CLASS}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label>
            <span className={LABEL_CLASS}>Assignee</span>
            <input value={inputValue(draft.assignee)} onChange={(event) => setDraft({ ...draft, assignee: nullable(event.target.value) })} placeholder="Optional" className={FIELD_CLASS} />
          </label>
        </div>

        <div className="mt-4 border-t border-[#d9d9d9] pt-3">
          <p className={LABEL_CLASS}>Scope confirmation</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {([
              ["adult", "Adult program"],
              ["residential", "Residential setting"],
              ["privateForProfit", "Private for-profit"]
            ] as const).map(([key, label]) => (
              <label key={key}>
                <span className="text-[10px] font-semibold text-[#737373]">{label}</span>
                <select
                  value={draft.scope[key]}
                  onChange={(event) => setDraft({
                    ...draft,
                    scope: { ...draft.scope, [key]: event.target.value as AcquisitionResearchCaseUpdate["scope"][typeof key] }
                  })}
                  className={FIELD_CLASS}
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="excluded">Excluded</option>
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 border-t border-[#d9d9d9] pt-3 xl:grid-cols-2">
          <fieldset>
            <legend className={LABEL_CLASS}>Ownership</legend>
            <div className="mt-1 grid gap-2">
              <select value={draft.ownership.status} onChange={(event) => setDraft({ ...draft, ownership: { ...draft.ownership, status: event.target.value as AcquisitionResearchCaseUpdate["ownership"]["status"] } })} aria-label="Ownership status" className={FIELD_CLASS}>
                <option value="unresolved">Unresolved</option>
                <option value="proposed">Proposed</option>
                <option value="verified">Verified</option>
              </select>
              <input value={inputValue(draft.ownership.operatorName)} onChange={(event) => setDraft({ ...draft, ownership: { ...draft.ownership, operatorName: nullable(event.target.value) } })} placeholder="Operating company" className={FIELD_CLASS} />
              <input value={inputValue(draft.ownership.parentName)} onChange={(event) => setDraft({ ...draft, ownership: { ...draft.ownership, parentName: nullable(event.target.value) } })} placeholder="Parent company, if different" className={FIELD_CLASS} />
              <input type="url" value={inputValue(draft.ownership.sourceUrl)} onChange={(event) => setDraft({ ...draft, ownership: { ...draft.ownership, sourceUrl: nullable(event.target.value) } })} placeholder="https:// ownership source" className={FIELD_CLASS} />
            </div>
          </fieldset>

          <fieldset>
            <legend className={LABEL_CLASS}>License and capacity</legend>
            <div className="mt-1 grid gap-2">
              <select value={draft.license.status} onChange={(event) => setDraft({ ...draft, license: { ...draft.license, status: event.target.value as AcquisitionResearchCaseUpdate["license"]["status"] } })} aria-label="License status" className={FIELD_CLASS}>
                <option value="pending">Pending</option>
                <option value="matched">Matched</option>
                <option value="not_found">Not found</option>
                <option value="not_required">Not required</option>
              </select>
              <input value={inputValue(draft.license.legalEntity)} onChange={(event) => setDraft({ ...draft, license: { ...draft.license, legalEntity: nullable(event.target.value) } })} placeholder="Licensed legal entity" className={FIELD_CLASS} />
              <div className="grid grid-cols-2 gap-2">
                <input value={inputValue(draft.license.licenseNumber)} onChange={(event) => setDraft({ ...draft, license: { ...draft.license, licenseNumber: nullable(event.target.value) } })} placeholder="License number" className={FIELD_CLASS} />
                <input type="number" min="1" step="1" value={inputValue(draft.license.licensedBeds)} onChange={(event) => setDraft({ ...draft, license: { ...draft.license, licensedBeds: event.target.value ? Number(event.target.value) : null } })} placeholder="Licensed beds" className={FIELD_CLASS} />
              </div>
              <input type="url" value={inputValue(draft.license.sourceUrl)} onChange={(event) => setDraft({ ...draft, license: { ...draft.license, sourceUrl: nullable(event.target.value) } })} placeholder="https:// license source" className={FIELD_CLASS} />
            </div>
          </fieldset>
        </div>

        <label className="mt-4 block border-t border-[#d9d9d9] pt-3">
          <span className={LABEL_CLASS}>Analyst notes</span>
          <textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} className="mt-1 w-full resize-y border border-[#b3b3b3] bg-white px-3 py-2 text-[12px] leading-5 outline-none focus:border-[#0f8b73]" />
        </label>
        <button type="submit" disabled={saving} className="mt-3 inline-flex h-9 items-center gap-2 bg-[#111111] px-3.5 text-[11px] font-semibold text-white hover:bg-[#0f8b73] disabled:opacity-60">
          <Save className="h-3.5 w-3.5" /> {saving ? "Saving" : "Save case"}
        </button>
      </form>

      <form onSubmit={addEvidence} className="mt-5 border-t-2 border-[#111111] pt-3">
        <p className={LABEL_CLASS}>Add cited evidence</p>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <select value={evidence.kind} onChange={(event) => setEvidence({ ...evidence, kind: event.target.value as AcquisitionEvidenceInput["kind"] })} aria-label="Evidence kind" className={FIELD_CLASS}>
            <option value="ownership">Ownership</option>
            <option value="license">License</option>
            <option value="capacity">Capacity</option>
            <option value="adult_population">Adult population</option>
            <option value="residential_setting">Residential setting</option>
            <option value="private_for_profit">Private for-profit</option>
            <option value="other">Other</option>
          </select>
          <input type="date" value={inputValue(evidence.observedAt)} onChange={(event) => setEvidence({ ...evidence, observedAt: nullable(event.target.value) })} aria-label="Evidence observed date" className={FIELD_CLASS} />
          <input value={evidence.title} onChange={(event) => setEvidence({ ...evidence, title: event.target.value })} placeholder="Source title" className={`${FIELD_CLASS} sm:col-span-2`} />
          <input type="url" value={inputValue(evidence.url)} onChange={(event) => setEvidence({ ...evidence, url: nullable(event.target.value) })} placeholder="https:// source URL" className={`${FIELD_CLASS} sm:col-span-2`} />
          <textarea value={evidence.note} onChange={(event) => setEvidence({ ...evidence, note: event.target.value })} rows={2} placeholder="What this source supports" className="mt-1 resize-y border border-[#b3b3b3] px-3 py-2 text-[12px] sm:col-span-2" />
        </div>
        <button type="submit" disabled={saving} className="mt-2 inline-flex h-9 items-center gap-2 border border-[#111111] px-3.5 text-[11px] font-semibold hover:border-[#0f8b73] hover:text-[#0f8b73] disabled:opacity-60">
          <Plus className="h-3.5 w-3.5" /> Add evidence
        </button>
      </form>

      {message ? <p role="status" className="mt-3 text-[11px] font-semibold leading-4 text-[#9a5b0a]">{message}</p> : null}

      <div className="mt-5 border-t border-[#d9d9d9] pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className={LABEL_CLASS}>Evidence history</p>
          <span className="text-[10px] font-semibold text-[#737373]">{record.evidence.length}</span>
        </div>
        {record.evidence.length ? (
          <div className="mt-2 space-y-2">
            {record.evidence.map((item) => (
              <article key={item.id} className="border-l-2 border-[#0f8b73] pl-3 text-[11px] leading-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[#333333]">{item.title}</p>
                  <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">{item.kind.replaceAll("_", " ")}</span>
                </div>
                {item.note ? <p className="mt-1 text-[#595959]">{item.note}</p> : null}
                <p className="mt-1 text-[10px] text-[#737373]">
                  {item.observedAt || item.createdAt.slice(0, 10)}
                  {item.url ? (
                    <> · <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#0f8b73] underline">Source <ExternalLink className="h-3 w-3" /></a></>
                  ) : null}
                </p>
              </article>
            ))}
          </div>
        ) : <p className="mt-2 text-[11px] text-[#737373]">No analyst evidence has been attached yet.</p>}
      </div>
    </article>
  );
}
