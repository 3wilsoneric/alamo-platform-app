// → src/components/ui/Status.tsx

interface StatusProps {
    label: string
    variant: string
}

const variantClass: Record<string, string> = {
    active: 'text-teal',
    review: 'text-[#E67E22]',
    high: 'text-red',
    critical: 'text-red',
    medium: 'text-[#E67E22]',
    low: 'text-teal',
}

export default function Status({ label, variant }: StatusProps) {
    const color = variantClass[variant] ?? 'text-ink3'
    return (
        <span className={`inline-flex items-center rounded-full bg-light px-2.5 py-1 font-mono text-[10px] tracking-[0.07em] uppercase whitespace-nowrap ${color}`}>
            {label}
        </span>
    )
}
