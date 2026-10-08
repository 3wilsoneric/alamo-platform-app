import { useMsal } from "@azure/msal-react";
import { CheckCircle2, ExternalLink, FileScan, LoaderCircle, PencilLine, ShieldCheck, Upload, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { getAccountExecutiveDirectorAccess } from "../../../shared/auth/executiveDirectorAccess";
import {
  fetchExecutiveDirectorBootstrap,
  fetchExecutiveDirectorSubmission,
  fetchExecutiveDirectorSubmissionSource,
  saveExecutiveDirectorLicensingReview,
  uploadExecutiveDirectorLicensingReport,
  type ExecutiveDirectorBootstrap,
  type ExecutiveDirectorSubmissionDetail,
  type Lic624ReviewData,
  type ExecutiveDirectorSubmission
} from "../data/executiveDirectorApi";
import Lic624ReviewWorkspace from "../components/Lic624ReviewWorkspace";

const DEFAULT_PREVIEW_FACILITY_ID = "337";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function statusLabel(status: ExecutiveDirectorSubmission["status"]) {
  if (status === "awaiting_form_definition") return "Stored · form mapping next";
  if (status === "ocr_required") return "Stored · OCR required";
  if (status === "needs_review") return "Fields extracted · review";
  if (status === "ready_to_file") return "Ready to file";
  if (status === "filed") return "Filed";
  return "Processing failed";
}

export default function ExecutiveDirectorPage() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  const access = getAccountExecutiveDirectorAccess(account, isE2EAuthBypassEnabled);
  const facilityId = access.primaryFacilityId ?? DEFAULT_PREVIEW_FACILITY_ID;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const [bootstrap, setBootstrap] = useState<ExecutiveDirectorBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [activeSubmission, setActiveSubmission] = useState<ExecutiveDirectorSubmissionDetail | null>(null);
  const [openingSubmissionId, setOpeningSubmissionId] = useState<string | null>(null);
  const [openingSourceId, setOpeningSourceId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const loadWorkspace = async (signal?: AbortSignal) => {
    setLoadError(null);
    try {
      setBootstrap(await fetchExecutiveDirectorBootstrap(facilityId, signal));
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(error instanceof Error ? error.message : "The workspace is unavailable.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [facilityId]);

  const recentSubmissions = useMemo(
    () => bootstrap?.intake.submissions.slice(0, 6) ?? [],
    [bootstrap]
  );

  const chooseFile = (candidate: File | null) => {
    setUploadMessage(null);
    if (!candidate) {
      setFile(null);
      setFileError(null);
      return;
    }
    if (!ACCEPTED_TYPES.has(candidate.type)) {
      setFile(null);
      setFileError("Choose a PDF, JPG, or PNG scan.");
      return;
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setFileError("The report must be 20 MB or smaller.");
      return;
    }
    if (!candidate.size) {
      setFile(null);
      setFileError("The selected file is empty.");
      return;
    }
    setFile(candidate);
    setFileError(null);
  };

  const submit = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setFileError(null);
    setUploadMessage(null);
    try {
      const result = await uploadExecutiveDirectorLicensingReport(facilityId, file);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setUploadMessage(
        result.submission.status === "needs_review"
          ? `LIC 624 fields extracted. ${result.submission.extractionSummary?.extractedFieldCount ?? 0} populated fields are ready for review.`
          : "Report stored securely. The OCR step is required before review."
      );
      if (result.submission.draftData) {
        setActiveSubmission(result.submission);
        window.setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      }
      await loadWorkspace();
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The report could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const openSubmission = async (submissionId: string) => {
    if (openingSubmissionId) return;
    setOpeningSubmissionId(submissionId);
    setReviewError(null);
    try {
      const result = await fetchExecutiveDirectorSubmission(facilityId, submissionId);
      setActiveSubmission(result.submission);
      window.setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "The digital form could not be opened.");
    } finally {
      setOpeningSubmissionId(null);
    }
  };

  const openOriginal = async (submission: ExecutiveDirectorSubmission) => {
    if (openingSourceId) return;
    const previewWindow = window.open("", "_blank");
    if (previewWindow) previewWindow.opener = null;
    setOpeningSourceId(submission.submissionId);
    setReviewError(null);
    try {
      const source = await fetchExecutiveDirectorSubmissionSource(facilityId, submission.submissionId);
      const objectUrl = URL.createObjectURL(source);
      if (previewWindow) previewWindow.location.replace(objectUrl);
      else {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      previewWindow?.close();
      setReviewError(error instanceof Error ? error.message : "The original report could not be opened.");
    } finally {
      setOpeningSourceId(null);
    }
  };

  const saveReview = async (data: Lic624ReviewData, confirm: boolean) => {
    if (!activeSubmission) throw new Error("Choose a licensing submission first.");
    const result = await saveExecutiveDirectorLicensingReview(facilityId, activeSubmission, data, confirm);
    setActiveSubmission(result.submission);
    await loadWorkspace();
    return result.submission;
  };

  return (
    <section
      data-executive-director-workspace="true"
      className="mx-auto w-full max-w-[1480px] px-4 pb-16 pt-7 sm:px-6 sm:pt-10 lg:px-8"
    >
      <header className="flex flex-col gap-3 border-b border-[#d8dedb] pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#0a765f]">{bootstrap?.facility.shortName ?? "Your community"}</p>
          <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.045em] text-[#151917] sm:text-[44px]">
            Licensing
          </h1>
          <p className="mt-2 max-w-2xl text-[16px] leading-7 text-[#58625e]">
            Submit LIC 624 reports, review extracted fields, and track each report through filing.
          </p>
        </div>
        {bootstrap?.dashboard.generatedAt ? (
          <p className="text-[12px] text-[#727b77]">Community data updated {formatDate(bootstrap.dashboard.generatedAt)}</p>
        ) : null}
      </header>

      {loadError ? (
        <div role="alert" className="mt-6 border-l-4 border-[#b24c3d] bg-[#fff7f5] px-4 py-3 text-[14px] text-[#7f3328]">
          {loadError}
        </div>
      ) : null}

      <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <article className="overflow-hidden rounded-[24px] border border-[#cdd8d3] bg-white shadow-[0_20px_55px_rgba(21,52,42,0.08)]">
          <div className="border-b border-[#dfe6e2] bg-[linear-gradient(135deg,#f5faf7_0%,#ffffff_68%)] px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e4f2ec] text-[#08725d]">
                <FileScan size={22} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-[24px] font-semibold tracking-[-0.03em] text-[#151917] sm:text-[28px]">LIC 624 intake</h2>
                <p className="mt-1 text-[15px] leading-6 text-[#59645f]">
                  Upload the original Unusual Incident/Injury Report. Fillable PDFs are stripped into a reviewable record; scanned pages are preserved for OCR.
                </p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-8">
            <div
              data-executive-director-upload="true"
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                chooseFile(event.dataTransfer.files[0] ?? null);
              }}
              className={`rounded-[20px] border-2 border-dashed px-5 py-9 text-center transition-colors sm:px-8 ${dragging ? "border-[#0b8269] bg-[#eef8f3]" : "border-[#bfcac5] bg-[#fafcfb]"}`}
            >
              <Upload className="mx-auto text-[#0a765f]" size={28} aria-hidden="true" />
              <p className="mt-4 text-[18px] font-semibold text-[#1f2522]">Drop a scanned report here</p>
              <p className="mt-1 text-[14px] text-[#68716d]">PDF, JPG, or PNG · 20 MB maximum</p>
              <label htmlFor={inputId} className="mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-[#0a765f] bg-white px-5 text-[14px] font-semibold text-[#086451] transition-colors hover:bg-[#f0f8f4]">
                Choose file
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              />
            </div>

            {file ? (
              <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-[#d5dfda] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[#1e2421]">{file.name}</p>
                  <p className="mt-0.5 text-[13px] text-[#6a736f]">{formatFileSize(file.size)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => chooseFile(null)} aria-label="Remove selected file" className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#626b67] hover:bg-[#f2f4f3]">
                    <X size={18} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => void submit()} disabled={uploading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#08725d] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#075c4b] disabled:cursor-wait disabled:opacity-65">
                    {uploading ? <LoaderCircle className="animate-spin" size={17} aria-hidden="true" /> : <ShieldCheck size={17} aria-hidden="true" />}
                    {uploading ? "Uploading" : "Upload securely"}
                  </button>
                </div>
              </div>
            ) : null}

            {fileError ? <p role="alert" className="mt-4 text-[14px] font-medium text-[#a13c30]">{fileError}</p> : null}
            {uploadMessage ? (
              <p role="status" className="mt-4 flex items-start gap-2 text-[14px] font-medium text-[#08725d]">
                <CheckCircle2 className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
                {uploadMessage}
              </p>
            ) : null}
          </div>
        </article>

        <aside className="space-y-6">
          <section className="rounded-[22px] border border-[#d7dfdb] bg-[#f8faf9] p-5 sm:p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#69736f]">Community snapshot</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-[42px] font-semibold leading-none tracking-[-0.05em] text-[#17201c]">
                  {loading ? "—" : bootstrap?.dashboard.residents ?? "—"}
                </p>
                <p className="mt-2 text-[14px] text-[#626c67]">Current residents</p>
              </div>
              <div className="text-right">
                <p className="text-[28px] font-semibold leading-none text-[#17201c]">{bootstrap?.intake.summary.total ?? 0}</p>
                <p className="mt-2 text-[14px] text-[#626c67]">Reports submitted</p>
              </div>
            </div>
          </section>

          <section className="rounded-[22px] border border-[#d7dfdb] bg-white p-5 sm:p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#0a765f]">LIC 624 · Rev. {bootstrap?.form.revision ?? "4/99"}</p>
            <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.025em] text-[#17201c]">Fields captured</h2>
            <div className="mt-4 divide-y divide-[#e1e6e3]">
              {(bootstrap?.form.sections ?? []).map((section) => (
                <div key={section.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-[14px] font-semibold text-[#202723]">{section.label}</p>
                  <p className="mt-1 text-[13px] leading-5 text-[#68716d]">{section.fields.join(" · ")}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {reviewError ? (
        <p role="alert" className="mt-7 border-l-4 border-[#b24c3d] bg-[#fff7f5] px-4 py-3 text-[14px] font-medium text-[#7f3328]">{reviewError}</p>
      ) : null}

      <div ref={reviewRef} className="scroll-mt-6">
        {activeSubmission && bootstrap?.form ? (
          <Lic624ReviewWorkspace
            submission={activeSubmission}
            form={bootstrap.form}
            onClose={() => setActiveSubmission(null)}
            onSave={saveReview}
          />
        ) : null}
      </div>

      <section className="mt-10 border-t border-[#d8dedb] pt-7" data-executive-director-submissions="true">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#0a765f]">Licensing queue</p>
            <h2 className="mt-1 text-[26px] font-semibold tracking-[-0.035em] text-[#151917]">Recent submissions</h2>
          </div>
          <p className="text-[13px] text-[#707975]">{recentSubmissions.length} of {bootstrap?.intake.summary.total ?? 0} shown</p>
        </div>

        {recentSubmissions.length ? (
          <div className="mt-5 divide-y divide-[#e0e5e2] border-y border-[#cfd8d3]">
            {recentSubmissions.map((submission) => (
              <div key={submission.submissionId} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[#202622]">{submission.originalFileName}</p>
                  <p className="mt-1 text-[13px] text-[#707874]">{formatFileSize(submission.byteLength)} · Uploaded {formatDate(submission.createdAt)}</p>
                  {submission.extractionSummary?.method === "pdf_acroform" ? (
                    <p className="mt-1 text-[12px] font-medium text-[#14705d]">
                      {submission.extractionSummary.extractedFieldCount} populated fields · {submission.extractionSummary.reviewIssueCount} review issues
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="w-fit rounded-full bg-[#eef5f1] px-3 py-1.5 text-[12px] font-semibold text-[#176b58]">
                    {statusLabel(submission.status)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void openOriginal(submission)}
                    disabled={Boolean(openingSourceId)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#aebbb5] bg-white px-4 text-[13px] font-semibold text-[#33413b] transition hover:border-[#55645d] hover:bg-[#f5f8f6] disabled:opacity-50"
                  >
                    {openingSourceId === submission.submissionId ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <ExternalLink size={16} aria-hidden="true" />}
                    {openingSourceId === submission.submissionId ? "Opening" : "Original"}
                  </button>
                  {submission.extractionSummary?.method === "pdf_acroform" ? (
                    <button
                      type="button"
                      onClick={() => void openSubmission(submission.submissionId)}
                      disabled={Boolean(openingSubmissionId)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[#08725d] bg-white px-4 text-[13px] font-bold text-[#08725d] transition hover:bg-[#eef7f3] disabled:opacity-50"
                    >
                      {openingSubmissionId === submission.submissionId ? <LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> : <PencilLine size={16} aria-hidden="true" />}
                      {openingSubmissionId === submission.submissionId ? "Opening" : submission.status === "ready_to_file" ? "Open form" : "Review form"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[20px] border border-[#d8dfdb] bg-[#fafcfb] px-5 py-8 text-center">
            <p className="text-[16px] font-semibold text-[#303733]">No reports submitted yet</p>
            <p className="mt-1 text-[14px] text-[#707874]">Uploaded scans will appear here with their processing status.</p>
          </div>
        )}
      </section>
    </section>
  );
}
