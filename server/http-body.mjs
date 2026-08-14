import { createHttpError } from "./http-errors.mjs";

const DEFAULT_MAX_REQUEST_BODY_BYTES = 1_000_000;

function assertBodySize(value, maximumBytes) {
  if (Buffer.byteLength(value, "utf8") > maximumBytes) {
    throw createHttpError(413, "request_body_too_large", "Request body is too large.");
  }
}

function parseJson(value) {
  if (!value.trim()) return {};

  try {
    return JSON.parse(value);
  } catch {
    throw createHttpError(400, "request_json_invalid", "Request body must be valid JSON.");
  }
}

async function readRawBody(req, maximumBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) {
      throw createHttpError(413, "request_body_too_large", "Request body is too large.");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonRequestBody(req, maximumBytes = DEFAULT_MAX_REQUEST_BODY_BYTES) {
  if (req.body === undefined) {
    return parseJson(await readRawBody(req, maximumBytes));
  }

  if (Buffer.isBuffer(req.body)) {
    assertBodySize(req.body.toString("utf8"), maximumBytes);
    return parseJson(req.body.toString("utf8"));
  }

  if (typeof req.body === "string") {
    assertBodySize(req.body, maximumBytes);
    return parseJson(req.body);
  }

  let serialized;
  try {
    serialized = JSON.stringify(req.body ?? {});
  } catch {
    throw createHttpError(400, "request_json_invalid", "Request body must be valid JSON.");
  }
  assertBodySize(serialized, maximumBytes);
  return req.body ?? {};
}

export async function readValidatedJsonRequest(req, validate, maximumBytes = DEFAULT_MAX_REQUEST_BODY_BYTES) {
  return validate(await readJsonRequestBody(req, maximumBytes));
}
