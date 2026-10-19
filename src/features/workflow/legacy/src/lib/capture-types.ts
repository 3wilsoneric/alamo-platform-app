export type CapturedStep = {
  id: string
  kind: 'click' | 'change'
  label: string
  control: 'button' | 'link' | 'checkbox' | 'radio' | 'select'
  at: string
}

export type WorkflowCapture = {
  schemaVersion: 1
  id: string
  title: string
  origin: string
  startedAt: string
  endedAt: string
  reviewedAt: string
  steps: CapturedStep[]
}

export type CaptureEvidence = { digest: string; bundle: WorkflowCapture }
