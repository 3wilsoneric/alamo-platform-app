import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { ClientSecretCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { requireApiUser } from './api-auth.mjs';
import { getRequestUrl } from './http-errors.mjs';
import { applyProtectedApiHeaders } from './http-response.mjs';

export const CAREBOOK_SOURCE_PREFIX = '/api/integrations/pipeline/clinical/carebook';
const root = 'snapshots/carebook/v1/';
const hashPattern = /^[a-f0-9]{64}$/;
const manifestCache = new Map();
const domains = 'Profile Allergy Diagnosis Contact Note Incident ServiceSummary ServicePlan Admission Absence RoomMove Immunization'.split(' ').sort();
const facilities = ['337','342','343','344','345'];
const sha = body => createHash('sha256').update(body).digest('hex');
const fail = (code, statusCode = 502) => Object.assign(new Error(code), { statusCode, sourceCode: code });
const maximum = { manifest: 4 * 1024 * 1024, compressed: 8 * 1024 * 1024, resident: 32 * 1024 * 1024 };

export function assertCarebookIdentity(auth, allowedClientId) {
  if (!allowedClientId || !auth?.authenticated || auth.mode !== 'entra-service-principal' || auth.claims?.scp ||
      (auth.claims?.azp ?? auth.claims?.appid) !== allowedClientId || !auth.claims?.roles?.includes('Carebook.Sync.Read.All')) {
    throw fail('source_identity_denied', 403);
  }
}
export function validateCarebookManifest(raw, expectedHash, now = new Date()) {
  if (raw.length > maximum.manifest || !hashPattern.test(expectedHash) || sha(raw) !== expectedHash) throw fail('source_checksum_invalid');
  const m = JSON.parse(raw.toString('utf8'));
  if (m.contractVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(m.asOf) || new Date(m.asOf + 'T00:00:00Z').toISOString().slice(0,10) !== m.asOf ||
      !Number.isFinite(Date.parse(m.publishedAt)) || Date.parse(m.publishedAt) > +now + 300_000 ||
      !Array.isArray(m.facilities) || [...m.facilities].sort().join(',') !== facilities.join(',') ||
      !Array.isArray(m.domains) || [...m.domains].sort().join(',') !== domains.join(',') || !Array.isArray(m.unavailable) ||
      !Array.isArray(m.members) || m.members.length < 1 || m.members.length > 20_000 ||
      m.members.some(x => !facilities.includes(x.facilityId) || !/^[1-9][0-9]{0,19}$/.test(x.residentId) || !hashPattern.test(x.sha256)) ||
      [...new Set(m.members.map(x => x.facilityId))].sort().join(',') !== facilities.join(',') ||
      new Set(m.members.map(x => x.facilityId + ':' + x.residentId)).size !== m.members.length) throw fail('source_manifest_invalid');
  return m;
}
async function readBlob(name, limit) {
  const account = process.env.AZURE_STORAGE_ACCOUNT?.trim(), container = process.env.AZURE_STORAGE_CONTAINER?.trim();
  const tenant = process.env.ENTRA_TENANT_ID?.trim(), client = process.env.ENTRA_CLIENT_ID?.trim(), secret = process.env.ENTRA_CLIENT_SECRET;
  if (!account || !container || !tenant || !client || !secret) throw fail('source_storage_unconfigured', 503);
  const service = new BlobServiceClient(`https://${account}.blob.core.windows.net`, new ClientSecretCredential(tenant, client, secret));
  const response = await service.getContainerClient(container).getBlobClient(root + name).download(0, undefined, { abortSignal: AbortSignal.timeout(25_000) });
  if (typeof response.contentLength !== 'number' || !Number.isFinite(response.contentLength) || response.contentLength > limit || !response.readableStreamBody) throw fail('source_size_invalid');
  const pieces = []; let length = 0;
  for await (const piece of response.readableStreamBody) {
    length += piece.length;
    if (length > limit) { response.readableStreamBody.destroy(); throw fail('source_size_invalid'); }
    pieces.push(Buffer.from(piece));
  }
  return Buffer.concat(pieces);
}
export async function handleCarebookSourceRequest(req, res, dependencies = {}) {
  applyProtectedApiHeaders(res); res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed.' }); return; }
  try {
    const authorize = dependencies.authorize ?? (r => requireApiUser(r, { requiredScope: null, requiredRole: 'Carebook.Sync.Read.All' }));
    const auth = await authorize(req);
    assertCarebookIdentity(auth, dependencies.clientId ?? process.env.CAREBOOK_SYNC_CLIENT_ID);
    const read = dependencies.read ?? readBlob;
    const path = getRequestUrl(req).pathname.slice(CAREBOOK_SOURCE_PREFIX.length);
    let id, memberHash;
    if (path === '/latest') {
      const pointer = JSON.parse((await read('latest.json', 4096)).toString('utf8'));
      id = pointer.snapshotId;
    } else {
      const match = /^\/([a-f0-9]{64})\/residents\/([a-f0-9]{64})$/.exec(path);
      if (!match) throw fail('source_route_not_found', 404);
      [, id, memberHash] = match;
    }
    if (!hashPattern.test(id)) throw fail('source_pointer_invalid');
    let cached = !dependencies.read && manifestCache.get(id);
    if (!cached) {
      const bytes = await read(`snapshots/${id}.json`, maximum.manifest);
      cached = { bytes, manifest: validateCarebookManifest(bytes, id) };
      if (!dependencies.read) { if (manifestCache.size >= 4) manifestCache.delete(manifestCache.keys().next().value); manifestCache.set(id, cached); }
    }
    const { bytes: manifestBytes, manifest } = cached;
    res.setHeader('X-Carebook-Snapshot', id); res.setHeader('X-Carebook-Source-Date', manifest.asOf);
    if (!memberHash) { res.setHeader('Content-Type', 'application/json'); res.status(200).send(manifestBytes); return; }
    const member = manifest.members.find(x => x.sha256 === memberHash);
    if (!member) throw fail('source_member_not_found', 404);
    const bytes = await read(`residents/${memberHash}.json.gz`, maximum.compressed);
    const raw = gunzipSync(bytes, { maxOutputLength: maximum.resident });
    if (sha(raw) !== memberHash) throw fail('source_checksum_invalid');
    const resident = JSON.parse(raw.toString('utf8'));
    if (resident.contractVersion !== 1 || resident.facilityId !== member.facilityId || resident.residentId !== member.residentId) throw fail('source_member_mismatch');
    res.setHeader('Content-Type', 'application/gzip'); res.status(200).send(bytes);
  } catch (error) {
    const e = error instanceof Error ? error : new Error();
    const statusCode = 'statusCode' in e ? Number(e.statusCode) : 502;
    const sourceCode = 'sourceCode' in e && typeof e.sourceCode === 'string' ? e.sourceCode : null;
    const status = statusCode === 404 && !sourceCode ? 503 : [401,403,404,405,429,503].includes(statusCode) ? statusCode : 502;
    // Never return/log SDK bodies, source rows, tokens, IDs or unexpected exception messages.
    res.status(status).json({ error: sourceCode ?? (status === 401 ? 'source_authentication_required' : 'source_temporarily_unavailable') });
  }
}
