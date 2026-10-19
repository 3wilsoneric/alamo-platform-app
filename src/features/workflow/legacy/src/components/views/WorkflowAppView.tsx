'use client'

import { useEffect, useState } from 'react'
import { SIDEBAR_COL, SIDEBAR_W } from '@/lib/tokens'
import type { NavPage, Procedure, WalkthroughLaunchContext } from '@/lib/types'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import DashboardView from '@/components/views/DashboardView'
import DemoView from '@/components/views/DemoView'
import ClinicalAssist from '@/components/assist/ClinicalAssist'
import ProceduresView from '@/components/views/ProceduresView'
import WalkthroughView from '@/components/views/WalkthroughView'
import TrainingPage from '@/app/training/page'
import DocumentsPage from '@/app/documents/page'
import PoliciesPage from '@/app/policies/page'
import RoleSkillLibraryView from '@/components/views/RoleSkillLibraryView'
import OrganizationView from '@/components/views/OrganizationView'
import DraftsWorkspace from '@/components/documents/DraftsWorkspace'
import KnowledgeView from '@/components/knowledge/KnowledgeView'
import './workflow-theme.css'

const PAGE_META: Record<Exclude<NavPage, 'home' | 'incident_center' | 'eldermark_agent'>, { title: string; sub?: string }> = {
  dashboard: { title: 'Dashboard' },
  demo: { title: 'Demo' },
  assist: { title: 'Workspace' },
  procedures: { title: 'Procedures' },
  walkthrough: { title: 'Walkthrough' },
  policies: { title: 'Policies' },
  forms: { title: 'Forms' },
  training: { title: 'Training' },
  role_library: { title: 'Roles & skills' },
  organization: { title: 'Organization' },
  documents: { title: 'Documents' },
  drafts: { title: 'Drafts & review' },
  knowledge: { title: 'Knowledge' },
  settings: { title: 'Settings' },
}

const Placeholder = ({ title, note }: { title: string; note: string }) => (
  <div className="min-h-full bg-cream px-12 py-20">
    <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink3">Not yet built</div>
    <h1 className="mb-3.5 font-serif text-[2.25rem] font-bold text-ink">{title}</h1>
    <p className="max-w-[420px] font-serif text-[1.05rem] leading-[1.7] text-ink3">{note}</p>
  </div>
)

interface WorkflowAppViewProps {
  initialPage?: Exclude<NavPage, 'home' | 'incident_center' | 'eldermark_agent'>
}

export default function WorkflowAppView({
  initialPage = 'dashboard',
}: WorkflowAppViewProps) {
  const [page, setPage] = useState<Exclude<NavPage, 'home' | 'incident_center' | 'eldermark_agent'>>(initialPage)
  const [walkthroughProcId, setWalkthroughProcId] = useState<number | null>(null)
  const [walkthroughContext, setWalkthroughContext] = useState<WalkthroughLaunchContext | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [compactViewport, setCompactViewport] = useState(false)
  const [unsavedDraft, setUnsavedDraft] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)')
    const syncSidebar = () => {
      setCompactViewport(media.matches)
      setSidebarCollapsed(media.matches)
    }
    syncSidebar()
    media.addEventListener('change', syncSidebar)
    return () => media.removeEventListener('change', syncSidebar)
  }, [])

  const meta = PAGE_META[page]
  const marginLeft = compactViewport || sidebarCollapsed ? SIDEBAR_COL : SIDEBAR_W

  const startWalkthrough = (proc: Procedure, context: WalkthroughLaunchContext = { source: 'procedures' }) => {
    setWalkthroughProcId(proc.id)
    setWalkthroughContext(context)
    setPage('walkthrough')
  }

  const handleWorkflowNav = (nextPage: NavPage) => {
    if (nextPage === 'home' || nextPage === 'incident_center' || nextPage === 'eldermark_agent') return
    if (nextPage === page) return
    if (unsavedDraft && !window.confirm('You have unsaved changes or a request in progress. Leave the editor?')) return
    setUnsavedDraft(false)
    setPage(nextPage)
    if (compactViewport) setSidebarCollapsed(true)
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <DashboardView onNav={handleWorkflowNav} />
      case 'demo':
        return <DemoView onExit={(nextPage) => handleWorkflowNav(nextPage === 'home' ? 'dashboard' : nextPage)} />
      case 'assist':
        return <ClinicalAssist onStartWalkthrough={startWalkthrough} onExit={() => setPage('dashboard')} />
      case 'procedures':
        return <ProceduresView onStartWalkthrough={startWalkthrough} />
      case 'walkthrough':
        return <WalkthroughView startProcId={walkthroughProcId} startContext={walkthroughContext} />
      case 'training':
        return <TrainingPage />
      case 'role_library':
        return <RoleSkillLibraryView />
      case 'organization':
        return <OrganizationView />
      case 'documents':
        return <DocumentsPage />
      case 'drafts':
        return <DraftsWorkspace onUnsavedChange={setUnsavedDraft} />
      case 'knowledge':
        return <KnowledgeView />
      case 'policies':
        return <PoliciesPage />
      case 'forms':
        return <Placeholder title="Forms Library" note="Access and submit required clinical and administrative forms." />
      case 'settings':
        return <Placeholder title="Settings" note="Manage preferences, user roles, and system configuration." />
      default:
        return null
    }
  }

  return (
    <div className="workflow-app flex">
      <Sidebar
        active={page}
        onNav={handleWorkflowNav}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
      />
      <div
        className="flex min-h-screen min-w-0 flex-1 flex-col transition-[margin-left] duration-200"
        style={{ marginLeft }}
      >
        <Header title={meta.title} sub={meta.sub} sharedContent={page === 'drafts' || page === 'knowledge'} onOpenWorkspace={['dashboard', 'assist', 'drafts', 'knowledge'].includes(page) ? undefined : () => handleWorkflowNav('assist')} />
        <main className={`workflow-surface workflow-surface--${page} min-w-0 flex-1 overflow-hidden`}>{renderPage()}</main>
      </div>
    </div>
  )
}
