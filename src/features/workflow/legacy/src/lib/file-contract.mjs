// Portable metadata only. Original bytes stay in the authenticated asset store.
export const FILE_LIMITS = Object.freeze({ bytes: 48 * 1024, documentBytes:4 * 1024 * 1024, requestBytes:6 * 1024 * 1024, recordBytes:8 * 1024 * 1024, text: 12000 })
export function validateFileReference(value) {
  if (value?.schemaVersion === 2) return documentReference(value)
  const keys = ['schemaVersion', 'id', 'filename', 'sha256', 'bytes', 'parser']
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || value.schemaVersion !== 1 || value.parser !== 'utf8-lines-v1' || typeof value.id !== 'string' || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.id) || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes < 20 || value.bytes > FILE_LIMITS.bytes || typeof value.filename !== 'string' || value.filename.length > 160 || !/^[^\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]+\.(txt|md|markdown)$/i.test(value.filename)) throw new Error('Choose a UTF-8 text or Markdown file, up to 48 KiB and 12,000 characters.')
  return Object.fromEntries(keys.map(key => [key, value[key]]))
}
function documentReference(value) {
  const keys = ['schemaVersion','id','filename','sha256','bytes','parser','extractionSha256','selection','anchors','notices']
  const hash = /^[a-f0-9]{64}$/
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value)) || !hash.test(value.id) || !hash.test(value.sha256) || !hash.test(value.extractionSha256) || !Number.isSafeInteger(value.bytes) || value.bytes < 20 || value.bytes > FILE_LIMITS.documentBytes || typeof value.filename !== 'string' || value.filename.length > 160 || !/^[^\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]+\.(pdf|docx)$/i.test(value.filename) || !['pdf-pages-v1','docx-paragraphs-v1'].includes(value.parser)) throw new Error('The retained document reference is invalid.')
  const {from,to} = value.selection ?? {}
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to < from || to > 2000 || Object.keys(value.selection).some(key=>!['from','to'].includes(key)) || !Array.isArray(value.anchors) || value.anchors.length !== to-from+1 || !Array.isArray(value.notices) || value.notices.length > 10 || value.notices.some(item=>typeof item !== 'string' || item.length > 600)) throw new Error('The retained document selection is invalid.')
  let previous = -2
  for (const anchor of value.anchors) {
    if (!anchor || Object.keys(anchor).some(key=>!['start','end','kind','number','part'].includes(key)) || !Number.isSafeInteger(anchor.start) || !Number.isSafeInteger(anchor.end) || anchor.start !== previous+2 || anchor.end < anchor.start || anchor.end > FILE_LIMITS.text || anchor.kind !== (value.parser === 'pdf-pages-v1'?'page':'paragraph') || !Number.isSafeInteger(anchor.number) || anchor.number < 1 || !Number.isSafeInteger(anchor.part) || anchor.part < 1) throw new Error('The extracted section anchors are invalid.')
    previous = anchor.end
  }
  return Object.fromEntries(keys.map(key=>[key,value[key]]))
}
export function fileLocation(source, start, length) {
  if (!source.file) return null
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 1 || start + length > source.text.length) throw new Error('The file quotation is outside its retained text.')
  const line = position => source.text.slice(0, position).split(/\r\n|\r|\n/).length
  if (source.file.schemaVersion === 2) {
    const anchors = source.file.anchors.filter(anchor=>anchor.end > start && anchor.start < start+length)
    if (!anchors.length) throw new Error('The quotation does not match a retained document section.')
    return {fileId:source.file.id,lineStart:line(start),lineEnd:line(start+length-1),unit:anchors[0].kind,unitStart:anchors[0].number,unitEnd:anchors.at(-1).number}
  }
  return { fileId: source.file.id, lineStart: line(start), lineEnd: line(start + length - 1) }
}
