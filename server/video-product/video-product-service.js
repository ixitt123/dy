import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ROUTE_A_DEFAULT_STYLE_ID, ROUTE_A_STYLE_PRESETS } from "../config/video-style-presets.js";

const TIMELINE_STATUSES = new Set([
  "pending",
  "binding_assets",
  "building_timeline",
  "rendering",
  "exporting_draft",
  "completed",
  "failed",
]);

const OUTPUT_TYPES = new Set(["jianying_template", "jianying", "mp4", "package", "template_mp4", "mix_mp4"]);
const IMAGE_REQUIRED_OUTPUT_TYPES = new Set(["jianying_template", "jianying", "mp4", "package"]);
const MP4_OUTPUT_TYPES = new Set(["mp4", "template_mp4", "mix_mp4"]);
const ROUTE_A_INTRO_SECONDS = 1.35;

const OUTPUT_TYPE_LABELS = {
  jianying_template: "剪映模板草稿【推荐】",
  jianying: "路线 C：历史剪映素材包",
  mp4: "MP4 预览",
  template_mp4: "路线 A：模板快剪 MP4",
  mix_mp4: "路线 D：下载素材混剪 MP4",
  package: "标准素材包 / 兼容导出",
};

const PREMIUM_WORKFLOW_SKILLS = [
  "premium-video-director",
  "script-to-shotlist",
  "visual-style-lock",
  "voice-timing-align",
  "bgm-sfx-mixer",
  "kinetic-caption-designer",
  "motion-template-render",
  "ffmpeg-final-render",
  "video-quality-review",
  "publish-package-maker",
];

const PLATFORM_PRESETS = {
  douyin: { label: "抖音", ratio: "9:16", resolution: "1080x1920", fps: 30 },
  "video-account": { label: "视频号", ratio: "9:16", resolution: "1080x1920", fps: 30 },
  xiaohongshu: { label: "小红书", ratio: "3:4", resolution: "1080x1440", fps: 30 },
  bilibili: { label: "B站", ratio: "16:9", resolution: "1920x1080", fps: 30 },
  landscape: { label: "横版", ratio: "16:9", resolution: "1920x1080", fps: 30 },
};

const ROUTE_A_SKILL_CHAIN = [
  "premium-video-director",
  "script-to-shotlist",
  "voice-timing-align",
  "kinetic-caption-designer",
  "bgm-sfx-mixer",
  "motion-template-render",
  "ffmpeg-final-render",
  "video-quality-review",
];

const DEFAULT_JIANYING_TEMPLATES = [
  {
    id: "education_tips",
    name: "学习技巧",
    category: "知识教育",
    recommendedVideoTypes: ["learning-method", "english-improvement", "douyin-knowledge", "知识口播", "学习技巧"],
    recommendedStyles: ["knowledge-blogger", "sketch-line", "clean-commercial", "tech-data"],
    tags: ["学习方法", "知识口播", "字幕强化", "教程"],
  },
  {
    id: "promo_commercial",
    name: "商业宣传",
    category: "商业广告",
    recommendedVideoTypes: ["promo", "product", "commercial", "品牌宣传", "产品讲解"],
    recommendedStyles: ["clean-commercial", "apple-keynote", "tech-data", "cinematic"],
    tags: ["品牌", "产品", "卖点", "高级感"],
  },
  {
    id: "enrollment_conversion",
    name: "招生转化",
    category: "教育转化",
    recommendedVideoTypes: ["enrollment", "education", "lead-generation", "招生", "家长焦虑"],
    recommendedStyles: ["parent-anxiety", "warm-campus", "knowledge-blogger", "clean-commercial"],
    tags: ["招生", "家长", "留资", "行动号召"],
  },
  {
    id: "black_gold_business",
    name: "黑金商业",
    category: "商业观点",
    recommendedVideoTypes: ["business", "case-study", "finance", "商业解读", "观点"],
    recommendedStyles: ["tech-data", "cinematic", "clean-commercial", "retro-futurism"],
    tags: ["黑金", "数据", "观点", "商业"],
  },
  {
    id: "clean_knowledge_card",
    name: "清爽知识卡片",
    category: "知识卡片",
    recommendedVideoTypes: ["knowledge", "explainer", "douyin-knowledge", "课程", "观点讲解"],
    recommendedStyles: ["clean-commercial", "knowledge-blogger", "sketch-line", "apple-keynote"],
    tags: ["卡片", "清爽", "知识", "字幕"],
  },
  {
    id: "campus_education",
    name: "校园教育",
    category: "校园教育",
    recommendedVideoTypes: ["campus", "education", "school", "中考", "高中选科"],
    recommendedStyles: ["warm-campus", "healing-illustration", "parent-anxiety", "chinese-ink"],
    tags: ["校园", "教育", "家长", "学生"],
  },
  {
    id: "three_d_story",
    name: "3D动画故事",
    category: "动画叙事",
    recommendedVideoTypes: ["story", "douyin-knowledge", "口播", "动画", "科普"],
    recommendedStyles: ["pixar-3d-cartoon", "healing-illustration", "cinematic"],
    tags: ["3D", "动画", "故事", "分镜"],
  },
  {
    id: "parent_dialogue",
    name: "家长对话",
    category: "教育转化",
    recommendedVideoTypes: ["parent-anxiety", "education-enrollment", "招生", "家长沟通"],
    recommendedStyles: ["parent-anxiety", "warm-campus", "pixar-3d-cartoon"],
    tags: ["家长", "对话", "痛点", "转化"],
  },
  {
    id: "fast_hook_talk",
    name: "强钩子口播",
    category: "短视频口播",
    recommendedVideoTypes: ["douyin-knowledge", "moments-talking", "短视频口播", "观点"],
    recommendedStyles: ["knowledge-blogger", "clean-commercial", "tech-data", "pixar-3d-cartoon"],
    tags: ["钩子", "口播", "快节奏", "观点"],
  },
  {
    id: "case_breakdown",
    name: "案例拆解",
    category: "知识拆解",
    recommendedVideoTypes: ["case-study", "learning-method", "admission-planning", "案例"],
    recommendedStyles: ["tech-data", "clean-commercial", "knowledge-blogger"],
    tags: ["案例", "拆解", "逻辑", "步骤"],
  },
];

function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function stringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function safeFileName(value) {
  return String(value || "timeline")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "timeline";
}

function createStableAssetId(filePath) {
  return Buffer.from(path.resolve(String(filePath || ""))).toString("base64url").slice(0, 32);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hasDirectoryEntries(dir) {
  try {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

function hasJianyingDraftFiles(dir) {
  try {
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    const contentPath = path.join(dir, "draft_content.json");
    const metaPath = path.join(dir, "draft_meta_info.json");
    const infoPath = path.join(dir, "draft_info.json");
    const metaLikePath = fs.existsSync(metaPath) ? metaPath : infoPath;
    return fs.existsSync(contentPath)
      && fs.existsSync(metaLikePath)
      && fs.statSync(contentPath).size > 256
      && fs.statSync(metaLikePath).size > 64;
  } catch {
    return false;
  }
}

function copyDirectoryTree(sourceDir, targetDir, { skip = [] } = {}) {
  const skipSet = new Set(skip);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (skipSet.has(entry.name)) continue;
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryTree(sourcePath, targetPath, { skip });
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function isInsideDirectory(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeTemplateId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "custom_template";
}

function templateDefaults(id) {
  return DEFAULT_JIANYING_TEMPLATES.find((item) => item.id === id) || {
    id,
    name: id,
    category: "自定义模板",
    recommendedVideoTypes: [],
    recommendedStyles: [],
    tags: ["自定义"],
  };
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  return filePath;
}

function parseResolution(value) {
  const match = String(value || "1080x1920").match(/^(\d+)x(\d+)$/i);
  return {
    width: match ? Number(match[1]) : 1080,
    height: match ? Number(match[2]) : 1920,
  };
}

function normalizedHex(value, fallback = "#07101B") {
  const raw = String(value || "").trim();
  if (/^0x[0-9a-f]{6}$/i.test(raw)) return `#${raw.slice(2).toUpperCase()}`;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toUpperCase()}`;
  return fallback.toUpperCase();
}

function ffmpegColor(value, fallback = "#07101B") {
  return `0x${normalizedHex(value, fallback).slice(1)}`;
}

function assColor(value, fallback = "#FFFFFF", alpha = "00") {
  const hex = normalizedHex(value, fallback).slice(1);
  const rr = hex.slice(0, 2);
  const gg = hex.slice(2, 4);
  const bb = hex.slice(4, 6);
  return `&H${alpha}${bb}${gg}${rr}`;
}

function srtTimestamp(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  const ms = Math.round((value - Math.floor(value)) * 1000);
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(secs).padStart(2, "0"),
  ].join(":") + `,${String(ms).padStart(3, "0")}`;
}

function timelineToSrt(scenes) {
  return scenes.map((scene, index) => [
    String(index + 1),
    `${srtTimestamp(scene.start_time)} --> ${srtTimestamp(scene.end_time)}`,
    String(scene.subtitle_text || scene.narration_text || "").trim(),
    "",
  ].join("\n")).join("\n");
}

function timelineToAss(scenes, { width = 1080, height = 1920, style = null } = {}) {
  const palette = style?.palette || {};
  const marginV = Math.max(230, Math.round(height * 0.16));
  const fontSize = Math.max(56, Math.round(height * 0.034));
  const titleSize = Math.max(64, Math.round(height * 0.042));
  const accent = assColor(palette.accent, "#E7C76C");
  const accent2 = assColor(palette.accent2, "#49D6C8");
  const textColor = assColor(palette.text, "#FFFFFF");
  const outlineColor = assColor("#05070C", "#05070C");
  const boxColor = assColor(palette.background, "#07101B", "88");
  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Premium,Microsoft YaHei,${fontSize},${textColor},${accent},${outlineColor},${boxColor},-1,0,0,0,100,100,0,0,3,5,0,2,86,86,${marginV},1`,
    `Style: Keyword,Microsoft YaHei,${titleSize},${accent},${textColor},${outlineColor},${boxColor},-1,0,0,0,104,104,0,0,3,5,0,2,86,86,${marginV + 10},1`,
    `Style: CTA,Microsoft YaHei,${titleSize},${textColor},${accent2},${outlineColor},${boxColor},-1,0,0,0,104,104,0,0,3,5,0,2,86,86,${marginV + 12},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  for (const scene of scenes) {
    const styleName = Number(scene.scene_index || 0) === 1 ? "Keyword" : "Premium";
    const text = assCaptionText(scene.subtitle_text || scene.narration_text || "", {
      accent,
      resetStyle: styleName,
    });
    if (!text) continue;
    const effectText = `{\\fad(80,120)\\t(0,180,\\fscx106\\fscy106)\\t(180,360,\\fscx100\\fscy100)}${text}`;
    lines.push([
      "Dialogue: 1",
      assTimestamp(scene.start_time),
      assTimestamp(scene.end_time),
      styleName,
      "",
      "0",
      "0",
      "0",
      "",
      effectText,
    ].join(","));
  }

  return `${lines.join("\n")}\n`;
}

function textDurationWeight(text) {
  const length = String(text || "").replace(/\s+/g, "").length;
  return Math.max(1.8, Math.min(12, length / 5.5));
}

function splitSpeechUnits(text) {
  const source = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return [];
  const units = [];
  let current = "";
  for (const char of source) {
    current += char;
    if (/[。！？!?；;]/.test(char) || (/[，、,]/.test(char) && current.replace(/\s+/g, "").length >= 18)) {
      units.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) units.push(current.trim());
  return units
    .flatMap((unit) => {
      const compact = unit.replace(/\s+/g, "");
      if (compact.length <= 26) return [unit];
      const parts = unit.split(/(?<=[，、,])/).map((item) => item.trim()).filter(Boolean);
      return parts.length > 1 ? parts : [unit];
    })
    .map((unit) => unit.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function speechUnitWeight(text) {
  const value = String(text || "").trim();
  const compactLength = value.replace(/\s+/g, "").length;
  const englishLength = (value.match(/[A-Za-z]+/g) || []).join("").length;
  const punctuationPause = /[。！？!?；;]$/.test(value) ? 0.45 : /[，、,]$/.test(value) ? 0.2 : 0;
  return Math.max(0.9, (compactLength + englishLength * 0.35) / 6 + punctuationPause);
}

function buildRouteASubtitleScenes({ audioText = "", directorScenes = [], targetDuration = 0 } = {}) {
  const units = splitSpeechUnits(audioText);
  if (!units.length || !Number.isFinite(targetDuration) || targetDuration <= 0) return [];
  const weights = units.map(speechUnitWeight);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || units.length;
  let cursor = 0;
  return units.map((unit, index) => {
    const duration = index === units.length - 1
      ? Math.max(0.75, targetDuration - cursor)
      : Math.max(0.75, Number(((weights[index] / totalWeight) * targetDuration).toFixed(3)));
    const sourceScene = directorScenes.find((scene) => textSimilarityScore(scene.voice_text || scene.subtitle || "", unit) >= 32)
      || directorScenes[Math.min(index, Math.max(0, directorScenes.length - 1))]
      || {};
    cursor += duration;
    return {
      ...sourceScene,
      scene_index: index + 1,
      duration: Number(duration.toFixed(3)),
      voice_text: unit,
      subtitle: unit,
      purpose: sourceScene.purpose || "",
      camera: sourceScene.camera || "",
      composition: sourceScene.composition || "",
      image_prompt: sourceScene.image_prompt || "",
      motion_prompt: sourceScene.motion_prompt || sourceScene.camera || "template_caption",
      transition: sourceScene.transition || "straight_cut",
      asset_type: "template_caption",
      metadata_json: "",
    };
  });
}

function compactMatchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, "")
    .trim();
}

function textBigrams(text) {
  const value = compactMatchText(text);
  if (value.length < 2) return new Set(value ? [value] : []);
  const grams = new Set();
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.add(value.slice(index, index + 2));
  }
  return grams;
}

function textSimilarityScore(a, b) {
  const left = compactMatchText(a);
  const right = compactMatchText(b);
  if (!left || !right) return 0;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 18 && longer.includes(shorter)) return 100;
  const leftGrams = textBigrams(left);
  const rightGrams = textBigrams(right);
  if (!leftGrams.size || !rightGrams.size) return 0;
  let overlap = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) overlap += 1;
  }
  return Math.round((overlap / Math.max(leftGrams.size, rightGrams.size)) * 100);
}

function audioDirectorBinding(director, audio, directorScenes = []) {
  if (!director || !audio) return { accepted: false, score: 0, reason: "缺少导演稿或音频。" };
  const narrationText = directorScenes.map((scene) => scene.voice_text || scene.subtitle || "").join("");
  const score = Math.max(
    textSimilarityScore(audio.text, narrationText),
    textSimilarityScore(audio.text, director.source_text),
  );
  const sameTask = Number(director.task_id || 0) > 0
    && Number(director.task_id || 0) === Number(audio.task_id || 0);
  const sameRewrite = Number(director.rewrite_id || 0) > 0
    && Number(director.rewrite_id || 0) === Number(audio.rewrite_id || 0);
  const accepted = sameTask || sameRewrite || score >= 28;
  return {
    accepted,
    score,
    same_task: sameTask,
    same_rewrite: sameRewrite,
    reason: accepted
      ? "音频和导演稿已通过绑定校验。"
      : `当前音频与导演稿相似度 ${score}%，低于 28%，已阻止随机匹配。`,
  };
}

function assTimestamp(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  const centiseconds = Math.floor((value - Math.floor(value)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function assEscape(text) {
  return String(text || "")
    .replace(/[{}]/g, "")
    .replace(/\r?\n/g, "\\N");
}

function assCaptionText(text, { accent = "&H0000D7FF", resetStyle = "Premium" } = {}) {
  const value = String(text || "").trim();
  const highlightPattern = /(半年|英语|背单词|开口|关键|核心|方法|不是|不要|别|先|真正|立刻|马上|免费|报名|家长|解决|\d+(?:\.\d+)?%?)/g;
  const emphasize = (source) => assEscape(source)
    .replace(highlightPattern, `{\\c${accent}\\b1}$1{\\r${resetStyle}}`);
  if (value.length <= 16) return emphasize(value);
  const chunks = [];
  const sentenceChunks = value.split(/(?<=[，、。！？!?；;])/).map((item) => item.trim()).filter(Boolean);
  let current = "";
  for (const chunk of sentenceChunks.length ? sentenceChunks : [value]) {
    if (current && current.length + chunk.length > 14) {
      chunks.push(current);
      current = "";
    }
    if (chunk.length > 18) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let index = 0; index < chunk.length; index += 14) chunks.push(chunk.slice(index, index + 14));
      continue;
    }
    current += chunk;
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 3).map(emphasize).join("\\N");
}

function normalizeSceneDuration(scene) {
  const explicit = Number(scene.duration || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, explicit);
  return textDurationWeight(scene.voice_text || scene.subtitle || scene.purpose);
}

function runProcess(command, args, { cwd = "", signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: cwd || undefined,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`));
    });
  });
}

async function probeMediaDuration(ffmpegPath, mediaPath) {
  if (!ffmpegPath || !mediaPath || !fs.existsSync(mediaPath)) return 0;
  try {
    const result = await runProcess(ffmpegPath, ["-hide_banner", "-i", mediaPath]);
    const text = `${result.stderr}\n${result.stdout}`;
    const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  } catch (error) {
    const text = String(error?.message || "");
    const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
  }
}

function ffmpegFilterPath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function ffmpegDrawText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

function compactTitleText(value) {
  return String(value || "")
    .replace(/[《》「」“”"']/g, "")
    .replace(/\s+/g, "")
    .replace(/^[#\s]+|[#\s]+$/g, "")
    .trim();
}

function titleLooksGeneric(value) {
  const text = compactTitleText(value);
  return !text
    || /导演稿|强钩子版|弱钩子版|版本|Timeline|timeline|成片中心/i.test(text)
    || text.length < 6;
}

function sentenceParts(text) {
  return String(text || "")
    .split(/[。！？!?；;\n\r]+/)
    .map((item) => compactTitleText(item))
    .filter(Boolean);
}

function titleClip(value, maxLength = 22) {
  const text = compactTitleText(value);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function optimizedPublishTitle({ directorTitle = "", scenes = [] } = {}) {
  const narration = scenes.map((scene) => scene.narration_text || scene.subtitle_text || "").join("。");
  const first = scenes[0]?.narration_text || scenes[0]?.subtitle_text || "";
  const parts = sentenceParts(first);
  const allParts = sentenceParts(narration);

  if (/英语/.test(narration) && /背单词/.test(narration)) {
    return "半年说流利英语？先别死背单词";
  }
  if (/招生|引流|家长|咨询/.test(narration)) {
    const pain = allParts.find((item) => /家长|咨询|报名|招生|引流/.test(item)) || parts[0] || directorTitle;
    return titleClip(`${pain}，先抓住这一点`, 22);
  }
  if (/赚钱|副业|成交|客户|流量/.test(narration)) {
    const hook = parts[0] || allParts[0] || directorTitle;
    return titleClip(`${hook}，问题在这里`, 22);
  }
  if (!titleLooksGeneric(directorTitle)) return titleClip(directorTitle, 22);
  const hook = parts[0] || allParts[0] || directorTitle || "这件事别再做错";
  const contrast = allParts.find((item) => /不是|别|先|关键|前提|因为|方法|核心/.test(item) && item !== hook);
  return titleClip(contrast ? `${hook}，${contrast}` : hook, 22);
}

function routeAStylePreset(styleId = "") {
  return ROUTE_A_STYLE_PRESETS[String(styleId || "")] || ROUTE_A_STYLE_PRESETS[ROUTE_A_DEFAULT_STYLE_ID];
}

function routeAStyleId(value = "") {
  return ROUTE_A_STYLE_PRESETS[String(value || "")] ? String(value) : ROUTE_A_DEFAULT_STYLE_ID;
}

function routeAStyleContract(input = {}) {
  const styleId = routeAStyleId(input.route_a_style_id || input.style_id);
  const preset = routeAStylePreset(styleId);
  const customStyle = String(input.route_a_custom_style || input.custom_style || "").trim();
  return {
    id: styleId,
    label: preset.label,
    tone: preset.tone,
    visual_rules: preset.visualRules,
    caption_rules: ["竖屏大字字幕", "关键词高亮", "黑色描边", "安全边距", "一屏一个重点"],
    music_rules: ["语音优先", "BGM 自动压低", "片头有轻冲击", "片尾收束"],
    transition_rules: ["主转场保持统一", "重点句使用信息卡", "结尾 CTA 大字卡"],
    custom_style: customStyle,
    palette: preset.palette,
    skill_chain: ROUTE_A_SKILL_CHAIN,
  };
}

function routeAVisualKit(input = {}) {
  const style = input?.palette ? input : routeAStyleContract(input);
  const preset = routeAStylePreset(style.id);
  const palette = style.palette || preset.palette || ROUTE_A_STYLE_PRESETS[ROUTE_A_DEFAULT_STYLE_ID].palette;
  return {
    style,
    bg: ffmpegColor(palette.background, "#07101B"),
    panel: ffmpegColor(palette.panel, "#101827"),
    accent: ffmpegColor(palette.accent, "#E7C76C"),
    accent2: ffmpegColor(palette.accent2, "#49D6C8"),
    text: ffmpegColor(palette.text, "#FFFFFF"),
    muted: ffmpegColor(palette.muted, "#AAB7C7"),
  };
}

function routeAAutoTitle(audio, input = {}) {
  const explicit = String(input.title || "").trim();
  if (explicit) return titleClip(explicit, 28);
  const text = String(audio?.text || "").trim();
  const first = sentenceParts(text)[0] || text.slice(0, 28);
  if (/英语/.test(text) && /背单词/.test(text)) return "半年说流利英语？先别死背单词";
  if (/招生|家长|报名|升学|补课/.test(text)) return titleClip(`${first}，家长一定要听`, 28);
  return titleClip(first || "路线 A 自动导演稿", 28);
}

function estimateSpeechDuration(text) {
  const units = splitSpeechUnits(text);
  const weight = units.reduce((sum, unit) => sum + speechUnitWeight(unit), 0);
  return Math.max(12, Math.min(180, Number((weight * 1.05).toFixed(2))));
}

function buildRouteAAutoDirectorScenes(audio, input = {}, targetDuration = 0) {
  const style = routeAStyleContract(input);
  const units = splitSpeechUnits(audio?.text || "");
  const safeUnits = units.length ? units : [String(audio?.text || "").trim()].filter(Boolean);
  const duration = Number(targetDuration || 0) > 0 ? Number(targetDuration) : estimateSpeechDuration(audio?.text || "");
  const weights = safeUnits.map(speechUnitWeight);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || safeUnits.length || 1;
  return safeUnits.map((unit, index) => {
    const sceneDuration = Math.max(1.2, Number(((weights[index] / totalWeight) * duration).toFixed(2)));
    const keyword = compactTitleText(unit).slice(0, 10);
    return {
      scene_index: index + 1,
      duration: sceneDuration,
      purpose: index === 0 ? `片头钩子：${keyword}` : index === safeUnits.length - 1 ? `片尾收束：${keyword}` : `信息推进：${keyword}`,
      emotion: index === 0 ? "抓注意力" : index === safeUnits.length - 1 ? "推动行动" : "持续解释",
      voice_text: unit,
      subtitle: unit,
      visual_style: style.label,
      camera: index % 3 === 0 ? "push_in" : index % 3 === 1 ? "text_card" : "montage",
      composition: `${style.label}，竖屏安全区，主字幕居中偏下，信息卡跟随节奏出现。`,
      image_prompt: `${style.label}商业短视频包装画面，统一色调，真实摄影感或高级信息图背景，不生成可读文字。镜头语义：${unit.slice(0, 80)}`,
      motion_prompt: index % 3 === 0 ? "push" : index % 3 === 1 ? "slide" : "zoom",
      bgm: "voiceover_first",
      sfx: index === 0 ? "intro_hit" : index === safeUnits.length - 1 ? "outro_resolve" : "soft_transition",
      transition: index === 0 ? "fade" : index % 4 === 0 ? "whip_pan" : "match_cut",
      asset_type: "graphic",
      metadata_json: JSON.stringify({
        generated_by: "route_a_auto_director",
        route_a_style_id: style.id,
        skill_chain: ROUTE_A_SKILL_CHAIN,
      }),
    };
  });
}

function buildRouteAAutoDirectorResult(project, scenes, style) {
  return {
    video_meta: {
      title: project.title,
      platform: project.platform,
      ratio: "9:16",
      estimated_duration: project.estimated_duration,
      style: style.label,
    },
    premium_video_director: {
      video_style: style.label,
      tone: style.tone,
      pacing: "快节奏",
      visual_rules: style.visual_rules,
      caption_rules: style.caption_rules,
      music_rules: style.music_rules,
      transition_rules: style.transition_rules,
    },
    storyboard: scenes.map((scene) => ({
      scene: scene.scene_index,
      duration: scene.duration,
      purpose: scene.purpose,
      emotion: scene.emotion,
      voice_text: scene.voice_text,
      subtitle: scene.subtitle,
      visual_style: scene.visual_style,
      camera: scene.camera,
      composition: scene.composition,
      image_prompt: scene.image_prompt,
      motion_prompt: scene.motion_prompt,
      bgm: scene.bgm,
      sfx: scene.sfx,
      transition: scene.transition,
      asset_type: scene.asset_type,
      subtitle_style: { highlight_words: [compactTitleText(scene.subtitle).slice(0, 4)].filter(Boolean) },
      notes: "路线 A 自动导演稿，服务于模板快剪 MP4。",
    })),
    aesthetic_review: {
      score: 88,
      summary: "路线 A 自动导演稿已锁定风格、节奏、字幕和混音要求。",
    },
  };
}

function splitTitleLines(value, maxLineLength = 11) {
  const text = compactTitleText(value);
  if (text.length <= maxLineLength) return [text];
  const breakMarks = ["？", "！", "，", "、", "："];
  for (const mark of breakMarks) {
    const index = text.indexOf(mark);
    if (index >= 4 && index < text.length - 2 && index <= maxLineLength + 1) {
      return [text.slice(0, index + 1), text.slice(index + 1)];
    }
  }
  return [text.slice(0, maxLineLength), text.slice(maxLineLength)];
}

function conciseSceneLabel(scene) {
  const title = String(scene.title_text || "").replace(/^(强钩子|展示痛点|提出|解释|总结|CTA|转折)[：:]/, "");
  const text = titleLooksGeneric(title) ? (scene.subtitle_text || scene.narration_text || "") : title;
  return titleClip(text, 11);
}

function routeACtaText(timelineJson = {}) {
  const narration = (timelineJson.scenes || [])
    .map((scene) => scene.subtitle_text || scene.narration_text || "")
    .join("");
  if (/英语|背单词|开口/.test(narration)) return "别再死背，今天就开口练";
  if (/招生|报名|家长|补课|咨询/.test(narration)) return "想少走弯路，先把方法换对";
  if (/赚钱|成交|客户|流量|副业/.test(narration)) return "收藏起来，下一条继续拆解";
  return "收藏起来，下一条继续讲透";
}

function ffmpegEnableBetween(start, end) {
  const safeStart = Math.max(0, Number(start || 0)).toFixed(3);
  const safeEnd = Math.max(Number(safeStart) + 0.2, Number(end || 0)).toFixed(3);
  return `between(t\\,${safeStart}\\,${safeEnd})`;
}

function concatFileList(files) {
  return files.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
}

function renderReport(project, timelineFiles, { mp4Path = "", bgmPath = "", quality = null } = {}) {
  return {
    project_id: project.id,
    output_type: project.output_type,
    ratio: project.ratio,
    resolution: project.resolution,
    fps: project.fps,
    duration: timelineFiles.timelineJson?.duration || project.duration || 0,
    commercial_contract: {
      voiceover: Boolean(timelineFiles.packagedAudio),
      bgm: Boolean(bgmPath),
      bgm_source: timelineFiles.bgmSourceKind || (bgmPath ? "local_auto" : "none"),
      bgm_label: timelineFiles.bgmLabel || "",
      ass_subtitles: Boolean(timelineFiles.assPath),
      title_card: project.output_type === "template_mp4",
      end_cta: project.output_type === "template_mp4",
      cover: Boolean(timelineFiles.coverPath),
      publish_text: true,
      hyperframes_package: Boolean(timelineFiles.hyperframesIndexPath),
      motion_template_version: project.output_type === "template_mp4" ? "route-a-premium-ffmpeg-v5" : "",
      template_background_mode: project.output_type === "template_mp4"
        ? (timelineFiles.packagedTemplateBackground ? "image_asset_dark_blur_motion" : "procedural_premium_motion")
        : "",
    },
    files: {
      mp4: mp4Path ? path.basename(mp4Path) : "",
      final_mp4: fs.existsSync(path.join(timelineFiles.projectDir, "final.mp4")) ? "final.mp4" : "",
      cover: timelineFiles.coverPath ? path.basename(timelineFiles.coverPath) : "",
      timeline: path.basename(timelineFiles.timelinePath || "timeline.json"),
      subtitles_srt: path.basename(timelineFiles.srtPath || "subtitles.srt"),
      subtitles_ass: timelineFiles.assPath ? path.basename(timelineFiles.assPath) : "",
      manifest: path.basename(timelineFiles.manifestPath || "project_manifest.json"),
      hyperframes_index: timelineFiles.hyperframesIndexPath ? path.relative(timelineFiles.projectDir, timelineFiles.hyperframesIndexPath) : "",
      hyperframes_design: timelineFiles.hyperframesDesignPath ? path.relative(timelineFiles.projectDir, timelineFiles.hyperframesDesignPath) : "",
    },
    quality,
    generated_at: new Date().toISOString(),
  };
}

function publicTimelineProject(row, scenes = [], { includeScenes = true } = {}) {
  if (!row) return null;
  const metadata = safeJson(row.metadata_json, {});
  const blockers = stringArray(safeJson(row.blockers_json, []));
  const tracks = safeJson(row.tracks_json, {});
  return {
    ...row,
    project_id: Number(row.id || row.project_id || 0),
    tracks,
    blockers,
    metadata,
    scenes: includeScenes ? scenes.map((scene) => ({
      ...scene,
      metadata: safeJson(scene.metadata_json, {}),
    })) : undefined,
  };
}

export function createVideoProductService({
  baseDir,
  taskStore,
  imageService,
  directorService = null,
  ffmpegPath,
  capcutCliAdapter = null,
  projectCenter = null,
  onProgress = () => {},
  onIdle = () => {},
}) {
  const outputRoot = ensureDir(path.join(baseDir, "video-products"));
  const jianyingTemplatesRoot = ensureDir(path.join(baseDir, "templates", "jianying"));
  const premiumSkillsRoot = path.join(baseDir, ".skills");
  const pending = [];
  let working = false;

  function platformPreset(platformId) {
    return PLATFORM_PRESETS[platformId] || PLATFORM_PRESETS.douyin;
  }

  function listImageAssets(limit = 500) {
    return imageService.getAssets({ limit })
      .filter((asset) => asset.original_path && fs.existsSync(asset.original_path));
  }

  function listDownloadedVideoAssets(limit = 200) {
    const seen = new Set();
    return taskStore.allTasks()
      .filter((task) => task.video_path && fs.existsSync(task.video_path))
      .map((task) => {
        const resolved = path.resolve(task.video_path);
        if (seen.has(resolved)) return null;
        seen.add(resolved);
        return {
          id: task.id,
          title: task.title || task.video_id || path.basename(resolved),
          video_id: task.video_id || "",
          path: resolved,
          filename: path.basename(resolved),
          source_url: task.url || "",
          created_at: task.completed_at || task.updated_at || task.created_at || "",
        };
      })
      .filter(Boolean)
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)));
  }

  function premiumWorkflowSkillStatus() {
    return PREMIUM_WORKFLOW_SKILLS.map((name) => ({
      name,
      path: path.join(".skills", name, "SKILL.md"),
      ready: fs.existsSync(path.join(premiumSkillsRoot, name, "SKILL.md")),
    }));
  }

  function normalizeJianyingTemplateConfig(id, templateDir, config = {}) {
    const defaults = templateDefaults(id);
    const merged = { ...defaults, ...(config && typeof config === "object" ? config : {}) };
    const draftTemplatePath = path.join(templateDir, "draft_template");
    return {
      id,
      name: String(merged.name || defaults.name || id).trim(),
      category: String(merged.category || defaults.category || "自定义模板").trim(),
      ratio: String(merged.ratio || "9:16").trim(),
      resolution: String(merged.resolution || "1080x1920").trim(),
      fps: Number(merged.fps || 30),
      version: Number(merged.version || 1),
      recommendedVideoTypes: stringArray(merged.recommendedVideoTypes),
      recommendedStyles: stringArray(merged.recommendedStyles),
      tags: stringArray(merged.tags),
      hasMaster: hasDirectoryEntries(draftTemplatePath),
      templateRoot: templateDir,
      draftTemplatePath,
    };
  }

  function readJianyingTemplate(templateId) {
    const id = safeTemplateId(templateId);
    const templateDir = path.join(jianyingTemplatesRoot, id);
    const configPath = path.join(templateDir, "template.config.json");
    const config = fs.existsSync(configPath) ? safeJson(fs.readFileSync(configPath, "utf8"), {}) : {};
    return normalizeJianyingTemplateConfig(id, templateDir, config);
  }

  function listJianyingTemplates() {
    const ids = new Set(DEFAULT_JIANYING_TEMPLATES.map((item) => item.id));
    if (fs.existsSync(jianyingTemplatesRoot)) {
      for (const entry of fs.readdirSync(jianyingTemplatesRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) ids.add(safeTemplateId(entry.name));
      }
    }
    return [...ids]
      .map((id) => readJianyingTemplate(id))
      .sort((a, b) => Number(b.hasMaster) - Number(a.hasMaster) || a.category.localeCompare(b.category, "zh-Hans-CN") || a.name.localeCompare(b.name, "zh-Hans-CN"));
  }

  function importJianyingTemplate(input = {}) {
    const sourcePathInput = String(input.sourcePath || input.path || "").trim();
    if (!sourcePathInput) throw new Error("请提供存在的本地剪映模板目录。");
    const sourcePath = path.resolve(sourcePathInput);
    if (!fs.existsSync(sourcePath)) throw new Error("请提供存在的本地剪映模板目录。");
    if (!fs.statSync(sourcePath).isDirectory()) throw new Error("当前先支持导入已解压的模板目录，请把安装包解压后再填写目录路径。");

    const sourceDraftPath = hasDirectoryEntries(path.join(sourcePath, "draft_template"))
      ? path.join(sourcePath, "draft_template")
      : sourcePath;
    if (!hasDirectoryEntries(sourceDraftPath)) throw new Error("模板目录为空，未检测到可复制的剪映母版文件。");

    const id = safeTemplateId(input.id || path.basename(sourcePath));
    const targetDir = path.join(jianyingTemplatesRoot, id);
    if (!isInsideDirectory(jianyingTemplatesRoot, targetDir)) throw new Error("模板 ID 不合法。");
    const targetDraftPath = path.join(targetDir, "draft_template");
    ensureDir(targetDir);
    if (path.resolve(sourceDraftPath) !== path.resolve(targetDraftPath)) {
      fs.rmSync(targetDraftPath, { recursive: true, force: true });
      fs.cpSync(sourceDraftPath, targetDraftPath, { recursive: true, force: true });
    }
    const config = normalizeJianyingTemplateConfig(id, targetDir, {
      id,
      name: String(input.name || templateDefaults(id).name || id).trim(),
      category: String(input.category || templateDefaults(id).category || "自定义模板").trim(),
      ratio: input.ratio || "9:16",
      resolution: input.resolution || "1080x1920",
      fps: Number(input.fps || 30),
      version: Number(input.version || 1),
      recommendedVideoTypes: input.recommendedVideoTypes || templateDefaults(id).recommendedVideoTypes,
      recommendedStyles: input.recommendedStyles || templateDefaults(id).recommendedStyles,
      tags: input.tags || templateDefaults(id).tags,
    });
    writeJson(path.join(targetDir, "template.config.json"), {
      id: config.id,
      name: config.name,
      category: config.category,
      ratio: config.ratio,
      resolution: config.resolution,
      fps: config.fps,
      version: config.version,
      recommendedVideoTypes: config.recommendedVideoTypes,
      recommendedStyles: config.recommendedStyles,
      tags: config.tags,
    });
    return readJianyingTemplate(id);
  }

  function syncDraftToLocalJianying(draftPath, project, templateId = "") {
    const draftPathInput = String(draftPath || "").trim();
    if (!draftPathInput) return "";
    const resolvedDraftPath = path.resolve(draftPathInput);
    if (!hasJianyingDraftFiles(resolvedDraftPath)) return "";
    const status = capcutCliAdapter?.detect?.() || {};
    const draftDirectory = String(status.paths?.draftDirectory || "").trim();
    if (!draftDirectory || !fs.existsSync(draftDirectory) || !fs.statSync(draftDirectory).isDirectory()) return "";
    if (isInsideDirectory(draftDirectory, resolvedDraftPath)) {
      writeJson(path.join(resolvedDraftPath, "codex-import.json"), {
        sourceDraftPath: resolvedDraftPath,
        timelineProjectId: project.id,
        templateId,
        syncedAt: new Date().toISOString(),
        alreadyInJianyingDraftDirectory: true,
      });
      return resolvedDraftPath;
    }
    const targetName = safeFileName(`codex_${project.id}_${templateId || "template"}_${Date.now()}`);
    const targetPath = path.join(draftDirectory, targetName);
    if (!isInsideDirectory(draftDirectory, targetPath)) return "";
    fs.rmSync(targetPath, { recursive: true, force: true });
    copyDirectoryTree(resolvedDraftPath, targetPath, { skip: [".backup"] });
    writeJson(path.join(targetPath, "codex-import.json"), {
      sourceDraftPath: resolvedDraftPath,
      timelineProjectId: project.id,
      templateId,
      syncedAt: new Date().toISOString(),
    });
    return targetPath;
  }

  function collectVisibleDraftSeeds(rootDir, { maxDepth = 2, includeCodex = false } = {}) {
    const seeds = [];
    function visit(dir, depth) {
      if (!dir || depth > maxDepth || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
      if (hasJianyingDraftFiles(dir)) {
        seeds.push(dir);
        return;
      }
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!includeCodex && (/^codex_/i.test(entry.name) || /^Codex/.test(entry.name))) continue;
        visit(path.join(dir, entry.name), depth + 1);
      }
    }
    visit(rootDir, 0);
    return seeds.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    });
  }

  function listDraftSeedCandidates(templateId = "", draftDirectory = "") {
    const primaryCandidates = [];
    const fallbackCandidates = [];
    const push = (value) => {
      const resolved = String(value || "").trim();
      if (resolved) primaryCandidates.push(path.resolve(resolved));
    };
    const pushFallback = (value) => {
      const resolved = String(value || "").trim();
      if (resolved) fallbackCandidates.push(path.resolve(resolved));
    };

    const requestedTemplate = readJianyingTemplate(templateId);
    push(requestedTemplate?.draftTemplatePath);
    for (const template of listJianyingTemplates()) {
      if (template.id !== requestedTemplate?.id) push(template.draftTemplatePath);
    }

    if (draftDirectory && fs.existsSync(draftDirectory)) {
      collectVisibleDraftSeeds(draftDirectory, { maxDepth: 1, includeCodex: false }).forEach(push);
      const recycleBin = path.join(draftDirectory, ".recycle_bin");
      collectVisibleDraftSeeds(recycleBin, { maxDepth: 2, includeCodex: true }).forEach(push);
      collectVisibleDraftSeeds(draftDirectory, { maxDepth: 1, includeCodex: true })
        .filter((seed) => /[\\/]Codex|[\\/]codex_/i.test(seed))
        .forEach(pushFallback);
    }

    return [...new Set([...primaryCandidates, ...fallbackCandidates])].filter(hasJianyingDraftFiles);
  }

  function updateVisibleDraftMeta(targetPath, project, timelineFiles) {
    const metaPath = path.join(targetPath, "draft_meta_info.json");
    if (!fs.existsSync(metaPath)) return;
    let meta = {};
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {
      meta = {};
    }
    const title = safeFileName(
      safeJson(project.metadata_json, {})?.title
      || timelineFiles?.timelineJson?.publish_title
      || `成片 ${project.id}`,
    );
    const now = Date.now() * 1000;
    meta.draft_name = `Codex成片-${project.id}-${title}`.slice(0, 80);
    meta.draft_fold_path = targetPath.replace(/\\/g, "/");
    meta.draft_root_path = path.dirname(targetPath).replace(/\\/g, "/");
    meta.draft_id = cryptoRandomId();
    meta.draft_is_invisible = false;
    meta.tm_draft_create = now;
    meta.tm_draft_modified = now;
    meta.tm_draft_removed = 0;
    if (Number(timelineFiles?.timelineJson?.duration || 0) > 0) {
      meta.tm_duration = Math.round(Number(timelineFiles.timelineJson.duration) * 1000000);
    }
    fs.writeFileSync(metaPath, JSON.stringify(meta), "utf8");
  }

  function cryptoRandomId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
      const value = Math.floor(Math.random() * 16);
      return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
    }).toUpperCase();
  }

  function createVisibleJianyingDraftFallback(project, timelineFiles, templateId = "", reason = "") {
    const status = capcutCliAdapter?.detect?.() || {};
    const draftDirectory = String(status.paths?.draftDirectory || "").trim();
    if (!draftDirectory || !fs.existsSync(draftDirectory) || !fs.statSync(draftDirectory).isDirectory()) {
      return { path: "", warning: "剪映草稿目录未配置，无法写入本地草稿。" };
    }
    const seeds = listDraftSeedCandidates(templateId, draftDirectory);
    if (!seeds.length) {
      return { path: "", warning: "没有找到可复制的真实剪映母版草稿，请先在剪映里保留一个母版草稿或导入模板母版。" };
    }
    const tried = [];
    for (const seed of seeds) {
      const targetName = safeFileName(`codex_${project.id}_${Date.now()}`);
      const targetPath = path.join(draftDirectory, targetName);
      if (!isInsideDirectory(draftDirectory, targetPath)) {
        tried.push(`${seed}: 目标路径不合法`);
        continue;
      }
      try {
        fs.rmSync(targetPath, { recursive: true, force: true });
        copyDirectoryTree(seed, targetPath, { skip: [".backup"] });
        updateVisibleDraftMeta(targetPath, project, timelineFiles);
        if (!hasJianyingDraftFiles(targetPath)) {
          tried.push(`${seed}: 复制后缺少剪映核心草稿文件`);
          fs.rmSync(targetPath, { recursive: true, force: true });
          continue;
        }
        const outputRefDir = path.join(targetPath, "codex-output");
        ensureDir(outputRefDir);
        for (const file of ["capcut-plan.json", "capcut-compile-spec.json", "timeline.json", "subtitles.srt", "subtitles.ass", "project_manifest.json"]) {
          const source = path.join(timelineFiles.projectDir, file);
          if (fs.existsSync(source)) fs.copyFileSync(source, path.join(outputRefDir, file));
        }
        writeJson(path.join(targetPath, "codex-import.json"), {
          mode: "visible_draft_fallback",
          sourceSeedDraftPath: seed,
          outputDir: timelineFiles.projectDir,
          timelineProjectId: project.id,
          templateId,
          reason,
          syncedAt: new Date().toISOString(),
        });
        return {
          path: targetPath,
          seed,
          warning: `capcut-cli 未生成可用草稿，已复制真实剪映母版到本地草稿目录：${targetPath}`,
        };
      } catch (error) {
        tried.push(`${seed}: ${error instanceof Error ? error.message : String(error)}`);
        try {
          fs.rmSync(targetPath, { recursive: true, force: true });
        } catch {
          // Best effort cleanup only.
        }
      }
    }
    return { path: "", warning: `剪映母版草稿复制失败：${tried.join("；")}` };
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function createLocalRouteADirector(audio, input = {}, fallbackReason = "") {
    const style = routeAStyleContract(input);
    const title = routeAAutoTitle(audio, input);
    const estimatedDuration = estimateSpeechDuration(audio?.text || "");
    const scenes = buildRouteAAutoDirectorScenes(audio, input, estimatedDuration);
    const project = taskStore.createDirectorProject({
      task_id: Number(audio?.task_id || input.task_id || 0),
      rewrite_id: Number(audio?.rewrite_id || input.rewrite_id || 0),
      title,
      source_text: String(audio?.text || ""),
      video_type: routeAStylePreset(style.id).videoType,
      visual_style: routeAStylePreset(style.id).directorStyle,
      platform: String(input.platform || "douyin"),
      pace: routeAStylePreset(style.id).pace,
      estimated_duration: estimatedDuration,
      status: "completed",
      score: 88,
      metadata_json: JSON.stringify({
        source_type: "route_a_auto_tts",
        source_key: `tts:${audio?.id || 0}`,
        tts_job_id: Number(audio?.id || 0),
        route_a_auto_director: true,
        route_a_director_mode: "local_skill_fallback",
        route_a_fallback_reason: fallbackReason,
        route_a_style: style,
        scene_count: scenes.length,
        total_duration: estimatedDuration,
        ratio: "9:16",
        skill_chain: ROUTE_A_SKILL_CHAIN,
        result: buildRouteAAutoDirectorResult({
          title,
          platform: String(input.platform || "douyin"),
          estimated_duration: estimatedDuration,
        }, scenes, style),
        error: "",
      }),
    });
    taskStore.replaceDirectorScenes(project.id, scenes);
    return taskStore.getDirectorProject(project.id);
  }

  function enqueueRouteAAiDirector(audio, input = {}) {
    if (!directorService?.enqueue) return { project: null, error: "Director Service 不可用。" };
    const style = routeAStyleContract(input);
    const preset = routeAStylePreset(style.id);
    const result = directorService.enqueue({
      task_id: Number(audio?.task_id || 0),
      rewrite_id: Number(audio?.rewrite_id || 0),
      title: routeAAutoTitle(audio, input),
      source_text: String(audio?.text || ""),
      source_type: "route_a_tts",
      source_key: `tts:${audio?.id || 0}`,
      provider: String(input.director_provider || ""),
      video_type: preset.videoType,
      visual_style: preset.directorStyle,
      platform: String(input.platform || "douyin"),
      pace: preset.pace,
      shot_count: "auto",
      estimated_duration: estimateSpeechDuration(audio?.text || ""),
      tts_duration: 0,
      reference_style: [
        `路线 A 高质量成片风格：${style.label}`,
        `语气：${style.tone}`,
        `视觉规则：${style.visual_rules.join("；")}`,
        `字幕规则：${style.caption_rules.join("；")}`,
        `音乐规则：${style.music_rules.join("；")}`,
        style.custom_style ? `用户补充风格：${style.custom_style}` : "",
        `必须使用 Skills：${ROUTE_A_SKILL_CHAIN.join(" -> ")}`,
      ].filter(Boolean).join("\n"),
      save_reference_style: true,
    });
    if (result?.error) return { project: null, error: result.error };
    return { project: result?.project || null, error: "" };
  }

  function ensureRouteADirectorForEnqueue(input = {}) {
    const outputType = OUTPUT_TYPES.has(String(input.output_type || "")) ? String(input.output_type) : "jianying_template";
    let directorId = Number(input.source_director_project_id || input.director_project_id || 0);
    const audioId = Number(input.audio_asset_id || input.tts_job_id || 0);
    if (outputType !== "template_mp4" || directorId > 0) {
      return { directorId, metadata: {} };
    }
    const audio = taskStore.getTtsJob(audioId);
    if (!audio || audio.status !== "completed" || !audio.audio_path || !fs.existsSync(audio.audio_path)) {
      throw new Error("路线 A 需要先选择一条已完成且可试听的 TTS 音频。");
    }
    const ai = enqueueRouteAAiDirector(audio, input);
    if (ai.project?.id) {
      return {
        directorId: Number(ai.project.id),
        metadata: {
          route_a_auto_director: true,
          route_a_director_mode: "ai_director",
          route_a_director_status: ai.project.status || "waiting",
          source_tts_job_id: audio.id,
        },
      };
    }
    const fallback = createLocalRouteADirector(audio, input, ai.error || "AI 导演未能创建，已使用路线 A 本地 Skills 导演稿。");
    return {
      directorId: Number(fallback.id),
      metadata: {
        route_a_auto_director: true,
        route_a_director_mode: "local_skill_fallback",
        route_a_director_status: "completed",
        route_a_director_fallback_reason: ai.error || "",
        source_tts_job_id: audio.id,
      },
    };
  }

  async function ensureRouteADirectorReady(project, input = {}) {
    if (project.output_type !== "template_mp4") return project;
    const metadata = safeJson(project.metadata_json, {});
    if (!metadata.route_a_auto_director) return project;
    let director = taskStore.getDirectorProject(project.source_director_project_id);
    if (director?.status === "completed") return project;
    const maxWaitMs = 5 * 60 * 1000;
    const startedAt = Date.now();
    while (director && ["waiting", "processing"].includes(director.status) && Date.now() - startedAt < maxWaitMs) {
      updateProject(project.id, {
        status: "binding_assets",
        progress: 12,
        current_step: `正在等待路线 A AI 导演稿完成：Director #${director.id}`,
        metadata_json: JSON.stringify({
          ...metadata,
          route_a_director_status: director.status,
        }),
      });
      await wait(1600);
      director = taskStore.getDirectorProject(project.source_director_project_id);
    }
    if (director?.status === "completed") return taskStore.getTimelineProject(project.id);

    const audio = taskStore.getTtsJob(project.audio_asset_id);
    const reason = director?.status === "failed"
      ? safeJson(director.metadata_json, {})?.error || "AI 导演稿生成失败。"
      : "AI 导演稿等待超时，已使用路线 A 本地 Skills 导演稿。";
    const fallback = createLocalRouteADirector(audio, input, reason);
    return updateProject(project.id, {
      source_director_project_id: fallback.id,
      current_step: "AI 导演稿不可用，已切换到路线 A 本地 Skills 导演稿",
      metadata_json: JSON.stringify({
        ...metadata,
        route_a_director_mode: "local_skill_fallback",
        route_a_director_status: "completed",
        route_a_director_fallback_reason: reason,
        fallback_director_project_id: fallback.id,
      }),
    });
  }

  function listBgmAssets() {
    const roots = [
      path.join(baseDir, "assets", "bgm"),
      path.join(baseDir, "media", "bgm"),
      path.join(baseDir, "bgm"),
    ];
    const extensions = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
    const assets = [];
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      const files = fs.readdirSync(root)
        .map((name) => path.join(root, name))
        .filter((filePath) => fs.statSync(filePath).isFile() && extensions.has(path.extname(filePath).toLowerCase()))
        .sort();
      for (const filePath of files) {
        const stats = fs.statSync(filePath);
        assets.push({
          id: createStableAssetId(filePath),
          path: filePath,
          filename: path.basename(filePath),
          file_size: stats.size,
          created_at: stats.birthtime?.toISOString?.() || stats.mtime?.toISOString?.() || "",
        });
      }
    }
    return assets.sort((a, b) => String(a.filename).localeCompare(String(b.filename)));
  }

  function findBgmAsset() {
    return listBgmAssets()[0]?.path || "";
  }

  function scoreBgmAsset(asset, styleId = ROUTE_A_DEFAULT_STYLE_ID) {
    const preset = routeAStylePreset(styleId);
    const haystack = `${asset.filename || ""} ${asset.path || ""}`.toLowerCase();
    let score = 0;
    for (const keyword of preset.bgmKeywords || []) {
      if (haystack.includes(String(keyword).toLowerCase())) score += 8;
    }
    if (/bgm|music|loop|背景|音乐/i.test(haystack)) score += 2;
    if (/default|generated|tts/i.test(haystack)) score -= 2;
    return score;
  }

  function selectBgmAsset({ preferredId = "", strategy = "none", styleId = ROUTE_A_DEFAULT_STYLE_ID } = {}) {
    const assets = listBgmAssets();
    const preferred = preferredId
      ? assets.find((asset) => String(asset.id) === String(preferredId) || path.resolve(asset.path) === path.resolve(String(preferredId)))
      : null;
    if (preferred) return { path: preferred.path, source: "manual", label: preferred.filename, asset: preferred };
    if (strategy === "manual" || strategy === "none") return { path: "", source: "none", label: "", asset: null };
    if (strategy === "generated_default") return { path: "", source: "generated_default", label: "generated_default", asset: null };
    if (assets.length) {
      const selected = assets
        .map((asset) => ({ asset, score: scoreBgmAsset(asset, styleId) }))
        .sort((a, b) => b.score - a.score || String(a.asset.filename).localeCompare(String(b.asset.filename)))[0]?.asset;
      if (selected) return { path: selected.path, source: "local_auto", label: selected.filename, asset: selected };
    }
    return { path: "", source: "none", label: "", asset: null };
  }

  function writeDefaultBgmWav(outputPath, durationSeconds, styleId = ROUTE_A_DEFAULT_STYLE_ID) {
    const preset = routeAStylePreset(styleId);
    const sampleRate = 44100;
    const duration = Math.max(1, Math.min(600, Number(durationSeconds || 0) || 30));
    const sampleCount = Math.ceil(sampleRate * duration);
    const dataSize = sampleCount * 2;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);

    const tonalMap = {
      black_gold_knowledge: { tones: [110, 165, 220], bpm: 92, hit: 74 },
      clean_education: { tones: [147, 196, 247], bpm: 86, hit: 92 },
      tech_info: { tones: [130.81, 196, 261.63], bpm: 104, hit: 82 },
      enrollment_ad: { tones: [98, 146.83, 196], bpm: 112, hit: 68 },
    };
    const music = tonalMap[routeAStyleId(styleId)] || tonalMap.black_gold_knowledge;
    const tones = music.tones;
    const beat = 60 / music.bpm;
    const halfBeat = beat / 2;
    for (let index = 0; index < sampleCount; index += 1) {
      const t = index / sampleRate;
      const fadeIn = Math.min(1, t / 1.5);
      const fadeOut = Math.min(1, (duration - t) / 1.8);
      const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
      const beatPhase = t % beat;
      const halfPhase = t % halfBeat;
      const kick = beatPhase < 0.18
        ? Math.sin(2 * Math.PI * (music.hit + 42 * (1 - beatPhase / 0.18)) * t) * Math.exp(-beatPhase * 16) * 0.36
        : 0;
      const tickNoise = Math.sin((index + 1) * 12.9898) * 43758.5453;
      const tick = halfPhase < 0.028
        ? (tickNoise - Math.floor(tickNoise) - 0.5) * Math.exp(-halfPhase * 105) * 0.08
        : 0;
      const introHit = t < 0.42
        ? Math.sin(2 * Math.PI * (music.hit * 1.7 - t * 60) * t) * Math.exp(-t * 6.5) * 0.34
        : 0;
      const transitionLift = Math.sin(2 * Math.PI * (1 / Math.max(beat * 4, 1)) * t) * 0.025;
      const value = (
        Math.sin(2 * Math.PI * tones[0] * t) * 0.11
        + Math.sin(2 * Math.PI * tones[1] * t) * 0.055
        + Math.sin(2 * Math.PI * tones[2] * t) * 0.03
        + transitionLift
        + kick
        + tick
        + introHit
      ) * envelope;
      const sample = Math.max(-1, Math.min(1, value)) * 32767;
      buffer.writeInt16LE(Math.round(sample), 44 + index * 2);
    }
    fs.writeFileSync(outputPath, buffer);
    return {
      path: outputPath,
      source: "generated_default",
      label: `${preset.label} · 系统默认基础 BGM`,
    };
  }

  function importBgmAsset(filePath) {
    const resolved = path.resolve(String(filePath || "").trim());
    if (!resolved || !fs.existsSync(resolved)) throw new Error("请选择存在的本地音乐文件。");
    const ext = path.extname(resolved).toLowerCase();
    const supported = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
    if (!supported.has(ext)) throw new Error("暂只支持 MP3、WAV、M4A、AAC、OGG 背景音乐。");
    const bgmDir = ensureDir(path.join(baseDir, "assets", "bgm"));
    const filename = `bgm_local_${Date.now()}_${safeFileName(path.basename(resolved, ext))}${ext}`;
    const outputPath = path.join(bgmDir, filename);
    fs.copyFileSync(resolved, outputPath);
    const stats = fs.statSync(outputPath);
    return {
      id: createStableAssetId(outputPath),
      path: outputPath,
      filename,
      file_size: stats.size,
    };
  }

  function sourceProject(row, { includeScenes = true } = {}) {
    if (!row) return null;
    return publicTimelineProject(row, taskStore.listTimelineScenes(row.id), { includeScenes });
  }

  function listSources() {
    const directors = taskStore.listDirectorProjects({ limit: 200 })
      .filter((project) => project.status === "completed")
      .map((project) => {
        const metadata = safeJson(project.metadata_json, {});
        return {
          ...project,
          scene_count: Number(metadata.scene_count || taskStore.listDirectorScenes(project.id).length || 0),
          ratio: metadata.ratio || platformPreset(project.platform).ratio,
        };
      });
    const audioJobs = taskStore.listTtsJobs({ limit: 200 })
      .filter((job) => job.status === "completed" && job.audio_path && fs.existsSync(job.audio_path))
      .map((job) => ({
        ...job,
        label: `${job.voice_name || job.voice_id || job.provider} · #${job.id}`,
      }));
    const imageAssets = listImageAssets(500);
    const downloadedVideos = listDownloadedVideoAssets(200);
    const bgmAssets = listBgmAssets();
    const jianyingTemplates = listJianyingTemplates();
    return {
      directors,
      audioJobs,
      imageAssets,
      downloadedVideos,
      bgmAssets,
      jianyingTemplates,
      routeAStyles: Object.entries(ROUTE_A_STYLE_PRESETS).map(([id, preset]) => ({
        id,
        label: preset.label,
        tone: preset.tone,
        visual_rules: preset.visualRules,
        bgm_keywords: preset.bgmKeywords,
      })),
      bgmStrategies: [
        { id: "none", label: "不使用 BGM", description: "默认选项；没有手动选择音乐时，不向剪映草稿写入背景音乐。" },
        { id: "auto", label: "自动匹配", description: "手动选择优先；未选时按风格匹配本地 BGM；本地没有时生成基础氛围 BGM。" },
        { id: "manual", label: "手动本地 BGM", description: "只使用下方指定的本地 BGM，适合已经有授权音乐的成片。" },
        { id: "local_auto", label: "本地库自动匹配", description: "根据路线 A 风格从本地 BGM 库自动选择，找不到时再基础生成。" },
        { id: "generated_default", label: "基础氛围生成", description: "不调用付费 API，生成简单节奏垫，报告会标记 generated_default。" },
      ],
      bgmProviderSuggestions: [
        { id: "jamendo", label: "Jamendo", status: "planned", note: "可接免费/授权音乐 API，后续需要用户自己的 API 凭据和授权策略。" },
        { id: "freesound", label: "Freesound", status: "planned", note: "更适合音效素材，后续可接 OAuth/API Token 并按许可证筛选。" },
        { id: "pixabay", label: "Pixabay", status: "planned", note: "可作为免版税素材来源候选，接入前需要确认音乐接口和授权范围。" },
      ],
      timelines: taskStore.listTimelineProjects({ limit: 50 }).map((row) => sourceProject(row, { includeScenes: false })),
      platforms: Object.entries(PLATFORM_PRESETS).map(([id, value]) => ({ id, ...value })),
      outputTypes: Object.entries(OUTPUT_TYPE_LABELS).map(([id, label]) => ({ id, label })),
    };
  }

  function findTemplateBackgroundAsset({ directorId = 0, ratio = "9:16" } = {}) {
    const assets = listImageAssets(200)
      .filter((asset) => asset.original_path && fs.existsSync(asset.original_path))
      .filter((asset) => !ratio || !asset.aspect_ratio || asset.aspect_ratio === ratio);
    const directorScoped = assets.find((asset) => (
      asset.source_type === "director" && String(asset.source_id || "").startsWith(`${directorId}:`)
    ));
    return directorScoped || assets[0] || null;
  }

  function selectImagesForScenes({ directorId, imageSource = "director", selectedImageIds = [], manualBindings = {} } = {}) {
    const all = listImageAssets(500);
    const selectedSet = new Set((Array.isArray(selectedImageIds) ? selectedImageIds : [])
      .map((id) => String(id || ""))
      .filter(Boolean));
    const selected = selectedSet.size ? all.filter((asset) => selectedSet.has(String(asset.id))) : all;
    const directorScoped = selected.filter((asset) => String(asset.source_id || "").startsWith(`${directorId}:`));
    const pool = imageSource === "director" && directorScoped.length ? directorScoped : selected;
    return { pool, all, directorScoped, manualBindings };
  }

  function imageAssetSceneIndex(asset = {}) {
    const sourceMatch = String(asset.source_id || "").match(/:(\d{1,3})$/);
    if (sourceMatch) return Number(sourceMatch[1] || 0);
    const explicit = Number(asset.scene_index || asset.sceneIndex || 0);
    if (explicit > 0) return explicit;
    const name = `${asset.filename || ""} ${asset.source_url || ""} ${asset.original_path || ""}`;
    const basename = path.basename(name);
    const patterns = [
      /^0*(\d{1,3})(?:[._\-\s]|$)/,
      /(?:^|[._\-\s#])0*(\d{1,3})(?:[._\-\s]|$)/,
      /(?:scene|shot|jing|fenjing|s|img|image)[._\-\s#]*0*(\d{1,3})(?:[._\-\s.]|$)/i,
      /(?:场景|镜头|分镜|第)[._\-\s#]*0*(\d{1,3})(?:[._\-\s号张.]|$)/,
    ];
    for (const pattern of patterns) {
      const found = basename.match(pattern);
      const number = Number(found?.[1] || 0);
      if (number > 0) return number;
    }
    const match = path.basename(name).match(/^(?:scene|shot|镜头|分镜|第)?[_\-\s]*(\d{1,3})(?:[_\-\s.]|$)|(?:scene|shot|镜头|分镜|第)[_\-\s]*(\d{1,3})/i);
    return Number(match?.[1] || match?.[2] || 0);
  }

  function bindSceneImage(scene, index, bindingContext) {
    const manualAssetId = String(bindingContext.manualBindings?.[scene.scene_index] || bindingContext.manualBindings?.[index + 1] || "");
    if (manualAssetId) {
      const manual = bindingContext.all.find((asset) => String(asset.id) === manualAssetId);
      if (manual) return manual;
    }
    const exact = bindingContext.pool.find((asset) => String(asset.source_id || "") === `${bindingContext.directorId}:${scene.scene_index}`);
    if (exact) return exact;
    const bySceneIndex = bindingContext.pool.find((asset) => imageAssetSceneIndex(asset) === Number(scene.scene_index || index + 1));
    if (bySceneIndex) return bySceneIndex;
    const byAssetOrder = bindingContext.pool.find((asset) => Number(asset.asset_order || asset.assetOrder || 0) === Number(scene.scene_index || index + 1));
    if (byAssetOrder) return byAssetOrder;
    return bindingContext.pool[index % Math.max(1, bindingContext.pool.length)] || null;
  }

  async function buildTimeline(input = {}) {
    const directorId = Number(input.source_director_project_id || input.director_project_id || 0);
    const audioAssetId = Number(input.audio_asset_id || input.tts_job_id || 0);
    const outputType = OUTPUT_TYPES.has(String(input.output_type || "")) ? String(input.output_type) : "jianying_template";
    const needsImages = IMAGE_REQUIRED_OUTPUT_TYPES.has(outputType);
    const needsDownloadedVideo = outputType === "mix_mp4";
    let director = taskStore.getDirectorProject(directorId);
    const audio = taskStore.getTtsJob(audioAssetId);
    const platformId = String(input.platform || director?.platform || "douyin");
    const platform = platformPreset(platformId);
    const blockers = [];

    if (!audio || audio.status !== "completed" || !audio.audio_path || !fs.existsSync(audio.audio_path)) {
      blockers.push("缺少已生成的 TTS 音频。");
    }

    let directorScenes = director ? taskStore.listDirectorScenes(director.id) : [];
    let routeAAutoPreview = false;
    if (outputType === "template_mp4" && (!director || director.status !== "completed") && audio && audio.status === "completed") {
      const style = routeAStyleContract(input);
      directorScenes = buildRouteAAutoDirectorScenes(audio, input, 0);
      director = {
        id: 0,
        task_id: audio.task_id || 0,
        rewrite_id: audio.rewrite_id || 0,
        title: routeAAutoTitle(audio, input),
        source_text: audio.text || "",
        platform: platformId,
        status: "completed",
        metadata_json: JSON.stringify({
          route_a_auto_preview: true,
          route_a_style: style,
          skill_chain: ROUTE_A_SKILL_CHAIN,
        }),
      };
      routeAAutoPreview = true;
    }
    if (!director || director.status !== "completed") blockers.push("缺少已完成的 AI 导演项目。");
    if (!directorScenes.length) blockers.push("导演项目没有可用镜头列表。");
    const audioBinding = director && audio
      ? audioDirectorBinding(director, audio, directorScenes)
      : { accepted: false, score: 0, reason: "缺少导演稿或音频，无法绑定。" };
    if (outputType === "template_mp4" && director && audio && !audioBinding.accepted) {
      blockers.push(`路线 A 已阻止随机音频匹配：${audioBinding.reason}`);
    }

    const imageSource = String(input.image_source || "director");
    const selectedImageIds = Array.isArray(input.image_asset_ids) ? input.image_asset_ids : [];
    const manualBindings = safeJson(input.manual_bindings, input.manual_bindings || {});
    const bindingContext = {
      directorId,
      ...selectImagesForScenes({ directorId, imageSource, selectedImageIds, manualBindings }),
    };
    if (needsImages && !bindingContext.pool.length) blockers.push("缺少可绑定的 AI 图片素材。");

    const downloadedVideos = needsDownloadedVideo ? listDownloadedVideoAssets(200) : [];
    if (needsDownloadedVideo && !downloadedVideos.length) blockers.push("缺少可用于混剪的已下载视频素材。");

    const audioDuration = await probeMediaDuration(ffmpegPath, audio?.audio_path || "");
    const routeASubtitleScenes = outputType === "template_mp4"
      ? buildRouteASubtitleScenes({
        audioText: audio?.text || "",
        directorScenes,
        targetDuration: audioDuration,
      })
      : [];
    const timelineSourceScenes = routeASubtitleScenes.length ? routeASubtitleScenes : directorScenes;
    const routeAIntroSeconds = outputType === "template_mp4" && routeASubtitleScenes.length ? ROUTE_A_INTRO_SECONDS : 0;
    const rawDurations = timelineSourceScenes.map(normalizeSceneDuration);
    const rawTotal = rawDurations.reduce((sum, value) => sum + value, 0) || directorScenes.length * 3;
    const speechTargetDuration = audioDuration > 0 ? audioDuration : rawTotal;
    const timelineTargetDuration = speechTargetDuration + routeAIntroSeconds;
    const scale = rawTotal > 0 ? speechTargetDuration / rawTotal : 1;

    let cursor = routeAIntroSeconds;
    const scenes = timelineSourceScenes.map((scene, index) => {
      const image = needsImages ? bindSceneImage(scene, index, bindingContext) : null;
      const video = needsDownloadedVideo ? downloadedVideos[index % Math.max(1, downloadedVideos.length)] : null;
      const isLastScene = index === timelineSourceScenes.length - 1;
      const speechCursor = Math.max(0, cursor - routeAIntroSeconds);
      const duration = isLastScene
        ? Number(Math.max(0.75, speechTargetDuration - speechCursor).toFixed(3))
        : Number(Math.max(0.75, rawDurations[index] * scale).toFixed(3));
      const start = Number(cursor.toFixed(3));
      cursor += duration;
      const end = Number((isLastScene ? routeAIntroSeconds + speechTargetDuration : cursor).toFixed(3));
      cursor = end;
      const status = (needsImages && !image) || (needsDownloadedVideo && !video) ? "blocked" : "ready";
      return {
        scene_index: scene.scene_index || index + 1,
        narration_text: scene.voice_text || "",
        subtitle_text: scene.subtitle || scene.voice_text || "",
        start_time: start,
        end_time: end,
        duration,
        image_asset_id: image?.id || "",
        image_path: image?.original_path || "",
        motion_type: scene.motion_prompt || scene.camera || "slow_push_in",
        transition_type: scene.transition || "straight_cut",
        title_text: scene.purpose || `Scene ${index + 1}`,
        visual_prompt: scene.image_prompt || "",
        status,
        metadata_json: JSON.stringify({
          director_scene_id: scene.id,
          purpose: scene.purpose || "",
          emotion: scene.emotion || "",
          asset_type: scene.asset_type || "",
          alignment_source: routeASubtitleScenes.length ? "tts_text_sentence_chunks" : "director_scene_duration_scaled",
          image_prompt: scene.image_prompt || "",
          output_type: outputType,
          image_source: image ? {
            id: image.id,
            source_type: image.source_type,
            source_id: image.source_id,
            prompt: image.prompt,
          } : null,
          video_source: video ? {
            id: video.id,
            title: video.title,
            path: video.path,
            filename: video.filename,
            source_url: video.source_url,
          } : null,
        }),
      };
    });

    const missingImages = scenes.filter((scene) => !scene.image_path).map((scene) => scene.scene_index);
    if (needsImages && missingImages.length) blockers.push(`缺少镜头图片：${missingImages.join("、")}。`);

    const tracks = {
      video: scenes.map((scene) => ({
        scene_index: scene.scene_index,
        source: safeJson(scene.metadata_json, {})?.video_source?.path || scene.image_path || "",
        start: scene.start_time,
        duration: scene.duration,
        motion: scene.motion_type,
        transition: scene.transition_type,
      })),
      audio: audio?.audio_path ? [{
        asset_id: audio.id,
        source: audio.audio_path,
        start: routeAIntroSeconds,
        duration: speechTargetDuration,
      }] : [],
      subtitles: scenes.map((scene) => ({
        scene_index: scene.scene_index,
        text: scene.subtitle_text,
        start: scene.start_time,
        duration: scene.duration,
      })),
    };

    return {
      director,
      audio,
      platform,
      duration: Number((scenes.at(-1)?.end_time || timelineTargetDuration || 0).toFixed(3)),
      tracks,
      scenes,
      blockers,
      metadata: {
        output_type: outputType,
        route_label: OUTPUT_TYPE_LABELS[outputType] || outputType,
        image_source: imageSource,
        selected_image_count: selectedImageIds.length,
        available_image_count: bindingContext.pool.length,
        downloaded_video_count: downloadedVideos.length,
        audio_duration: Number(audioDuration.toFixed(3)),
        route_a_intro_seconds: routeAIntroSeconds,
        route_a_style_id: routeAStyleId(input.route_a_style_id || input.style_id),
        route_a_style: routeAStyleContract(input),
        route_a_bgm_strategy: String(input.bgm_strategy || "none"),
        route_a_bgm_asset_id: String(input.bgm_asset_id || ""),
        route_a_auto_preview: routeAAutoPreview,
        route_a_skill_chain: ROUTE_A_SKILL_CHAIN,
        director_scene_count: directorScenes.length,
        timeline_scene_count: scenes.length,
        alignment_source: routeASubtitleScenes.length ? "tts_text_sentence_chunks" : "director_scene_duration_scaled",
        audio_binding: audioBinding,
        premium_workflow_skills: premiumWorkflowSkillStatus(),
      },
    };
  }

  function updateProject(id, changes) {
    const project = taskStore.updateTimelineProject(id, changes);
    onProgress({ domain: "video-product", projectId: Number(id), project: sourceProject(project) });
    return project;
  }

  function htmlEscape(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function scriptJson(value) {
    return JSON.stringify(value)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function cssHex(value, fallback = "#0b111c") {
    const raw = String(value || "").trim();
    if (/^0x[0-9a-f]{6}$/i.test(raw)) return `#${raw.slice(2)}`;
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    return fallback;
  }

  function relativeMediaPath(fromDir, filePath) {
    if (!filePath) return "";
    return path.relative(fromDir, filePath).replace(/\\/g, "/");
  }

  function writeHyperframesPackage(project, timelineFiles) {
    if (project.output_type !== "template_mp4") return null;
    const hyperframesDir = ensureDir(path.join(timelineFiles.projectDir, "hyperframes"));
    const style = timelineFiles.timelineJson.route_a_style || routeAStyleContract(safeJson(project.metadata_json, {}));
    const preset = routeAStylePreset(style.id);
    const palette = style.palette || preset.palette || ROUTE_A_STYLE_PRESETS[ROUTE_A_DEFAULT_STYLE_ID].palette;
    const { width, height } = parseResolution(project.resolution);
    const duration = Math.max(1, Number(timelineFiles.timelineJson.duration || project.duration || 0));
    const publishTitle = String(timelineFiles.timelineJson.publish_title || timelineFiles.timelineJson.name || "路线 A 成片");
    const bg = cssHex(palette.background, "#07101B");
    const panel = cssHex(palette.panel, "#101827");
    const accent = cssHex(palette.accent, "#E7C76C");
    const accent2 = cssHex(palette.accent2, "#49D6C8");
    const fg = cssHex(palette.text, "#FFFFFF");
    const muted = cssHex(palette.muted, "#AAB7C7");
    const voiceTrack = timelineFiles.timelineJson.tracks?.audio?.[0] || {};
    const sceneData = timelineFiles.packagedScenes.map((scene, index) => ({
      id: `scene-${index + 1}`,
      index: index + 1,
      start: Number(scene.start_time || 0),
      end: Number(scene.end_time || 0),
      duration: Number(scene.duration || 0),
      title: conciseSceneLabel(scene),
      caption: String(scene.subtitle_text || scene.narration_text || "").trim(),
      image: relativeMediaPath(hyperframesDir, scene.packaged_image_path || ""),
      motion: scene.motion_type || "template_caption",
      transition: scene.transition_type || "push_slide",
    }));
    const routeData = {
      composition_id: "route-a",
      title: publishTitle,
      duration,
      width,
      height,
      style: {
        id: style.id,
        label: style.label,
        tone: style.tone,
        palette: { bg, panel, accent, accent2, fg, muted },
        visual_rules: style.visual_rules,
        caption_rules: style.caption_rules,
      },
      audio: {
        voiceover: relativeMediaPath(hyperframesDir, timelineFiles.packagedAudio),
        voice_start: Number(voiceTrack.start || 0),
        bgm: relativeMediaPath(hyperframesDir, timelineFiles.packagedBgm),
        bgm_source: timelineFiles.bgmSourceKind || "none",
      },
      background: relativeMediaPath(hyperframesDir, timelineFiles.packagedTemplateBackground),
      scenes: sceneData,
    };

    const dataPath = writeJson(path.join(hyperframesDir, "route-a-data.json"), routeData);
    const designPath = path.join(hyperframesDir, "DESIGN.md");
    fs.writeFileSync(designPath, [
      "# Route A HyperFrames Design",
      "",
      `Style: ${style.label}`,
      `Tone: ${style.tone}`,
      "",
      "## Colors",
      `- Background: ${bg}`,
      `- Panel: ${panel}`,
      `- Accent: ${accent}`,
      `- Secondary Accent: ${accent2}`,
      `- Text: ${fg}`,
      `- Muted: ${muted}`,
      "",
      "## Typography",
      "- Display/body: Microsoft YaHei / PingFang SC with heavy display weights.",
      "- Captions use large vertical-video safe margins, black stroke, and accent keyword emphasis.",
      "",
      "## Motion Rules",
      "- Every scene has entrance animation.",
      "- Scene changes use consistent wipe or flash transitions.",
      "- Voiceover is the master clock; captions follow timeline.json.",
      "",
      "## What NOT to Do",
      "- Do not create random visuals.",
      "- Do not use unreadable tiny subtitles.",
      "- Do not let BGM overpower voiceover.",
      "- Do not render as static PPT.",
      "",
    ].join("\n"), "utf8");

    const sceneMarkup = sceneData.map((scene) => `
      <section id="${scene.id}" class="scene" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="1">
        ${scene.image ? `<img class="scene-image" src="${htmlEscape(scene.image)}" alt="" crossorigin="anonymous" />` : ""}
        <div class="scene-shade"></div>
        <div class="scene-content">
          <div class="kicker">SHOT ${String(scene.index).padStart(2, "0")}</div>
          <h2>${htmlEscape(scene.title)}</h2>
          <p>${htmlEscape(scene.caption)}</p>
        </div>
      </section>
      ${scene.index < sceneData.length ? `<div id="transition-${scene.index}" class="transition-strip" data-start="${Math.max(0, scene.end - 0.22).toFixed(3)}" data-duration="0.36" data-track-index="8"></div>` : ""}
    `).join("\n");

    const indexPath = path.join(hyperframesDir, "index.html");
    fs.writeFileSync(indexPath, `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(publishTitle)}</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: ${bg}; color: ${fg}; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; }
    [data-composition-id="route-a"] { position: relative; overflow: hidden; width: ${width}px; height: ${height}px; background: ${bg}; }
    .base-bg { position: absolute; inset: 0; background: radial-gradient(circle at 18% 12%, ${accent}44, transparent 34%), radial-gradient(circle at 80% 78%, ${accent2}2e, transparent 30%), ${bg}; }
    .grid { position: absolute; inset: 0; opacity: 0.13; background-image: linear-gradient(${fg}10 1px, transparent 1px), linear-gradient(90deg, ${fg}10 1px, transparent 1px); background-size: 54px 54px; }
    .scene { position: absolute; inset: 0; overflow: hidden; background: ${bg}; }
    .scene-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(0.86) contrast(1.05) brightness(0.58); transform: scale(1.06); }
    .scene-shade { position: absolute; inset: 0; background: linear-gradient(180deg, ${bg}ee 0%, ${bg}99 42%, ${bg}f2 100%); }
    .scene-content { position: relative; z-index: 2; box-sizing: border-box; width: 100%; height: 100%; padding: 176px 86px 240px; display: flex; flex-direction: column; justify-content: center; gap: 28px; }
    .kicker { width: fit-content; padding: 10px 18px; border: 1px solid ${accent}99; color: ${accent}; background: ${panel}dd; border-radius: 999px; font-size: 28px; font-weight: 800; letter-spacing: 0.08em; }
    h1, h2, p { margin: 0; }
    .title-card { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; justify-content: center; gap: 28px; padding: 180px 84px 260px; box-sizing: border-box; background: linear-gradient(180deg, ${bg} 0%, ${panel} 100%); }
    .title-card h1 { font-size: 86px; line-height: 1.08; font-weight: 900; color: ${fg}; text-wrap: balance; }
    .title-card span { color: ${accent}; font-size: 32px; font-weight: 900; }
    h2 { max-width: 910px; font-size: 76px; line-height: 1.08; font-weight: 900; color: ${accent}; text-wrap: balance; }
    p { max-width: 910px; padding: 24px 28px; border: 1px solid ${fg}1f; border-radius: 24px; background: ${panel}dd; color: ${fg}; font-size: 54px; line-height: 1.28; font-weight: 800; box-shadow: 0 24px 80px rgba(0,0,0,0.36); }
    .brand-bar { position: absolute; left: 72px; right: 72px; bottom: 78px; z-index: 9; height: 72px; border-top: 1px solid ${fg}20; display: flex; align-items: center; justify-content: space-between; color: ${muted}; font-size: 24px; font-weight: 700; }
    .progress { position: absolute; left: 0; right: 0; bottom: 0; z-index: 12; height: 16px; background: ${fg}12; }
    .progress i { display: block; width: 100%; height: 100%; background: ${accent}; transform-origin: left center; transform: scaleX(0); }
    .transition-strip { position: absolute; top: 0; bottom: 0; left: -18%; width: 38%; z-index: 10; background: linear-gradient(90deg, transparent, ${accent}, ${accent2}, transparent); transform: skewX(-12deg) translateX(-120%); filter: blur(1px); }
    .final-fade { position: absolute; inset: 0; z-index: 20; pointer-events: none; background: ${bg}; opacity: 0; }
  </style>
</head>
<body>
  <div id="route-a-root" data-composition-id="route-a" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}">
    <div class="base-bg"></div>
    <div class="grid"></div>
    <div class="title-card" data-start="0" data-duration="${Math.min(1.35, duration).toFixed(3)}" data-track-index="3">
      <span>${htmlEscape(style.label || "路线 A")}</span>
      <h1>${htmlEscape(publishTitle)}</h1>
    </div>
${sceneMarkup}
    <div class="brand-bar"><span>AI Director Timeline</span><span>Voice First Mix</span></div>
    <div class="progress"><i id="progress-fill"></i></div>
    <div id="final-fade" class="final-fade"></div>
    ${routeData.audio.voiceover ? `<audio id="voiceover" data-start="${routeData.audio.voice_start}" data-duration="${Math.max(0.1, duration - routeData.audio.voice_start).toFixed(3)}" data-track-index="20" src="${htmlEscape(routeData.audio.voiceover)}" data-volume="1"></audio>` : ""}
    ${routeData.audio.bgm ? `<audio id="bgm" data-start="0" data-duration="${duration}" data-track-index="21" src="${htmlEscape(routeData.audio.bgm)}" data-volume="0.12"></audio>` : ""}
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    var DATA = ${scriptJson(routeData)};
    var tl = gsap.timeline({ paused: true });
    tl.from(".title-card span", { y: 34, opacity: 0, duration: 0.42, ease: "power3.out" }, 0.15);
    tl.from(".title-card h1", { y: 52, opacity: 0, scale: 0.96, duration: 0.58, ease: "expo.out" }, 0.28);
    tl.to("#progress-fill", { scaleX: 1, duration: DATA.duration, ease: "none" }, 0);
    DATA.scenes.forEach(function(scene) {
      var start = scene.start + 0.12;
      tl.from("#" + scene.id + " .scene-image", { scale: 1.16, opacity: 0.72, duration: Math.max(0.8, scene.duration), ease: "sine.out" }, scene.start);
      tl.from("#" + scene.id + " .kicker", { y: 34, opacity: 0, duration: 0.36, ease: "power2.out" }, start);
      tl.from("#" + scene.id + " h2", { x: -44, opacity: 0, scale: 0.97, duration: 0.48, ease: "expo.out" }, start + 0.08);
      tl.from("#" + scene.id + " p", { y: 42, opacity: 0, scale: 0.98, duration: 0.45, ease: "back.out(1.35)" }, start + 0.18);
      if (scene.index < DATA.scenes.length) {
        tl.fromTo("#transition-" + scene.index, { xPercent: -120 }, { xPercent: 330, duration: 0.32, ease: "power4.inOut" }, Math.max(0, scene.end - 0.2));
      }
    });
    tl.to("#final-fade", { opacity: 0.84, duration: 0.55, ease: "power1.inOut" }, Math.max(0, DATA.duration - 0.58));
    window.__timelines["route-a"] = tl;
  </script>
</body>
</html>
`, "utf8");

    return { hyperframesDir, indexPath, designPath, dataPath };
  }

  function writeTimelineFiles(project, timeline) {
    const baseName = `${project.id}_${safeFileName(timeline.director?.title || "video-product")}`;
    const projectDir = ensureDir(project.output_dir || path.join(outputRoot, baseName));
    const mediaDir = ensureDir(path.join(projectDir, "media"));
    const imageDir = ensureDir(path.join(mediaDir, "images"));
    const audioDir = ensureDir(path.join(mediaDir, "audio"));
    const videoDir = ensureDir(path.join(mediaDir, "videos"));
    const projectMetadata = safeJson(project.metadata_json, {});
    const routeAStyle = routeAStyleId(timeline.metadata?.route_a_style_id || projectMetadata.route_a_style_id);

    const packagedScenes = timeline.scenes.map((scene) => {
      const sceneMetadata = safeJson(scene.metadata_json, {});
      let packagedImage = "";
      if (scene.image_path && fs.existsSync(scene.image_path)) {
        const ext = path.extname(scene.image_path) || ".png";
        packagedImage = path.join(imageDir, `scene_${String(scene.scene_index).padStart(2, "0")}${ext}`);
        fs.copyFileSync(scene.image_path, packagedImage);
      }
      let packagedVideo = "";
      const sourceVideoPath = sceneMetadata.video_source?.path || "";
      if (sourceVideoPath && fs.existsSync(sourceVideoPath)) {
        const ext = path.extname(sourceVideoPath) || ".mp4";
        packagedVideo = path.join(videoDir, `scene_${String(scene.scene_index).padStart(2, "0")}${ext}`);
        fs.copyFileSync(sourceVideoPath, packagedVideo);
      }
      return {
        ...scene,
        packaged_image_path: packagedImage,
        packaged_video_path: packagedVideo,
      };
    });

    let packagedAudio = "";
    if (timeline.audio?.audio_path && fs.existsSync(timeline.audio.audio_path)) {
      const ext = path.extname(timeline.audio.audio_path) || ".mp3";
      packagedAudio = path.join(audioDir, `voiceover${ext}`);
      fs.copyFileSync(timeline.audio.audio_path, packagedAudio);
    }
    let packagedBgm = "";
    let bgmSourceKind = "none";
    let bgmLabel = "";
    const bgmSelection = selectBgmAsset({
      preferredId: projectMetadata.bgm_asset_id || timeline.metadata?.route_a_bgm_asset_id || "",
      strategy: projectMetadata.bgm_strategy || timeline.metadata?.route_a_bgm_strategy || "none",
      styleId: routeAStyle,
    });
    if (bgmSelection.source === "generated_default") {
      const generatedPath = path.join(audioDir, "bgm_generated_default.wav");
      const generated = writeDefaultBgmWav(generatedPath, timeline.duration, routeAStyle);
      bgmSelection.path = generated.path;
      bgmSelection.label = generated.label;
    }
    if (bgmSelection.path && fs.existsSync(bgmSelection.path)) {
      const ext = path.extname(bgmSelection.path) || ".mp3";
      packagedBgm = path.join(audioDir, `bgm${ext}`);
      fs.copyFileSync(bgmSelection.path, packagedBgm);
      bgmSourceKind = bgmSelection.source || "local_auto";
      bgmLabel = bgmSelection.label || path.basename(bgmSelection.path);
    }
    let packagedTemplateBackground = "";
    if (project.output_type === "template_mp4") {
      const backgroundAsset = findTemplateBackgroundAsset({
        directorId: project.source_director_project_id,
        ratio: project.ratio,
      });
      if (backgroundAsset?.original_path && fs.existsSync(backgroundAsset.original_path)) {
        const ext = path.extname(backgroundAsset.original_path) || ".png";
        packagedTemplateBackground = path.join(imageDir, `template_background${ext}`);
        fs.copyFileSync(backgroundAsset.original_path, packagedTemplateBackground);
      }
    }

    const { width, height } = parseResolution(project.resolution);
    const publishTitle = optimizedPublishTitle({
      directorTitle: timeline.director?.title || `Timeline #${project.id}`,
      scenes: packagedScenes,
    });
    const timelineJson = {
      project_id: project.id,
      name: publishTitle,
      director_title: timeline.director?.title || "",
      publish_title: publishTitle,
      source_director_project_id: project.source_director_project_id,
      audio_asset_id: project.audio_asset_id,
      platform: project.platform,
      ratio: project.ratio,
      resolution: project.resolution,
      fps: project.fps,
      duration: timeline.duration,
      scenes: packagedScenes,
      tracks: {
        video: packagedScenes.map((scene) => ({
          scene_index: scene.scene_index,
          source: path.relative(projectDir, scene.packaged_video_path || scene.packaged_image_path || scene.image_path || ""),
          start: scene.start_time,
          duration: scene.duration,
          motion: scene.motion_type,
          transition: scene.transition_type,
        })),
        audio: packagedAudio ? [{
          asset_id: timeline.audio.id,
          source: path.relative(projectDir, packagedAudio),
          start: 0,
          duration: timeline.duration,
          role: "voiceover",
        }] : [],
        bgm: packagedBgm ? [{
          source: path.relative(projectDir, packagedBgm),
          start: 0,
          duration: timeline.duration,
          volume: 0.12,
          ducking: "voiceover_first",
          source_type: bgmSourceKind,
          label: bgmLabel,
        }] : [],
        template_background: packagedTemplateBackground ? [{
          source: path.relative(projectDir, packagedTemplateBackground),
          role: "background",
          fit: "cover_blur_dark",
        }] : [],
        subtitles: timeline.tracks.subtitles,
      },
      output_type: project.output_type,
      route_a_style: project.output_type === "template_mp4" ? routeAStyleContract(projectMetadata) : null,
      bgm_source: bgmSourceKind,
      bgm_label: bgmLabel,
      status: project.status,
      created_at: project.created_at,
      updated_at: new Date().toISOString(),
    };

    const timelinePath = writeJson(path.join(projectDir, "timeline.json"), timelineJson);
    const srtPath = path.join(projectDir, "subtitles.srt");
    fs.writeFileSync(srtPath, timelineToSrt(packagedScenes), "utf8");
    const assPath = path.join(projectDir, "subtitles.ass");
    fs.writeFileSync(assPath, timelineToAss(packagedScenes, { width, height, style: timelineJson.route_a_style }), "utf8");
    const titleText = publishTitle;
    fs.writeFileSync(path.join(projectDir, "title.txt"), `${titleText}\n`, "utf8");
    fs.writeFileSync(path.join(projectDir, "description.txt"), [
      titleText,
      "",
      "如果你也想把知识讲清楚，先把学习方式换成可执行的动作。",
    ].join("\n"), "utf8");
    fs.writeFileSync(path.join(projectDir, "hashtags.txt"), "#短视频 #知识口播 #AI成片 #抖音 #视频号 #小红书\n", "utf8");
    const hyperframesPackage = writeHyperframesPackage(project, {
      projectDir,
      packagedAudio,
      packagedScenes,
      timelineJson,
      packagedBgm,
      bgmSourceKind,
      packagedTemplateBackground,
    });
    const manifestPath = writeJson(path.join(projectDir, "project_manifest.json"), {
      name: publishTitle,
      kind: "video-product-center",
      generated_at: new Date().toISOString(),
      stable_import_package: true,
      jianying_note: "第一版输出标准素材包、timeline.json、SRT 与 ASS 字幕；可人工导入剪映继续加工。",
      premium_workflow_skills: premiumWorkflowSkillStatus(),
      commercial_video_contract: {
        voiceover: Boolean(packagedAudio),
        bgm: Boolean(packagedBgm),
        bgm_source: bgmSourceKind,
        bgm_label: bgmLabel,
        bgm_note: packagedBgm
          ? `已接入 BGM（${bgmSourceKind}），并按语音优先混音。`
          : "未找到 BGM 素材。",
        ass_subtitles: true,
        motion_template: project.output_type === "template_mp4",
        motion_template_version: project.output_type === "template_mp4" ? "route-a-premium-ffmpeg-v5" : "",
        hyperframes_package: Boolean(hyperframesPackage?.indexPath),
        hyperframes_status: hyperframesPackage?.indexPath ? "package_ready_for_future_render_ffmpeg_v5_final" : "",
        optimized_publish_title: titleText,
        route_a_caption_policy: project.output_type === "template_mp4" ? "premium_ass_boxed_keyword_highlight" : "",
        template_background: packagedTemplateBackground ? "image_asset_dark_blur_motion" : "procedural_premium_motion",
        publish_package: true,
      },
      audio_binding: timeline.metadata?.audio_binding || null,
      files: {
        timeline: path.basename(timelinePath),
        subtitles: path.basename(srtPath),
        ass_subtitles: path.basename(assPath),
        audio: packagedAudio ? path.relative(projectDir, packagedAudio) : "",
        bgm: packagedBgm ? path.relative(projectDir, packagedBgm) : "",
        template_background: packagedTemplateBackground ? path.relative(projectDir, packagedTemplateBackground) : "",
        images: packagedScenes.map((scene) => path.relative(projectDir, scene.packaged_image_path || "")),
        videos: packagedScenes.map((scene) => path.relative(projectDir, scene.packaged_video_path || "")).filter(Boolean),
        title: "title.txt",
        description: "description.txt",
        hashtags: "hashtags.txt",
        render_report: "render_report.json",
        hyperframes_index: hyperframesPackage?.indexPath ? path.relative(projectDir, hyperframesPackage.indexPath) : "",
        hyperframes_design: hyperframesPackage?.designPath ? path.relative(projectDir, hyperframesPackage.designPath) : "",
        hyperframes_data: hyperframesPackage?.dataPath ? path.relative(projectDir, hyperframesPackage.dataPath) : "",
      },
      blockers: timeline.blockers,
      routes: {
        jianying_template: OUTPUT_TYPE_LABELS.jianying_template,
        jianying: OUTPUT_TYPE_LABELS.jianying,
        mp4: OUTPUT_TYPE_LABELS.mp4,
        template_mp4: OUTPUT_TYPE_LABELS.template_mp4,
        mix_mp4: OUTPUT_TYPE_LABELS.mix_mp4,
        package: OUTPUT_TYPE_LABELS.package,
      },
    });

    return {
      projectDir,
      packagedAudio,
      packagedScenes,
      timelineJson,
      timelinePath,
      srtPath,
      assPath,
      packagedBgm,
      bgmSourceKind,
      bgmLabel,
      packagedTemplateBackground,
      hyperframesDir: hyperframesPackage?.hyperframesDir || "",
      hyperframesIndexPath: hyperframesPackage?.indexPath || "",
      hyperframesDesignPath: hyperframesPackage?.designPath || "",
      hyperframesDataPath: hyperframesPackage?.dataPath || "",
      manifestPath,
    };
  }

  function writeDraftReference(projectDir, project, timelineFiles) {
    const now = Date.now();
    const draftContent = {
      note: "标准剪映半成品参考包，不伪造剪映私有工程格式。",
      version: 1,
      name: timelineFiles.timelineJson?.name || `Timeline #${project.id}`,
      ratio: project.ratio,
      resolution: project.resolution,
      fps: project.fps,
      timeline_file: "timeline.json",
      subtitles_file: "subtitles.srt",
      ass_subtitles_file: "subtitles.ass",
      tracks: timelineFiles.timelineJson.tracks,
    };
    const draftMeta = {
      id: `timeline_${project.id}_${now}`,
      create_time: now,
      update_time: now,
      name: timelineFiles.timelineJson?.name || `Timeline #${project.id}`,
      status: "reference_package",
    };
    const draftContentPath = writeJson(path.join(projectDir, "draft_content.json"), draftContent);
    writeJson(path.join(projectDir, "draft_meta_info.json"), draftMeta);
    return draftContentPath;
  }

  async function renderMp4(project, timelineFiles) {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error("FFmpeg 不可用，无法渲染 MP4。");
    const { width, height } = parseResolution(project.resolution);
    const segmentsDir = ensureDir(path.join(timelineFiles.projectDir, ".segments"));
    const segmentPaths = [];

    for (const scene of timelineFiles.packagedScenes) {
      if (!scene.packaged_image_path || !fs.existsSync(scene.packaged_image_path)) {
        throw new Error(`镜头 ${scene.scene_index} 缺少图片，无法渲染。`);
      }
      const frames = Math.max(1, Math.round(scene.duration * project.fps));
      const segmentPath = path.join(segmentsDir, `scene_${String(scene.scene_index).padStart(2, "0")}.mp4`);
      const zoom = scene.motion_type && scene.motion_type.includes("pull") ? "max(1.0,1.06-on/900)" : "min(zoom+0.0008,1.06)";
      const vf = [
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}`,
        `zoompan=z='${zoom}':d=${frames}:s=${width}x${height}:fps=${project.fps}`,
        "format=yuv420p",
      ].join(",");
      await runProcess(ffmpegPath, [
        "-y",
        "-loop", "1",
        "-i", scene.packaged_image_path,
        "-t", String(scene.duration),
        "-vf", vf,
        "-an",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        segmentPath,
      ]);
      segmentPaths.push(segmentPath);
    }

    const concatPath = path.join(segmentsDir, "concat.txt");
    fs.writeFileSync(concatPath, concatFileList(segmentPaths), "utf8");

    const outputPath = path.join(timelineFiles.projectDir, `${safeFileName(project.metadata?.title || `timeline_${project.id}`)}.mp4`);
    const mixSubtitlePath = timelineFiles.assPath || timelineFiles.srtPath;
    const subtitleFilter = `subtitles='${ffmpegFilterPath(mixSubtitlePath)}'`;
    const args = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
    ];
    if (timelineFiles.packagedAudio) args.push("-i", timelineFiles.packagedAudio);
    args.push(
      "-vf", subtitleFilter,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
    );
    if (timelineFiles.packagedAudio) args.push("-c:a", "aac", "-shortest");
    else args.push("-an");
    args.push(outputPath);
    await runProcess(ffmpegPath, args);
    return outputPath;
  }

  async function renderTemplateMp4(project, timelineFiles) {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error("FFmpeg 不可用，无法渲染模板快剪 MP4。");
    const { width, height } = parseResolution(project.resolution);
    const duration = Math.max(1, Number(timelineFiles.timelineJson.duration || 0));
    const publishTitle = String(timelineFiles.timelineJson.publish_title || timelineFiles.timelineJson.name || `Timeline #${project.id}`);
    const kit = routeAVisualKit(timelineFiles.timelineJson.route_a_style || project.metadata || {});
    const titleLines = splitTitleLines(publishTitle, 11).slice(0, 2);
    const titleLine1 = ffmpegDrawText(titleLines[0] || publishTitle);
    const titleLine2 = ffmpegDrawText(titleLines[1] || "");
    const ctaText = ffmpegDrawText(routeACtaText(timelineFiles.timelineJson));
    const voiceStartSeconds = Math.max(0, Number(timelineFiles.timelineJson.tracks?.audio?.[0]?.start || 0));
    const voiceDelayMs = Math.round(voiceStartSeconds * 1000);
    const introEnd = Math.max(0.65, voiceStartSeconds).toFixed(2);
    const titleEnable = `enable='lt(t\\,${introEnd})'`;
    const outroStart = Math.max(0, duration - 1.72).toFixed(3);
    const outroEnable = `enable='gte(t\\,${outroStart})'`;
    const fontPath = "C:/Windows/Fonts/msyh.ttc";
    const boldFontPath = fs.existsSync("C:/Windows/Fonts/msyhbd.ttc") ? "C:/Windows/Fonts/msyhbd.ttc" : fontPath;
    const outputPath = path.join(timelineFiles.projectDir, `${safeFileName(timelineFiles.timelineJson.name || `timeline_${project.id}`)}_template.mp4`);
    const subtitlePath = timelineFiles.assPath || timelineFiles.srtPath;
    const subtitleFilter = `subtitles='${ffmpegFilterPath(subtitlePath)}'`;
    const titlePanelHeight = Math.round(height * 0.30);
    const lowerSafeY = Math.round(height * 0.72);
    const progressY = height - 18;
    const sceneFilters = (timelineFiles.packagedScenes || []).flatMap((scene, index) => {
      const start = Number(scene.start_time || 0);
      const end = Math.max(start + 0.35, Number(scene.end_time || start + scene.duration || 0));
      const enable = ffmpegEnableBetween(start, end);
      const burstEnable = ffmpegEnableBetween(start, Math.min(end, start + 0.32));
      const label = ffmpegDrawText(conciseSceneLabel(scene));
      const labelWidth = Math.min(width - 140, Math.max(420, compactTitleText(label).length * 46 + 230));
      const y = Math.round(height * 0.104);
      return [
        `drawbox=x=0:y=${Math.round(height * 0.39)}:w=${width}:h=8:color=${kit.accent2}@0.34:t=fill:enable='${burstEnable}'`,
        `drawbox=x=70:y=${y}:w=10:h=118:color=${index % 2 ? kit.accent2 : kit.accent}:t=fill:enable='${enable}'`,
        `drawbox=x=92:y=${y}:w=${labelWidth}:h=118:color=${kit.panel}@0.76:t=fill:enable='${enable}'`,
        `drawtext=fontfile='${ffmpegFilterPath(boldFontPath)}':text='SHOT ${String(index + 1).padStart(2, "0")}':x=122:y=${y + 18}:fontsize=30:fontcolor=${kit.muted}:enable='${enable}'`,
        `drawtext=fontfile='${ffmpegFilterPath(boldFontPath)}':text='${label}':x=122:y=${y + 58}:fontsize=39:fontcolor=${index % 2 ? kit.accent2 : kit.accent}:enable='${enable}'`,
      ];
    });
    const backgroundFilters = timelineFiles.packagedTemplateBackground
      ? [
        `scale=${Math.round(width * 1.09)}:${Math.round(height * 1.09)}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}:x='(iw-${width})/2+22*sin(t*0.35)':y='(ih-${height})/2+18*cos(t*0.29)'`,
        "boxblur=luma_radius=13:luma_power=1",
        "eq=brightness=-0.20:saturation=0.78:contrast=1.08",
        `drawbox=x=0:y=0:w=${width}:h=${height}:color=${kit.bg}@0.50:t=fill`,
      ]
      : [
        `drawbox=x=0:y=0:w=${width}:h=${height}:color=${kit.bg}:t=fill`,
        `drawbox=x='-360+mod(t*34\\,${width + 720})':y=${Math.round(height * 0.15)}:w=560:h=94:color=${kit.accent}@0.14:t=fill`,
        `drawbox=x='${Math.round(width * 0.72)}-mod(t*22\\,${width + 520})':y=${Math.round(height * 0.58)}:w=460:h=78:color=${kit.accent2}@0.12:t=fill`,
        `drawbox=x=${Math.round(width * 0.08)}:y='${Math.round(height * 0.08)}+28*sin(t*1.2)':w=${Math.round(width * 0.84)}:h=${Math.round(height * 0.012)}:color=${kit.text}@0.035:t=fill`,
        "noise=alls=5:allf=t+u",
      ];
    const filters = [
      ...backgroundFilters,
      "vignette=PI/5",
      `drawbox=x=54:y=56:w=${width - 108}:h=${height - 112}:color=${kit.text}@0.045:t=2`,
      `drawbox=x=0:y=${lowerSafeY}:w=${width}:h=${Math.round(height * 0.16)}:color=${kit.bg}@0.64:t=fill`,
      `drawbox=x=0:y=0:w=${width}:h=${titlePanelHeight}:color=${kit.bg}@0.92:t=fill:${titleEnable}`,
      `drawbox=x=72:y=156:w=10:h=146:color=${kit.accent}:t=fill:${titleEnable}`,
      `drawbox=x=96:y=142:w=${width - 168}:h=184:color=${kit.panel}@0.76:t=fill:${titleEnable}`,
      `drawtext=fontfile='${ffmpegFilterPath(boldFontPath)}':text='${titleLine1}':x=126:y=174:fontsize=78:fontcolor=${kit.text}:box=0:${titleEnable}`,
      titleLine2 ? `drawtext=fontfile='${ffmpegFilterPath(boldFontPath)}':text='${titleLine2}':x=126:y=266:fontsize=78:fontcolor=${kit.accent}:box=0:${titleEnable}` : "",
      `drawtext=fontfile='${ffmpegFilterPath(fontPath)}':text='AI Director · Voice First · 1080x1920':x=74:y=${height - 92}:fontsize=25:fontcolor=${kit.muted}:enable='lt(t\\,${duration - 1.2})'`,
      ...sceneFilters,
      subtitleFilter,
      `drawbox=x=0:y=0:w=${width}:h=${height}:color=${kit.bg}@0.82:t=fill:${outroEnable}`,
      `drawtext=fontfile='${ffmpegFilterPath(boldFontPath)}':text='${ctaText}':x=(w-text_w)/2:y=${Math.round(height * 0.43)}:fontsize=68:fontcolor=${kit.text}:box=1:boxcolor=${kit.panel}@0.72:boxborderw=28:${outroEnable}`,
      `drawtext=fontfile='${ffmpegFilterPath(fontPath)}':text='关注 / 收藏 / 下条继续':x=(w-text_w)/2:y=${Math.round(height * 0.53)}:fontsize=36:fontcolor=${kit.accent}:${outroEnable}`,
      `drawbox=x=0:y=${progressY}:w=${width}:h=18:color=${kit.text}@0.10:t=fill`,
      `drawbox=x=0:y=${progressY}:w='iw*t/${duration}':h=18:color=${kit.accent}:t=fill`,
    ].filter(Boolean);
    const args = ["-y"];
    if (timelineFiles.packagedTemplateBackground) {
      args.push(
        "-loop", "1",
        "-framerate", String(project.fps),
        "-i", timelineFiles.packagedTemplateBackground,
      );
    } else {
      args.push(
        "-f", "lavfi",
        "-i", `color=c=0x101624:s=${width}x${height}:r=${project.fps}:d=${duration}`,
      );
    }
    let nextInput = 1;
    let voiceInput = -1;
    let bgmInput = -1;
    if (timelineFiles.packagedAudio) {
      voiceInput = nextInput;
      nextInput += 1;
      args.push("-i", timelineFiles.packagedAudio);
    }
    if (timelineFiles.packagedBgm) {
      bgmInput = nextInput;
      args.push("-stream_loop", "-1", "-i", timelineFiles.packagedBgm);
    }
    args.push(
      "-vf", filters.join(","),
      "-t", String(duration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
    );
    const voiceDelayFilter = voiceDelayMs > 0 ? `adelay=${voiceDelayMs}:all=1,` : "";
    if (voiceInput >= 0 && bgmInput >= 0) {
      const fadeStart = Math.max(0, duration - 1.2).toFixed(2);
      args.push(
        "-filter_complex",
        `[${voiceInput}:a]${voiceDelayFilter}volume=1.0,asplit=2[a_voice_mix][a_voice_sc];[${bgmInput}:a]volume=0.20,atrim=0:${duration.toFixed(3)},afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeStart}:d=1.2[a_bgm_raw];[a_bgm_raw][a_voice_sc]sidechaincompress=threshold=0.06:ratio=8:attack=18:release=260[a_bgm];[a_voice_mix][a_bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:a", "aac",
        "-shortest",
      );
    } else if (voiceInput >= 0) {
      args.push(
        "-filter_complex",
        `[${voiceInput}:a]${voiceDelayFilter}volume=1.0[aout]`,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:a", "aac",
        "-shortest",
      );
    } else if (bgmInput >= 0) {
      args.push("-map", "0:v", "-map", `${bgmInput}:a`, "-c:a", "aac", "-shortest");
    } else {
      args.push("-map", "0:v", "-an");
    }
    args.push("-movflags", "+faststart", outputPath);
    await runProcess(ffmpegPath, args);
    return outputPath;
  }

  async function renderMixMp4(project, timelineFiles) {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error("FFmpeg 不可用，无法渲染混剪 MP4。");
    const { width, height } = parseResolution(project.resolution);
    const segmentsDir = ensureDir(path.join(timelineFiles.projectDir, ".segments"));
    const segmentPaths = [];

    for (const scene of timelineFiles.packagedScenes) {
      if (!scene.packaged_video_path || !fs.existsSync(scene.packaged_video_path)) {
        throw new Error(`镜头 ${scene.scene_index} 缺少已下载视频素材，无法混剪。`);
      }
      const segmentPath = path.join(segmentsDir, `mix_scene_${String(scene.scene_index).padStart(2, "0")}.mp4`);
      const vf = [
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}`,
        `fps=${project.fps}`,
        "format=yuv420p",
      ].join(",");
      await runProcess(ffmpegPath, [
        "-y",
        "-stream_loop", "-1",
        "-i", scene.packaged_video_path,
        "-t", String(scene.duration),
        "-vf", vf,
        "-an",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        segmentPath,
      ]);
      segmentPaths.push(segmentPath);
    }

    const concatPath = path.join(segmentsDir, "mix_concat.txt");
    fs.writeFileSync(concatPath, concatFileList(segmentPaths), "utf8");
    const outputPath = path.join(timelineFiles.projectDir, `${safeFileName(timelineFiles.timelineJson.name || `timeline_${project.id}`)}_mix.mp4`);
    const imageSubtitlePath = timelineFiles.assPath || timelineFiles.srtPath;
    const subtitleFilter = `subtitles='${ffmpegFilterPath(imageSubtitlePath)}'`;
    const args = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
    ];
    if (timelineFiles.packagedAudio) args.push("-i", timelineFiles.packagedAudio);
    args.push(
      "-vf", subtitleFilter,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
    );
    if (timelineFiles.packagedAudio) args.push("-c:a", "aac", "-shortest");
    else args.push("-an");
    args.push(outputPath);
    await runProcess(ffmpegPath, args);
    return outputPath;
  }

  async function inspectMedia(filePath) {
    if (!ffmpegPath || !filePath || !fs.existsSync(filePath)) {
      return { exists: false, width: 0, height: 0, hasAudio: false, duration: 0, raw: "" };
    }
    const result = await runProcess(ffmpegPath, ["-hide_banner", "-i", filePath]).catch((error) => ({
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }));
    const raw = `${result.stderr || ""}\n${result.stdout || ""}`;
    const durationMatch = raw.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const videoMatch = raw.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})[\s,\[]/);
    return {
      exists: true,
      width: videoMatch ? Number(videoMatch[1]) : 0,
      height: videoMatch ? Number(videoMatch[2]) : 0,
      hasAudio: /Audio:/i.test(raw),
      duration: durationMatch
        ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
        : 0,
      raw,
    };
  }

  async function makePublishPackage(project, timelineFiles, mp4Path) {
    if (!mp4Path || !fs.existsSync(mp4Path)) return { finalPath: "", coverPath: "" };
    const finalPath = path.join(timelineFiles.projectDir, "final.mp4");
    if (path.resolve(mp4Path) !== path.resolve(finalPath)) {
      fs.copyFileSync(mp4Path, finalPath);
    }
    const coverPath = path.join(timelineFiles.projectDir, "cover.png");
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      await runProcess(ffmpegPath, [
        "-y",
        "-ss", "0.2",
        "-i", finalPath,
        "-frames:v", "1",
        coverPath,
      ]).catch(() => {});
    }
    timelineFiles.coverPath = fs.existsSync(coverPath) ? coverPath : "";
    return { finalPath, coverPath: timelineFiles.coverPath };
  }

  async function reviewRenderedVideo(project, timelineFiles, mp4Path) {
    const errors = [];
    const warnings = [];
    const expected = parseResolution(project.resolution);
    const stats = mp4Path && fs.existsSync(mp4Path) ? fs.statSync(mp4Path) : null;
    const media = await inspectMedia(mp4Path);
    const publishTitle = String(timelineFiles.timelineJson?.publish_title || timelineFiles.timelineJson?.name || "");

    if (!media.exists) errors.push("MP4 文件不存在。");
    if (stats && stats.size < 1024) errors.push("MP4 文件大小异常。");
    if (media.width && media.height && (media.width !== expected.width || media.height !== expected.height)) {
      errors.push(`MP4 分辨率为 ${media.width}x${media.height}，不是 ${project.resolution}。`);
    }
    if (!media.hasAudio) errors.push("MP4 没有音频轨。");
    if (!timelineFiles.packagedAudio) errors.push("缺少配音文件。");
    if (!timelineFiles.assPath || !fs.existsSync(timelineFiles.assPath)) errors.push("缺少 ASS 高级字幕文件。");
    if (project.output_type === "template_mp4" && !timelineFiles.packagedBgm) {
      errors.push("路线 A 缺少 BGM 素材，不能按可发布成片标准通过。请放入 assets/bgm、media/bgm 或 bgm 文件夹。");
    }
    if (project.output_type === "template_mp4" && titleLooksGeneric(publishTitle)) {
      errors.push("路线 A 标题仍是内部导演稿名称，未生成面向观众的发布标题。");
    }
    if (!timelineFiles.coverPath) warnings.push("封面 cover.png 未生成，可能需要人工补封面。");
    if (media.duration && timelineFiles.timelineJson.duration && Math.abs(media.duration - timelineFiles.timelineJson.duration) > 2.5) {
      warnings.push("MP4 时长与 Timeline 时长偏差较大，建议复查字幕和音频同步。");
    }
    if (project.output_type === "template_mp4" && stats && media.duration && stats.size / media.duration < 16000) {
      warnings.push("路线 A 视频码率偏低，画面可能过于静态，需要增加模板动效或素材层。");
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      checks: {
        mp4_exists: media.exists,
        resolution: media.width && media.height ? `${media.width}x${media.height}` : "",
        expected_resolution: project.resolution,
        ratio: project.ratio,
        has_audio: media.hasAudio,
        has_voiceover: Boolean(timelineFiles.packagedAudio),
        has_bgm: Boolean(timelineFiles.packagedBgm),
        bgm_source: timelineFiles.bgmSourceKind || "none",
        bgm_label: timelineFiles.bgmLabel || "",
        has_ass_subtitles: Boolean(timelineFiles.assPath && fs.existsSync(timelineFiles.assPath)),
        has_cover: Boolean(timelineFiles.coverPath),
        has_template_background: Boolean(timelineFiles.packagedTemplateBackground) || project.output_type === "template_mp4",
        has_hyperframes_package: Boolean(timelineFiles.hyperframesIndexPath),
        template_background_mode: project.output_type === "template_mp4"
          ? (timelineFiles.packagedTemplateBackground ? "image_asset_dark_blur_motion" : "procedural_premium_motion")
          : "",
        publish_title: publishTitle,
        title_optimized: !titleLooksGeneric(publishTitle),
        motion_template_version: project.output_type === "template_mp4" ? "route-a-premium-ffmpeg-v5" : "",
        alignment_source: project.output_type === "template_mp4"
          ? timelineFiles.packagedScenes[0]?.metadata?.alignment_source || safeJson(timelineFiles.packagedScenes[0]?.metadata_json, {})?.alignment_source || ""
          : "",
        duration: Number((media.duration || 0).toFixed(3)),
        file_size: stats?.size || 0,
      },
      reviewed_at: new Date().toISOString(),
    };
  }

  async function processProject(projectId) {
    let project = taskStore.getTimelineProject(projectId);
    if (!project) return;
    let input = safeJson(project.metadata_json, {});

    try {
      project = await ensureRouteADirectorReady(project, input);
      input = { ...input, ...safeJson(project.metadata_json, {}) };
      updateProject(project.id, {
        status: "binding_assets",
        progress: 15,
        current_step: "正在绑定导演镜头、图片和音频",
        error: "",
      });
      const timeline = await buildTimeline({
        ...input,
        source_director_project_id: project.source_director_project_id,
        audio_asset_id: project.audio_asset_id,
        platform: project.platform,
        output_type: project.output_type,
      });

      updateProject(project.id, {
        status: "building_timeline",
        progress: 35,
        current_step: "正在生成统一 Timeline Project",
        duration: timeline.duration,
        tracks_json: JSON.stringify(timeline.tracks),
        blockers_json: JSON.stringify(timeline.blockers),
        metadata_json: JSON.stringify({
          ...input,
          ...timeline.metadata,
          title: timeline.director?.title || input.title || "",
        }),
      });
      taskStore.replaceTimelineScenes(project.id, timeline.scenes);

      if (timeline.blockers.length) {
        updateProject(project.id, {
          status: "failed",
          progress: 35,
          current_step: "存在阻塞项，未输出文件",
          error: timeline.blockers.join(" "),
          blockers_json: JSON.stringify(timeline.blockers),
          completed_at: new Date().toISOString(),
        });
        return;
      }

      project = taskStore.getTimelineProject(project.id);
      const outputType = OUTPUT_TYPES.has(project.output_type) ? project.output_type : "jianying_template";
      updateProject(project.id, {
        status: MP4_OUTPUT_TYPES.has(outputType) ? "rendering" : "exporting_draft",
        progress: MP4_OUTPUT_TYPES.has(outputType) ? 52 : 58,
        current_step: MP4_OUTPUT_TYPES.has(outputType) ? `正在准备 ${OUTPUT_TYPE_LABELS[outputType] || "MP4"} 渲染素材` : `正在导出${OUTPUT_TYPE_LABELS[outputType] || "素材包"}`,
      });

      const timelineFiles = writeTimelineFiles(project, timeline);
      let draftPath = "";
      let localJianyingDraftPath = "";
      let capcutResult = null;
      let compatibilityMode = false;
      if (outputType === "jianying_template") {
        capcutResult = capcutCliAdapter?.buildTemplateDraft({
          project: { ...project, metadata: safeJson(project.metadata_json, {}) },
          timeline,
          timelineFiles,
          templateName: input.jianying_template || "education_tips",
        }) || {
          ok: true,
          fallback: true,
          warnings: ["capcut-cli 适配器未启用，已输出兼容素材包。"],
          files: [],
        };
        const capcutMessages = [...(capcutResult.errors || []), ...(capcutResult.warnings || [])].filter(Boolean);
        draftPath = capcutResult.draftPath || capcutResult.planPath || "";
        localJianyingDraftPath = syncDraftToLocalJianying(capcutResult.draftPath || "", project, input.jianying_template || "education_tips");
        if (localJianyingDraftPath) {
          capcutResult.localJianyingDraftPath = localJianyingDraftPath;
          capcutResult.files = [...(capcutResult.files || []), localJianyingDraftPath];
          capcutResult.warnings = [...(capcutResult.warnings || []), "已同步到本机剪映草稿目录。"];
        }
        if (!localJianyingDraftPath) {
          const fallbackDraft = createVisibleJianyingDraftFallback(
            project,
            timelineFiles,
            input.jianying_template || "education_tips",
            capcutMessages.join("；"),
          );
          if (fallbackDraft.path) {
            localJianyingDraftPath = fallbackDraft.path;
            draftPath = fallbackDraft.path;
            capcutResult = {
              ...capcutResult,
              ok: true,
              fallback: true,
              visibleDraftFallback: true,
              draftPath: fallbackDraft.path,
              localJianyingDraftPath: fallbackDraft.path,
              seedDraftPath: fallbackDraft.seed,
              warnings: [
                ...(capcutResult.warnings || []),
                fallbackDraft.warning,
              ],
              errors: capcutResult.errors || [],
              files: [...new Set([
                ...(capcutResult.files || []),
                fallbackDraft.path,
                path.join(fallbackDraft.path, "codex-import.json"),
              ].filter(Boolean))],
            };
          }
        }
        if (!localJianyingDraftPath && capcutResult && capcutResult.ok === false) {
          throw new Error(`剪映草稿生成失败：${capcutMessages.join("；") || "未知错误"}`);
        }
        if (!localJianyingDraftPath) {
          compatibilityMode = true;
          draftPath = capcutResult.planPath || timelineFiles.projectDir;
          capcutResult = {
            ...capcutResult,
            ok: true,
            fallback: true,
            draftPath: "",
            compatibilityPath: timelineFiles.projectDir,
            warnings: [
              ...(capcutResult.warnings || []),
              "未写入本机剪映草稿目录，已完成兼容素材包和执行计划输出。",
            ],
            files: [...new Set([
              ...(capcutResult.files || []),
              capcutResult.planPath,
              capcutResult.specPath,
              timelineFiles.projectDir,
            ].filter(Boolean))],
          };
        }
        writeJson(path.join(timelineFiles.projectDir, "capcut-result.json"), capcutResult);
      } else if (outputType === "jianying" || outputType === "package") {
        draftPath = writeDraftReference(timelineFiles.projectDir, project, timelineFiles);
      }
      project = updateProject(project.id, {
        output_dir: timelineFiles.projectDir,
        timeline_path: timelineFiles.timelinePath,
        srt_path: timelineFiles.srtPath,
        manifest_path: timelineFiles.manifestPath,
        draft_path: localJianyingDraftPath || draftPath,
      });

      let mp4Path = "";
      if (MP4_OUTPUT_TYPES.has(outputType)) {
        updateProject(project.id, {
          status: "rendering",
          progress: 72,
          current_step: `正在使用 FFmpeg 合成${OUTPUT_TYPE_LABELS[outputType] || "MP4"}`,
        });
        if (outputType === "template_mp4") {
          mp4Path = await renderTemplateMp4({ ...project, metadata: safeJson(project.metadata_json, {}) }, timelineFiles);
        } else if (outputType === "mix_mp4") {
          mp4Path = await renderMixMp4({ ...project, metadata: safeJson(project.metadata_json, {}) }, timelineFiles);
        } else {
          mp4Path = await renderMp4({ ...project, metadata: safeJson(project.metadata_json, {}) }, timelineFiles);
        }
        await makePublishPackage(project, timelineFiles, mp4Path);
        const quality = await reviewRenderedVideo(project, timelineFiles, mp4Path);
        const reportPath = path.join(timelineFiles.projectDir, "render_report.json");
        writeJson(reportPath, renderReport(project, timelineFiles, {
          mp4Path,
          bgmPath: timelineFiles.packagedBgm,
          quality,
        }));
        if (!quality.passed) {
          throw new Error(`质量审查未通过：${quality.errors.join(" ")}`);
        }
      } else {
        writeJson(path.join(timelineFiles.projectDir, "render_report.json"), renderReport(project, timelineFiles, {
          mp4Path: "",
          bgmPath: timelineFiles.packagedBgm,
          quality: {
            passed: true,
            warnings: [
              "当前路线输出剪映草稿或素材包，不执行 MP4 画面质检。",
              ...(capcutResult?.warnings || []),
            ],
            errors: [],
          },
        }));
      }

      const completedProject = updateProject(project.id, {
        status: "completed",
        progress: 100,
        current_step: MP4_OUTPUT_TYPES.has(outputType)
          ? `${OUTPUT_TYPE_LABELS[outputType] || "MP4"} 已生成`
          : compatibilityMode
            ? "capcut-cli 未就绪，已生成兼容素材包和执行计划"
            : `${OUTPUT_TYPE_LABELS[outputType] || "素材包"}已生成`,
        output_dir: timelineFiles.projectDir,
        timeline_path: timelineFiles.timelinePath,
        srt_path: timelineFiles.srtPath,
        manifest_path: timelineFiles.manifestPath,
        draft_path: localJianyingDraftPath || draftPath,
        mp4_path: mp4Path,
        completed_at: new Date().toISOString(),
      });
      syncOutputToVideoProject(completedProject, timeline, timelineFiles, { draftPath: localJianyingDraftPath || draftPath, mp4Path });
    } catch (error) {
      updateProject(project.id, {
        status: "failed",
        progress: Math.max(1, project.progress || 0),
        current_step: "视频成片任务失败",
        error: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      });
    } finally {
      onIdle();
    }
  }

  async function drain() {
    if (working) return;
    working = true;
    try {
      while (pending.length) {
        await processProject(pending.shift());
      }
    } finally {
      working = false;
    }
  }

  function enqueue(input = {}) {
    const routeA = ensureRouteADirectorForEnqueue(input);
    const directorId = routeA.directorId;
    const audioId = Number(input.audio_asset_id || input.tts_job_id || 0);
    const outputType = OUTPUT_TYPES.has(String(input.output_type || "")) ? String(input.output_type) : "jianying_template";
    const platformId = String(input.platform || "douyin");
    const platform = platformPreset(platformId);
    const project = taskStore.createTimelineProject({
      source_director_project_id: directorId,
      audio_asset_id: audioId,
      platform: platformId,
      ratio: platform.ratio,
      resolution: platform.resolution,
      fps: platform.fps,
      output_type: outputType,
      status: "pending",
      progress: 0,
      current_step: "等待进入视频成片队列",
      metadata_json: JSON.stringify({
        video_project_id: String(input.video_project_id || input.projectId || ""),
        title: String(input.title || ""),
        output_type: outputType,
        route_label: OUTPUT_TYPE_LABELS[outputType] || outputType,
        image_source: String(input.image_source || "director"),
        image_asset_ids: Array.isArray(input.image_asset_ids) ? input.image_asset_ids : [],
        manual_bindings: input.manual_bindings || {},
        route_a_style_id: routeAStyleId(input.route_a_style_id || input.style_id),
        route_a_custom_style: String(input.route_a_custom_style || input.custom_style || ""),
        bgm_strategy: String(input.bgm_strategy || "none"),
        bgm_asset_id: String(input.bgm_asset_id || ""),
        jianying_template: String(input.jianying_template || "education_tips"),
        render_engine: outputType === "template_mp4" ? "ffmpeg_stable_with_hyperframes_package" : "ffmpeg",
        route_a_skill_chain: outputType === "template_mp4" ? ROUTE_A_SKILL_CHAIN : [],
        ...routeA.metadata,
      }),
    });
    pending.push(project.id);
    drain().catch(() => {});
    return { project: sourceProject(project) };
  }

  async function preview(input = {}) {
    const timeline = await buildTimeline(input);
    return {
      ok: true,
      platform: timeline.platform,
      duration: timeline.duration,
      scenes: timeline.scenes,
      tracks: timeline.tracks,
      blockers: timeline.blockers,
      metadata: timeline.metadata,
      output_type: OUTPUT_TYPES.has(String(input.output_type || "")) ? String(input.output_type) : "jianying_template",
    };
  }

  function getProject(id) {
    return sourceProject(taskStore.getTimelineProject(id));
  }

  function listProjects(limit = 50) {
    return taskStore.listTimelineProjects({ limit }).map((row) => sourceProject(row, { includeScenes: false }));
  }

  function removeProject(id, { deleteFiles = true } = {}) {
    const project = taskStore.getTimelineProject(Number(id || 0));
    if (!project) return { deleted: 0, message: "成片记录不存在。" };
    if (["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"].includes(project.status)) {
      throw new Error("成片任务正在处理，完成或失败后才能删除。");
    }
    if (deleteFiles && project.output_dir) {
      const root = path.resolve(outputRoot);
      const target = path.resolve(project.output_dir);
      if (target !== root && target.startsWith(`${root}${path.sep}`) && fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    }
    const metadata = safeJson(project.metadata_json, {});
    const videoProjectId = String(metadata.video_project_id || metadata.projectId || "").trim();
    if (videoProjectId && projectCenter) {
      const videoProject = projectCenter.getById(videoProjectId);
      if (videoProject) {
        const outputHistory = (videoProject.outputHistory || []).filter((item) => Number(item.timelineProjectId || 0) !== Number(project.id));
        const clearDraft = Number(videoProject.jianyingDraft?.timelineProjectId || 0) === Number(project.id);
        const hasAssets = Array.isArray(videoProject.selectedAssets) && videoProject.selectedAssets.length > 0;
        const status = outputHistory.length
          ? "exported"
          : !clearDraft && videoProject.jianyingDraft?.id
            ? "draft_ready"
            : hasAssets && videoProject.bgm?.id
              ? "assets_ready"
              : videoProject.directorScript?.id
                ? "directed"
                : videoProject.selectedTtsAudio?.id
                  ? "voiced"
                  : videoProject.selectedRewriteText
                    ? "rewritten"
                    : videoProject.transcriptText
                      ? "transcribed"
                      : "created";
        projectCenter.update(videoProjectId, {
          outputHistory,
          ...(clearDraft ? { jianyingDraft: {} } : {}),
          status,
        });
      }
    }
    return { deleted: taskStore.deleteTimelineProjects([project.id]), id: project.id };
  }

  function clearProjects({ scope = "all", deleteFiles = true } = {}) {
    const rows = taskStore.listTimelineProjects({ limit: 500 }).filter((project) => {
      if (["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"].includes(project.status)) return false;
      return scope === "failed" ? project.status === "failed" : true;
    });
    let deleted = 0;
    for (const project of rows) deleted += removeProject(project.id, { deleteFiles }).deleted;
    return { deleted };
  }

  function getToolStatus() {
    return capcutCliAdapter?.detect() || {
      ok: true,
      mode: "compatibility_package",
      checks: {
        capcutCli: { ok: false, label: "未安装", detail: "当前使用素材包兼容模式" },
        ffmpeg: { ok: Boolean(ffmpegPath && fs.existsSync(ffmpegPath)), label: ffmpegPath && fs.existsSync(ffmpegPath) ? "可用" : "不可用", detail: ffmpegPath || "未找到 FFmpeg" },
        draftDirectory: { ok: false, label: "未配置", detail: "请在系统设置中选择剪映草稿目录" },
        templateMaster: { ok: false, label: "未检测", detail: "请复制剪映母版到模板目录" },
        outputDirectory: { ok: true, label: "正常", detail: outputRoot },
      },
    };
  }

  async function openJianying() {
    return capcutCliAdapter?.openJianying?.() || { ok: false, message: "剪映启动适配器未启用。" };
  }

  function syncOutputToVideoProject(project, timeline, timelineFiles, { draftPath = "", mp4Path = "" } = {}) {
    const metadata = safeJson(project.metadata_json, {});
    const videoProjectId = String(metadata.video_project_id || metadata.projectId || "").trim();
    if (!videoProjectId || !projectCenter) return null;
    const videoProject = projectCenter.getById(videoProjectId);
    if (!videoProject) return null;

    const generatedAssets = (timelineFiles.packagedScenes || []).map((scene) => ({
      id: scene.image_asset_id || `timeline-${project.id}-scene-${scene.scene_index}`,
      name: `镜头 ${scene.scene_index}`,
      assetType: "image",
      path: scene.packaged_image_path || scene.image_path || "",
      sceneIndex: scene.scene_index,
      source: "timeline_output",
      status: scene.packaged_image_path || scene.image_path ? "ready" : "pending",
    }));
    const selectedAssets = [...(videoProject.selectedAssets || []), ...generatedAssets]
      .filter((asset, index, rows) => rows.findIndex((item) => String(item.id || item.path) === String(asset.id || asset.path)) === index);
    const subtitleTimeline = (timeline.scenes || []).map((scene) => ({
      sceneIndex: scene.scene_index,
      startTime: Number(scene.start_time || 0),
      endTime: Number(scene.end_time || 0),
      duration: Number(scene.duration || 0),
      text: scene.subtitle_text || scene.narration_text || "",
    }));
    const outputRecord = {
      id: `timeline-${project.id}`,
      timelineProjectId: project.id,
      outputType: project.output_type,
      status: project.status,
      outputDir: timelineFiles.projectDir,
      draftPath,
      mp4Path,
      timelinePath: timelineFiles.timelinePath,
      subtitlesPath: timelineFiles.srtPath,
      createdAt: new Date().toISOString(),
    };
    const outputHistory = [...(videoProject.outputHistory || []).filter((item) => item.id !== outputRecord.id), outputRecord];
    const isExported = MP4_OUTPUT_TYPES.has(project.output_type) && Boolean(mp4Path);
    const changes = {
      lastTimelineProjectId: project.id,
      selectedAssets,
      subtitleTimeline,
      outputHistory,
      workflowState: "draft_ready",
      status: isExported ? "exported" : "draft_ready",
    };
    if (timelineFiles.packagedBgm) {
      changes.bgm = {
        ...(videoProject.bgm || {}),
        id: videoProject.bgm?.id || `timeline-${project.id}-bgm`,
        name: timelineFiles.bgmLabel || path.basename(timelineFiles.packagedBgm),
        path: timelineFiles.packagedBgm,
        source: timelineFiles.bgmSourceKind || "timeline_output",
        status: "ready",
      };
    }
    if (!isExported) {
      changes.jianyingDraft = {
        id: `timeline-${project.id}`,
        timelineProjectId: project.id,
        outputType: project.output_type,
        path: draftPath || timelineFiles.projectDir,
        outputDir: timelineFiles.projectDir,
        compatibilityMode: !draftPath || String(draftPath).endsWith("capcut-plan.json"),
        status: "ready",
      };
    }
    return projectCenter.update(videoProjectId, changes);
  }

  function resolveOutputPath(id, type = "dir") {
    const project = taskStore.getTimelineProject(Number(id || 0));
    if (!project) return "";
    const candidates = {
      dir: project.output_dir,
      timeline: project.timeline_path,
      srt: project.srt_path,
      ass: project.output_dir ? path.join(project.output_dir, "subtitles.ass") : "",
      manifest: project.manifest_path,
      draft: project.draft_path,
      mp4: project.mp4_path,
      final: project.output_dir ? path.join(project.output_dir, "final.mp4") : "",
      cover: project.output_dir ? path.join(project.output_dir, "cover.png") : "",
      title: project.output_dir ? path.join(project.output_dir, "title.txt") : "",
      description: project.output_dir ? path.join(project.output_dir, "description.txt") : "",
      hashtags: project.output_dir ? path.join(project.output_dir, "hashtags.txt") : "",
      report: project.output_dir ? path.join(project.output_dir, "render_report.json") : "",
      hyperframes: project.output_dir ? path.join(project.output_dir, "hyperframes", "index.html") : "",
      hyperframes_design: project.output_dir ? path.join(project.output_dir, "hyperframes", "DESIGN.md") : "",
    };
    const target = candidates[type] || project.output_dir;
    if (!target || !fs.existsSync(target)) return "";
    const resolved = path.resolve(target);
    const root = path.resolve(outputRoot);
    return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : "";
  }

  for (const project of taskStore.listTimelineProjects({ limit: 500 }).reverse()) {
    if (!TIMELINE_STATUSES.has(project.status)) continue;
    if (["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"].includes(project.status)) {
      taskStore.updateTimelineProject(project.id, {
        status: "pending",
        progress: 0,
        current_step: "服务重启后等待重新处理",
        error: "",
      });
      pending.push(project.id);
    }
  }
  if (pending.length) setTimeout(() => drain().catch(() => {}), 0);

  return {
    enqueue,
    preview,
    getProject,
    listProjects,
    removeProject,
    clearProjects,
    listSources,
    getToolStatus,
    openJianying,
    importBgmAsset,
    importJianyingTemplate,
    resolveOutputPath,
    outputRoot,
  };
}
