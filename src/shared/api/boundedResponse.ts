export const DEFAULT_API_RESPONSE_MAX_BYTES = 50 * 1024 * 1024;

function responseSizeError(maximumBytes: number) {
  return new Error(`Platform API response exceeded the ${Math.round(maximumBytes / (1024 * 1024))} MB safety limit.`);
}

export async function readBoundedResponseText(
  response: Response,
  maximumBytes = DEFAULT_API_RESPONSE_MAX_BYTES
) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw responseSizeError(maximumBytes);
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maximumBytes) throw responseSizeError(maximumBytes);
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw responseSizeError(maximumBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new TextDecoder().decode(bytes);
}

export async function readBoundedJsonResponse<T>(
  response: Response,
  maximumBytes = DEFAULT_API_RESPONSE_MAX_BYTES
): Promise<T> {
  const text = await readBoundedResponseText(response, maximumBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("The server returned a response the platform could not read.");
  }
}
