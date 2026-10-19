// → src/components/layout/Header.tsx
'use client'

interface HeaderProps {
    title: string
    sub?: string | undefined
    onOpenWorkspace?: (() => void) | undefined
    sharedContent?: boolean
}

function AnimalAvatar({ size = 40 }: { size?: number }) {
    return (
        <div
            className="overflow-hidden rounded-full border border-[#d4ddda]"
            style={{
                width: size,
                height: size,
                background: '#eef3f0',
            }}
        >
            <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
                <circle cx="20" cy="15.5" r="6.25" fill="#8ca59a" />
                <path
                    d="M10.5 31.2C11.8 25.9 15.6 23.1 20 23.1C24.4 23.1 28.2 25.9 29.5 31.2"
                    fill="#8ca59a"
                />
                <path
                    d="M10.5 31.2C11.8 25.9 15.6 23.1 20 23.1C24.4 23.1 28.2 25.9 29.5 31.2"
                    stroke="#638777"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                />
            </svg>
        </div>
    )
}

export default function Header({ title, sub, onOpenWorkspace, sharedContent = false }: HeaderProps) {
    return (
        <header className="workflow-header h-[64px] border-b flex items-center px-7 gap-5 sticky top-0 z-40">
            <div className="flex-1 min-w-0">
                <div className="workflow-header-location flex items-center gap-2.5">
                    <span className="workflow-header-product">Workflow</span>
                    <span className="workflow-header-separator" aria-hidden="true">/</span>
                    <span className="inline-flex items-center font-sans text-[13px] text-ink font-semibold tracking-[-0.01em]">
                        {title}
                    </span>
                    {sub && <span className="font-mono text-[9px] text-ink3 tracking-[0.1em] uppercase">{sub}</span>}
                    <span className="ml-2 rounded border border-[#d6dfdc] bg-[#f2f6f4] px-2 py-1 font-sans text-[10px] font-semibold text-[#50665e]" title={sharedContent ? 'Owner-only Workflow authoring and knowledge.' : 'Sample procedures and activity. No EHR writes or saved records.'}>{sharedContent ? 'Owner pilot' : 'Preview data'}</span>
                </div>
            </div>
            {onOpenWorkspace && <button
                onClick={onOpenWorkspace}
                className="workflow-header-action rounded-md px-4 py-2.5 bg-[#087b60] text-white font-sans text-[12px] font-semibold tracking-[-0.01em] border-none cursor-pointer hover:bg-[#086a54] transition-colors"
            >
                Open workspace
            </button>}
            <AnimalAvatar />
        </header>
    )
}
