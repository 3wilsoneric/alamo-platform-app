import { randomUUID } from 'node:crypto';
import { sopFromCapture, renderSop } from '../src/features/workflow/legacy/src/lib/sop-contract.mjs';

export function syntheticCapture() {
  return { schemaVersion: 1, id: randomUUID(), title: 'Synthetic captured SOP', origin: 'https://example.test',
    startedAt: '2026-10-19T12:00:00.000Z', endedAt: '2026-10-19T12:01:00.000Z', reviewedAt: '2026-10-19T12:02:00.000Z',
    steps: [{ id: randomUUID(), kind: 'click', control: 'button', label: 'Practice', at: '2026-10-19T12:00:01.000Z' }] };
}

export function syntheticSopContent(capture, previousContent) {
  const sop = { ...sopFromCapture(capture, previousContent.body), trigger: 'A fictional exercise starts.',
    applicability: 'Synthetic training room only.', ownerRole: 'Practice facilitator', prerequisites: 'Obtain a fictional checklist.',
    completionCriteria: 'The fictional outcome is recorded.', exceptions: 'Stop the exercise if its checklist is missing.',
    handoff: 'Give the practice checklist to the facilitator for acknowledgement.' };
  sop.steps[0] = { ...sop.steps[0], role: 'Assessor', action: 'The assessor checks the fictional checklist.', expectedResult: 'The fictional checklist is visible.' };
  return { ...previousContent, audience: 'Practice team', purpose: 'Exercise the capture-to-publication path.', sop, body: renderSop(sop) };
}
