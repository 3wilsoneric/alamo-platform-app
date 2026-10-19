import content from '../../content/library/documents.v1.json'
import type { Document, KnowledgeFile } from './types'

// A projection of Workflow-owned content and the pinned read-only skill import.
// Original source files remain authoritative; workspace copies are not editors.
export const LIBRARY_DOCUMENTS: Document[] = content.records.map(record => ({
  id: record.id, code: record.code, title: record.title,
  type: record.kind === 'procedure' ? 'Procedure' : 'Reference',
  dept: record.kind === 'procedure' ? 'Admissions' : 'Cross-application',
  owner: record.ownerApplication === 'workflow' ? 'Alamo Workflow' : 'AlamoAgent',
  version: String(record.version), format: 'Markdown', size: `${(new TextEncoder().encode(record.body).length / 1024).toFixed(1)} KB`,
  status: record.kind === 'procedure' ? 'review' : 'draft',
  effective_date: 'Not effective — draft', reviewed_at: 'Not reviewed', review_due: 'Not assigned',
  body: record.body, source_reference: `${record.sourceFile} · ${record.sourceId}`, source_updated: record.updated, source_revision: record.revision,
}))

export const LIBRARY_KNOWLEDGE: KnowledgeFile[] = content.records.map(record => ({
  id: record.id, title: record.title, folder: record.folder, type: 'Reference', updated_at: record.updated,
  summary: record.summary, tags: record.tags, linked_file_ids: record.linkedIds, source_codes: [record.code],
  body: record.body, read_only: true,
}))
