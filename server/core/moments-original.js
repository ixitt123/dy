function textLength(value = "") {
  return Array.from(String(value || "")).length;
}

function splitLongOriginalLine(value = "") {
  const line = String(value || "").trim();
  if (!line || textLength(line) <= 88) return line ? [line] : [];

  const sentences = line.match(/[^。！？!?；;]+[。！？!?；;]?/gu) || [line];
  const paragraphs = [];
  let current = "";
  for (const sentenceValue of sentences) {
    const sentence = sentenceValue.trim();
    if (!sentence) continue;
    const candidate = `${current}${sentence}`;
    if (current && textLength(candidate) > 88 && textLength(current) >= 28) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

export function formatOriginalMomentsPost(value = "") {
  const lines = String(value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim());
  const paragraphs = [];
  for (const line of lines) {
    if (!line) continue;
    paragraphs.push(...splitLongOriginalLine(line));
  }
  return paragraphs.join("\n\n").trim();
}
