import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const TOOL_TABLE_MAX_BYTES = 64 * 1024 * 1024;
export function assertToolTableReferences(context) {
  const references = context?.tableReferences ?? {};
  if (!references || typeof references !== 'object' || Array.isArray(references) || Object.keys(references).length > 80) throw Error('Invalid published table references.');
  let totalBytes = 0;
  for (const [name, ref] of Object.entries(references)) {
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(name) || !ref || Object.keys(ref).sort().join(',') !== 'bytes,compressedBytes,path,rows,sha256' ||
      !/^[a-f0-9]{64}$/.test(ref.sha256) || ref.path !== `snapshots/tool-tables/v1/${name}/${ref.sha256}.json.gz` ||
      !Number.isSafeInteger(ref.bytes) || ref.bytes < 2 || ref.bytes > TOOL_TABLE_MAX_BYTES ||
      !Number.isSafeInteger(ref.compressedBytes) || ref.compressedBytes < 1 || ref.compressedBytes > TOOL_TABLE_MAX_BYTES ||
      !Number.isSafeInteger(ref.rows) || ref.rows < 0 || ref.rows > 1_000_000 ||
      Object.hasOwn(context.tables ?? {}, name)) throw Error('Invalid or conflicting published table reference.');
    totalBytes += ref.bytes;
    if (totalBytes > TOOL_TABLE_MAX_BYTES) throw Error('Published tables exceed the complete-hydration memory budget.');
  }
  return references;
}

export function decodeToolTable(body, reference) {
  if (!body || body.byteLength !== reference.compressedBytes) throw Error('Published table compressed size mismatch.');
  const bytes = gunzipSync(body, { maxOutputLength: TOOL_TABLE_MAX_BYTES });
  if (bytes.byteLength !== reference.bytes || createHash('sha256').update(bytes).digest('hex') !== reference.sha256) throw Error('Published table revision mismatch.');
  const rows = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(rows) || rows.length !== reference.rows || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw Error('Published table population mismatch.');
  return rows;
}
