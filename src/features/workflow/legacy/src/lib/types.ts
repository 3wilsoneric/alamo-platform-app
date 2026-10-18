// ─── Core data types ──────────────────────────────────────────────────────────

export interface StepVideo {
    id: string
    title: string
    duration: string
    trnCode?: string
}

export interface ProcedureStep {
    id: string
    procedure_id: number
    order: number
    title: string
    body: string
    clickpath?: string[]
    expected_result?: string
    note_prompt: string
    caution: string | null
    video: StepVideo | null
}

export interface ProcedureResource {
    type: string
    label: string
    code: string
}

export interface Procedure {
    id: number
    code: string
    title: string
    dept: string
    role: string
    type: string
    status: 'active' | 'review' | 'archived'
    overview: string
    learning_only?: boolean
    tags: string[]
    updated_at: string
    video: StepVideo | null
    steps: ProcedureStep[]
    resources: ProcedureResource[]
}

export interface Video {
    id: string
    title: string
    duration: string
    series: string
    dept: string
    role: string
    proc_code: string | null
    trn_code: string | null
    assigned?: boolean
    watched?: boolean
}

export interface Document {
    id: string
    code: string
    title: string
    type: 'Policy' | 'Procedure' | 'Training' | 'Form' | 'Reference' | 'Guideline'
    dept: string
    owner: string
    version: string
    format: string
    size: string
    status: 'active' | 'review' | 'expiring' | 'draft'
    effective_date: string
    reviewed_at: string
    review_due: string
    body?: string
    source_reference?: string
    source_updated?: string
}

export interface KnowledgeFile {
    id: string
    title: string
    folder: string
    type: 'Workflow' | 'Policy Note' | 'Case Pattern' | 'Helper Note' | 'Reference'
    updated_at: string
    summary: string
    tags: string[]
    linked_file_ids: string[]
    source_codes: string[]
    body: string
    read_only?: boolean
}

// ─── Walkthrough ──────────────────────────────────────────────────────────────

export interface WalkthroughSession {
    stepIdx: number
    notes: Record<string, string>
    skipped: Set<string>
    completed: Set<string>
}

export interface WalkthroughLaunchContext {
    source: 'assist' | 'procedures' | 'dashboard'
    query?: string
}

// ─── UI types ─────────────────────────────────────────────────────────────────

export type NavPage =
    | 'home'
    | 'dashboard'
    | 'demo'
    | 'assist'
    | 'procedures'
    | 'walkthrough'
    | 'policies'
    | 'forms'
    | 'training'
    | 'role_library'
    | 'documents'
    | 'incident_center'
    | 'eldermark_agent'
    | 'settings'

export interface QuickTap {
    label: string
    ids: number[]
}
