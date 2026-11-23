// → src/components/layout/Header.tsx
'use client'

import { openAlly } from '../../../../../agent/allyLauncher'
import AllyMark from '../../../../../agent/components/AllyMark'

interface HeaderProps {
    title: string
    sharedContent?: boolean
    sub?: string | undefined
    onOpenWorkspace?: (() => void) | undefined
    onOpenNavigation?: (() => void) | undefined
    navigationExpanded?: boolean
}

export default function Header({ title, sub, onOpenWorkspace, onOpenNavigation, navigationExpanded }: HeaderProps) {
    return (
        <header className="workflow-header h-[64px] border-b flex items-center px-7 gap-5 sticky top-0 z-40">
            {onOpenNavigation && <button type="button" className="workflow-nav-toggle" aria-label="Open navigation" aria-controls="workflow-navigation-panel" aria-expanded={navigationExpanded} onClick={onOpenNavigation}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>}
            <div className="flex-1 min-w-0">
                <div className="workflow-header-location flex items-center gap-2.5">
                    <a className="pf-header-brand" href="/workflow" aria-label="ProForma workspace">ProForma</a>
                    <span className="inline-flex items-center font-sans text-[13px] text-ink font-semibold tracking-[-0.01em]">
                        {title}
                    </span>
                    {sub && <span className="font-mono text-[9px] text-ink3 tracking-[0.1em] uppercase">{sub}</span>}
                </div>
            </div>
            <button type="button" className="platform-ally-header-button" aria-label="Open Ally chat" aria-haspopup="dialog" onClick={openAlly}><AllyMark /><span>Ally</span></button>
            {onOpenWorkspace && <button
                onClick={onOpenWorkspace}
                className="workflow-header-action rounded-md px-4 py-2.5 bg-[#087b60] text-white font-sans text-[12px] font-semibold tracking-[-0.01em] border-none cursor-pointer hover:bg-[#086a54] transition-colors"
            >
                Open workspace
            </button>}

        </header>
    )
}
