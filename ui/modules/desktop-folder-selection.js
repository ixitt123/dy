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

export function resolveUniqueReferenceFolder(results = []) {
  const matchesByPath = new Map();
  for (const item of Array.isArray(results) ? results : []) {
    const folderPath = String(item?.data?.folderPath || "").trim();
    const images = Array.isArray(item?.data?.images) ? item.data.images : [];
    if (!folderPath || !images.length) continue;
    if (!matchesByPath.has(folderPath)) {
      matchesByPath.set(folderPath, {
        suffix: String(item?.suffix || "").trim(),
        data: item.data,
      });
    }
  }
  const matches = [...matchesByPath.values()];
  if (matches.length === 1) return { status: "matched", ...matches[0] };
  if (matches.length > 1) return { status: "ambiguous", matches };
  return { status: "missing", matches: [] };
}
