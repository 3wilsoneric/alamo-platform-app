export function isProductionLikeRuntime() {
  const vercelEnvironment = String(process.env.VERCEL_ENV ?? "").trim().toLowerCase();
  return (
    process.env.NODE_ENV === "production" ||
    vercelEnvironment === "preview" ||
    vercelEnvironment === "production"
  );
}

export function getBoundedNumberEnv(name, fallback, minimum, maximum) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

export function getBoundedIntegerEnv(name, fallback, minimum, maximum) {
  const value = getBoundedNumberEnv(name, fallback, minimum, maximum);
  return Number.isInteger(value) ? value : fallback;
}
