import { CheckCircle2, CopyCheck, FileScan, FileText, LoaderCircle, PencilLine, RotateCcw, ShieldCheck, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_LICENSING_BATCH_FILES, type LicensingUploadBatch, type LicensingUploadEntry } from "./useLicensingUploadBatch";
import "../licensingBulkUpload.css";

interface Props {
  batch: LicensingUploadBatch;
  revision: string;
  busy: boolean;
  ready: boolean;
  onUpload: (retryFailed: boolean) => void;
  onReview: (submissionId: string) => void;
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function receiptLabel(entry: LicensingUploadEntry) {
  if (entry.receipt?.status === "ocr_required") return "Awaiting OCR";
  if (entry.receipt?.status === "ready_to_file") return "Ready to file";
  if (entry.receipt?.status === "filed") return "Filed";
  if (entry.receipt?.status === "needs_review") return "Needs review";
  if (entry.receipt?.status === "awaiting_form_definition") return "Mapping required";
  return entry.receipt ? "Extraction failed" : null;
}

export default function LicensingBulkUpload({ batch, revision, busy, ready, onUpload, onReview }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const wasUploading = useRef(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (wasUploading.current && !batch.uploading && !summaryRef.current?.closest("[hidden]")) summaryRef.current?.focus({ preventScroll: true });
    wasUploading.current = batch.uploading;
  }, [batch.uploading]);
  const counts = { queued: 0, uploading: 0, received: 0, duplicate: 0, failed: 0 };
  for (const entry of batch.entries) counts[entry.status] += 1;
  const retryable = batch.entries.filter((entry) => entry.status === "failed" && entry.file).length;
  const complete = counts.received + counts.duplicate + counts.failed;
  const addFiles = (files: File[]) => { if (!busy) batch.addFiles(files); };
  const focusPicker = () => window.requestAnimationFrame(() => inputRef.current?.focus());
  const clear = () => { batch.clear(); if (inputRef.current) inputRef.current.value = ""; focusPicker(); };

  return <div data-licensing-bulk-upload="true" className="licensing-upload licensing-bulk-upload">
    <aside className="licensing-upload__document" aria-hidden="true"><div className="licensing-upload__document-code">LIC 624<span>Rev. {revision}</span></div><FileScan /><h2>Unusual Incident<br />/ Injury Report</h2><div className="licensing-upload__document-rule" /><span>Original reports</span></aside>
    <div className="licensing-upload__body">
      <header><h2>LIC 624 intake</h2><p>Upload originals, then check and edit each extracted form.</p></header>
      <div data-executive-director-upload="true" className={`licensing-dropzone${dragging ? " is-dragging" : ""}${batch.entries.length ? " licensing-dropzone--compact" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}>
        <Upload aria-hidden="true" /><h3><span className="licensing-dropzone__desktop-label">Drop your reports here</span><span className="licensing-dropzone__mobile-label">Choose reports to upload</span></h3><p>PDF, JPG, or PNG · 20 MB each · Up to {MAX_LICENSING_BATCH_FILES} files per batch</p>
        <label htmlFor={inputId} className={`licensing-button${busy || batch.entries.length >= MAX_LICENSING_BATCH_FILES ? " is-disabled" : ""}`}>{batch.entries.length ? "Add files" : "Choose files"}</label>
        <input ref={inputRef} id={inputId} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={busy || batch.entries.length >= MAX_LICENSING_BATCH_FILES} onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      </div>
      {batch.selectionError ? <p className="licensing-message is-error" role="alert">{batch.selectionError}</p> : null}
      {batch.entries.length ? <section className="licensing-batch" data-licensing-batch="true" aria-label="Selected report batch">
        <header className="licensing-batch__heading"><h3>{batch.entries.length} {batch.entries.length === 1 ? "report" : "reports"} in this batch</h3><button type="button" className="licensing-button" disabled={busy} onClick={clear}>Clear batch</button></header>
        <p ref={summaryRef} tabIndex={-1} className="licensing-batch__summary" role="status" aria-live="polite" data-licensing-upload-summary="true">{counts.queued} queued · {counts.uploading} uploading · {counts.received} received · {counts.duplicate} duplicate · {counts.failed} failed</p>
        {batch.uploading ? <progress className="licensing-batch__progress" aria-label="Batch upload progress" value={complete} max={batch.entries.length} /> : null}
        <ol className="licensing-batch__list" aria-label="Upload batch">
          {batch.entries.map((entry) => <li key={entry.id} data-licensing-batch-entry={entry.id} data-upload-status={entry.status}>
            <span className="licensing-batch__file-icon" aria-hidden="true">{entry.status === "uploading" ? <LoaderCircle className="animate-spin" /> : entry.status === "received" ? <CheckCircle2 /> : entry.status === "duplicate" ? <CopyCheck /> : <FileText />}</span>
            <div className="licensing-batch__file"><h4>{entry.name}</h4><p>{fileSize(entry.byteLength)}{receiptLabel(entry) ? ` · ${receiptLabel(entry)}` : ""}</p>{entry.error ? <p className="licensing-batch__error">{entry.error}</p> : null}{entry.status === "duplicate" ? <p>Already received; existing report retained.</p> : null}</div>
            <span className={`licensing-batch__state is-${entry.status}`}>{entry.status === "queued" ? "Queued" : entry.status === "uploading" ? "Uploading" : entry.status === "received" ? "Received" : entry.status === "duplicate" ? "Duplicate" : "Failed"}</span>
            <div className="licensing-batch__actions">{entry.receipt?.reviewable ? <button className="licensing-button is-review" type="button" disabled={busy} onClick={() => { if (entry.receipt) onReview(entry.receipt.submissionId); }}><PencilLine aria-hidden="true" />Review form</button> : null}{!entry.receipt ? <button type="button" disabled={busy} aria-label={batch.entries.length === 1 ? "Remove selected file" : `Remove ${entry.name} from batch`} onClick={() => { batch.remove(entry.id); focusPicker(); }}><X aria-hidden="true" /></button> : null}</div>
          </li>)}
        </ol>
        <div className="licensing-batch__submit">
          {counts.queued || batch.uploading ? <button className="licensing-button is-primary" type="button" disabled={busy || !ready || !counts.queued} onClick={() => onUpload(false)}>{batch.uploading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{batch.uploading ? batch.entries.length === 1 ? "Uploading" : "Uploading batch" : batch.entries.length === 1 ? "Upload securely" : "Upload queued files"}</button> : null}
          {retryable ? <button className="licensing-button" type="button" aria-label="Retry failed files" disabled={busy || !ready} onClick={() => onUpload(true)}><RotateCcw aria-hidden="true" />Retry failed files ({retryable})</button> : null}
        </div>
      </section> : null}
      <p className="licensing-upload__note">Fillable PDFs can be reviewed after receipt. Scans are stored as Awaiting OCR; extraction is not yet automatic.</p>
      <p className="licensing-upload__note licensing-batch__session-note">Keep this tab open while uploading. Closing it cancels files not yet sent; received files stay on the server. Reselect unconfirmed files to retry; the server checks for duplicates.</p>
    </div>
  </div>;
}
