import { useEffect, useRef, useState } from "react";
import {
  uploadExecutiveDirectorLicensingReport,
  type ExecutiveDirectorIntakeStatus,
  type ExecutiveDirectorUploadResponse
} from "../data/executiveDirectorApi";

export const MAX_LICENSING_BATCH_FILES = 100;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export interface LicensingUploadEntry {
  id: string;
  name: string;
  byteLength: number;
  status: "queued" | "uploading" | "received" | "duplicate" | "failed";
  error: string | null;
  file: File | null;
  receipt: { submissionId: string; status: ExecutiveDirectorIntakeStatus; reviewable: boolean } | null;
}

interface BatchState {
  facilityId: string;
  entries: LicensingUploadEntry[];
  uploading: boolean;
  selectionError: string | null;
}

function validateFile(file: File) {
  if (!ACCEPTED_TYPES.has(file.type)) return "Choose a PDF, JPG, or PNG scan.";
  if (!file.size) return "The selected file is empty.";
  if (file.size > MAX_FILE_BYTES) return "The report must be 20 MB or smaller.";
  return null;
}

export function useLicensingUploadBatch(facilityId: string) {
  const [state, setState] = useState<BatchState>({ facilityId, entries: [], uploading: false, selectionError: null });
  const stateRef = useRef(state);
  const controllerRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const sequence = useRef(0);
  const publish = (next: BatchState) => { stateRef.current = next; setState(next); };

  useEffect(() => {
    generation.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    const next = { facilityId, entries: [], uploading: false, selectionError: null };
    stateRef.current = next;
    setState(next);
    return () => { generation.current += 1; controllerRef.current?.abort(); };
  }, [facilityId]);

  const addFiles = (files: File[]) => {
    const current = stateRef.current;
    if (current.facilityId !== facilityId || current.uploading || !files.length) return;
    if (files.length + current.entries.length > MAX_LICENSING_BATCH_FILES) {
      publish({ ...current, selectionError: "Choose up to 100 files per batch. No files from this selection were added." });
      return;
    }
    const entries = files.map((file): LicensingUploadEntry => {
      const error = validateFile(file);
      return { id: String(++sequence.current), name: file.name, byteLength: file.size, status: error ? "failed" : "queued", error, file: error ? null : file, receipt: null };
    });
    publish({ ...current, entries: [...current.entries, ...entries], selectionError: null });
  };
  const remove = (id: string) => {
    const current = stateRef.current;
    if (current.uploading || current.facilityId !== facilityId) return;
    publish({ ...current, selectionError: null, entries: current.entries.filter((entry) => entry.id !== id || entry.receipt) });
  };
  const clear = () => {
    const current = stateRef.current;
    if (!current.uploading && current.facilityId === facilityId) publish({ ...current, entries: [], selectionError: null });
  };
  const upload = async (retryFailed: boolean, signal: AbortSignal) => {
    const current = stateRef.current;
    if (current.uploading || current.facilityId !== facilityId || signal.aborted) return null;
    const selected = current.entries.filter((entry) => entry.file && entry.status === (retryFailed ? "failed" : "queued"));
    if (!selected.length) return null;
    const controller = new AbortController();
    controllerRef.current = controller;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const runGeneration = generation.current;
    const isCurrent = () => !controller.signal.aborted && generation.current === runGeneration && stateRef.current.facilityId === facilityId;
    const update = (id: string, patch: Partial<LicensingUploadEntry>) => {
      if (isCurrent()) publish({ ...stateRef.current, entries: stateRef.current.entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) });
    };
    let singleResult: ExecutiveDirectorUploadResponse | null = null;
    publish({ ...current, uploading: true, selectionError: null });
    try {
      for (const entry of selected) {
        if (!isCurrent() || !entry.file) break;
        update(entry.id, { status: "uploading", error: null });
        try {
          const result = await uploadExecutiveDirectorLicensingReport(facilityId, entry.file, controller.signal);
          if (!isCurrent()) break;
          if (result.submission.facilityId !== facilityId) throw new Error("The receipt did not match this community. Please retry.");
          update(entry.id, {
            status: result.duplicate ? "duplicate" : "received", file: null,
            receipt: { submissionId: result.submission.submissionId, status: result.submission.status, reviewable: Boolean(result.submission.draftData && result.submission.sourceData) }
          });
          if (current.entries.length === 1) singleResult = result;
        } catch (error) {
          if (!isCurrent()) break;
          update(entry.id, { status: "failed", error: error instanceof Error ? error.message : "Receipt could not be confirmed. Retry this file." });
        }
      }
      return isCurrent() ? { singleResult } : null;
    } finally {
      signal.removeEventListener("abort", abort);
      if (controllerRef.current === controller) controllerRef.current = null;
      if (isCurrent()) publish({ ...stateRef.current, uploading: false });
    }
  };

  const visible = state.facilityId === facilityId ? state : { facilityId, entries: [], uploading: false, selectionError: null };
  return { ...visible, addFiles, remove, clear, upload };
}

export type LicensingUploadBatch = ReturnType<typeof useLicensingUploadBatch>;
