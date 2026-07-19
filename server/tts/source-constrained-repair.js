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

function editRatio(left = [], right = []) {
  return editDistance(left, right) / Math.max(1, left.length, right.length);
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

function sourceSegmentCost(rowChars = [], chunkChars = [], expectedLength = 0) {
  const distance = editRatio(rowChars, chunkChars);
  const lengthPenalty = Math.abs(chunkChars.length - expectedLength) / Math.max(1, expectedLength, rowChars.length);
  const emptyPenalty = chunkChars.length ? 0 : 2;
  return distance + lengthPenalty * 0.22 + emptyPenalty;
}

function proportionalSourceSegments(sourceChars = [], rowCharsList = []) {
  const totalWeight = Math.max(1, rowCharsList.reduce((sum, chars) => sum + Math.max(1, chars.length), 0));
  let cursor = 0;
  return rowCharsList.map((chars, index) => {
    const remainingRows = rowCharsList.length - index - 1;
    const remainingChars = sourceChars.length - cursor;
    const targetLength = index === rowCharsList.length - 1
      ? remainingChars
      : Math.max(0, Math.min(remainingChars - remainingRows, Math.round(sourceChars.length * (Math.max(1, chars.length) / totalWeight))));
    const end = Math.max(cursor, Math.min(sourceChars.length, cursor + targetLength));
    const segment = sourceChars.slice(cursor, end);
    cursor = end;
    return segment;
  });
}

function segmentSourceByAsrRows(sourceChars = [], rowCharsList = []) {
  if (!sourceChars.length) return rowCharsList.map(() => []);
  if (!rowCharsList.length) return [];
  const asrTotal = Math.max(1, rowCharsList.reduce((sum, chars) => sum + chars.length, 0));
  const sourceRatio = sourceChars.length / asrTotal;
  const bounds = rowCharsList.map((chars, index) => {
    const expected = Math.max(1, chars.length * sourceRatio);
    if (index === rowCharsList.length - 1) return { min: 0, max: sourceChars.length, expected };
    return {
      min: chars.length ? Math.max(1, Math.floor(expected * 0.45) - 2) : 0,
      max: Math.max(1, Math.ceil(expected * 1.75) + 4),
      expected,
    };
  });
  const suffixMin = Array(bounds.length + 1).fill(0);
  const suffixMax = Array(bounds.length + 1).fill(0);
  for (let index = bounds.length - 1; index >= 0; index -= 1) {
    suffixMin[index] = suffixMin[index + 1] + bounds[index].min;
    suffixMax[index] = Math.min(sourceChars.length, suffixMax[index + 1] + bounds[index].max);
  }

  let previous = new Float64Array(sourceChars.length + 1);
  previous.fill(Number.POSITIVE_INFINITY);
  previous[0] = 0;
  const backtracks = [];
  for (let rowIndex = 0; rowIndex < rowCharsList.length; rowIndex += 1) {
    const current = new Float64Array(sourceChars.length + 1);
    current.fill(Number.POSITIVE_INFINITY);
    const backtrack = Array(sourceChars.length + 1).fill(-1);
    const { min, max, expected } = bounds[rowIndex];
    for (let position = 0; position <= sourceChars.length; position += 1) {
      if (!Number.isFinite(previous[position])) continue;
      const lower = Math.max(min, sourceChars.length - position - suffixMax[rowIndex + 1]);
      const upper = Math.min(max, sourceChars.length - position - suffixMin[rowIndex + 1]);
      for (let length = lower; length <= upper; length += 1) {
        const next = position + length;
        const chunk = sourceChars.slice(position, next);
        const score = previous[position] + sourceSegmentCost(rowCharsList[rowIndex], chunk, expected);
        if (score < current[next]) {
          current[next] = score;
          backtrack[next] = position;
        }
      }
    }
    previous = current;
    backtracks.push(backtrack);
  }

  if (!Number.isFinite(previous[sourceChars.length])) return proportionalSourceSegments(sourceChars, rowCharsList);

  const segments = Array(rowCharsList.length);
  let cursor = sourceChars.length;
  for (let rowIndex = rowCharsList.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const previousCursor = backtracks[rowIndex][cursor];
    if (previousCursor < 0) return proportionalSourceSegments(sourceChars, rowCharsList);
    segments[rowIndex] = sourceChars.slice(previousCursor, cursor);
    cursor = previousCursor;
  }
  return segments;
}

function punctuationSlots(value = "") {
  const slots = [""];
  let coreCount = 0;
  for (const char of Array.from(String(value || ""))) {
    if (coreCharacters(char).length) {
      coreCount += 1;
      if (!slots[coreCount]) slots[coreCount] = "";
    } else {
      slots[coreCount] = `${slots[coreCount] || ""}${char}`;
    }
  }
  return { slots, coreCount };
}

function applySubtitlePunctuationTemplate(originalText = "", replacementChars = []) {
  const chars = Array.isArray(replacementChars) ? replacementChars : coreCharacters(replacementChars);
  const { slots, coreCount } = punctuationSlots(originalText);
  if (!chars.length) return String(originalText || "").trim();
  if (coreCount === chars.length) {
    let output = slots[0] || "";
    chars.forEach((char, index) => {
      output += char;
      output += slots[index + 1] || "";
    });
    return output.trim();
  }

  const insertions = new Map();
  for (let oldIndex = 1; oldIndex < coreCount; oldIndex += 1) {
    const punctuation = slots[oldIndex] || "";
    if (!punctuation.trim()) continue;
    const newIndex = Math.max(1, Math.min(chars.length - 1, Math.round((oldIndex / Math.max(1, coreCount)) * chars.length)));
    insertions.set(newIndex, `${insertions.get(newIndex) || ""}${punctuation}`);
  }
  let output = slots[0] || "";
  chars.forEach((char, index) => {
    output += char;
    output += insertions.get(index + 1) || "";
  });
  output += slots[coreCount] || "";
  return output.trim();
}

export function repairSourceConstrainedRows({ sourceText = "", asrRows = [] } = {}) {
  const sourceChars = coreCharacters(sourceText);
  if (!sourceChars.length) throw new Error("source text is required for subtitle repair");
  if (!Array.isArray(asrRows) || !asrRows.length) throw new Error("timestamped ASR rows are required for subtitle repair");

  const rowCharsList = asrRows.map((row) => coreCharacters(row?.text || ""));
  const sourceSegments = segmentSourceByAsrRows(sourceChars, rowCharsList);
  let changedCharacters = 0;
  let totalScore = 0;
  const lowConfidenceRows = [];
  const rows = asrRows.map((row, offset) => {
    const index = offset + 1;
    const originalChars = rowCharsList[offset] || [];
    const segmentChars = sourceSegments[offset] || [];
    const text = applySubtitlePunctuationTemplate(row?.text || "", segmentChars);
    const score = 1 - editRatio(originalChars, segmentChars);
    totalScore += score;
    if (score < 0.58) {
      lowConfidenceRows.push({
        index,
        score: Number(Math.max(0, score).toFixed(3)),
        asrText: String(row?.text || "").trim(),
        correctedText: text,
      });
    }
    changedCharacters += editDistance(originalChars, segmentChars);
    return { ...row, index, text };
  });

  return {
    rows,
    changedCharacters,
    fallbackCount: 0,
    partial: false,
    lowConfidenceRows,
    correctionScore: Number((totalScore / Math.max(1, rows.length)).toFixed(3)),
    warnings: lowConfidenceRows.map((row) => `low confidence row ${row.index}; used nearest source segment`),
  };
}

export function isMusic26FreeJob(job = {}) {
  const metadata = job.metadata && typeof job.metadata === "object" ? job.metadata : {};
  const model = String(job.model || metadata.model || metadata.target_model || "").trim().toLowerCase();
  return model === MUSIC_REPAIR_MODEL;
}

export function buildFixedAsrRows({ fixedRows = [], recognizedWords = [] } = {}) {
  if (!Array.isArray(fixedRows) || !fixedRows.length) throw new Error("当前歌唱音频没有可用的字幕时间轴。");
  const rows = fixedRows.map((row, offset) => ({
    index: offset + 1,
    start: Number(row?.start || 0),
    end: Number(row?.end || row?.start || 0),
    text: "",
  }));
  const words = (Array.isArray(recognizedWords) ? recognizedWords : [])
    .map((word) => ({
      text: String(word?.text || "").trim(),
      start: Number(word?.start || 0),
      end: Number(word?.end || word?.start || 0),
    }))
    .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
  for (const word of words) {
    const midpoint = word.start + Math.max(0, word.end - word.start) / 2;
    let targetIndex = rows.findIndex((row, index) => midpoint >= row.start && (midpoint < row.end || (index === rows.length - 1 && midpoint <= row.end)));
    if (targetIndex < 0) {
      let bestDistance = Number.POSITIVE_INFINITY;
      rows.forEach((row, index) => {
        const rowMidpoint = row.start + Math.max(0, row.end - row.start) / 2;
        const distance = Math.abs(midpoint - rowMidpoint);
        if (distance < bestDistance) {
          bestDistance = distance;
          targetIndex = index;
        }
      });
    }
    if (targetIndex >= 0) rows[targetIndex].text += word.text;
  }
  return rows.map((row, index) => ({
    ...row,
    text: row.text || String(fixedRows[index]?.text || "").trim(),
  }));
}

export function mergeSourceConstrainedRows({ sourceText = "", asrRows = [] } = {}) {
  const source = String(sourceText || "").trim();
  if (!source) throw new Error("source text is required for subtitle repair");
  if (!Array.isArray(asrRows) || !asrRows.length) throw new Error("timestamped ASR rows are required for subtitle repair");
  return repairSourceConstrainedRows({ sourceText: source, asrRows });
}
export const SOURCE_CONSTRAINED_MUSIC_MODEL = MUSIC_REPAIR_MODEL;
