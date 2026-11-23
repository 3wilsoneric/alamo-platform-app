import type { InspectedSource } from './process-types'
export function selectedSourcePassage(source: InspectedSource): { quote: string; start: number; location: string; field: string } | null
