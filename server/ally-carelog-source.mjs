import { ManagedIdentityCredential } from '@azure/identity';
import { reportObject, reportSubject } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';

import { projectNativeRecord, readNativeJsonResponse } from './ally-native-record.mjs';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const DATA_PATH = /^\/api\/[a-zA-Z][a-zA-Z0-9-/{}:_]*$/;

// The owner supplies the catalog and handles every clinical read. No model URL,
// delegated browser token, database access, or write endpoint crosses this adapter.
export function createCarelogAnalystSource({ env = process.env, fetchImpl = fetch, credentialFor = id => new ManagedIdentityCredential(id) } = {}) {
  let connection = null, connectionKey = '';
  async function request(path, subjectId) {
    reportSubject(subjectId);
    const origin = env.ALLY_CARELOG_ORIGIN, audience = env.ALLY_CARELOG_AUDIENCE, clientId = env.AZURE_CLIENT_ID;
    if (!origin || !audience || !clientId) throw Error('Carelog analytical reads are not connected.');
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || !audience.startsWith('api://') || !UUID.test(audience.slice(6)) || !UUID.test(clientId)) throw Error('Invalid Carelog analytical connection.');
    const key = JSON.stringify([origin, audience, clientId]);
    if (key !== connectionKey) { connection = credentialFor(clientId); connectionKey = key; }
    const token = await connection.getToken(`${audience}/.default`, { abortSignal: AbortSignal.timeout(5000) });
    if (!token?.token || token.expiresOnTimestamp <= Date.now()) throw Error('Carelog source identity is unavailable.');
    const response = await fetchImpl(origin + path, { method: 'GET', redirect: 'error',
      headers: { authorization: `Bearer ${token.token}`, 'X-Ally-Subject': subjectId, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    return readNativeJsonResponse(response, 'Carelog');
  }
  return async (args, { subjectId }) => {
    reportObject(args, [], ['view','query','path','parameters','pointer','columns','offset','revision']);
    const view = args.view ?? 'catalog';
    if (!['catalog','read'].includes(view)) throw Error('Choose catalog or read.');
    if (args.query !== undefined && (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 200)) throw Error('Choose a short source search.');
    if (args.path !== undefined && (typeof args.path !== 'string' || args.path.length > 250 || !DATA_PATH.test(args.path))) throw Error('Choose an operation from the Carelog catalog.');
    const search = new URLSearchParams();
    if (args.query) search.set('query', args.query);
    if (args.path) search.set('path', args.path);
    const catalog = await request(`/api/ally/catalog?${search}`, subjectId);
    if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.operations) || catalog.operations.length > 250) throw Error('Carelog operation catalog is unavailable.');
    if (view === 'catalog') return { operations: catalog.operations.slice(0, 5), otherMatches: catalog.operations.slice(5).map(operation => operation.path), meaning: catalog.meaning };
    const operation = catalog.operations.find(operation => operation.path === args.path);
    if (!operation || !Array.isArray(operation.parameters)) throw Error('Choose a registered Carelog read operation.');
    reportObject(args.parameters ?? {}, [], operation.parameters.map(parameter => parameter.name));
    let path = operation.path; const query = new URLSearchParams();
    for (const parameter of operation.parameters) {
      const value = args.parameters?.[parameter.name];
      if (value === undefined) { if (parameter.required) throw Error(`Carelog parameter ${parameter.name} is required.`); continue; }
      if (!validParameter(parameter, value)) throw Error(`Carelog parameter ${parameter.name} needs a valid ${parameter.type}.`);
      if (parameter.location === 'path') {
        if (value === '.' || value === '..' || /[/\\%?#]/.test(String(value))) throw Error('Invalid Carelog path parameter.');
        const marker = new RegExp(`\\{${parameter.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?::[^}]+)?\\}`, 'g');
        path = path.replace(marker, encodeURIComponent(String(value)));
      } else if (parameter.location === 'query') query.set(parameter.name, String(value));
      else throw Error('Unsupported Carelog parameter location.');
    }
    if (!path.startsWith('/api/') || /[{}?\\#]/.test(path)) throw Error('Incomplete Carelog operation path.');
    const data = await request(`${path}?${query}`, subjectId);
    return projectNativeRecord(data, args, 'Carelog');
  };
}

function validParameter(parameter, value) {
  if (parameter.type === 'integer') return Number.isSafeInteger(value);
  if (parameter.type === 'boolean') return typeof value === 'boolean';
  if (typeof value !== 'string' || value.length > 1000 || value.includes('\0')) return false;
  if (parameter.type === 'uuid') return UUID.test(value);
  if (parameter.type === 'enum') return parameter.options?.includes(value);
  if (parameter.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  if (parameter.type === 'datetime') return Number.isFinite(Date.parse(value));
  return parameter.type === 'string';
}

