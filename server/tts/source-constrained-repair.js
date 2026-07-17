const MUSIC_REPAIR_MODEL = "music-2.6-free";

function coreCharacters(value) {
  return Array.from(String(value || "").normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, ""));
}

function editDistance(left = [], right = []) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function sourceBigramCoverage(candidate, source) {
  if (candidate.length < 2) return source.includes(candidate.join("")) ? 1 : 0;
  const sourceText = source.join("");
  let matched = 0;
  for (let index = 0; index < candidate.length - 1; index += 1) {
    if (sourceText.includes(candidate.slice(index, index + 2).join(""))) matched += 1;
  }
  return matched / (candidate.length - 1);
}

function numericTokens(value) {
  return String(value || "").normalize("NFKC").match(/\d+(?:\.\d+)?/g) || [];
}

function validateCandidate({ sourceText, asrText, candidateText }) {
  const source = coreCharacters(sourceText);
  const asr = coreCharacters(asrText);
  const candidate = coreCharacters(candidateText);
  if (!candidate.length) return { valid: false, reason: "校正结果为空" };
  const sourceSet = new Set(source);
  if (candidate.some((character) => !sourceSet.has(character))) {
    return { valid: false, reason: "包含配音前文案中不存在的实质性文字" };
  }
  if (numericTokens(candidateText).some((token) => !String(sourceText || "").normalize("NFKC").includes(token))) {
    return { valid: false, reason: "数字无法从配音前文案追溯" };
  }
  const maximumLengthDelta = Math.max(4, Math.ceil(Math.max(1, asr.length) * 0.35));
  if (Math.abs(candidate.length - asr.length) > maximumLengthDelta) {
    return { valid: false, reason: "单行增删幅度过大" };
  }
  const coverage = sourceBigramCoverage(candidate, source);
  if (candidate.length >= 4 && coverage < 0.45) {
    return { valid: false, reason: "短语无法充分从配音前文案追溯" };
  }
  return {
    valid: true,
    changedCharacters: editDistance(asr, candidate),
    characterCount: candidate.length,
    sourceBigramCoverage: coverage,
  };
}

export function isMusic26FreeJob(job = {}) {
  const metadata = job.metadata && typeof job.metadata === "object" ? job.metadata : {};
  const model = String(job.model || metadata.model || metadata.target_model || "").trim().toLowerCase();
  return model === MUSIC_REPAIR_MODEL;
}

export function mergeSourceConstrainedRows({ sourceText = "", asrRows = [], modelRows = [] } = {}) {
  const source = String(sourceText || "").trim();
  if (!source) throw new Error("缺少配音前文案，无法执行原文约束修复。");
  if (!Array.isArray(asrRows) || !asrRows.length) throw new Error("缺少带时间戳的语音识别稿。");
  const candidates = new Map();
  for (const row of Array.isArray(modelRows) ? modelRows : []) {
    const index = Number(row?.index || row?.row_index || row?.rowIndex || 0);
    if (index > 0 && !candidates.has(index)) candidates.set(index, String(row?.text || row?.corrected_text || "").trim());
  }
  let changedCharacters = 0;
  let fallbackCount = 0;
  const warnings = [];
  const rows = asrRows.map((row, offset) => {
    const index = offset + 1;
    const originalText = String(row?.text || "").trim();
    const candidateText = candidates.get(index) || "";
    const validation = validateCandidate({ sourceText: source, asrText: originalText, candidateText });
    if (!validation.valid) {
      fallbackCount += 1;
      warnings.push(`第 ${index} 行${validation.reason || "未返回可用结果"}，已保留原识别文字`);
      return { ...row, index, text: originalText };
    }
    changedCharacters += validation.changedCharacters;
    return { ...row, index, text: candidateText };
  });
  const correctedCore = coreCharacters(rows.map((row) => row.text).join(""));
  const asrCore = coreCharacters(asrRows.map((row) => row.text).join(""));
  const sourceCore = coreCharacters(source);
  if (correctedCore.join("") === sourceCore.join("") && asrCore.join("") !== sourceCore.join("")) {
    throw new Error("模型直接返回了完整配音前文案，未保留实际演唱内容选择。");
  }
  return {
    rows,
    changedCharacters,
    fallbackCount,
    partial: fallbackCount > 0,
    warnings,
  };
}

export const SOURCE_CONSTRAINED_MUSIC_MODEL = MUSIC_REPAIR_MODEL;
