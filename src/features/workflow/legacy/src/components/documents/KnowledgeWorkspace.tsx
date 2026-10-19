'use client'

import { useMemo, useRef, useState } from 'react'
import { KNOWLEDGE_FILES, REPO_DOCS } from '@/lib/data'
import DocumentBody from './DocumentBody'
import type { KnowledgeFile } from '@/lib/types'

interface KnowledgeWorkspaceProps {
  onClose: () => void
}

interface GraphNodeLayout {
  id: string
  x: number
  y: number
}

const NOTE_TEMPLATES = [
  {
    id: 'workflow-map',
    label: 'Workflow map',
    folder: 'Workspace/Workflow Maps',
    type: 'Workflow' as const,
    title: 'New workflow map',
    summary: 'Map the operational flow, key decisions, and linked source material.',
    body: '# New workflow map\n\n## Situation\n\n## Operational flow\n- \n\n## Key decisions\n- \n\n## Linked source material\n- ',
  },
  {
    id: 'helper-note',
    label: 'Helper note',
    folder: 'Workspace/Helpers',
    type: 'Helper Note' as const,
    title: 'New helper note',
    summary: 'Short, prompt-ready support for in-system helper experiences.',
    body: '# New helper note\n\n## Staff usually ask\n- \n\n## Answer\n\n## Before leaving this screen\n- ',
  },
  {
    id: 'policy-interpretation',
    label: 'Policy note',
    folder: 'Workspace/Policy Notes',
    type: 'Policy Note' as const,
    title: 'New policy interpretation',
    summary: 'Translate formal policy into operational guidance staff can actually use.',
    body: '# New policy interpretation\n\n## What this policy means operationally\n\n## What staff should do\n- \n\n## What not to miss\n- ',
  },
]

const NOTE_TYPE_RULES: Record<
  KnowledgeFile['type'],
  { requiredSections: string[]; productTargets: string[] }
> = {
  Workflow: {
    requiredSections: ['Situation', 'Operational flow', 'Key decisions'],
    productTargets: ['Workflow'],
  },
  'Policy Note': {
    requiredSections: ['What this policy means operationally', 'What staff should do'],
    productTargets: ['Workflow', 'Incident Center'],
  },
  'Case Pattern': {
    requiredSections: ['Keep across shifts', 'Good handoff language'],
    productTargets: ['Incident Center', 'ElderMark Side Panel'],
  },
  'Helper Note': {
    requiredSections: ['Staff usually ask', 'Answer'],
    productTargets: ['ElderMark Side Panel'],
  },
  Reference: {
    requiredSections: [],
    productTargets: ['Workflow'],
  },
}

function getMissingSections(file: KnowledgeFile) {
  const rules = NOTE_TYPE_RULES[file.type]
  return rules.requiredSections.filter((section) => !file.body.includes(`## ${section}`))
}

function buildLintIssues(files: KnowledgeFile[]) {
  return files.flatMap((file) => {
    const issues: Array<{ id: string; tone: 'warning' | 'info'; title: string; detail: string; fileId: string }> = []
    const missingSections = getMissingSections(file)

    if (!file.source_codes.length) {
      issues.push({
        id: `${file.id}-source`,
        tone: 'warning',
        title: 'Missing source basis',
        detail: `${file.title} is not linked to any formal source document.`,
        fileId: file.id,
      })
    }

    if (!file.linked_file_ids.length) {
      issues.push({
        id: `${file.id}-links`,
        tone: 'info',
        title: 'No graph links yet',
        detail: `${file.title} is not connected to any other workspace note.`,
        fileId: file.id,
      })
    }

    if (missingSections.length) {
      issues.push({
        id: `${file.id}-schema`,
        tone: 'warning',
        title: 'Schema sections missing',
        detail: `${file.title} is missing ${missingSections.join(', ')}.`,
        fileId: file.id,
      })
    }

    return issues
  })
}

export default function KnowledgeWorkspace({ onClose }: KnowledgeWorkspaceProps) {
  const [files, setFiles] = useState<KnowledgeFile[]>(KNOWLEDGE_FILES)
  const [selectedFileId, setSelectedFileId] = useState<string>(KNOWLEDGE_FILES[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [selectedSourceCode, setSelectedSourceCode] = useState<string | null>(KNOWLEDGE_FILES[0]?.source_codes[0] ?? null)
  const nextIdRef = useRef(KNOWLEDGE_FILES.length + 1)

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return files
    return files.filter((file) => {
      return (
        file.title.toLowerCase().includes(q) ||
        file.folder.toLowerCase().includes(q) ||
        file.body.toLowerCase().includes(q) ||
        file.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        file.source_codes.some((code) => code.toLowerCase().includes(q))
      )
    })
  }, [files, search])

  const selectedFile = files.find((file) => file.id === selectedFileId) ?? files[0]
  const linkedFiles = files.filter((file) => selectedFile?.linked_file_ids.includes(file.id))
  const backlinks = files.filter((file) => file.id !== selectedFile?.id && file.linked_file_ids.includes(selectedFile?.id ?? ''))
  const sourceDocs = REPO_DOCS.filter((doc) => selectedFile?.source_codes.includes(doc.code))
  const selectedSourceDoc = sourceDocs.find((doc) => doc.code === selectedSourceCode) ?? sourceDocs[0]
  const sourceImpactNotes = files.filter((file) => selectedSourceDoc && file.source_codes.includes(selectedSourceDoc.code))
  const lintIssues = useMemo(() => buildLintIssues(files), [files])
  const selectedRules = selectedFile ? NOTE_TYPE_RULES[selectedFile.type] : null
  const selectedMissingSections = selectedFile ? getMissingSections(selectedFile) : []

  const graphNodes = useMemo<GraphNodeLayout[]>(() => {
    if (!selectedFile) return []

    const nodes: GraphNodeLayout[] = [{ id: selectedFile.id, x: 210, y: 125 }]
    const count = Math.max(linkedFiles.length, 1)

    linkedFiles.forEach((file, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2
      nodes.push({
        id: file.id,
        x: 210 + Math.cos(angle) * 122,
        y: 125 + Math.sin(angle) * 84,
      })
    })

    return nodes
  }, [linkedFiles, selectedFile])

  const createNewFile = () => {
    const nextId = `kf-draft-${nextIdRef.current}`
    nextIdRef.current += 1
    const nextFile: KnowledgeFile = {
      id: nextId,
      title: 'Untitled knowledge note',
      folder: 'Workspace/Drafts',
      type: 'Reference',
      updated_at: 'Just now',
      summary: 'New workspace note for connecting guidance, policy, and workflow context.',
      tags: ['draft'],
      linked_file_ids: selectedFile ? [selectedFile.id] : [],
      source_codes: [],
      body: '# Untitled knowledge note\n\nStart building a connected note here.',
    }

    setFiles((current) => [nextFile, ...current])
    setSelectedFileId(nextId)
  }

  const createFromTemplate = (templateId: string) => {
    const template = NOTE_TEMPLATES.find((item) => item.id === templateId)
    if (!template) return

    const nextId = `kf-draft-${nextIdRef.current}`
    nextIdRef.current += 1
    const nextFile: KnowledgeFile = {
      id: nextId,
      title: template.title,
      folder: template.folder,
      type: template.type,
      updated_at: 'Just now',
      summary: template.summary,
      tags: ['draft', template.label.toLowerCase().replace(' ', '-')],
      linked_file_ids: selectedFile ? [selectedFile.id] : [],
      source_codes: selectedFile?.source_codes.slice(0, 2) ?? [],
      body: template.body,
    }

    setFiles((current) => [nextFile, ...current])
    setSelectedFileId(nextId)
  }

  const updateSelectedFile = (patch: Partial<KnowledgeFile>) => {
    if (!selectedFile || selectedFile.read_only) return
    setFiles((current) =>
      current.map((file) =>
        file.id === selectedFile.id
          ? {
              ...file,
              ...patch,
              updated_at: 'Just now',
            }
          : file
      )
    )
  }

  const appendMissingSections = () => {
    if (!selectedFile || !selectedMissingSections.length) return
    const nextSections = selectedMissingSections.map((section) => `\n\n## ${section}\n`).join('')
    updateSelectedFile({ body: `${selectedFile.body.trimEnd()}${nextSections}` })
  }

  const helperPreview = selectedFile
    ? `Use this note to answer: ${selectedFile.summary.slice(0, 110)}${selectedFile.summary.length > 110 ? '…' : ''}`
    : ''

  return (
    <div className="relative flex h-[78vh] min-h-[620px] w-full max-w-[1360px] overflow-hidden rounded-[22px] border border-[#C9D3E6] bg-[#F6F8FC] shadow-[0_20px_60px_rgba(18,28,45,0.16)]">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[#DDE1E7] bg-white text-[14px] font-semibold text-[#5A6A7E] shadow-sm transition-colors hover:border-[#B8C5DE] hover:text-[#1A2535]"
        aria-label="Close workspace"
      >
        ×
      </button>
      <aside className="w-[236px] shrink-0 border-r border-[#E2E8F2] bg-white">
        <div className="border-b border-[#E8EDF6] px-4 py-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#7387B3]">Workflow workspace</div>
          <div className="mt-1 text-[0.8rem] font-semibold text-[#1A2535]">Knowledge files</div>
        </div>
        <div className="border-b border-[#E8EDF6] px-4 py-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search notes, folders, codes"
            className="w-full rounded-[10px] border border-[#D7DEEA] bg-[#FCFDFE] px-3 py-2 text-[11.5px] text-[#1A2535] outline-none transition-colors focus:border-[#8DA5DB]"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={createNewFile}
              className="rounded-full border border-[#D7E2FF] bg-[#EEF3FF] px-3 py-1.5 text-[11px] font-semibold text-[#3652A5]"
            >
              New note
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {NOTE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => createFromTemplate(template.id)}
                className="rounded-full border border-[#E0E7F4] bg-white px-2.5 py-1 text-[10px] font-medium text-[#5F6F88]"
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto px-3 py-3">
          <div className="space-y-2">
            {filteredFiles.map((file) => {
              const active = file.id === selectedFile?.id

              return (
                <button
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  className={`w-full rounded-[12px] border px-3 py-2.5 text-left transition-colors ${
                    active ? 'border-[#C7D6FB] bg-[#F4F7FF]' : 'border-[#E6EBF3] bg-white hover:border-[#CBD7EE]'
                  }`}
                >
                  <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7A8FBF]">{file.folder}</div>
                  <div className="mt-1 text-[0.76rem] font-semibold text-[#1A2535]">{file.title}</div>
                  <div className="mt-1 line-clamp-2 text-[0.66rem] leading-4 text-[#66768B]">{file.summary}</div>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 overflow-y-auto border-r border-[#E2E8F2] bg-[#FCFDFF]">
          {selectedFile ? (
            <div className="mx-auto max-w-[760px] px-5 py-5">
              <div className="mb-3 flex items-start justify-between gap-5">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#7387B3]">
                    {selectedFile.folder}
                  </div>
                  <input
                    readOnly={selectedFile.read_only}
                    aria-label="Knowledge file title"
                    value={selectedFile.title}
                    onChange={(event) => updateSelectedFile({ title: event.target.value })}
                    className="mt-1 w-full border-none bg-transparent p-0 text-[1.1rem] font-semibold tracking-[-0.03em] text-[#162033] outline-none"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFile.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-[#DCE5F6] bg-white px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-[#6377A8]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#E5EAF3] bg-white px-3.5 py-3 shadow-sm">
                  <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#8A9BB0]">Workspace state</div>
                  <div className="mt-1 text-[0.76rem] font-semibold text-[#1A2535]">{selectedFile.type}</div>
                  <div className="mt-1 text-[0.68rem] text-[#66768B]">
                    Updated {selectedFile.updated_at} · {selectedRules?.productTargets.join(', ')}
                  </div>
                </div>
              </div>

              <div className="mb-3 rounded-[18px] border border-[#E0E7F4] bg-white px-4 py-3 shadow-sm">
                <textarea
                  readOnly={selectedFile.read_only}
                  aria-label="Knowledge file summary"
                  value={selectedFile.summary}
                  onChange={(event) => updateSelectedFile({ summary: event.target.value })}
                  rows={2}
                  className="w-full resize-none border-none bg-transparent p-0 text-[0.74rem] leading-5 text-[#46556E] outline-none"
                />
                {selectedFile.source_codes.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFile.source_codes.map((code) => (
                      <button
                        key={code}
                        onClick={() => setSelectedSourceCode(code)}
                        className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${
                          selectedSourceDoc?.code === code
                            ? 'border-[#C7D6FB] bg-[#EEF3FF] text-[#3652A5]'
                            : 'border-[#D7E2FF] bg-[#F6F9FF] text-[#3652A5]'
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-[22px] border border-[#DCE4F3] bg-white shadow-sm">
                {selectedFile.read_only ? <div className="p-5"><p className="mb-5 text-xs text-slate-500">Source-linked reference · changes are maintained in the owning content library.</p><DocumentBody body={selectedFile.body} /></div> : <textarea
                  value={selectedFile.body}
                  onChange={(event) => updateSelectedFile({ body: event.target.value })}
                  className="min-h-[520px] w-full resize-none border-none bg-transparent px-4 py-4 font-mono text-[11.5px] leading-6 text-[#24344E] outline-none"
                />}
              </div>

              {selectedRules ? (
                <div className="mt-3 flex items-center justify-between rounded-[14px] border border-[#E2E8F2] bg-[#FBFCFF] px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7387B3]">Schema</div>
                    <div className="mt-1 text-[0.68rem] text-[#607086]">
                      Required sections: {selectedRules.requiredSections.length ? selectedRules.requiredSections.join(', ') : 'None'}
                    </div>
                  </div>
                  {selectedMissingSections.length ? (
                    <button
                      onClick={appendMissingSections}
                      className="rounded-full border border-[#D7E2FF] bg-[#EEF3FF] px-3 py-1.5 text-[10px] font-semibold text-[#3652A5]"
                    >
                      Insert missing
                    </button>
                  ) : (
                    <div className="rounded-full border border-[#D9ECDD] bg-[#F4FBF6] px-3 py-1.5 text-[10px] font-semibold text-[#2E7A55]">
                      Structure checked
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </main>

        <aside className="overflow-y-auto bg-[#F8FAFD] px-4 py-4">
          <div className="rounded-[16px] border border-[#DCE4F3] bg-white px-3.5 py-3 shadow-sm">
            <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7387B3]">Graph</div>
            <div className="mt-2 overflow-hidden rounded-[14px] border border-[#E5EAF3] bg-[#FBFCFF]">
              <svg viewBox="0 0 420 250" className="h-[220px] w-full">
                {selectedFile && graphNodes[0] && graphNodes.slice(1).map((node) => {
                  const center = graphNodes[0]!
                  return (
                    <line
                      key={`${center.id}-${node.id}`}
                      x1={center.x}
                      y1={center.y}
                      x2={node.x}
                      y2={node.y}
                      stroke="#C8D6F0"
                      strokeWidth="1.5"
                    />
                  )
                })}
                {graphNodes.map((node) => {
                  const file = files.find((item) => item.id === node.id)
                  const active = node.id === selectedFile?.id
                  return (
                    <g key={node.id} onClick={() => setSelectedFileId(node.id)} className="cursor-pointer">
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={active ? 28 : 21}
                        fill={active ? '#3652A5' : '#EEF3FF'}
                        stroke={active ? '#3652A5' : '#D7E2FF'}
                      />
                      <text
                        x={node.x}
                        y={node.y + 3}
                        textAnchor="middle"
                        fontSize={active ? '9' : '8'}
                        fill={active ? 'white' : '#3652A5'}
                        className="font-semibold"
                      >
                        {(file?.title ?? '').slice(0, active ? 12 : 10)}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>

          <div className="mt-3 rounded-[16px] border border-[#DCE4F3] bg-white px-3.5 py-3 shadow-sm">
            <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7387B3]">Backlinks</div>
            <div className="mt-3 space-y-2">
              {backlinks.length ? (
                backlinks.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => setSelectedFileId(file.id)}
                    className="w-full rounded-[12px] border border-[#E5EAF3] bg-[#FBFCFF] px-3 py-2 text-left"
                  >
                    <div className="text-[0.74rem] font-semibold text-[#1A2535]">{file.title}</div>
                    <div className="mt-1 text-[0.65rem] leading-4 text-[#66768B]">{file.folder}</div>
                  </button>
                ))
              ) : (
                <div className="rounded-[12px] border border-dashed border-[#E5EAF3] bg-[#FBFCFF] px-3 py-2 text-[0.65rem] text-[#66768B]">
                  No backlinks yet.
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-[16px] border border-[#DCE4F3] bg-white px-3.5 py-3 shadow-sm">
            <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7387B3]">Source preview</div>
            {selectedSourceDoc ? (
              <div className="mt-3 rounded-[12px] border border-[#E5EAF3] bg-[#FBFCFF] px-3 py-2.5">
                <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#7A8FBF]">{selectedSourceDoc.code}</div>
                <div className="mt-1 text-[0.74rem] font-semibold text-[#1A2535]">{selectedSourceDoc.title}</div>
                <div className="mt-1 text-[0.68rem] text-[#66768B]">
                  {selectedSourceDoc.type} · {selectedSourceDoc.dept} · v{selectedSourceDoc.version}
                </div>
                <div className="mt-2 text-[0.66rem] leading-5 text-[#5E6E84]">
                  Owner {selectedSourceDoc.owner}. Review due {selectedSourceDoc.review_due}.
                </div>
                <div className="mt-3 border-t border-[#E8EDF6] pt-2">
                  <div className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#8A9BB0]">Impact</div>
                  <div className="mt-1 text-[0.65rem] leading-4 text-[#5E6E84]">
                    Referenced by {sourceImpactNotes.length} workspace note{sourceImpactNotes.length === 1 ? '' : 's'}.
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-[12px] border border-dashed border-[#E5EAF3] bg-[#FBFCFF] px-3 py-2 text-[0.65rem] text-[#66768B]">
                Select a source badge to preview the linked document.
              </div>
            )}
          </div>

          <div className="mt-3 rounded-[16px] border border-[#DCE4F3] bg-white px-3.5 py-3 shadow-sm">
            <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7387B3]">Helper preview</div>
            <div className="mt-3 rounded-[12px] border border-[#E5EAF3] bg-[#FBFCFF] px-3 py-2.5 text-[0.66rem] leading-5 text-[#5E6E84]">
              {helperPreview}
            </div>
          </div>

          <div className="mt-3 rounded-[16px] border border-[#DCE4F3] bg-white px-3.5 py-3 shadow-sm">
            <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7387B3]">Knowledge lint</div>
            <div className="mt-3 space-y-2">
              {lintIssues.slice(0, 4).map((issue) => (
                <button
                  key={issue.id}
                  onClick={() => setSelectedFileId(issue.fileId)}
                  className={`w-full rounded-[12px] border px-3 py-2 text-left ${
                    issue.tone === 'warning'
                      ? 'border-[#F0D8BE] bg-[#FFF8F1]'
                      : 'border-[#E5EAF3] bg-[#FBFCFF]'
                  }`}
                >
                  <div className="text-[0.68rem] font-semibold text-[#1A2535]">{issue.title}</div>
                  <div className="mt-1 text-[0.64rem] leading-4 text-[#66768B]">{issue.detail}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
