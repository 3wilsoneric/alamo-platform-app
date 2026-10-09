import { useMsal } from "@azure/msal-react";
import { ExternalLink, FileScan, FileText, LoaderCircle, PencilLine, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { getAccountExecutiveDirectorAccess } from "../../../shared/auth/executiveDirectorAccess";
import {
  fetchExecutiveDirectorBootstrap,
  fetchExecutiveDirectorSubmission,
  fetchExecutiveDirectorSubmissions,
  fetchExecutiveDirectorSubmissionSource,
  saveExecutiveDirectorLicensingReview,
  type ExecutiveDirectorBootstrap,
  type ExecutiveDirectorSubmissionCatalog,
  type ExecutiveDirectorSubmissionDetail,
  type Lic624FormContract,
  type Lic624ReviewData,
  type ExecutiveDirectorSubmission
} from "../data/executiveDirectorApi";
import Lic624ReviewWorkspace from "../components/Lic624ReviewWorkspace";
import LicensingBulkUpload from "../components/LicensingBulkUpload";
import { useLicensingUploadBatch } from "../components/useLicensingUploadBatch";
import "../executiveCommunity.css";
import "../executiveLicensing.css";

const DEFAULT_PREVIEW_FACILITY_ID = "337";
const PENDING_NAVIGATION_MESSAGE = "Wait for the current report action to finish before leaving Licensing.";
type LicensingView = "reports" | "upload" | "review";
type LicensingOperation = { kind: "upload" | "open" | "save"; controller: AbortController };

function formatFileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? (bytes / (1024 * 1024)).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}
function formatDate(value: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
function statusLabel(status: ExecutiveDirectorSubmission["status"]) {
  if (status === "awaiting_form_definition") return "Mapping required";
  if (status === "ocr_required") return "OCR required";
  if (status === "needs_review") return "Needs review";
  if (status === "ready_to_file") return "Ready to file";
  if (status === "filed") return "Filed";
  return "Processing failed";
}

export default function ExecutiveDirectorPage() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  const access = getAccountExecutiveDirectorAccess(account, isE2EAuthBypassEnabled);
  const facilityId = access.primaryFacilityId ?? DEFAULT_PREVIEW_FACILITY_ID;
  const batch = useLicensingUploadBatch(facilityId);
  const pageRef = useRef<HTMLElement>(null);
  const workspaceController = useRef<AbortController | null>(null);
  const operationRef = useRef<LicensingOperation | null>(null);
  const sourceRequestRef = useRef<AbortController | null>(null);
  const focusViewRef = useRef<LicensingView | null>(null);
  const listGeneration = useRef(0);
  const moreController = useRef<AbortController | null>(null);
  const [bootstrap, setBootstrap] = useState<ExecutiveDirectorBootstrap | null>(null);
  const [form, setForm] = useState<Lic624FormContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapRefresh, setBootstrapRefresh] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<LicensingView>("reports");
  const [catalog, setCatalog] = useState<ExecutiveDirectorSubmissionCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [activeSubmission, setActiveSubmission] = useState<ExecutiveDirectorSubmissionDetail | null>(null);
  const [openingSubmissionId, setOpeningSubmissionId] = useState<string | null>(null);
  const [openingSourceId, setOpeningSourceId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const workspaceBusy = uploading || Boolean(openingSubmissionId) || reviewBusy;
  const refreshCatalog = useCallback(() => setCatalogRefresh((revision) => revision + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    workspaceController.current = controller;
    operationRef.current = null;
    sourceRequestRef.current = null;
    focusViewRef.current = null;
    setBootstrap(null);
    setForm(null);
    setLoading(true);
    setLoadError(null);
    setActiveSubmission(null);
    setReviewDirty(false);
    setReviewBusy(false);
    setReviewError(null);
    setUploading(false);
    setOpeningSubmissionId(null);
    setOpeningSourceId(null);
    setView("reports");
    return () => controller.abort();
  }, [facilityId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    void fetchExecutiveDirectorBootstrap(facilityId, controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setBootstrap(result); setForm(result.form); } })
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Licensing is unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [facilityId, bootstrapRefresh]);

  useEffect(() => {
    if (workspaceBusy || focusViewRef.current !== view) return;
    document.getElementById("licensing-tab-" + view)?.focus();
    focusViewRef.current = null;
    pageRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [view, workspaceBusy]);

  useEffect(() => {
    const controller = new AbortController();
    listGeneration.current += 1;
    moreController.current?.abort();
    setLoadingMore(false);
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalog(null);
    const timer = window.setTimeout(() => {
      void fetchExecutiveDirectorSubmissions(facilityId, { status, query: query.trim() }, controller.signal)
        .then((result) => { if (!controller.signal.aborted) setCatalog(result); })
        .catch((error: unknown) => { if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : "Reports could not be loaded."); })
        .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    }, query ? 250 : 0);
    return () => {
      controller.abort();
      moreController.current?.abort();
      window.clearTimeout(timer);
    };
  }, [facilityId, status, query, catalogRefresh]);

  useEffect(() => {
    if (!reviewDirty && !workspaceBusy) return;
    const preventExit = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [reviewDirty, workspaceBusy]);

  useEffect(() => {
    if (!reviewDirty && !workspaceBusy) return;
    // These links use BrowserRouter, so a same-tab route change does not fire beforeunload.
    const protectHeaderNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("[data-executive-director-header='true'] a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      if (!operationRef.current && !workspaceBusy && (!reviewDirty || window.confirm("Discard unsaved changes to this report?"))) return;
      event.preventDefault();
      event.stopPropagation();
      if (operationRef.current || workspaceBusy) setReviewError(PENDING_NAVIGATION_MESSAGE);
    };
    document.addEventListener("click", protectHeaderNavigation, true);
    return () => document.removeEventListener("click", protectHeaderNavigation, true);
  }, [reviewDirty, workspaceBusy]);

  useEffect(() => {
    if (workspaceBusy || operationRef.current) return;
    setReviewError((current) => current === PENDING_NAVIGATION_MESSAGE ? null : current);
  }, [workspaceBusy]);

  const loadMore = async () => {
    if (!catalog?.nextCursor || loadingMore) return;
    const generation = listGeneration.current;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true);
    setCatalogError(null);
    try {
      const next = await fetchExecutiveDirectorSubmissions(facilityId, { status, query: query.trim(), cursor: catalog.nextCursor }, controller.signal);
      if (controller.signal.aborted || generation !== listGeneration.current) return;
      if (next.catalogRevision !== catalog.catalogRevision) { refreshCatalog(); return; }
      setCatalog((previous) => previous ? { ...next, submissions: [...previous.submissions, ...next.submissions.filter((item) => !previous.submissions.some((existing) => existing.submissionId === item.submissionId))] } : next);
    } catch (error) {
      if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : "More reports could not be loaded.");
    } finally {
      if (!controller.signal.aborted && generation === listGeneration.current) setLoadingMore(false);
    }
  };

  const selectView = (next: LicensingView) => {
    if (operationRef.current || workspaceBusy) return;
    setView(next);
    document.getElementById("licensing-tab-" + next)?.focus();
    pageRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  };
  const mayReplaceReview = () => !operationRef.current && !workspaceBusy && (!reviewDirty || window.confirm("Discard unsaved changes to this report?"));
  const closeReview = () => {
    if (!mayReplaceReview()) return;
    setActiveSubmission(null);
    setReviewDirty(false);
    focusViewRef.current = "reports";
    selectView("reports");
  };
  const submit = async (retryFailed: boolean) => {
    const controller = workspaceController.current;
    if (!controller || controller.signal.aborted || !mayReplaceReview()) return;
    const operation: LicensingOperation = { kind: "upload", controller };
    operationRef.current = operation;
    setUploading(true);
    setReviewError(null);
    try {
      const completed = await batch.upload(retryFailed, controller.signal);
      if (controller.signal.aborted) return;
      const result = completed?.singleResult;
      if (result?.submission.draftData && result.submission.sourceData) {
        setForm(result.form);
        setActiveSubmission(result.submission);
        setReviewDirty(false);
        focusViewRef.current = "review";
        setView("review");
      }
      if (completed) refreshCatalog();
    } catch (error) {
      if (!controller.signal.aborted) setReviewError(error instanceof Error ? error.message : "The upload batch could not be completed.");
    } finally {
      if (operationRef.current === operation) operationRef.current = null;
      if (!controller.signal.aborted) setUploading(false);
    }
  };
  const openSubmission = async (submissionId: string) => {
    const controller = workspaceController.current;
    if (!controller || controller.signal.aborted || operationRef.current || workspaceBusy) return;
    if (activeSubmission?.submissionId === submissionId) { selectView("review"); return; }
    if (!mayReplaceReview()) return;
    const operation: LicensingOperation = { kind: "open", controller };
    operationRef.current = operation;
    setOpeningSubmissionId(submissionId);
    setReviewError(null);
    try {
      const result = await fetchExecutiveDirectorSubmission(facilityId, submissionId, controller.signal);
      if (controller.signal.aborted) return;
      if (!result.submission.draftData || !result.submission.sourceData) throw new Error("This report requires extraction before the digital form is available.");
      setForm(result.form);
      setActiveSubmission(result.submission);
      setReviewDirty(false);
      focusViewRef.current = "review";
      setView("review");
    } catch (error) {
      if (!controller.signal.aborted) setReviewError(error instanceof Error ? error.message : "The digital form could not be opened.");
    } finally {
      if (operationRef.current === operation) operationRef.current = null;
      if (!controller.signal.aborted) setOpeningSubmissionId(null);
    }
  };
  const openOriginal = async (submission: ExecutiveDirectorSubmission) => {
    const controller = workspaceController.current;
    if (!controller || controller.signal.aborted || sourceRequestRef.current || submission.facilityId !== facilityId) return;
    sourceRequestRef.current = controller;
    const previewWindow = window.open("", "_blank");
    if (previewWindow) previewWindow.opener = null;
    setOpeningSourceId(submission.submissionId);
    setReviewError(null);
    try {
      const source = await fetchExecutiveDirectorSubmissionSource(facilityId, submission.submissionId, controller.signal);
      if (controller.signal.aborted) { previewWindow?.close(); return; }
      const objectUrl = URL.createObjectURL(source);
      if (previewWindow && !previewWindow.closed) previewWindow.location.replace(objectUrl);
      else if (previewWindow?.closed) URL.revokeObjectURL(objectUrl);
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
      if (!controller.signal.aborted) setReviewError(error instanceof Error ? error.message : "The original report could not be opened.");
    } finally {
      if (sourceRequestRef.current === controller) sourceRequestRef.current = null;
      if (!controller.signal.aborted) setOpeningSourceId(null);
    }
  };
  const saveReview = async (data: Lic624ReviewData, confirm: boolean) => {
    const controller = workspaceController.current;
    if (!controller || controller.signal.aborted || !activeSubmission || activeSubmission.facilityId !== facilityId) throw new Error("Choose a licensing submission first.");
    if (operationRef.current) throw new Error("Wait for the current report action to finish.");
    const operation: LicensingOperation = { kind: "save", controller };
    operationRef.current = operation;
    try {
      const result = await saveExecutiveDirectorLicensingReview(facilityId, activeSubmission, data, confirm, controller.signal);
      if (controller.signal.aborted) throw new DOMException("The licensing workspace changed.", "AbortError");
      setActiveSubmission(result.submission);
      refreshCatalog();
      return result.submission;
    } finally {
      if (operationRef.current === operation) operationRef.current = null;
    }
  };
  const tabs = [
    { id: "reports" as const, label: "Reports", icon: FileText },
    { id: "upload" as const, label: "Upload report", icon: Upload },
    ...(activeSubmission ? [{ id: "review" as const, label: "Review form", icon: PencilLine }] : [])
  ];

  return (
    <section ref={pageRef} data-executive-director-workspace="true" className="executive-director-community executive-licensing">
      <header className="executive-director-community__masthead">
        <div><h1>Licensing</h1><span>{bootstrap?.facility.shortName ?? "Your community"}</span></div>
        <p>LIC 624 · Unusual Incident/Injury Report</p>
      </header>
      {loadError ? <p role="alert" className="licensing-message is-error">{loadError} <button type="button" disabled={loading} onClick={() => setBootstrapRefresh((revision) => revision + 1)}>Retry workspace</button></p> : null}
      {reviewError ? <p role="alert" className="licensing-message is-error">{reviewError}</p> : null}
      <div className="licensing-register" data-licensing-register="true">
        <div role="tablist" aria-label="Licensing views" className="licensing-register__tabs">
          {tabs.map((tab, index) => <button key={tab.id} id={"licensing-tab-" + tab.id} role="tab" type="button" disabled={workspaceBusy} aria-selected={view === tab.id} aria-controls={"licensing-panel-" + tab.id} tabIndex={view === tab.id ? 0 : -1} onClick={() => selectView(tab.id)} onKeyDown={(event) => {
            if (workspaceBusy || operationRef.current) return;
            const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!offset && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            const target = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length];
            if (!target) return;
            selectView(target.id);
            document.getElementById("licensing-tab-" + target.id)?.focus();
          }}><tab.icon aria-hidden="true" />{tab.label}{tab.id === "review" && reviewDirty ? <i aria-label="Unsaved changes" /> : null}</button>)}
          <span className="licensing-register__stamp">LIC 624 <small>Rev. {form?.revision ?? "4/99"}</small></span>
        </div>
        <div className="licensing-register__paper">
          <section id="licensing-panel-reports" role="tabpanel" aria-labelledby="licensing-tab-reports" hidden={view !== "reports"} data-executive-director-submissions="true">
            <div className="licensing-reports__toolbar">
              <div><h2>Reports</h2><p>{catalog ? catalog.summary.total + " submitted" : loading || catalogLoading ? "Loading reports…" : "Report library"}</p></div>
              <button className="licensing-button is-primary" type="button" disabled={workspaceBusy} onClick={() => selectView("upload")}><Upload aria-hidden="true" />Upload report</button>
            </div>
            <div className="licensing-reports__filters">
              <label className="licensing-search"><Search aria-hidden="true" /><input aria-label="Search reports" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filename" /></label>
              <select aria-label="Report status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All reports</option><option value="needs_review">Needs review</option><option value="ocr_required">OCR required</option><option value="ready_to_file">Ready to file</option><option value="filed">Filed</option><option value="failed">Processing failed</option><option value="awaiting_form_definition">Mapping required</option>
              </select>
            </div>
            {catalogError ? <p role="alert" className="licensing-message is-error">{catalogError} <button type="button" onClick={refreshCatalog}>Refresh reports</button></p> : null}
            <div className="licensing-report-list" aria-busy={catalogLoading}>
              <div className="licensing-report-list__columns" aria-hidden="true"><span>Original report</span><span>Uploaded</span><span>Status</span><span>Open</span></div>
              {catalogLoading ? <p role="status" className="licensing-empty"><LoaderCircle className="animate-spin" aria-hidden="true" />Loading reports…</p> : null}
              {!catalogLoading && catalog?.submissions.map((submission) => <article data-licensing-report={submission.submissionId} key={submission.submissionId} className="licensing-report-row">
                <div className="licensing-report-row__file"><FileText aria-hidden="true" /><div><h3>{submission.originalFileName}</h3><p>{formatFileSize(submission.byteLength)}{submission.extractionSummary?.method === "pdf_acroform" ? " · " + submission.extractionSummary.extractedFieldCount + " fields extracted" : ""}</p></div></div>
                <time dateTime={submission.createdAt}>{formatDate(submission.createdAt)}</time>
                <span className={"licensing-report-status is-" + submission.status}>{statusLabel(submission.status)}</span>
                <div className="licensing-report-row__actions">
                  <button className="licensing-button" type="button" disabled={Boolean(openingSourceId)} onClick={() => void openOriginal(submission)}><ExternalLink aria-hidden="true" />{openingSourceId === submission.submissionId ? "Opening" : "Original"}</button>
                  {submission.extractionSummary?.method === "pdf_acroform" ? <button className="licensing-button is-review" type="button" disabled={workspaceBusy || loading} onClick={() => void openSubmission(submission.submissionId)}><PencilLine aria-hidden="true" />{openingSubmissionId === submission.submissionId ? "Opening" : submission.status === "ready_to_file" ? "Open form" : "Review form"}</button> : null}
                </div>
              </article>)}
              {!catalogLoading && !catalogError && !catalog?.submissions.length ? <div className="licensing-empty"><FileScan aria-hidden="true" /><h3>{query || status ? "No matching reports" : "No reports submitted yet"}</h3><p>{query || status ? "Try another filename or status." : "Upload a LIC 624 to start the record."}</p>{!query && !status ? <button className="licensing-button" type="button" disabled={workspaceBusy} onClick={() => selectView("upload")}>Upload report</button> : null}</div> : null}
            </div>
            {catalog ? <footer className="licensing-reports__footer"><span>{catalog.submissions.length} of {catalog.filteredTotal} reports{query || status ? " matching filters" : ""}</span>{catalog.nextCursor ? <button className="licensing-button" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading" : "Load more reports"}</button> : null}</footer> : null}
          </section>
          <section id="licensing-panel-upload" role="tabpanel" aria-labelledby="licensing-tab-upload" hidden={view !== "upload"}>
            <LicensingBulkUpload key={facilityId} batch={batch} revision={form?.revision ?? "4/99"} busy={workspaceBusy} ready={Boolean(bootstrap)} onUpload={(retryFailed) => void submit(retryFailed)} onReview={(submissionId) => void openSubmission(submissionId)} />
          </section>
          {activeSubmission && form ? <section id="licensing-panel-review" role="tabpanel" aria-labelledby="licensing-tab-review" hidden={view !== "review"} inert={Boolean(openingSubmissionId) || uploading} aria-busy={Boolean(openingSubmissionId) || uploading}>
            <Lic624ReviewWorkspace submission={activeSubmission} form={form} onClose={closeReview} onSave={saveReview} onDirtyChange={setReviewDirty} onBusyChange={setReviewBusy} onOpenOriginal={() => void openOriginal(activeSubmission)} />
          </section> : null}
        </div>
      </div>
    </section>
  );
}
