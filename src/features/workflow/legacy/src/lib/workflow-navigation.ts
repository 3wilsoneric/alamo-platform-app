import type { NavPage } from './types'

export type WorkflowPage = Exclude<NavPage, 'home' | 'incident_center' | 'eldermark_agent'>
export const WORKFLOW_TITLES: Record<WorkflowPage, string> = {
  dashboard: 'Workspace', drafts: 'Documents', role_library: 'Roles',
  processes: 'Workflows', knowledge: 'Sources & connections', procedures: 'Procedures', documents: 'Source library',
  policies: 'Policies', training: 'Read & practice', organization: 'Organization preview',
  assist: 'Guidance demo', demo: 'Demo', walkthrough: 'Walkthrough',
  forms: 'Forms · planned', settings: 'Settings · planned',
}
export function workflowPage(value: string | null | undefined): WorkflowPage {
  return value && Object.hasOwn(WORKFLOW_TITLES, value) ? value as WorkflowPage : 'dashboard'
}
export function workflowHref(page: WorkflowPage, params: Record<string, string> = {}) {
  return `/workflow?${new URLSearchParams({ view: page, ...params })}`
}
/** Read navigation context only; document data remains on the server. */
export function workflowParams() {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
}
export function replaceWorkflowParams(params: Record<string, string | undefined>) {
  const url = new URL(window.location.href)
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) url.searchParams.delete(name)
    else url.searchParams.set(name, value)
  }
  window.history.replaceState(window.history.state, '', url)
}
