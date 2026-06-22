function compactText(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[“”"'`*_#<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceStart(text) {
  return compactText(text)
    .split(/[。！？!?；;\n\r]+/)
    .map((item) => item.trim())
    .find(Boolean) || compactText(text);
}

function clipChineseTitle(value, min = 8, max = 24) {
  const text = compactText(value).replace(/\s+/g, "");
  if (!text) return "短视频文案";
  if (text.length <= max) return text.length >= min ? text : `${text}方法`;
  return text.slice(0, max);
}

function keywordCandidates(text) {
  const value = compactText(text);
  const preferred = [
    "英语", "学习", "家长", "孩子", "教育", "升学", "招生", "方法", "经验",
    "避坑", "口播", "动画", "AI", "Codex", "Remotion", "视频", "剪映",
  ].filter((word) => value.includes(word));
  const words = value
    .split(/[，,。！？!?；;、\s]+/)
    .map((item) => item.replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, ""))
    .filter((item) => item.length >= 2 && item.length <= 8);
  return [...new Set([...preferred, ...words])].slice(0, 8);
}

function safeFileName(value) {
  return String(value || "短视频项目")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
    .replace(/\s+/g, "")
    .slice(0, 36) || "短视频项目";
}

function dateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function generatePlatformTitles({ transcriptText = "", videoType = "", fallbackTitle = "" } = {}) {
  const text = compactText(transcriptText);
  const first = sentenceStart(text);
  const keywords = keywordCandidates(`${videoType} ${text}`);
  const leadKeyword = keywords[0] || "短视频";
  const base = clipChineseTitle(fallbackTitle || first || `${leadKeyword}方法`);
  const douyinTitle = clipChineseTitle(base);
  const xiaohongshuTitle = clipChineseTitle(`${leadKeyword}经验：${base}`, 8, 30);
  const shipinhaoTitle = clipChineseTitle(`${leadKeyword}内容分享：${base}`, 8, 32);
  const hashtags = keywords.slice(0, 5).map((item) => `#${item.replace(/^#/, "")}`);
  const projectTitle = `${safeFileName(douyinTitle || xiaohongshuTitle)}_${dateStamp()}`;
  return {
    douyinTitle,
    xiaohongshuTitle,
    shipinhaoTitle,
    projectTitle,
    seoKeywords: keywords,
    hashtags,
    riskNotes: [],
  };
}
