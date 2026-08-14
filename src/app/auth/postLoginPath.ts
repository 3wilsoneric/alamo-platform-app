const DEFAULT_POST_LOGIN_PATH = "/home";

export function normalizePostLoginPath(value: unknown) {
  if (typeof value !== "string") return DEFAULT_POST_LOGIN_PATH;
  const path = value.trim();
  if (
    !path ||
    path.length > 2_048 ||
    !/^\/(?!\/)/.test(path) ||
    /[\\\u0000-\u001f\u007f]/.test(path)
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  if (/^\/login(?:[/?#]|$)/i.test(path)) return DEFAULT_POST_LOGIN_PATH;
  return path;
}
