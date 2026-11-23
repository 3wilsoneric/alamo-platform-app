import type {CaptureVisual} from './visual-types.js'
export const VISUAL_LIMITS: Readonly<{imageBytes:number;totalBytes:number;images:number;packetBytes:number;width:number;height:number;pixels:number}>
export function validateVisual(value:unknown):CaptureVisual
