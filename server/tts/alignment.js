const TOKEN_PATTERN = /[\p{Script=Han}]|[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+(?:[.:]\d+)*|[^\s]/gu;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTime(value) {
  return Number(Math.max(0, finiteNumber(value)).toFixed(3));
}

export function tokenizeAlignmentText(value = "") {
  return String(value || "").normalize("NFKC").match(TOKEN_PATTERN) || [];
}

function normalizedToken(value = "") {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function splitSubtitleSentences(text = "") {
  const rows = String(text || "")
    .replace(/\r/g, "")
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return rows.length ? rows : [String(text || "").trim()].filter(Boolean);
}

function expandRecognizedWords(words = [], duration = 0) {
  const expanded = [];
  for (const word of Array.isArray(words) ? words : []) {
    const text = String(word?.text || word?.word || "").trim();
    const tokens = tokenizeAlignmentText(text);
    if (!tokens.length) continue;
    const start = Math.max(0, finiteNumber(word.start));
    const end = Math.max(start, finiteNumber(word.end, start));
    const span = Math.max(0, end - start);
    tokens.forEach((token, index) => {
      const tokenStart = start + span * (index / tokens.length);
      const tokenEnd = index === tokens.length - 1 ? end : start + span * ((index + 1) / tokens.length);
      expanded.push({
        text: token,
        start: roundTime(tokenStart),
        end: roundTime(Math.max(tokenStart + 0.01, tokenEnd)),
        confidence: Number.isFinite(Number(word.confidence)) ? Number(word.confidence) : null,
        source: String(word.source || "audio_asr"),
      });
    });
  }
  if (expanded.length || duration <= 0) return expanded;
  return [];
}

function estimatedWordsFromSentences(sentences = [], duration = 0) {
  const rows = [];
  for (const sentence of Array.isArray(sentences) ? sentences : []) {
    const text = String(sentence?.text || "").trim();
    const tokens = tokenizeAlignmentText(text);
    if (!tokens.length) continue;
    const start = Math.max(0, finiteNumber(sentence.start));
    const end = Math.max(start + 0.01, finiteNumber(sentence.end, start));
    const span = end - start;
    tokens.forEach((token, index) => {
      rows.push({
        text: token,
        start: roundTime(start + span * (index / tokens.length)),
        end: roundTime(start + span * ((index + 1) / tokens.length)),
        confidence: Number.isFinite(Number(sentence.confidence)) ? Number(sentence.confidence) : null,
        source: "estimated_sentence",
      });
    });
  }
  if (rows.length) return rows;
  const transcript = (Array.isArray(sentences) ? sentences : []).map((item) => item?.text || "").join("");
  return estimatedWordsFromText(transcript, duration);
}

function estimatedWordsFromText(text = "", duration = 0) {
  const tokens = tokenizeAlignmentText(text);
  if (!tokens.length) return [];
  const total = Math.max(0.25, finiteNumber(duration, Math.max(0.25, tokens.length * 0.18)));
  return tokens.map((token, index) => ({
    text: token,
    start: roundTime(total * (index / tokens.length)),
    end: roundTime(total * ((index + 1) / tokens.length)),
    confidence: null,
    source: "estimated_audio_duration",
  }));
}

function lcsMatches(left, right) {
  const n = left.length;
  const m = right.length;
  if (!n || !m) return [];
  if (n * m > 6_000_000) return greedyMatches(left, right);
  const rows = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      rows[i][j] = left[i - 1] === right[j - 1]
        ? rows[i - 1][j - 1] + 1
        : Math.max(rows[i - 1][j], rows[i][j - 1]);
    }
  }
  const matches = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (left[i - 1] === right[j - 1]) {
      matches.push([i - 1, j - 1]);
      i -= 1;
      j -= 1;
    } else if (rows[i - 1][j] >= rows[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return matches.reverse();
}

function greedyMatches(left, right) {
  const positions = new Map();
  right.forEach((token, index) => {
    if (!positions.has(token)) positions.set(token, []);
    positions.get(token).push(index);
  });
  const matches = [];
  let cursor = 0;
  for (let index = 0; index < left.length; index += 1) {
    const candidates = positions.get(left[index]) || [];
    const match = candidates.find((candidate) => candidate >= cursor);
    if (match === undefined) continue;
    matches.push([index, match]);
    cursor = match + 1;
  }
  return matches;
}

function estimateMissingRuns(rows, duration) {
  let index = 0;
  while (index < rows.length) {
    if (rows[index].start !== null) {
      index += 1;
      continue;
    }
    const runStart = index;
    while (index < rows.length && rows[index].start === null) index += 1;
    const runEnd = index;
    const previous = runStart > 0 ? rows[runStart - 1] : null;
    const next = runEnd < rows.length ? rows[runEnd] : null;
    let left = previous ? previous.end : 0;
    let right = next ? next.start : duration;
    if (!(right > left)) {
      left = previous ? previous.start : Math.max(0, right - 0.25);
      right = next ? next.end : Math.max(left + 0.25, duration);
    }
    const count = runEnd - runStart;
    const span = Math.max(0.03 * count, right - left);
    for (let offset = 0; offset < count; offset += 1) {
      const start = left + span * (offset / count);
      const end = left + span * ((offset + 1) / count);
      rows[runStart + offset].start = start;
      rows[runStart + offset].end = end;
      rows[runStart + offset].source = "estimated_manual_edit";
      rows[runStart + offset].confidence = null;
    }
  }
}

function normalizeWordTimeline(rows, duration) {
  const total = Math.max(0.25, finiteNumber(duration, rows.at(-1)?.end || 0.25));
  let previousStart = 0;
  return rows.map((row, index) => {
    const start = clamp(Math.max(previousStart, finiteNumber(row.start)), 0, total);
    const end = clamp(Math.max(start + 0.01, finiteNumber(row.end, start + 0.01)), 0, total);
    previousStart = start;
    return {
      index: index + 1,
      text: row.text,
      start: roundTime(start),
      end: roundTime(Math.max(start, end)),
      confidence: row.confidence,
      source: row.source || "audio_asr",
      estimated: String(row.source || "").startsWith("estimated"),
    };
  });
}

function sentenceTimelineFromWords(text, wordTimeline, duration) {
  const sentences = splitSubtitleSentences(text);
  const rows = [];
  let cursor = 0;
  for (const sentence of sentences) {
    const count = Math.max(1, tokenizeAlignmentText(sentence).length);
    const words = wordTimeline.slice(cursor, cursor + count);
    cursor += count;
    if (!words.length) continue;
    rows.push({
      text: sentence,
      start: words[0].start,
      end: words.reduce((max, item) => Math.max(max, item.end), words[0].end),
      estimated: words.some((item) => item.estimated),
      low_confidence: words.some((item) => Number.isFinite(item.confidence) && item.confidence < 0.75),
      source: words.some((item) => item.estimated) ? "mixed_audio_estimated" : "audio_asr_aligned",
    });
  }
  const total = Math.max(0.25, finiteNumber(duration, rows.at(-1)?.end || 0.25));
  let previousEnd = 0;
  return rows.map((row, index) => {
    const start = clamp(Math.max(previousEnd, finiteNumber(row.start)), 0, total);
    const end = clamp(Math.max(start + 0.05, finiteNumber(row.end, start + 0.25)), 0, total);
    previousEnd = Math.max(start, end);
    return {
      index: index + 1,
      ...row,
      start: roundTime(start),
      end: roundTime(Math.max(start, end)),
    };
  });
}

export function alignTranscriptToAudio({
  text = "",
  recognizedText = "",
  recognizedWords = [],
  recognizedSentences = [],
  duration = 0,
} = {}) {
  const finalText = String(text || "").trim();
  const total = Math.max(0.25, finiteNumber(duration));
  const finalTokens = tokenizeAlignmentText(finalText);
  if (!finalTokens.length) throw new Error("最终文案不能为空。");

  let anchors = expandRecognizedWords(recognizedWords, total);
  if (!anchors.length) anchors = estimatedWordsFromSentences(recognizedSentences, total);
  if (!anchors.length) anchors = estimatedWordsFromText(recognizedText || finalText, total);
  const matches = lcsMatches(finalTokens.map(normalizedToken), anchors.map((item) => normalizedToken(item.text)));
  const matchByFinalIndex = new Map(matches.map(([finalIndex, sourceIndex]) => [finalIndex, sourceIndex]));
  const rows = finalTokens.map((token, index) => {
    const sourceIndex = matchByFinalIndex.get(index);
    const anchor = sourceIndex === undefined ? null : anchors[sourceIndex];
    return {
      text: token,
      start: anchor ? anchor.start : null,
      end: anchor ? anchor.end : null,
      confidence: anchor?.confidence ?? null,
      source: anchor?.source || "",
    };
  });
  estimateMissingRuns(rows, total);
  const wordTimeline = normalizeWordTimeline(rows, total);
  const sentenceTimeline = sentenceTimelineFromWords(finalText, wordTimeline, total);
  const estimatedCount = wordTimeline.filter((item) => item.estimated).length;
  const lowConfidenceCount = wordTimeline.filter((item) => Number.isFinite(item.confidence) && item.confidence < 0.75).length;
  const source = estimatedCount === 0
    ? "audio_asr_aligned"
    : estimatedCount === wordTimeline.length
      ? "estimated_audio_duration"
      : "mixed_audio_estimated";
  return {
    finalText,
    wordTimeline,
    sentenceTimeline,
    estimatedCount,
    lowConfidenceCount,
    source,
    matchRatio: Number((matches.length / Math.max(finalTokens.length, anchors.length, 1)).toFixed(4)),
  };
}

export function validateAlignment({ text = "", wordTimeline = [], sentenceTimeline = [], duration = 0 } = {}) {
  const errors = [];
  const warnings = [];
  const total = Math.max(0, finiteNumber(duration));
  if (!String(text || "").trim()) errors.push("最终文案为空");
  if (!wordTimeline.length) errors.push("缺少逐字/逐词时间轴");
  if (!sentenceTimeline.length) errors.push("缺少逐句时间轴");
  let previousEnd = 0;
  sentenceTimeline.forEach((row, index) => {
    if (row.start < 0 || row.end <= row.start) errors.push(`第 ${index + 1} 句时间范围无效`);
    if (row.start + 0.001 < previousEnd) errors.push(`第 ${index + 1} 句与前一句重叠`);
    if (total > 0 && row.end > total + 0.05) errors.push(`第 ${index + 1} 句超过音频时长`);
    previousEnd = Math.max(previousEnd, row.end);
    if (row.estimated) warnings.push(`第 ${index + 1} 句包含估算时间戳`);
    if (row.low_confidence) warnings.push(`第 ${index + 1} 句包含低置信词`);
  });
  return { valid: errors.length === 0, errors, warnings };
}

