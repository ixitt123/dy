export function resolveFolderNameSelection({
  names = [],
  currentValue = "",
  cachedValue = "",
} = {}) {
  const available = [...new Set(
    (Array.isArray(names) ? names : [])
      .map((name) => String(name || "").trim())
      .filter(Boolean),
  )];
  const current = String(currentValue || "").trim();
  const cached = String(cachedValue || "").trim();
  if (available.includes(current)) return current;
  if (available.includes(cached)) return cached;
  return available.length === 1 ? available[0] : "";
}
