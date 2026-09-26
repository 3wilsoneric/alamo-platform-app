export function getSafeExternalUrl(value: string, baseUrl = window.location.origin) {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function openSafeExternalUrl(value: string) {
  const url = getSafeExternalUrl(value);
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
