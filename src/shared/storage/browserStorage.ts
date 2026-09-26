type StorageKind = "local" | "session";

interface StorageOptions {
  kind?: StorageKind;
  label?: string;
  removeInvalid?: boolean;
}

interface ReadJsonOptions<T> extends StorageOptions {
  fallback: T;
  validate?: (value: unknown) => value is T;
}

function getStorage(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  return kind === "session" ? window.sessionStorage : window.localStorage;
}

function warnStorage(message: string, options: StorageOptions, error: unknown) {
  if (options.label) {
    console.warn(message, { key: options.label, error });
    return;
  }
  console.warn(message, error);
}

export function readStorageItem(key: string, options: StorageOptions = {}) {
  const storage = getStorage(options.kind ?? "local");
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch (error) {
    warnStorage("Could not read browser storage item.", options, error);
    return null;
  }
}

export function writeStorageItem(key: string, value: string, options: StorageOptions = {}) {
  const storage = getStorage(options.kind ?? "local");
  if (!storage) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    warnStorage("Could not persist browser storage item.", options, error);
    return false;
  }
}

export function removeStorageItem(key: string, options: StorageOptions = {}) {
  const storage = getStorage(options.kind ?? "local");
  if (!storage) return false;

  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    warnStorage("Could not remove browser storage item.", options, error);
    return false;
  }
}

export function readJsonStorage<T>(key: string, options: ReadJsonOptions<T>): T {
  const raw = readStorageItem(key, options);
  if (!raw) return options.fallback;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (options.validate && !options.validate(parsed)) {
      if (options.removeInvalid ?? true) removeStorageItem(key, options);
      return options.fallback;
    }
    return parsed as T;
  } catch (error) {
    if (options.removeInvalid ?? true) removeStorageItem(key, options);
    warnStorage("Could not parse browser storage JSON.", options, error);
    return options.fallback;
  }
}

export function writeJsonStorage(key: string, value: unknown, options: StorageOptions = {}) {
  try {
    return writeStorageItem(key, JSON.stringify(value), options);
  } catch (error) {
    warnStorage("Could not serialize browser storage JSON.", options, error);
    return false;
  }
}
