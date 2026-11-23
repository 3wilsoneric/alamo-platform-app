export type CaptureVisual = {id:string;bytes:number;width:number;height:number;capturedAt:string;reviewedAt:string;redactions:number;cropped:boolean;resized:boolean}
export type VisualImage = {id:string;base64:string}
export type StoredVisual = VisualImage & {schemaVersion:1;bytes:number;width:number;height:number}
