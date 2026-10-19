import { isProductionLikeRuntime } from "./runtime-environment.mjs";

let clientPromise = null;

async function getDatabricksClient() {
  if (!clientPromise) {
    clientPromise = import("@databricks/sql")
      .then(({ DBSQLClient }) => new DBSQLClient())
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
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

async function executeQuery(connectionOptions, sessionConfig, sql) {
  let connection = null;
  let session = null;
  let operation = null;

  try {
    const databricksClient = await getDatabricksClient();
    connection = await databricksClient.connect(connectionOptions);
    session = await connection.openSession(sessionConfig);
    operation = await session.executeStatement(sql, {
      runAsync: false
    });
    return await operation.fetchAll();
  } finally {
    for (const [label, resource] of [
      ["operation", operation],
      ["session", session],
      ["connection", connection]
    ]) {
      if (!resource) continue;
      try {
        await resource.close();
      } catch (error) {
        console.warn(`Databricks ${label} cleanup failed.`, error);
      }
    }
  }
}

export async function queryDatabricks(sql) {
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
