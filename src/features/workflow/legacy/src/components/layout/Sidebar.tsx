// → src/components/layout/Sidebar.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Workflow, PanelLeftClose } from 'lucide-react'
import { SIDEBAR_COL } from '@/lib/tokens'
import type { NavPage } from '@/lib/types'
import { workflowHref } from '@/lib/workflow-navigation'

const TOP_ITEMS = [
    { id: 'dashboard' as const, label: 'Workspace' },
    { id: 'processes' as const, label: 'Workflows' },
    { id: 'drafts' as const, label: 'Documents' },
]
const NAV_SECTIONS = [
    { id: 'understand', label: 'Reference', items: [
        { id: 'role_library' as const, label: 'Roles' },
        { id: 'knowledge' as const, label: 'Sources & connections' },
    ] },
    { id: 'reference', label: 'Learning', items: [
        { id: 'training' as const, label: 'Read & practice' },
    ] },

]

interface SidebarProps {
    active: NavPage
    onNav: (page: NavPage) => void
    collapsed: boolean
    compactViewport?: boolean
    onToggle: () => void
    linkedNavigation?: boolean
    sharedSession?: boolean
}

function BrandLockup() {
    return (
        <div className="workflow-brand-lockup flex min-w-0 items-center gap-2.5">
            <img src="/brand/alamo-head-tree-mark.png" alt="" width={38} height={38} className="h-[38px] w-[38px] flex-none object-contain" />
            <span className="sidebar-brand-name workflow-wordmark" aria-label="ProForma">
                ProForma
            </span>
        </div>
    )
}

export default function Sidebar({ active, onNav, collapsed, compactViewport = false, onToggle, linkedNavigation = false, sharedSession = false }: SidebarProps) {
    const panel = useRef<HTMLElement>(null)
    useEffect(() => {
        if (!compactViewport || collapsed) return
        const previous = document.activeElement as HTMLElement | null
        const overflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onToggle(); return }
            if (event.key !== 'Tab') return
            const controls = [...(panel.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),[tabindex="0"]') ?? [])].filter(element => element.getClientRects().length)
            const first = controls[0], last = controls.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
        document.addEventListener('keydown', keydown)
        return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
    }, [compactViewport, collapsed, onToggle])
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({ understand: true, reference: true, previews: active === 'assist' || active === 'organization' })
    const toggleSection = (id: string) => setOpenSections(s => ({ ...s, [id]: !s[id] }))

    const iconFor = (id: NavPage) => {
        const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none' }
        switch (id) {
            case 'processes':
                return <Workflow size={18} aria-hidden="true" />
            case 'dashboard':
                return <svg {...common}><path d="M2.5 2.5H7V7H2.5zM9 2.5h4.5V7H9zM2.5 9H7v4.5H2.5zM9 9h4.5v4.5H9z" stroke="currentColor" strokeWidth="1.3" /></svg>
            case 'assist':
                return <svg {...common}><path d="M3.2 8A4.8 4.8 0 0 1 8 3.2h1.6A3.2 3.2 0 1 1 9.6 9.6H8A4.8 4.8 0 0 1 3.2 8Z" stroke="currentColor" strokeWidth="1.3" /><path d="M6.2 12.8h3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            case 'demo':
                return <svg {...common}><path d="M4 3.2h8v9.6H4z" stroke="currentColor" strokeWidth="1.3" /><path d="M6 6.2h4M6 8.7h4M6 11.2h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            case 'procedures':
                return <svg {...common}><path d="M4 3h8M4 6.5h8M4 10h8M4 13h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            case 'walkthrough':
                return <svg {...common}><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            case 'policies':
                return <svg {...common}><path d="M4 2.8h6l2 2v8.4H4z" stroke="currentColor" strokeWidth="1.3" /><path d="M10 2.8v2h2" stroke="currentColor" strokeWidth="1.3" /></svg>
            case 'forms':
                return <svg {...common}><path d="M4 3h8v10H4z" stroke="currentColor" strokeWidth="1.3" /><path d="M6 6.2h4M6 8.6h4M6 11h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            case 'training':
                return <svg {...common}><path d="M3 4.5 8 2l5 2.5v7L8 14l-5-2.5z" stroke="currentColor" strokeWidth="1.3" /><path d="M8 6.2v3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            case 'role_library':
                return <svg {...common}><circle cx="5" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" /><circle cx="11" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" /><path d="M1.8 12.5c.2-2 1.3-3 3.2-3s3 1 3.2 3M8 12.5c.2-2 1.3-3 3.2-3s3 1 3.2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            case 'organization':
            case 'knowledge':
                return <svg {...common}><circle cx="8" cy="3" r="1.6" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.8v3M3 10V8h10v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="3" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.3" /><circle cx="13" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.3" /></svg>
            case 'drafts':
            case 'documents':
                return <svg {...common}><path d="M4 2.8h6l2 2v8.4H4z" stroke="currentColor" strokeWidth="1.3" /><path d="M6 8h4M6 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            case 'settings':
                return <svg {...common}><path d="M8 3.2v2M8 10.8v2M12.8 8h-2M5.2 8h-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" /></svg>
            default:
                return <div className="w-4 h-4 rounded-full border border-current" />
        }
    }

    const NavItem = ({ item, prominent = false }: { item: { id: NavPage; label: string }; prominent?: boolean }) => {
        const on = active === item.id
        const Item = linkedNavigation ? 'a' : 'button'
        return (
            <Item
                href={linkedNavigation && item.id !== 'home' && item.id !== 'incident_center' && item.id !== 'eldermark_agent' ? workflowHref(item.id) : undefined}
                onClick={linkedNavigation ? undefined : () => onNav(item.id)}
                aria-label={item.label}
                aria-current={on ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                data-active={on}
                data-destination={item.id}
                className={`
          sidebar-nav-item flex items-center w-full text-left transition-colors duration-150 border cursor-pointer
          ${collapsed ? 'justify-center py-2.5 px-0 mx-2' : 'px-3 py-2.5 mx-0 gap-3'}
          ${on ? 'font-semibold' : 'bg-transparent border-transparent'}
        `}
            >
                {collapsed ? (
                    <span>{iconFor(item.id)}</span>
                ) : (
                    <>
                        <span className="flex items-center justify-center w-6 h-6">
                            {iconFor(item.id)}
                        </span>
                        <span className={`sidebar-nav-label font-sans leading-none ${prominent ? 'text-[13.5px] font-semibold' : 'text-[13px]'}`}>
                            {item.label}
                        </span>
                    </>
                )}
            </Item>
        )
    }

    return (
        <aside
            ref={panel}
            id="workflow-navigation-panel"
            role={compactViewport ? 'dialog' : undefined}
            aria-label={compactViewport ? 'Navigation' : undefined}
            aria-modal={compactViewport && !collapsed ? true : undefined}
            data-compact={compactViewport}
            data-collapsed={collapsed}
            className="workflow-sidebar fixed left-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden transition-[width] duration-200"
            style={{ width: collapsed ? SIDEBAR_COL : compactViewport ? 248 : 104, background: '#f8faf9', borderRight: '1px solid #d9e0e3' }}
        >
            {/* Logo */}
            <div className={`sidebar-brand h-[64px] flex items-center flex-shrink-0 border-b ${collapsed ? 'justify-center' : 'px-4 justify-between'}`}>
                {!collapsed && (
                    <BrandLockup />
                )}
                {collapsed && (
                    <button
                        onClick={onToggle}
                        aria-label="Expand sidebar"
                        className="w-10 h-10 rounded-md bg-white border border-[#d9e0e3] text-[#52616b] hover:text-[#087b60] transition-colors cursor-pointer flex items-center justify-center"
                    >
                        <img src="/brand/alamo-head-tree-mark.png" alt="ProForma" width={29} height={29} className="h-[29px] w-[29px] object-contain" />
                    </button>
                )}
                {!collapsed && (
                    <button
                        onClick={onToggle}
                        aria-label={compactViewport ? 'Close navigation' : 'Collapse sidebar'}
                        className="flex-none text-[#52616b] hover:text-[#087b60] transition-colors bg-white border border-[#d9e0e3] rounded-md cursor-pointer p-2"
                    >
                        <PanelLeftClose size={17} aria-hidden="true" />
                    </button>
                )}
                {collapsed && (
                    <></>
                )}
            </div>

            {/* Nav */}
            <nav aria-label="ProForma navigation" className={`flex-1 overflow-y-auto overflow-x-hidden pt-3 pb-3 ${collapsed ? '' : 'px-3'}`}>

                <div className={`mb-3 flex flex-col gap-0.5 ${collapsed ? '' : ''}`}>
                    {TOP_ITEMS.map(item => <NavItem key={item.id} item={item} prominent />)}
                </div>

                <div className="sidebar-divider h-px mb-4" style={{ margin: collapsed ? '0 10px 16px' : '0 8px 16px' }} />

                {NAV_SECTIONS.map(section => {
                    const open = !compactViewport || openSections[section.id]
                    return (
                        <div key={section.id} className="mb-4">
                            {!collapsed && (
                                <button
                                    aria-expanded={open}
                                    onClick={() => toggleSection(section.id)}
                                    className="sidebar-section-toggle flex items-center justify-between w-full px-3 pb-1.5 bg-transparent border-none cursor-pointer"
                                >
                                    <span className="sidebar-section-label font-sans text-[10px] font-bold tracking-[0.12em] uppercase">
                                        {section.label}
                                    </span>
                                    <span className="text-[#71817d] text-[9px]">{open ? '▴' : '▾'}</span>
                                </button>
                            )}
                            {collapsed && <div className="sidebar-divider h-px mx-3 mb-2" />}
                            <div className="flex flex-col gap-0.5">
                                {(open || collapsed) && section.items.map(item => <NavItem key={item.id} item={item} />)}
                            </div>
                        </div>
                    )
                })}
            </nav>

            <div className="sidebar-footer px-4 py-4 border-t">
                <span className="sidebar-session" title={sharedSession ? 'Owner-only pilot' : 'Local authoring preview'}>{collapsed ? <span aria-label={sharedSession ? 'Owner-only pilot' : 'Local preview'}>●</span> : sharedSession ? 'Owner-only pilot' : 'Local preview'}</span>
            </div>
        </aside>
    )
}
