import type { IntakeSource } from './intake-types.js'
type FileBase = { id: string; filename: string; sha256: string; bytes: number }
export type DocumentFile = FileBase & {schemaVersion:2;parser:'pdf-pages-v1'|'docx-paragraphs-v1';extractionSha256:string}
export type DocumentUnit = {kind:'page'|'paragraph';number:number;part:number;text:string}
export type ExtractedDocument = {file:DocumentFile;units:DocumentUnit[];notices:string[]}
export type SourceFile = (FileBase & {schemaVersion:1;parser:'utf8-lines-v1'}) | (DocumentFile & {selection:{from:number;to:number};anchors:{start:number;end:number;kind:'page'|'paragraph';number:number;part:number}[];notices:string[]})
export type FileLocation = { fileId: string; lineStart: number; lineEnd: number;unit?:'page'|'paragraph';unitStart?:number;unitEnd?:number }
export type UploadedSource = { source: IntakeSource | null;document?:ExtractedDocument }
export type OriginalFile = { filename: string; sha256: string; bytes: number; base64: string }
