import type { Procedure } from './types'
import { mockProcedures } from './data'

export function searchProcedures(query: string, procedures: Procedure[] = mockProcedures): Procedure[] {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return procedures
        .map(p => {
            let score = 0
            if (p.title.toLowerCase().includes(q)) score += 10
            p.tags.forEach(t => { if (q.includes(t) || t.includes(q)) score += 5 })
            if (p.dept.toLowerCase().includes(q)) score += 2
            if (p.type.toLowerCase().includes(q)) score += 2
            return { proc: p, score }
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.proc)
}

export function getProcedureMatchReasons(query: string, procedure: Procedure): string[] {
    const q = query.trim().toLowerCase()
    if (!q) return [`Matches ${procedure.dept.toLowerCase()} guidance`, `Covers ${procedure.type.toLowerCase()} workflow`]

    const tagHits = procedure.tags
        .filter((tag) => q.includes(tag.toLowerCase()) || tag.toLowerCase().includes(q))
        .slice(0, 2)

    const reasons: string[] = []

    if (procedure.title.toLowerCase().includes(q)) reasons.push('Direct title match')
    if (tagHits.length > 0) reasons.push(`Matched terms: ${tagHits.join(', ')}`)
    if (procedure.dept.toLowerCase().includes(q)) reasons.push(`Relevant to ${procedure.dept}`)
    if (procedure.type.toLowerCase().includes(q)) reasons.push(`Relevant ${procedure.type.toLowerCase()} procedure`)

    if (reasons.length === 0) {
        reasons.push(`Best fit for ${procedure.dept.toLowerCase()} workflow`)
        reasons.push('Contains steps for documentation and follow-up')
    }

    return reasons.slice(0, 3)
}
