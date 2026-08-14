export function getTopCounts<T>(
  items: T[],
  getKey: (item: T) => string | null | undefined,
  limit = 6
) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const key = getKey(item)?.trim();
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
