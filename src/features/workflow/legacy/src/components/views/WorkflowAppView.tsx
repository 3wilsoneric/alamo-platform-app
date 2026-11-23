'use client'

import { useCallback, useEffect, useState } from 'react'
import { SIDEBAR_COL } from '@/lib/tokens'
import type { NavPage, Procedure, WalkthroughLaunchContext } from '@/lib/types'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import WorkflowHomeView from '@/components/views/WorkflowHomeView'
import { WORKFLOW_TITLES, workflowHref, workflowParams, replaceWorkflowParams } from '@/lib/workflow-navigation'
import DemoView from '@/components/views/DemoView'
import ClinicalAssist from '@/components/assist/ClinicalAssist'
import ProceduresView from '@/components/views/ProceduresView'
import WalkthroughView from '@/components/views/WalkthroughView'
import LearningWorkspace from '@/components/learning/LearningWorkspace'
import TrainingPage from '@/app/training/page'
import DocumentsPage from '@/app/documents/page'
import PoliciesPage from '@/app/policies/page'
import RoleSkillLibraryView from '@/components/views/RoleSkillLibraryView'
import OrganizationView from '@/components/views/OrganizationView'
import DraftsWorkspace from '@/components/documents/DraftsWorkspace'
import ProcessWorkspace from '@/components/processes/ProcessWorkspace'
import KnowledgeView from '@/components/knowledge/KnowledgeView'
import './workflow-theme.css'
import './commonplace-materials.css'
import './workflow-workspace.css'
import './proforma-design.css'

const Placeholder = () => (
  <div className="p-8"><p>Not yet available.</p></div>
)

interface WorkflowAppViewProps {
  initialPage?: Exclude<NavPage, 'home' | 'incident_center' | 'eldermark_agent'>
}

export default function WorkflowAppView({
  initialPage = 'dashboard',
}: WorkflowAppViewProps) {
  const [page, setPage] = useState<Exclude<NavPage, 'home' | 'incident_center' | 'eldermark_agent'>>(initialPage)
  const [walkthroughProcId, setWalkthroughProcId] = useState<number | null>(() => Number(workflowParams().get('procedure')) || null)
  const [walkthroughContext, setWalkthroughContext] = useState<WalkthroughLaunchContext | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [compactViewport, setCompactViewport] = useState(false)
  const toggleSidebar = useCallback(() => setSidebarCollapsed(current => !current), [])
  const navigationOpen = compactViewport && !sidebarCollapsed

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

  const title = WORKFLOW_TITLES[page]
  const notice = page === 'policies' ? 'Policy reference preview · Sample policy statuses are not approvals. Verify the authoritative policy before use.'
    : page === 'assist' ? 'Guidance demo · Scenario matching uses sample content. No live care records or actions are connected.'
    : page === 'procedures' || page === 'walkthrough' ? 'Reference procedures · Includes authored assessor drafts and sample guides. Check the source and review status before use.' : null
  const marginLeft = compactViewport ? 0 : sidebarCollapsed ? SIDEBAR_COL : 104

  const startWalkthrough = (proc: Procedure, context: WalkthroughLaunchContext = { source: 'procedures' }) => {
    setWalkthroughProcId(proc.id)
    setWalkthroughContext(context)
    replaceWorkflowParams({ view: 'walkthrough', procedure: String(proc.id) })
    setPage('walkthrough')
  }

  const handleWorkflowNav = (nextPage: NavPage) => {
    if (nextPage === 'home' || nextPage === 'incident_center' || nextPage === 'eldermark_agent') return
    if (nextPage === page) return
    window.location.assign(workflowHref(nextPage))
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <WorkflowHomeView />
      case 'demo':
        return <DemoView onExit={(nextPage) => handleWorkflowNav(nextPage === 'home' ? 'dashboard' : nextPage)} />
      case 'assist':
        return <ClinicalAssist onStartWalkthrough={startWalkthrough} onExit={() => handleWorkflowNav('dashboard')} />
      case 'procedures':
        return <ProceduresView onStartWalkthrough={startWalkthrough} />
      case 'walkthrough':
        return <WalkthroughView startProcId={walkthroughProcId} startContext={walkthroughContext} />
      case 'training':
        return workflowParams().get('sample') === 'lessons' ? <div><div className="p-5 text-[13px]"><a className="underline" href={workflowHref('training')}>← Guidance & practice</a><p className="mt-2">Sample lessons · Progress here is a demonstration.</p></div><TrainingPage /></div> : <LearningWorkspace />
      case 'role_library':
        return <RoleSkillLibraryView />
      case 'organization':
        return <OrganizationView />
      case 'documents':
        return <DocumentsPage />
      case 'drafts':
        return <DraftsWorkspace />
      case 'processes': return <ProcessWorkspace />
      case 'knowledge':
        return <KnowledgeView />
      case 'policies':
        return <PoliciesPage />
      case 'forms':
        return <Placeholder />
      case 'settings':
        return <Placeholder />
      default:
        return null
    }
  }

  return (
    <div className="workflow-app flex" data-page={page}>
      <Sidebar
        sharedSession
        linkedNavigation
        active={page}
        onNav={handleWorkflowNav}
        collapsed={sidebarCollapsed}
        compactViewport={compactViewport}
        onToggle={toggleSidebar}
      />
      {navigationOpen && <button type="button" className="workflow-nav-backdrop" tabIndex={-1} aria-label="Dismiss navigation" onClick={toggleSidebar} />}
      <div
        inert={navigationOpen}
        className="workflow-content flex min-h-screen min-w-0 flex-1 flex-col transition-[margin-left] duration-200"
        style={{ marginLeft }}
      >
        <Header title={title} sharedContent onOpenNavigation={() => setSidebarCollapsed(false)} navigationExpanded={navigationOpen} />
        <main className={`workflow-surface workflow-surface--${page} min-w-0 flex-1 overflow-hidden`}>{notice && <p className="workflow-surface-notice">{notice}</p>}{renderPage()}</main>
      </div>
    </div>
  )
}
