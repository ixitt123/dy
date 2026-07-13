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

function clipChineseTitle(value, min = 8, max = 28) {
  const text = compactText(value).replace(/\s+/g, "");
  if (!text) return "短视频文案";
  if (text.length <= max) return text.length >= min ? text : `${text}方法`;
  return text.slice(0, max);
}

function keywordCandidates(text) {
  const value = compactText(text);
  const preferred = [
    "英语", "学习", "家长", "孩子", "教育", "升学", "招生", "报名", "方法", "经验",
    "避坑", "口播", "动画", "AI", "Codex", "Remotion", "视频", "剪映", "小红书",
    "抖音", "私域", "成交", "转化", "引流", "课程", "训练营", "老师", "机构",
  ].filter((word) => value.includes(word));
  const words = value
    .split(/[，,。！？!?；;、\s]+/)
    .map((item) => item.replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, ""))
    .filter((item) => item.length >= 2 && item.length <= 8);
  return [...new Set([...preferred, ...words])].slice(0, 8);
}

function titleSentences(text = "") {
  return compactText(text)
    .split(/[。！？!?；;\n\r]+/)
    .map((item) => item.trim().replace(/^(你知道吗|你有没有发现|很多人|其实|真的|注意|提醒)[:：，,]*/u, ""))
    .filter((item) => item.length >= 4)
    .slice(0, 8);
}

function pickTitleCore(text = "", keywords = [], fallbackTitle = "") {
  const fallback = compactText(fallbackTitle);
  if (fallback) return clipChineseTitle(fallback);
  const sentences = titleSentences(text);
  const scored = sentences
    .map((item, index) => {
      const keywordHits = keywords.filter((keyword) => item.includes(keyword)).length;
      const practical = /方法|经验|效果|坚持|报名|学习|避坑|问题|解决|怎么|如何|为什么|别|不要|一定|家长|孩子/.test(item) ? 8 : 0;
      const lengthScore = item.length >= 10 && item.length <= 32 ? 6 : item.length >= 6 && item.length <= 42 ? 3 : 0;
      const rhetoricalPenalty = /吗$|呢$|吧$/.test(item) ? -8 : 0;
      return { item, score: keywordHits * 7 + practical + lengthScore + rhetoricalPenalty - index };
    })
    .sort((a, b) => b.score - a.score);
  return clipChineseTitle(scored[0]?.item || sentenceStart(text));
}

function titleClip(value, maxLength = 28) {
  return clipChineseTitle(value, 8, maxLength);
}

function scoreSeoTitle(title = "", keywords = []) {
  const text = compactText(title);
  const length = text.length;
  const keywordHits = keywords.filter((keyword) => text.includes(keyword)).length;
  const lengthScore = length >= 10 && length <= 28 ? 30 : length >= 8 && length <= 34 ? 22 : 12;
  const keywordScore = keywordHits >= 2 ? 30 : keywordHits === 1 ? 22 : 10;
  const clarityScore = /方法|经验|避坑|报名|家长|孩子|学习|怎么|为什么|别|不要|一定/.test(text) ? 24 : 18;
  const safetyScore = /保证|百分百|包过|稳赚|必涨|绝对/.test(text) ? 6 : 16;
  return {
    total: Math.min(100, lengthScore + keywordScore + clarityScore + safetyScore),
    lengthScore,
    keywordScore,
    clarityScore,
    safetyScore,
    keywordHits,
    notes: keywordHits ? [] : ["标题未明显包含搜索关键词"],
  };
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
  const keywords = keywordCandidates(`${videoType} ${text}`);
  const leadKeyword = keywords[0] || "短视频";
  const baseCore = pickTitleCore(text, keywords, fallbackTitle);
  const base = baseCore.includes(leadKeyword) ? baseCore : titleClip(`${leadKeyword}：${baseCore}`, 28);
  const douyinTitle = titleClip(base, 28);
  const xiaohongshuTitle = titleClip(`${leadKeyword}经验：${baseCore}`, 30);
  const shipinhaoTitle = titleClip(`${leadKeyword}内容分享：${baseCore}`, 32);
  const bilibiliTitle = titleClip(`${baseCore}｜${leadKeyword}实用方法`, 36);
  const hashtags = keywords.slice(0, 5).map((item) => `#${item.replace(/^#/, "")}`);
  const projectTitle = `${safeFileName(douyinTitle || xiaohongshuTitle)}_${dateStamp()}`;
  return {
    douyinTitle,
    xiaohongshuTitle,
    shipinhaoTitle,
    bilibiliTitle,
    projectTitle,
    seoKeywords: keywords,
    hashtags,
    titleScore: scoreSeoTitle(douyinTitle, keywords),
    riskNotes: [],
  };
}

export function generateSeoTitlePackage({ transcriptText = "", videoType = "", fallbackTitle = "" } = {}) {
  const platform = generatePlatformTitles({ transcriptText, videoType, fallbackTitle });
  const title = platform.douyinTitle || platform.xiaohongshuTitle || "短视频文案";
  return {
    title,
    seoTitle: title,
    publishTitle: title,
    platformTitles: {
      douyin: platform.douyinTitle,
      xiaohongshu: platform.xiaohongshuTitle,
      shipinhao: platform.shipinhaoTitle,
      bilibili: platform.bilibiliTitle,
    },
    projectTitle: platform.projectTitle,
    seoKeywords: platform.seoKeywords,
    hashtags: platform.hashtags,
    titleScore: platform.titleScore,
    riskNotes: platform.riskNotes,
    source: "skill:seo-title",
    prompt: "seo_title_generation.md",
  };
}
