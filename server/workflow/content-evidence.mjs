import { CAPTURE_LIMITS, validateCapture } from '../../src/features/workflow/legacy/src/lib/capture-contract.mjs';
import { renderSop, validateSop } from '../../src/features/workflow/legacy/src/lib/sop-contract.mjs';
import { fail, hash } from './model.mjs';

export function captureEvidence(input, id) {
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > CAPTURE_LIMITS.bytes) fail(413, 'capture_too_large', 'Choose a capture smaller than 64 KiB.');
  try {
    const bundle = validateCapture(input);
    if (bundle.id !== id) fail(400, 'invalid_capture', 'The document ID must match the capture ID.');
    return { bundle, digest: hash(bundle) };
  } catch (error) { fail(400, 'invalid_capture', error instanceof Error ? error.message : 'Invalid capture.'); }
}

export function assertCaptureReferences(content, capture) {
  const ids = new Set(capture?.bundle.steps.map(step => step.id) ?? []);
  if (content.sop?.steps.some(step => step.captureStepId && !ids.has(step.captureStepId))) fail(400, 'invalid_sop_source', 'A referenced capture step is not in this document’s retained evidence.');
}

export function assertDocumentEvidence(doc) {
  try {
    if (hash(doc.content) !== doc.contentHash) throw new Error('Content changed');
    if (Object.hasOwn(doc, 'capture')) {
      const checked = captureEvidence(doc.capture.bundle, doc.id);
      if (checked.digest !== doc.capture.digest) throw new Error('Capture changed');
    }
    if (Object.hasOwn(doc.content, 'sop')) {
      const sop = validateSop(doc.content.sop);
      if (doc.content.kind !== 'procedure' || renderSop(sop) !== doc.content.body) throw new Error('SOP projection changed');
      assertCaptureReferences(doc.content, doc.capture);
    }
  } catch { fail(503, 'workflow_content_integrity', 'Stored Workflow content or evidence failed its integrity check.'); }
}
