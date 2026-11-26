import { isProductionLikeRuntime } from "./runtime-environment.mjs";

import { createHash } from "node:crypto";

let clientConstructorPromise = null;

async function getDatabricksClient() {
  if (!clientConstructorPromise) {
    clientConstructorPromise = import("@databricks/sql")
      .then(({ DBSQLClient }) => DBSQLClient)
      .catch((error) => {
        clientConstructorPromise = null;
        throw error;
      });
  }
  const Client = await clientConstructorPromise;
  return new Client();
}

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Missing required Databricks environment variable: ${name}`);
  }

  return value.trim();
}

function getWarehousePath() {
  const explicitPath = process.env.DATABRICKS_HTTP_PATH?.trim();
  if (explicitPath) return explicitPath;

  const warehouseId = process.env.DATABRICKS_SQL_WAREHOUSE_ID?.trim();
  if (warehouseId) {
    return `/sql/1.0/warehouses/${warehouseId.replace(/^\/sql\/1\.0\/warehouses\//, "")}`;
  }

  throw new Error(
    "Missing Databricks warehouse path. Set DATABRICKS_HTTP_PATH or DATABRICKS_SQL_WAREHOUSE_ID."
  );
}

function isDevelopmentPatFallbackAllowed() {
  const flag = process.env.ALLOW_DATABRICKS_PAT_IN_DEV?.trim().toLowerCase();
  return !isProductionLikeRuntime() && (flag === "true" || flag === "1" || flag === "yes");
}

export function getDatabricksConfig() {
  const token = process.env.DATABRICKS_TOKEN?.trim();

  return {
    host: getRequiredEnv("DATABRICKS_HOST").replace(/^https?:\/\//, ""),
    path: getWarehousePath(),
    token: token || null,
    catalog: process.env.DATABRICKS_CATALOG?.trim() || "alamohealth",
    schema: process.env.DATABRICKS_SCHEMA?.trim() || "gold"
  };
}

function hasDatabricksOAuthEnv() {
  return Boolean(process.env.DATABRICKS_CLIENT_ID?.trim() && process.env.DATABRICKS_CLIENT_SECRET?.trim());
}

function hasDatabricksPatEnv() {
  return Boolean(process.env.DATABRICKS_TOKEN?.trim());
}

export function getDatabricksOAuthConfig() {
  return {
    host: getRequiredEnv("DATABRICKS_HOST").replace(/^https?:\/\//, ""),
    path: getWarehousePath(),
    oauthClientId: getRequiredEnv("DATABRICKS_CLIENT_ID"),
    oauthClientSecret: getRequiredEnv("DATABRICKS_CLIENT_SECRET"),
    azureTenantId: process.env.ENTRA_TENANT_ID?.trim() || undefined,
    catalog: process.env.DATABRICKS_CATALOG?.trim() || "alamohealth",
    schema: process.env.DATABRICKS_SCHEMA?.trim() || "gold"
  };
}

// W3.5: one long-lived SDK connection per configuration (one OAuth handshake)
// and a bounded set of sessions. A session runs one statement at a time and is
// returned only after a clean close of its operation; a failed or timed-out
// session is discarded. Nothing closes a connection while another request
// holds one of its sessions. A configuration change starts a new pool and
// retires the old one once its sessions are released.
const MAX_SESSIONS = 4;
const SESSION_MAX_AGE_MS = 30 * 60_000;
const DEFAULT_STATEMENT_TIMEOUT_SECONDS = 60;
const statementTimeoutSeconds = () => {
  const value = Number(process.env.DATABRICKS_STATEMENT_TIMEOUT_SECONDS);
  return Number.isInteger(value) && value >= 5 && value <= 600 ? value : DEFAULT_STATEMENT_TIMEOUT_SECONDS;
};
/** @type {Map<string, any>} */
const pools = new Map();
const poolKey = (connectionOptions, sessionConfig) => createHash("sha256").update(JSON.stringify([connectionOptions, sessionConfig])).digest("hex");
const timings = [];
function recordTiming(entry) { timings.push(entry); if (timings.length > 50) timings.shift(); }
/** Recent warehouse timings (no SQL text), for warm-latency measurement. */
export function getDatabricksQueryTimings() { return timings.map(entry => ({ ...entry })); }

function createPool(key, connectionOptions, sessionConfig) {
  /** @type {any} */
  const pool = { key, connection: null, connecting: null, idle: [], active: 0, waiters: [], retired: false, broken: false };
  pool.connect = async () => {
    if (pool.connection) return pool.connection;
    pool.connecting ??= (async () => {
      const client = await getDatabricksClient();
      try { pool.connection = await client.connect(connectionOptions); return pool.connection; }
      catch (error) { try { await client.close(); } catch { /* best effort */ } throw error; }
      finally { pool.connecting = null; }
    })();
    return pool.connecting;
  };
  pool.acquire = async () => {
    while (pool.active >= MAX_SESSIONS) await new Promise(resolve => pool.waiters.push(resolve));
    pool.active++;
    try {
      while (pool.idle.length) {
        const entry = pool.idle.pop();
        if (Date.now() - entry.openedAt < SESSION_MAX_AGE_MS) return { ...entry, reused: true };
        void closeQuietly("session", entry.session);
      }
      const connection = await pool.connect();
      const session = await connection.openSession({ ...sessionConfig,
        configuration: { ...(sessionConfig.configuration ?? {}), STATEMENT_TIMEOUT: String(statementTimeoutSeconds()) } });
      return { session, openedAt: Date.now(), reused: false };
    } catch (error) { pool.release(null, false); pool.broken = true; throw error; }
  };
  pool.release = (entry, healthy) => {
    pool.active--;
    if (entry && healthy && !pool.retired && !pool.broken) pool.idle.push({ session: entry.session, openedAt: entry.openedAt });
    else if (entry) void closeQuietly("session", entry.session);
    pool.waiters.shift()?.();
    if ((pool.retired || pool.broken) && pool.active === 0) void retirePool(pool);
  };
  return pool;
}

async function closeQuietly(label, resource) {
  if (!resource) return;
  try { await resource.close(); } catch (error) { console.warn(`Databricks ${label} cleanup failed.`, error); }
}

async function retirePool(pool) {
  if (pools.get(pool.key) === pool) pools.delete(pool.key);
  pool.retired = true;
  if (pool.active > 0) return; // The last release finishes retirement.
  const idle = pool.idle.splice(0);
  for (const entry of idle) await closeQuietly("session", entry.session);
  const connection = pool.connection; pool.connection = null;
  await closeQuietly("connection", connection);
}

/** Close every pooled connection (shutdown and tests). */
export async function closeDatabricksPools() {
  await Promise.all([...pools.values()].map(retirePool));
}

async function executeQuery(connectionOptions, sessionConfig, sql) {
  const key = poolKey(connectionOptions, sessionConfig);
  for (const [otherKey, other] of pools) if (otherKey !== key) void retirePool(other);
  let pool = pools.get(key);
  if (!pool || pool.broken) { if (pool) void retirePool(pool); pool = createPool(key, connectionOptions, sessionConfig); pools.set(key, pool); }
  const started = Date.now();
  const entry = await pool.acquire();
  const acquiredAt = Date.now();
  /** @type {any} */ let operation = null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  let healthy = false, timedOut = false;
  try {
    // Client-side guard: the warehouse STATEMENT_TIMEOUT plus a grace period.
    const guard = Number(process.env.DATABRICKS_CLIENT_TIMEOUT_MS);
    const timeoutMs = Number.isInteger(guard) && guard > 0 ? guard : statementTimeoutSeconds() * 1000 + 2000;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("Databricks statement timed out."), { code: "databricks_statement_timeout" })), timeoutMs); });
    const run = (async () => {
      operation = await entry.session.executeStatement(sql, { runAsync: false, queryTimeout: statementTimeoutSeconds() });
      return operation.fetchAll();
    })();
    // A statement that outlives the timeout is closed when it eventually returns.
    run.catch(() => {}).finally(() => { if (!healthy && operation && timedOut) void closeQuietly("operation", operation); });
    const rows = await Promise.race([run, timeout]);
    healthy = true;
    return rows;
  } catch (/** @type {any} */ error) {
    if (error?.code === "databricks_statement_timeout") { timedOut = true; if (operation) { try { await operation.cancel(); } catch { /* the session is discarded */ } } }
    throw error;
  } finally {
    clearTimeout(timer);
    if (operation && !timedOut) { try { await operation.close(); } catch (error) { healthy = false; console.warn("Databricks operation cleanup failed.", error); } }
    pool.release(entry, healthy);
    recordTiming({ reusedSession: entry.reused, acquireMs: acquiredAt - started, executeMs: Date.now() - acquiredAt, ok: healthy });
  }
}

// Short result cache keyed by (SQL, parameters, snapshot revision). Only used
// when the caller supplies a revision; SQL already carries the enforced grant
// scope, so a cached result can never cross communities. Entries are copies.
export const RESULT_CACHE_TTL_MS = 60_000;
const RESULT_CACHE_MAX_ENTRIES = 100;
const RESULT_CACHE_MAX_BYTES = 256_000;
export function createQueryResultCache({ now = Date.now, ttlMs = RESULT_CACHE_TTL_MS, maxEntries = RESULT_CACHE_MAX_ENTRIES, maxBytes = RESULT_CACHE_MAX_BYTES } = {}) {
  const entries = new Map(), inflight = new Map();
  /** @param {string} sql @param {{revision?:string|null,params?:unknown}} options @param {() => Promise<any>} run */
  return async (sql, { revision = null, params = null } = {}, run) => {
    if (typeof revision !== "string" || !revision) return run();
    const key = createHash("sha256").update(JSON.stringify([sql, params, revision])).digest("hex");
    const hit = entries.get(key);
    if (hit && now() - hit.storedAt < ttlMs) return structuredClone(hit.rows);
    if (hit) entries.delete(key);
    let pending = inflight.get(key);
    if (!pending) {
      pending = (async () => {
        try {
          const rows = await run();
          if (Array.isArray(rows) && Buffer.byteLength(JSON.stringify(rows), "utf8") <= maxBytes) {
            if (entries.size >= maxEntries) { const oldest = entries.keys().next().value; if (oldest !== undefined) entries.delete(oldest); }
            entries.set(key, { rows: structuredClone(rows), storedAt: now() });
          }
          return rows;
        } finally { inflight.delete(key); }
      })();
      inflight.set(key, pending);
    }
    return structuredClone(await pending);
  };
}
const resultCache = createQueryResultCache();

/** @param {string} sql @param {{cacheRevision?:string|null}} [options] */
export async function queryDatabricks(sql, { cacheRevision = null } = {}) {
  return resultCache(sql, { revision: cacheRevision }, () => queryDatabricksUncached(sql));
}

async function queryDatabricksUncached(sql) {
  if (hasDatabricksOAuthEnv()) {
    return queryDatabricksOAuth(sql);
  }

  if (!hasDatabricksPatEnv()) {
    throw new Error(
      "Databricks OAuth credentials are required. PAT fallback is unavailable because DATABRICKS_TOKEN is not set."
    );
  }

  if (!isDevelopmentPatFallbackAllowed()) {
    throw new Error(
      "Databricks PAT fallback is disabled. Use DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET for production code paths, or explicitly allow PAT fallback in development with ALLOW_DATABRICKS_PAT_IN_DEV=true."
    );
  }

  const config = getDatabricksConfig();

  return executeQuery(
    {
      host: config.host,
      path: config.path,
      token: config.token
    },
    {
      initialCatalog: config.catalog,
      initialSchema: config.schema
    },
    sql
  );
}

export function getDatabricksAuthMode() {
  if (hasDatabricksOAuthEnv()) {
    return "databricks-oauth";
  }

  if (hasDatabricksPatEnv() && isDevelopmentPatFallbackAllowed()) {
    return "pat-dev-fallback";
  }

  return "unconfigured";
}

export async function queryDatabricksOAuth(sql) {
  const config = getDatabricksOAuthConfig();

  return executeQuery(
    {
      host: config.host,
      path: config.path,
      authType: "databricks-oauth",
      azureTenantId: config.azureTenantId,
      oauthClientId: config.oauthClientId,
      oauthClientSecret: config.oauthClientSecret
    },
    {
      initialCatalog: config.catalog,
      initialSchema: config.schema
    },
    sql
  );
}
