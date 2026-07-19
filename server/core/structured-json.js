function stripMarkdownFence(value = "") {
  return String(value || "")
    .trim()
    .replace(/^```(?:json|javascript|js)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObjectText(value = "") {
  const text = stripMarkdownFence(value);
  const start = text.indexOf("{");
  if (start < 0) return text;

  let inString = false;
  let escaped = false;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString && char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  const end = text.lastIndexOf("}");
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

function nextSignificantChar(value, index) {
  for (let cursor = index; cursor < value.length; cursor += 1) {
    const char = value[cursor];
    if (!/\s/.test(char)) return char;
  }
  return "";
}

function repairJsonStringLiterals(value = "") {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (!inString) {
      output += char;
      if (char === "\"") inString = true;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === "\r") {
      if (value[index + 1] === "\n") index += 1;
      output += "\\n";
      continue;
    }

    if (char === "\n") {
      output += "\\n";
      continue;
    }

    if (char === "\t") {
      output += "\\t";
      continue;
    }

    if (char === "\"") {
      const next = nextSignificantChar(value, index + 1);
      if (next === ":" || next === "," || next === "}" || next === "]" || !next) {
        output += char;
        inString = false;
      } else {
        output += "\\\"";
      }
      continue;
    }

    output += char;
  }

  return output;
}

function removeTrailingJsonCommas(value = "") {
  return value.replace(/,\s*([}\]])/g, "$1");
}

export function parseJsonFromModelText(text) {
  const extracted = extractJsonObjectText(text);
  try {
    return JSON.parse(extracted);
  } catch (initialError) {
    const repaired = removeTrailingJsonCommas(repairJsonStringLiterals(extracted));
    try {
      return JSON.parse(repaired);
    } catch {
      throw initialError;
    }
  }
}

export const structuredJsonInternals = {
  extractJsonObjectText,
  repairJsonStringLiterals,
};
