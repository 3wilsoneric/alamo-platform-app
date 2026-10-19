// → src/components/ui/HR.tsx

interface HRProps {
    className?: string
}

export default function HR({ className = '' }: HRProps) {
    return <div className={`h-px bg-border ${className}`} />
}