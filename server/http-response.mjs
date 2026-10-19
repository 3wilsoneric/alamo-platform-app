const PROTECTED_CACHE_CONTROL = "private, no-store, max-age=0, must-revalidate";

function appendVaryHeader(currentValue, value) {
  const values = String(currentValue ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!values.some((entry) => entry.toLowerCase() === value.toLowerCase())) values.push(value);
  return values.join(", ");
}

export function appendResponseVaryHeader(res, value) {
  res.setHeader("Vary", appendVaryHeader(res.getHeader?.("Vary"), value));
}

export function applyProtectedApiHeaders(res) {
  res.setHeader("Cache-Control", PROTECTED_CACHE_CONTROL);
  res.setHeader("Pragma", "no-cache");
  appendResponseVaryHeader(res, "Authorization");
  res.setHeader("X-Content-Type-Options", "nosniff");
}
