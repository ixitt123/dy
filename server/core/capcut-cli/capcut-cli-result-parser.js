import fs from "node:fs";

function parseJsonOutput(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    const lines = value.split(/\r?\n/).reverse();
    for (const line of lines) {
      try {
        return JSON.parse(line);
      } catch {
        // Continue until a JSON line is found.
      }
    }
  }
  return null;
}

export function parseCapcutCliResult(result = {}, defaults = {}) {
  const parsed = parseJsonOutput(result.stdout) || {};
  const draftPath = parsed.draftPath || parsed.draft_path || defaults.draftPath || "";
  const previewPath = parsed.previewPath || parsed.preview_path || defaults.previewPath || "";
  const files = Array.isArray(parsed.files) ? parsed.files : [draftPath, previewPath].filter(Boolean);
  const warnings = [...(defaults.warnings || []), ...(Array.isArray(parsed.warnings) ? parsed.warnings : [])];
  const errors = [...(defaults.errors || []), ...(Array.isArray(parsed.errors) ? parsed.errors : [])];
  if (!result.ok && (result.stderr || result.error)) errors.push(result.stderr || result.error);
  return {
    ok: Boolean(result.ok && errors.length === 0),
    draftPath,
    previewPath,
    warnings: [...new Set(warnings.filter(Boolean))],
    errors: [...new Set(errors.filter(Boolean))],
    files: [...new Set(files.filter((file) => !file || fs.existsSync(file)))],
    raw: parsed,
  };
}
