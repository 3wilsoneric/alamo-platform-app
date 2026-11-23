export const VISUAL_LIMITS = Object.freeze({ imageBytes:1048576, totalBytes:6291456, images:12, packetBytes:9437184, width:2400, height:1600, pixels:3840000 })
const hash = /^[a-f0-9]{64}$/
export function validateVisual(value) {
  const keys=['id','bytes','width','height','capturedAt','reviewedAt','redactions','cropped','resized']
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>!keys.includes(key)) || keys.some(key=>!(key in value)) || !hash.test(value.id) || !Number.isSafeInteger(value.bytes) || value.bytes<50 || value.bytes>VISUAL_LIMITS.imageBytes || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width<1 || value.height<1 || value.width>VISUAL_LIMITS.width || value.height>VISUAL_LIMITS.height || value.width*value.height>VISUAL_LIMITS.pixels || !Number.isSafeInteger(value.redactions) || value.redactions<0 || value.redactions>100 || typeof value.cropped!=='boolean' || typeof value.resized!=='boolean') throw new Error('The reviewed screenshot reference is invalid.')
  for(const key of ['capturedAt','reviewedAt']) if(typeof value[key]!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value[key]) || !Number.isFinite(Date.parse(value[key])) || new Date(value[key]).toISOString()!==value[key]) throw new Error('The screenshot time is invalid.')
  if(value.reviewedAt<value.capturedAt) throw new Error('Review the screenshot after capturing it.')
  return Object.fromEntries(keys.map(key=>[key,value[key]]))
}
