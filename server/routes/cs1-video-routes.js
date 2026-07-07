import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";

const HYPERFRAMES_VERSION = "0.7.37";
const MAX_SCRIPT_LENGTH = 1200;
const DEFAULT_BEAT_COUNT = 5;
const ALLOWED_BEAT_COUNTS = new Set([2, 3, 4, 5, 6]);
const LOCAL_TEMPLATE_IDS = new Set([
  "cs1",
  "aifman-manager-card",
]);
const OFFICIAL_TEMPLATE_IDS = new Set([
  "warm-grain",
  "play-mode",
  "swiss-grid",
  "kinetic-type",
  "decision-tree",
  "product-promo",
  "nyt-graph",
  "vignelli",
  "blank",
]);

const INTRO_TEMPLATE_IDS = new Set([
  "none",
  "brand_hook_dark",
  "title_flash_dark",
  "series_badge_dark",
]);

const OUTRO_TEMPLATE_IDS = new Set([
  "none",
  "follow_cta_dark",
  "comment_cta_dark",
  "consult_cta_dark",
]);

const WATERMARK_POSITIONS = new Set([
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
]);

const AIFMAN_MANAGER_SCRIPT_FORMAT = [
  "适用：职场管理、领导力、认知提升、能力清单类视频。",
  "标题：用“对象 + 必备/避坑/提升 + 数字”结构，例如：升到管理岗必备的三个能力。",
  "开场：一句身份变化或痛点，15-24 字，不铺垫。",
  "主体：按文案实际结构生成 2-6 个卡片，不强行固定 3 个；每个卡片包含：标题 4-8 字 + 副标题 8-14 字 + 说明 16-32 字。",
  "节奏：每段只讲一个动作，不写长段落，不写复杂案例。",
  "结尾：一句行动提醒或认知总结，12-20 字。",
  "示例：第一，沟通能力。向上汇报、平行协作、向下管理都要有秩序。",
].join("\n");

const CS1_VIDEO_STYLES = [
  { id: "cs1", name: "CS1 深色解释风", description: "黑色电影感画布，红色警示块和金色强调，适合招生提醒、学习规划、危机感口播，节奏是三段式：问题、冲突、行动。", source: "local" },
  { id: "aifman-manager-card", name: "管理岗能力卡片风", description: "参考 AIfman 职场知识视频的动效结构：暗橄榄渐变背景、金色标题、绿色关键词、粒子圆环，按文案实际结构生成 2-6 段能力卡片，适合职场管理、领导力、认知提升类横版知识短视频。", source: "local", scriptFormat: AIFMAN_MANAGER_SCRIPT_FORMAT },
  { id: "warm-grain", name: "Warm Grain 暖纸纹", description: "暖色纸张质感、颗粒纹理、绿色和陶土色点缀，适合教育提醒、家长通知、温和但严肃的知识类内容。", source: "hyperframes" },
  { id: "play-mode", name: "Play Mode 活力弹性风", description: "高能社交媒体动效，弹性转场、明亮强调色，适合短促口号、活动宣传、年轻化信息流内容。", source: "hyperframes" },
  { id: "swiss-grid", name: "Swiss Grid 瑞士网格风", description: "白底、蓝黑网格、信息排版清晰，适合课程说明、流程拆解、专业知识点和结构化教学内容。", source: "hyperframes" },
  { id: "kinetic-type", name: "Kinetic Type 动态大字风", description: "黑底强对比大字，文字运动冲击强，适合痛点放大、金句输出、观点表达和高冲击招生广告。", source: "hyperframes" },
  { id: "decision-tree", name: "Decision Tree 决策路径风", description: "节点和路径图形推进，适合选择题、学习路径、规划方案、家长决策类解释视频。", source: "hyperframes" },
  { id: "product-promo", name: "Product Promo 产品宣传风", description: "深色商业背景、产品卡片和展示感强，适合课程产品、训练营、服务卖点和招生转化内容。", source: "hyperframes" },
  { id: "nyt-graph", name: "NYT Graph 数据叙事风", description: "报刊式数据图表语言，适合成绩对比、趋势变化、案例分析和需要数据说服力的内容。", source: "hyperframes" },
  { id: "vignelli", name: "Vignelli 竖版海报风", description: "极简红黑白视觉、竖版大排版，适合封面感强的短视频、品牌表达、观点标题和高级感口播。", source: "hyperframes" },
  { id: "blank", name: "Blank 空白基础风", description: "最少包装的基础模板，适合后续深度自定义，不建议作为商业成片默认选择。", source: "hyperframes" },
];

export function createCs1VideoRoutes({ baseDir, sendJson, modelRouter, ffmpegPath = "", ffprobePath = "" }) {
  const runsDir = path.join(baseDir, ".data", "cs1-video-maker");
  const outputDir = path.join(baseDir, "jianying-exports", "hyperframes");
  const hiddenStylesPath = path.join(runsDir, "hidden-styles.json");

  return async function handleCs1VideoRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/cs1-video/")) return false;
    const route = url.pathname.replace("/api/cs1-video/", "");

    if (req.method === "GET" && route === "styles") {
      const hiddenStyleIds = readHiddenStyleIds(hiddenStylesPath);
      const visibleStyles = CS1_VIDEO_STYLES
        .filter((style) => !hiddenStyleIds.has(style.id))
        .map((style, index) => ({ ...style, display_index: index + 1 }));
      sendJson(res, 200, {
        ok: true,
        styles: visibleStyles,
      });
      return true;
    }

    if (req.method === "GET" && route === "outputs") {
      sendJson(res, 200, {
        ok: true,
        outputDir,
        outputs: listCs1Outputs(outputDir),
      });
      return true;
    }

    if (req.method === "POST" && route === "styles/delete") {
      try {
        const body = await readJsonBody(req, { maxBytes: 16 * 1024 });
        const styleId = String(body.id || "").trim();
        const exists = CS1_VIDEO_STYLES.some((style) => style.id === styleId);
        if (!exists) throw new Error("模板不存在，无法删除。");
        const hiddenStyleIds = readHiddenStyleIds(hiddenStylesPath);
        const visibleCount = CS1_VIDEO_STYLES.filter((style) => !hiddenStyleIds.has(style.id)).length;
        if (!hiddenStyleIds.has(styleId) && visibleCount <= 1) {
          throw new Error("至少需要保留一个 HyperFrames 模板。");
        }
        hiddenStyleIds.add(styleId);
        writeHiddenStyleIds(hiddenStylesPath, hiddenStyleIds);
        sendJson(res, 200, { ok: true, id: styleId });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "generate") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const result = await generateVideo({
          baseDir,
          runsDir,
          outputDir,
          text: body.text,
          style: body.style,
          title: body.title,
          beatCount: body.beatCount,
          templateName: body.templateName,
          bgmMode: body.bgmMode,
          bgmPath: body.bgmPath,
          packaging: {
            introTemplateId: body.introTemplateId,
            outroTemplateId: body.outroTemplateId,
            ctaText: body.ctaText,
            watermarkEnabled: body.watermarkEnabled,
            watermarkText: body.watermarkText,
            watermarkPosition: body.watermarkPosition,
            watermarkOpacity: body.watermarkOpacity,
          },
          aiRefine: body.aiRefine === true,
          modelRouter,
          ffmpegPath,
          ffprobePath,
        });
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    sendJson(res, 404, { ok: false, message: "Unknown CS1 video API" });
    return true;
  };
}

function readHiddenStyleIds(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed?.ids) ? parsed.ids : [];
    return new Set(ids.map((id) => String(id || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeHiddenStyleIds(filePath, ids) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    ids: Array.from(ids).sort(),
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function generateVideo({ runsDir, outputDir, text, style, title, beatCount, templateName, bgmMode, bgmPath, packaging, aiRefine, modelRouter, ffmpegPath, ffprobePath }) {
  const script = normalizeScript(text);
  const styleId = normalizeStyle(style);
  const normalizedBeatCount = styleId === "aifman-manager-card"
    ? resolveAifmanPreferredCount(beatCount, script)
    : normalizeBeatCount(beatCount);
  const slug = `${formatDateSlug(new Date())}-${styleId}-${randomUUID().slice(0, 8)}`;
  const projectDir = path.join(runsDir, slug);
  const videoTitle = sanitizeTitle(title) || inferTitle(script);
  const styleName = sanitizeTitle(templateName) || defaultStyleName(styleId);
  const packagingOptions = normalizePackagingOptions(packaging, { title: videoTitle });
  const outputPath = path.join(outputDir, `${slug}.mp4`);

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const refined = aiRefine ? await refineStoryModel({ script, title: videoTitle, beatCount: normalizedBeatCount, styleId, modelRouter }) : null;
  const model = refined || (styleId === "aifman-manager-card"
    ? buildAifmanStoryModel(script, videoTitle, normalizedBeatCount)
    : buildStoryModel(script, videoTitle, normalizedBeatCount));
  const files = styleId === "cs1"
    ? cs1Files(model)
    : styleId === "aifman-manager-card"
      ? aifmanManagerCardFiles(model, { bgmMode, bgmPath, packaging: packagingOptions })
      : styleId === "warm-grain"
      ? warmGrainFiles(model)
      : officialTemplateFiles(model, styleId);
  writeProject(projectDir, {
    slug,
    title: videoTitle,
    styleId,
    styleName,
    beatCount: model.beatCount || normalizedBeatCount,
    files,
  });

  const hyperframesEnv = buildHyperframesEnv({ ffmpegPath, ffprobePath });
  const checkOutput = [];
  await runHyperframes(projectDir, ["lint"], checkOutput, hyperframesEnv);
  await runHyperframes(projectDir, ["validate"], checkOutput, hyperframesEnv);
  await runHyperframes(projectDir, ["inspect"], checkOutput, hyperframesEnv);
  const renderOutput = [];
  await runHyperframes(projectDir, ["render", "--output", outputPath, "--quality", "standard"], renderOutput, hyperframesEnv);

  return {
    id: slug,
    title: videoTitle,
    style: styleId,
    templateName: styleName,
    beatCount: model.beatCount || normalizedBeatCount,
    projectDir,
    outputPath,
    outputDir,
    aiUsed: Boolean(refined),
    bgm: files.bgm || null,
    packaging: files.packaging || packagingOptions,
    checkLog: checkOutput.join("\n").slice(-8000),
    renderLog: renderOutput.join("\n").slice(-8000),
  };
}

async function refineStoryModel({ script, title, beatCount, styleId, modelRouter }) {
  if (!modelRouter || typeof modelRouter.generate !== "function") return null;
  try {
    if (styleId === "aifman-manager-card") {
      return await refineAifmanStoryModel({ script, title, beatCount, modelRouter });
    }
    const result = await modelRouter.generate({
      taskType: "rewrite",
      messages: [
        {
          role: "system",
          content: [
            `You turn Chinese short-video copy into a 10-second, ${beatCount}-beat video structure.`,
            `Return only JSON with keys: title, beats. beats must be an array with exactly ${beatCount} items.`,
            "Each beat item must include: role, text, caption.",
            "Each text/caption value must be concise Chinese, suitable for large on-screen text.",
            "No markdown, no explanations.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({ title, script, beatCount }),
        },
      ],
      options: { temperature: 0.4 },
    });
    const parsed = JSON.parse(String(result.content || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    if (Array.isArray(parsed.beats)) {
      return storyModelFromBeats(sanitizeTitle(parsed.title) || title, parsed.beats, beatCount);
    }
    return storyModelFromBeats(sanitizeTitle(parsed.title) || title, [
      { role: "hook", text: parsed.hook, caption: parsed.caption1 },
      { role: "conflict", text: parsed.question, caption: parsed.caption2 },
      { role: "action", text: parsed.action, caption: parsed.caption3 },
    ], beatCount);
  } catch {
    return null;
  }
}

async function refineAifmanStoryModel({ script, title, beatCount, modelRouter }) {
  const result = await modelRouter.generate({
    taskType: "rewrite",
    messages: [
      {
        role: "system",
        content: [
          "你是 AIfman 风格的中文短视频导演，只负责把文案拆成深色知识卡片视频结构。",
          "必须返回 JSON，不要 markdown，不要解释。",
          "结构：{ \"title\":\"\", \"headline_lead\":\"\", \"headline_keyword\":\"\", \"cards\":[{\"title\":\"\", \"subtitle\":\"\", \"detail\":\"\"}], \"outro\":\"\" }",
          "cards 数量必须按文案实际情况决定，范围 2-6 个；文案明确有第一/第二/第三/四点时必须跟随原结构，不要强行固定三个。",
          "每个 card.title 4-8 个中文；subtitle 8-14 个中文；detail 16-32 个中文。",
          "不要直接截取长句当标题，要提炼成可上屏的大字。",
          "如果是英语学习内容，避免把“学英语12年”这类背景句当能力卡标题，应提炼为“开口能力”“场景练习”“输出习惯”等动作型卡片。",
          "headline_lead 是标题前半句，headline_keyword 是需要绿色强调的短词，例如：必备能力、避坑指南、核心动作、正确方法。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({ title, script, preferredCardCount: beatCount }, null, 2),
      },
    ],
    options: { temperature: 0.25 },
  });
  const parsed = JSON.parse(String(result.content || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
  return aifmanModelFromParts({
    title: sanitizeTitle(parsed.title) || title,
    headlineLead: parsed.headline_lead,
    headlineKeyword: parsed.headline_keyword,
    cards: parsed.cards,
    outro: parsed.outro,
    fallbackTitle: title,
    preferredCount: beatCount,
  });
}

function writeProject(projectDir, { slug, title, styleId, styleName, beatCount, files }) {
  const compositionDir = path.join(projectDir, "compositions");
  const width = files.width || 1920;
  const height = files.height || 1080;
  const duration = files.duration || 10;
  fs.mkdirSync(compositionDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({
    name: slug,
    private: true,
    type: "module",
    scripts: {
      check: `npx --yes hyperframes@${HYPERFRAMES_VERSION} lint && npx --yes hyperframes@${HYPERFRAMES_VERSION} validate && npx --yes hyperframes@${HYPERFRAMES_VERSION} inspect`,
      render: `npx --yes hyperframes@${HYPERFRAMES_VERSION} render`,
    },
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, "hyperframes.json"), JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, "meta.json"), JSON.stringify({
    id: slug,
    name: title,
    style: styleId,
    styleName,
    beatCount,
    createdAt: new Date().toISOString(),
    duration,
    width,
    height,
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, "DESIGN.md"), files.design);
  fs.writeFileSync(path.join(projectDir, "index.html"), files.index);
  for (const [name, content] of Object.entries(files.compositions || {})) {
    fs.writeFileSync(path.join(compositionDir, name), content);
  }
  for (const [name, asset] of Object.entries(files.assets || {})) {
    const targetPath = path.join(projectDir, name);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    if (asset && typeof asset === "object" && asset.copyFrom) {
      fs.copyFileSync(asset.copyFrom, targetPath);
    } else if (Buffer.isBuffer(asset)) {
      fs.writeFileSync(targetPath, asset);
    } else {
      fs.writeFileSync(targetPath, String(asset || ""), "utf8");
    }
  }
}

function buildHyperframesEnv({ ffmpegPath, ffprobePath }) {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const safeFfmpegPath = materializeAsciiToolPath(ffmpegPath, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  const safeFfprobePath = materializeAsciiToolPath(ffprobePath, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const toolDirs = [safeFfmpegPath, safeFfprobePath]
    .filter((toolPath) => toolPath && fs.existsSync(toolPath))
    .map((toolPath) => path.dirname(toolPath));
  const uniqueToolDirs = Array.from(new Set(toolDirs));
  const joinedPath = [...uniqueToolDirs, env[pathKey] || ""].filter(Boolean).join(path.delimiter);

  env[pathKey] = joinedPath;
  env.PATH = joinedPath;
  if (process.platform === "win32") env.Path = joinedPath;
  if (safeFfmpegPath && fs.existsSync(safeFfmpegPath)) {
    env.FFMPEG_PATH = safeFfmpegPath;
    env.FFMPEG_BIN = safeFfmpegPath;
    env.HYPERFRAMES_FFMPEG_PATH = safeFfmpegPath;
  }
  if (safeFfprobePath && fs.existsSync(safeFfprobePath)) {
    env.FFPROBE_PATH = safeFfprobePath;
    env.FFPROBE_BIN = safeFfprobePath;
    env.HYPERFRAMES_FFPROBE_PATH = safeFfprobePath;
  }
  return env;
}

function materializeAsciiToolPath(sourcePath, fileName) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return "";
  const cacheRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "douyin-video-tool", "media-tools")
    : path.join(process.cwd(), ".cache-tools", "media-tools");
  const targetPath = path.join(cacheRoot, fileName);
  try {
    fs.mkdirSync(cacheRoot, { recursive: true });
    const sourceStat = fs.statSync(sourcePath);
    const targetStat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;
    if (!targetStat || targetStat.size !== sourceStat.size) {
      fs.copyFileSync(sourcePath, targetPath);
    }
    return targetPath;
  } catch {
    return sourcePath;
  }
}

function runHyperframes(cwd, args, output, env = process.env) {
  const command = "npx";
  const finalArgs = ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(command, finalArgs, { cwd, env, windowsHide: true, shell: process.platform === "win32" });
    let combined = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      combined += text;
      output.push(text.trimEnd());
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      combined += text;
      output.push(text.trimEnd());
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`HyperFrames ${args[0]} failed:\n${combined.slice(-2500)}`));
    });
  });
}

function normalizeScript(value) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw new Error("Please enter text for video generation.");
  return text.slice(0, MAX_SCRIPT_LENGTH);
}

function normalizeStyle(value) {
  const style = String(value || "cs1").toLowerCase().trim();
  const normalized = style === "warmgrain" ? "warm-grain" : style;
  if (LOCAL_TEMPLATE_IDS.has(normalized) || OFFICIAL_TEMPLATE_IDS.has(normalized)) return normalized;
  return "cs1";
}

function normalizeBeatCount(value) {
  const count = Number.parseInt(value, 10);
  return ALLOWED_BEAT_COUNTS.has(count) ? count : DEFAULT_BEAT_COUNT;
}

function isAutoBeatCount(value) {
  return String(value || "").trim().toLowerCase() === "auto";
}

function clampCardCount(value, fallback = DEFAULT_BEAT_COUNT) {
  const count = Number.parseInt(value, 10);
  const fallbackCount = Number.parseInt(fallback, 10);
  const resolved = Number.isFinite(count) ? count : fallbackCount;
  return Math.max(2, Math.min(6, Number.isFinite(resolved) ? resolved : DEFAULT_BEAT_COUNT));
}

function resolveAifmanPreferredCount(value, script = "") {
  if (isAutoBeatCount(value)) return inferAifmanCardCount(script);
  return normalizeBeatCount(value);
}

function sanitizeTitle(value) {
  return String(value || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().slice(0, 80);
}

function defaultStyleName(styleId) {
  return CS1_VIDEO_STYLES.find((style) => style.id === styleId)?.name || styleId || "HyperFrames";
}

function normalizePackagingOptions(input = {}, context = {}) {
  const introTemplateId = INTRO_TEMPLATE_IDS.has(String(input?.introTemplateId || "none")) ? String(input.introTemplateId || "none") : "none";
  const outroTemplateId = OUTRO_TEMPLATE_IDS.has(String(input?.outroTemplateId || "none")) ? String(input.outroTemplateId || "none") : "none";
  const watermarkPosition = WATERMARK_POSITIONS.has(String(input?.watermarkPosition || "top-right")) ? String(input.watermarkPosition || "top-right") : "top-right";
  const watermarkEnabled = input?.watermarkEnabled === true || input?.watermarkEnabled === "true" || input?.watermarkEnabled === "on";
  const opacityValue = Number.parseFloat(input?.watermarkOpacity);
  const watermarkOpacity = Number.isFinite(opacityValue) ? Math.max(0.15, Math.min(0.85, opacityValue)) : 0.45;
  const fallbackTitle = sanitizeTitle(context.title) || "短视频";
  return {
    introTemplateId,
    outroTemplateId,
    ctaText: sanitizeOverlayText(input?.ctaText, "关注我，持续升级认知"),
    watermark: {
      enabled: watermarkEnabled,
      text: sanitizeOverlayText(input?.watermarkText, fallbackTitle),
      position: watermarkPosition,
      opacity: Number(watermarkOpacity.toFixed(2)),
    },
  };
}

function sanitizeOverlayText(value, fallback = "") {
  return String(value || fallback || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function renderIntroTemplate(packaging, { title, keyword } = {}) {
  if (!packaging || packaging.introTemplateId === "none") return "";
  const presets = {
    brand_hook_dark: { kicker: "BRAND OPENING", sub: "固定开场 · 统一账号识别" },
    title_flash_dark: { kicker: "TODAY'S POINT", sub: "标题冲击开场 · 先抓住注意力" },
    series_badge_dark: { kicker: "SERIES", sub: "系列栏目开场 · 适合长期内容" },
  };
  const preset = presets[packaging.introTemplateId] || presets.brand_hook_dark;
  return `<section id="intro-template" class="intro-template clip" data-layout-allow-occlusion data-layout-allow-overlap data-start="0" data-duration="1.8" data-track-index="90">
    <div class="intro-box">
      <p class="intro-kicker">${escapeHtml(preset.kicker)}</p>
      <h2 class="intro-title">${title || "短视频"}</h2>
      <p class="intro-sub">${escapeHtml(keyword || preset.sub)}</p>
    </div>
  </section>`;
}

function renderOutroTemplate(packaging, { title, start = 13.3, duration = 1.5 } = {}) {
  if (!packaging || packaging.outroTemplateId === "none") return "";
  const presets = {
    follow_cta_dark: { kicker: "FOLLOW", title: "关注我", sub: packaging.ctaText || "持续升级认知" },
    comment_cta_dark: { kicker: "COMMENT", title: "评论区见", sub: packaging.ctaText || "留下你的问题" },
    consult_cta_dark: { kicker: "CONTACT", title: "私信咨询", sub: packaging.ctaText || "领取完整方案" },
  };
  const preset = presets[packaging.outroTemplateId] || presets.follow_cta_dark;
  return `<section id="outro-template" class="outro-template clip" data-start="${start.toFixed(2)}" data-duration="${duration.toFixed(2)}" data-track-index="91">
    <div class="outro-box">
      <p class="outro-kicker">${escapeHtml(preset.kicker)}</p>
      <h2 class="outro-title">${escapeHtml(preset.title)}</h2>
      <p class="outro-sub">${escapeHtml(preset.sub || title || "")}</p>
    </div>
  </section>`;
}

function renderWatermark(packaging) {
  const watermark = packaging?.watermark;
  if (!watermark?.enabled || !watermark.text) return "";
  return `<div class="watermark ${escapeHtml(watermark.position)}" style="opacity:${watermark.opacity}" data-layout-ignore>${escapeHtml(watermark.text)}</div>`;
}

function buildIntroTimeline(packaging) {
  if (!packaging || packaging.introTemplateId === "none") return "";
  return [
    `tl.fromTo("#intro-template",{opacity:0},{opacity:1,duration:.2,ease:"sine.out"},.04);`,
    `tl.from("#intro-template .intro-box",{y:34,scale:.96,opacity:0,duration:.48,ease:"power3.out"},.14);`,
    `tl.to("#intro-template",{opacity:0,duration:.34,ease:"sine.in"},1.38);`,
    `tl.set("#intro-template",{opacity:0},1.72);`,
  ].join("\n    ");
}

function buildOutroTimeline(packaging, { start = 13.4 } = {}) {
  if (!packaging || packaging.outroTemplateId === "none") return "";
  return [
    `tl.fromTo("#outro-template",{opacity:0},{opacity:1,duration:.22,ease:"sine.out"},${start.toFixed(2)});`,
    `tl.from("#outro-template .outro-box",{y:42,scale:.96,opacity:0,duration:.48,ease:"power3.out"},${(start + 0.12).toFixed(2)});`,
    `tl.to("#outro-template .outro-box",{scale:1.02,duration:.42,repeat:1,yoyo:true,ease:"sine.inOut"},${(start + 0.86).toFixed(2)});`,
  ].join("\n    ");
}

function inferTitle(script) {
  return sanitizeTitle(script.replace(/[，。！？；,.!?;].*$/, "")) || "CS1 Video";
}

function formatDateSlug(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function buildStoryModel(script, title, beatCount = DEFAULT_BEAT_COUNT) {
  const segments = splitScript(script, beatCount);
  const beats = segments.map((segment, index) => ({
    role: index === 0 ? "hook" : index === segments.length - 1 ? "action" : "build",
    text: segment,
    caption: segment,
  }));
  return storyModelFromBeats(title, beats, beatCount);
}

function buildAifmanStoryModel(script, title, beatCount = DEFAULT_BEAT_COUNT) {
  const cards = extractAifmanCardsFromScript(script, beatCount);
  const display = splitAifmanDisplayTitle(title, inferAifmanKeyword(title, script));
  return aifmanModelFromParts({
    title,
    headlineLead: display.lead,
    headlineKeyword: display.keyword,
    cards,
    fallbackTitle: title,
    preferredCount: beatCount,
  });
}

function aifmanModelFromParts({ title, headlineLead, headlineKeyword, cards, outro = "", fallbackTitle = "", preferredCount = DEFAULT_BEAT_COUNT } = {}) {
  const normalizedCards = normalizeAifmanCards(cards, preferredCount);
  const safeTitle = sanitizeTitle(title) || sanitizeTitle(fallbackTitle) || "知识卡片视频";
  const display = {
    lead: limitChineseTitle(String(headlineLead || "").trim() || splitAifmanDisplayTitle(safeTitle, headlineKeyword).lead, 12),
    keyword: limitChineseTitle(String(headlineKeyword || "").trim() || splitAifmanDisplayTitle(safeTitle, "核心动作").keyword, 8),
  };
  const beats = normalizedCards.map((card, index) => ({
    index: index + 1,
    role: `card_${index + 1}`,
    text: card.title,
    caption: `${card.subtitle}。${card.detail}`,
  }));
  return {
    title: safeTitle,
    beatCount: normalizedCards.length,
    beats,
    hook: display.lead,
    question: normalizedCards[0]?.subtitle || "先把问题拆清楚。",
    action: String(outro || normalizedCards.at(-1)?.detail || "现在开始行动。").slice(0, 90),
    caption1: normalizedCards[0]?.detail || safeTitle,
    caption2: normalizedCards[1]?.detail || "问题已经很清楚。",
    caption3: normalizedCards[2]?.detail || "现在开始行动。",
    aifmanDisplayTitle: display,
    aifmanCards: normalizedCards,
    aifmanOutro: String(outro || "").trim(),
  };
}

function listCs1Outputs(outputDir) {
  try {
    if (!fs.existsSync(outputDir)) return [];
    return fs.readdirSync(outputDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
      .map((entry) => {
        const filePath = path.join(outputDir, entry.name);
        const stat = fs.statSync(filePath);
        return {
          name: entry.name,
          filePath,
          size: stat.size,
          updatedAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 80);
  } catch {
    return [];
  }
}

function storyModelFromBeats(title, rawBeats, beatCount = DEFAULT_BEAT_COUNT) {
  const normalizedCount = normalizeBeatCount(beatCount);
  const beats = normalizeBeats(rawBeats, normalizedCount, title);
  const captions = groupBeatsForCaptions(beats);
  return {
    title,
    beatCount: beats.length,
    beats,
    hook: beats[0]?.text || title,
    question: beats[Math.min(1, beats.length - 1)]?.text || "这个问题现在就要解决。",
    action: beats.slice(Math.max(0, beats.length - 2)).map((beat) => beat.text).join(" / ") || "现在开始行动。",
    caption1: captions[0] || title,
    caption2: captions[1] || "问题已经很清楚。",
    caption3: captions[2] || "现在开始行动。",
  };
}

function normalizeBeats(rawBeats, beatCount, title) {
  const source = Array.isArray(rawBeats) ? rawBeats : [];
  const beats = source
    .map((beat, index) => {
      const text = String(beat?.text || beat?.caption || beat || "").replace(/\s+/g, " ").trim();
      const caption = String(beat?.caption || text).replace(/\s+/g, " ").trim();
      if (!text && !caption) return null;
      return {
        index: index + 1,
        role: String(beat?.role || `beat_${index + 1}`).trim().slice(0, 24),
        text: text.slice(0, 90),
        caption: caption.slice(0, 90),
      };
    })
    .filter(Boolean)
    .slice(0, beatCount);
  while (beats.length < beatCount) {
    const index = beats.length + 1;
    beats.push({
      index,
      role: index === 1 ? "hook" : index === beatCount ? "action" : "build",
      text: index === 1 ? title : index === beatCount ? "现在开始行动。" : "把问题拆开，马上执行。",
      caption: index === 1 ? title : index === beatCount ? "现在开始行动。" : "把问题拆开，马上执行。",
    });
  }
  return beats;
}

function groupBeatsForCaptions(beats) {
  const groups = [[], [], []];
  beats.forEach((beat, index) => {
    const groupIndex = Math.min(2, Math.floor((index / Math.max(1, beats.length)) * 3));
    groups[groupIndex].push(beat.caption || beat.text);
  });
  return groups.map((group) => group.join("，").slice(0, 120));
}

function splitScript(script, beatCount = DEFAULT_BEAT_COUNT) {
  const parts = script
    .split(/(?<=[。！？!?；;])|[\n|]/)
    .map((item) => item.replace(/[。！？!?；;]+$/g, "").trim())
    .filter(Boolean);
  if (parts.length >= beatCount) return parts.slice(0, beatCount);
  const chunks = [];
  const size = Math.ceil(script.length / beatCount);
  for (let i = 0; i < script.length; i += size) chunks.push(script.slice(i, i + size).trim());
  return chunks.filter(Boolean).slice(0, beatCount);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsString(value) {
  return JSON.stringify(String(value));
}

function cs1Files(model) {
  const title = escapeHtml(model.title);
  const hook = escapeHtml(model.hook);
  const question = escapeHtml(model.question);
  const action = escapeHtml(model.action);
  return {
    design: `## Style Prompt

Dark CS1 explainer video: cinematic black-brown canvas, exam-red warning blocks, large Chinese display type, deterministic three-beat motion.

## Colors

- Background: \`#12100d\`
- Panel: \`#241b16\`
- Paper: \`#f0e5ce\`
- Warning red: \`#c9362c\`
- Gold: \`#d39b45\`

## Typography

- \`"Microsoft YaHei UI", "Microsoft YaHei", sans-serif\`
- \`"IBM Plex Mono", "Cascadia Mono", monospace\`
`,
    index: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    *{box-sizing:border-box} @font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")} @font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")} @font-face{font-family:"Cascadia Mono";src:local("Cascadia Mono")}
    html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#12100d;color:#f0e5ce;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif}
    #root{position:relative;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(circle at 74% 18%,rgba(201,54,44,.22),rgba(201,54,44,0) 28%),radial-gradient(circle at 18% 78%,rgba(211,155,69,.18),rgba(211,155,69,0) 32%),#12100d}
    .texture,.lines{position:absolute;inset:0;pointer-events:none}.texture{z-index:8;opacity:.18;background-image:linear-gradient(rgba(240,229,206,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(240,229,206,.04) 1px,transparent 1px);background-size:72px 72px}.lines{z-index:1;opacity:.34;background:repeating-linear-gradient(0deg,rgba(240,229,206,.08) 0 2px,transparent 2px 54px),linear-gradient(90deg,rgba(201,54,44,.28),rgba(201,54,44,0) 18%)}
    .scene{position:absolute;inset:0;z-index:2;display:flex;width:100%;height:100%;padding:106px 132px;background:#12100d}.scene-content{position:relative;z-index:3;display:flex;flex-direction:column;justify-content:center;width:100%;height:100%;gap:34px}
    #scene-2,#scene-3{opacity:0}.label{width:max-content;padding:12px 18px;border:1px solid rgba(211,155,69,.46);color:#d39b45;background:rgba(36,27,22,.76);font:700 24px "Cascadia Mono",monospace;letter-spacing:.08em;text-transform:uppercase}
    h1,h2{margin:0;max-width:1340px;color:#f0e5ce;font-weight:900;line-height:1.08;letter-spacing:.01em}h1{font-size:116px}h2{font-size:104px}.red{color:#ff6258}.subline{margin:0;max-width:1040px;color:#c8b99d;font-size:39px;line-height:1.42}
    .stamp{position:absolute;right:140px;bottom:92px;width:300px;height:300px;display:flex;align-items:center;justify-content:center;border:12px solid #c9362c;border-radius:50%;color:#ff6258;font-size:52px;font-weight:900;transform:rotate(-12deg)}
    .action{padding:30px 38px;border-left:10px solid #c9362c;background:rgba(36,27,22,.82);color:#f0e5ce;font-size:48px;font-weight:900;max-width:1180px}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="1920" data-height="1080">
    <div class="lines" data-layout-ignore></div><div class="texture" data-layout-ignore></div>
    <section id="scene-1" class="scene clip" data-start="0" data-duration="3.35" data-track-index="1"><div class="scene-content"><div class="label">CS1 HOOK</div><h1>${hook}</h1><p class="subline">${title}</p></div></section>
    <section id="scene-2" class="scene clip" data-start="3.05" data-duration="3.35" data-track-index="2"><div class="scene-content"><div class="label">QUESTION</div><h2>${question}</h2></div><div class="stamp" data-layout-ignore>NOW</div></section>
    <section id="scene-3" class="scene clip" data-start="6.15" data-duration="3.85" data-track-index="3"><div class="scene-content"><div class="label">START NOW</div><h2><span class="red">Start</span> today</h2><div class="action">${action}</div></div></section>
  </div>
  <script>
    window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
    tl.from("#scene-1 .label",{y:32,opacity:0,duration:.38,ease:"power3.out"},.15).from("#scene-1 h1",{y:60,opacity:0,duration:.56,ease:"expo.out"},.36).from("#scene-1 .subline",{x:-44,opacity:0,duration:.44,ease:"power2.out"},.82);
    tl.fromTo("#scene-2",{x:170,opacity:0},{x:0,opacity:1,duration:.42,ease:"power2.inOut"},3.05).to("#scene-1",{x:-120,opacity:0,duration:.42,ease:"power2.inOut"},3.05).from("#scene-2 .label",{y:32,opacity:0,duration:.36,ease:"power3.out"},3.28).from("#scene-2 h2",{scale:.96,opacity:0,duration:.5,ease:"expo.out"},3.52).from("#scene-2 .stamp",{scale:1.45,rotation:8,opacity:0,duration:.34,ease:"power4.out"},4.25).to("#scene-2 .stamp",{scale:1.08,duration:.28,repeat:5,yoyo:true,ease:"sine.inOut"},4.7);
    tl.fromTo("#scene-3",{y:145,opacity:0},{y:0,opacity:1,duration:.48,ease:"power3.inOut"},6.15).to("#scene-2",{y:-115,opacity:0,duration:.48,ease:"power3.inOut"},6.15).from("#scene-3 .label",{y:30,opacity:0,duration:.36,ease:"power2.out"},6.42).from("#scene-3 h2",{y:58,opacity:0,duration:.5,ease:"expo.out"},6.84).from("#scene-3 .action",{x:62,opacity:0,duration:.38,ease:"power4.out"},7.28).to("#root",{opacity:0,duration:.42,ease:"sine.in"},9.55);
    window.__timelines.main=tl;
  </script>
</body>
</html>`,
  };
}

function aifmanManagerCardFiles(model, { bgmMode = "builtin_dark_pulse_128", bgmPath = "", packaging = {} } = {}) {
  const width = 1280;
  const height = 720;
  const cards = buildAifmanCards(model);
  const cardCount = cards.length;
  const beatStep = 60 / 128;
  const snapBeat = (seconds) => Number((Math.round(seconds / beatStep) * beatStep).toFixed(3));
  const cardDuration = snapBeat(cardCount <= 3 ? beatStep * 7 : cardCount === 4 ? beatStep * 6 : beatStep * 5);
  const firstCardStart = snapBeat(beatStep * 8);
  const duration = Math.max(15, snapBeat(firstCardStart + cardCount * cardDuration + beatStep * 3));
  const bgm = resolveCs1Bgm({ bgmMode, bgmPath, duration });
  const packagingOptions = normalizePackagingOptions(packaging, { title: model.title || "短视频" });
  const title = escapeHtml(model.title || "升到管理岗的必备能力");
  const displayTitle = model.aifmanDisplayTitle || splitAifmanDisplayTitle(model.title || "", cards[0]?.keyword || "必备能力");
  const lead = escapeHtml(displayTitle.lead);
  const keyword = escapeHtml(displayTitle.keyword);
  const particleSeeds = [
    [404, 48, 5], [446, 58, 8], [512, 36, 4], [584, 38, 7], [648, 52, 11],
    [700, 74, 6], [466, 104, 6], [536, 92, 12], [608, 112, 5], [682, 126, 8],
    [418, 146, 4], [484, 158, 7], [562, 148, 5], [628, 170, 4], [708, 164, 6],
    [768, 96, 4], [726, 34, 7], [370, 94, 5], [338, 142, 4], [792, 144, 5],
  ];
  const particles = particleSeeds.map(([x, y, size], index) => {
    return `<i class="particle p${index + 1}" style="--x:${x}px;--y:${y}px;--s:${size}px"></i>`;
  }).join("");
  const cardSections = cards.map((card, index) => {
    const start = firstCardStart + index * cardDuration;
    const cardId = `card-${index + 1}`;
    return `<section id="${cardId}" class="ability-card clip" data-start="${start.toFixed(2)}" data-duration="${(cardDuration + 0.32).toFixed(2)}" data-track-index="${index + 3}">
      <div class="card-grid">
        <div class="card-copy">
          <h2 data-layout-allow-overlap><span data-layout-allow-overlap>${index + 1}.</span> ${escapeHtml(card.title)}</h2>
          <h3>${escapeHtml(card.subtitle)}</h3>
          <p>${escapeHtml(card.detail)}</p>
          <b></b>
        </div>
        <div class="node-map" data-layout-ignore>
          <em class="node-ring"></em>
          <i class="node-bubble b1"></i>
          <i class="node-bubble b2"></i>
          <i class="node-bubble b3"></i>
          <i class="node-bubble b4"></i>
          <i class="node-bubble b5"></i>
        </div>
        <div class="light-node" data-layout-ignore></div>
      </div>
    </section>`;
  }).join("");
  const transitionSweeps = cards.map((_, index) => {
    const start = firstCardStart + index * cardDuration;
    return [
      `tl.fromTo(".transition-wipe",{xPercent:-112,opacity:0},{xPercent:0,opacity:.82,duration:.16,ease:"power4.out"},${Math.max(0, start - 0.14).toFixed(3)});`,
      `tl.to(".transition-wipe",{xPercent:112,opacity:0,duration:.24,ease:"power3.in"},${(start + 0.04).toFixed(3)});`,
      `tl.fromTo(".beat-spark",{opacity:0,scale:.62},{opacity:.85,scale:1.18,duration:.18,ease:"expo.out"},${(start + 0.02).toFixed(3)});`,
      `tl.to(".beat-spark",{opacity:0,scale:1.55,duration:.32,ease:"sine.in"},${(start + 0.22).toFixed(3)});`,
    ].join("\n    ");
  }).join("\n    ");
  const cardAnimations = cards.map((_, index) => {
    const start = firstCardStart + index * cardDuration;
    const previous = index === 0 ? "#title-scene" : `#card-${index}`;
    const current = `#card-${index + 1}`;
    return [
      `tl.fromTo("${current}",{opacity:0,y:34,clipPath:"inset(0 100% 0 0)"},{opacity:1,y:0,clipPath:"inset(0 0% 0 0)",duration:.42,ease:"power4.out"},${start.toFixed(3)});`,
      `tl.to("${previous}",{opacity:0,filter:"blur(5px)",scale:.985,duration:.24,ease:"power2.in"},${(start + 0.08).toFixed(3)});`,
      `tl.from("${current} h2",{x:-42,opacity:0,duration:.36,ease:"expo.out"},${(start + 0.16).toFixed(3)});`,
      `tl.from("${current} h3",{x:-26,opacity:0,duration:.32,ease:"power3.out"},${(start + 0.42).toFixed(3)});`,
      `tl.from("${current} p",{y:18,opacity:0,duration:.34,ease:"sine.out"},${(start + 0.7).toFixed(3)});`,
      `tl.from("${current} b",{scaleX:0,transformOrigin:"left center",duration:.42,ease:"power2.out"},${(start + 0.3).toFixed(3)});`,
      `tl.from("${current} .node-ring",{scale:.35,opacity:0,rotation:-16,duration:.34,ease:"back.out(1.8)"},${(start + 0.2).toFixed(3)});`,
      `tl.from("${current} .node-bubble",{scale:.18,opacity:0,y:10,duration:.28,stagger:.045,ease:"power3.out"},${(start + 0.32).toFixed(3)});`,
      `tl.from("${current} .light-node",{scale:.2,opacity:0,duration:.3,ease:"back.out(1.8)"},${(start + 0.54).toFixed(3)});`,
      `tl.to("${current} .node-ring",{scale:1.08,rotation:8,duration:.42,repeat:2,yoyo:true,ease:"sine.inOut"},${(start + 0.82).toFixed(3)});`,
      `tl.to("${current} .light-node",{scale:1.18,duration:${beatStep.toFixed(3)},repeat:4,yoyo:true,ease:"sine.inOut"},${(start + beatStep * 2).toFixed(3)});`,
    ].join("\n    ");
  }).join("\n    ");
  const lastCardSelector = `#card-${cardCount}`;
  const outroStart = Math.max(firstCardStart + cardCount * cardDuration - 0.28, 13.2);
  const introHtml = renderIntroTemplate(packagingOptions, { title, keyword, duration });
  const outroHtml = renderOutroTemplate(packagingOptions, { title, keyword, start: outroStart + 0.2, duration: Math.max(1.3, duration - outroStart - 0.25) });
  const watermarkHtml = renderWatermark(packagingOptions);
  const introTimeline = buildIntroTimeline(packagingOptions);
  const outroTimeline = buildOutroTimeline(packagingOptions, { start: outroStart + 0.2 });

  return {
    width,
    height,
    duration,
    assets: bgm.assets,
    bgm: bgm.label ? { mode: bgm.mode, label: bgm.label } : null,
    packaging: packagingOptions,
    design: `## Style Prompt

AIfman-inspired knowledge card template. Dark olive cinematic canvas, soft black vignette center, gold headlines, mint-green keyword emphasis, minimal particles, orbit ring, and dynamic 2-6 knowledge cards based on the script.

## Colors

- Background: \`#17170c\`
- Vignette: \`#020302\`
- Gold: \`#f1d44a\`
- Amber: \`#d8952c\`
- Mint: \`#25e29a\`
- Muted text: \`#d7c782\`

## Typography

- \`"Microsoft YaHei UI", "Microsoft YaHei", sans-serif\`
- Bold Chinese display type, large card headings, compact body text.
`,
    index: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, height=${height}" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    *{box-sizing:border-box}
    @font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}
    @font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#17170c;color:#f1d44a;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif}
    #root{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#252512}
    #root:before{content:"";position:absolute;inset:0;z-index:1;background:radial-gradient(circle at 51% 50%,rgba(0,0,0,.98) 0 15%,rgba(0,0,0,.82) 24%,rgba(0,0,0,.52) 40%,rgba(0,0,0,.18) 60%,rgba(0,0,0,0) 76%),radial-gradient(circle at 44% 22%,rgba(245,219,74,.09),rgba(245,219,74,0) 34%);pointer-events:none}
    .grain,.scan,.glow,.orbit,.hero-halos,.hero-halo,.particle{position:absolute;pointer-events:none}.grain{inset:0;z-index:20;opacity:.13;background:repeating-linear-gradient(0deg,rgba(255,255,255,.026) 0 1px,rgba(255,255,255,0) 1px 4px),repeating-linear-gradient(90deg,rgba(0,0,0,.12) 0 1px,rgba(0,0,0,0) 1px 7px)}.scan{inset:0;z-index:2;background:radial-gradient(circle at 17% 20%,rgba(241,212,74,.08),rgba(241,212,74,0) 32%),radial-gradient(circle at 83% 44%,rgba(241,212,74,.05),rgba(241,212,74,0) 28%);opacity:.86}.glow{left:330px;top:34px;width:450px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,244,135,.34),rgba(255,244,135,.08) 48%,rgba(255,244,135,0) 72%);filter:blur(13px);opacity:0}.orbit{display:none}.hero-halos{left:0;top:0;right:0;bottom:0;z-index:4;opacity:1}.hero-halo{left:50%;top:50%;border-radius:50%;opacity:0;border:2.5px solid rgba(241,212,74,.38);box-shadow:0 0 58px rgba(241,212,74,.18),inset 0 0 58px rgba(37,226,154,.08)}.hero-halo.h1{width:520px;height:520px;margin-left:-260px;margin-top:-260px;border-color:rgba(241,212,74,.48)}.hero-halo.h2{width:680px;height:680px;margin-left:-340px;margin-top:-340px;border-color:rgba(37,226,154,.36)}.hero-halo.h3{width:840px;height:840px;margin-left:-420px;margin-top:-420px;border-color:rgba(255,255,255,.22)}
    .particle{left:var(--x);top:var(--y);width:var(--s);height:var(--s);border-radius:50%;background:rgba(245,245,232,.76);box-shadow:0 0 13px rgba(255,255,255,.54);opacity:0;z-index:9}.topline{position:absolute;left:0;right:0;top:30px;z-index:12;text-align:center;color:#f1d44a;font-size:24px;font-weight:900;line-height:1.35;text-shadow:0 0 13px rgba(241,212,74,.23);opacity:0}.scene,.ability-card{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:76px 94px}.title-stack{text-align:center;transform:translateY(-12px)}.title-stack h1{margin:0;font-size:72px;line-height:1.22;font-weight:900;letter-spacing:.025em;color:#f1d44a;text-shadow:0 0 18px rgba(241,212,74,.20)}.title-stack h1 span{color:#f06d75}.title-stack h2{margin:34px 0 0;font-size:92px;line-height:1.12;font-weight:900;letter-spacing:.025em;color:#25e29a;text-shadow:0 0 18px rgba(37,226,154,.26)}.title-stack small{display:none}.ability-card{opacity:0;justify-content:flex-start}.card-grid{position:relative;width:100%;height:100%;display:flex;align-items:flex-start;padding-top:82px}.card-copy{position:relative;width:670px;margin-left:18px;padding-left:36px}.card-copy:before{content:"";position:absolute;left:0;top:8px;bottom:14px;width:2px;background:linear-gradient(#f1d44a,rgba(241,212,74,.06))}.card-copy h2{margin:0 0 32px;color:#f1d44a;font-size:58px;line-height:1.26;font-weight:900;letter-spacing:.018em;text-shadow:0 0 18px rgba(241,212,74,.18)}.card-copy h2 span{color:#c99531}.card-copy h3{margin:0 0 26px;color:#d8952c;font-size:36px;font-weight:850;line-height:1.42}.card-copy p{margin:0;max-width:625px;color:#e3dfc7;font-size:22px;font-weight:700;line-height:1.82;opacity:.94}.card-copy b{display:block;width:414px;height:2px;margin-top:30px;background:linear-gradient(90deg,rgba(241,212,74,.82),rgba(241,212,74,0))}.node-map{position:absolute;left:735px;top:126px;width:235px;height:230px}.node-ring{position:absolute;left:55px;top:45px;width:126px;height:126px;border:2px solid rgba(241,212,74,.32);border-radius:50%;box-shadow:0 0 34px rgba(241,212,74,.12),inset 0 0 24px rgba(37,226,154,.08);opacity:.82}.node-ring:before,.node-ring:after{content:"";position:absolute;border-radius:50%;border:1px solid rgba(37,226,154,.28)}.node-ring:before{inset:22px}.node-ring:after{inset:48px;background:rgba(37,226,154,.08)}.node-bubble{position:absolute;width:17px;height:17px;border-radius:50%;background:#25e29a;box-shadow:0 0 0 9px rgba(37,226,154,.08),0 0 23px rgba(37,226,154,.62);opacity:.9}.b1{left:38px;top:78px}.b2{left:132px;top:28px;background:#f1d44a}.b3{left:188px;top:112px}.b4{left:108px;top:166px;background:#d8952c}.b5{left:18px;top:151px}.light-node{position:absolute;left:666px;top:220px;width:13px;height:13px;border-radius:50%;background:#f1d44a;box-shadow:0 0 0 8px rgba(241,212,74,.12),0 0 24px rgba(241,212,74,.82)}.light-node:before{content:"";position:absolute;left:-126px;top:6px;width:118px;height:1px;background:linear-gradient(90deg,rgba(241,212,74,0),rgba(241,212,74,.68))}.transition-wipe{position:absolute;inset:0;z-index:24;opacity:0;background:linear-gradient(90deg,rgba(23,23,12,0),rgba(241,212,74,.16) 34%,rgba(37,226,154,.28) 48%,rgba(241,212,74,.16) 62%,rgba(23,23,12,0));filter:blur(.4px);pointer-events:none}.beat-spark{position:absolute;left:661px;top:216px;z-index:25;width:26px;height:26px;border-radius:50%;border:2px solid rgba(241,212,74,.8);box-shadow:0 0 32px rgba(241,212,74,.42);opacity:0;pointer-events:none}.intro-template,.outro-template{position:absolute;inset:0;z-index:34;display:flex;align-items:center;justify-content:center;background:rgba(5,6,4,.88);color:#f1d44a;opacity:0}.intro-box,.outro-box{width:880px;min-height:260px;padding:46px 58px;border:1px solid rgba(241,212,74,.32);background:linear-gradient(135deg,rgba(23,23,12,.96),rgba(37,37,18,.82));box-shadow:0 0 80px rgba(241,212,74,.12)}.intro-kicker,.outro-kicker{margin:0 0 20px;color:#25e29a;font-size:22px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.intro-title,.outro-title{margin:0;color:#f1d44a;font-size:58px;font-weight:900;line-height:1.22}.intro-sub,.outro-sub{margin:24px 0 0;color:#e3dfc7;font-size:28px;font-weight:800;line-height:1.55}.watermark{position:absolute;z-index:36;max-width:360px;padding:8px 14px;border:1px solid rgba(241,212,74,.22);border-radius:999px;background:rgba(5,6,4,.38);color:#f1d44a;font-size:18px;font-weight:900;line-height:1.25;letter-spacing:.03em;text-shadow:0 0 10px rgba(0,0,0,.42);pointer-events:none}.watermark.top-right{right:34px;top:26px}.watermark.top-left{left:34px;top:26px}.watermark.bottom-right{right:34px;bottom:28px}.watermark.bottom-left{left:34px;bottom:28px}.final-dim{position:absolute;inset:0;background:#17170c;opacity:0;z-index:30}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}">
    ${bgm.src ? `<audio id="bgm" data-start="0" data-duration="${duration}" data-track-index="50" src="${bgm.src}" data-volume="${bgm.volume}"></audio>` : ""}
    <div class="scan" data-layout-ignore></div>
    <div class="grain" data-layout-ignore></div>
    <div class="glow" data-layout-ignore></div>
    <div class="hero-halos" data-layout-ignore>
      <i class="hero-halo h1"></i>
      <i class="hero-halo h2"></i>
      <i class="hero-halo h3"></i>
    </div>
    <div class="orbit" data-layout-ignore></div>
    ${particles}
    <div class="transition-wipe" data-layout-ignore></div>
    <div class="beat-spark" data-layout-ignore></div>
    <div class="topline">${title}</div>
    ${introHtml}
    <section id="title-scene" class="scene clip" data-start="0" data-duration="3.8" data-track-index="1">
      <div class="title-stack">
        <h1>${lead}</h1>
        <h2>${keyword}</h2>
        <small>MANAGEMENT ABILITY</small>
      </div>
    </section>
    <section id="blank-scene" class="scene clip" data-start="3.35" data-duration=".85" data-track-index="2"></section>
    ${cardSections}
    ${outroHtml}
    ${watermarkHtml}
    <div class="final-dim" data-layout-ignore></div>
  </div>
  <script>
    window.__timelines=window.__timelines||{};
    const tl=gsap.timeline({paused:true});
    tl.from("#title-scene h1",{y:28,opacity:0,duration:.42,ease:"power3.out"},.18)
      .from("#title-scene h2",{y:36,opacity:0,scale:.94,duration:.54,ease:"expo.out"},.68)
      .from("#title-scene small",{y:18,opacity:0,duration:.32,ease:"sine.out"},1.2)
      .fromTo(".glow",{opacity:0,scale:.7},{opacity:1,scale:1,duration:.72,ease:"sine.out"},1.35)
      .fromTo(".hero-halo",{opacity:0,scale:.84},{opacity:.88,scale:1,duration:.26,stagger:.04,ease:"sine.out"},.04)
      .to(".hero-halo",{opacity:.84,duration:.78,ease:"none"},.38)
      .to(".hero-halo.h1",{scale:1.38,opacity:.16,duration:1.78,ease:"sine.inOut"},1.18)
      .to(".hero-halo.h2",{scale:1.52,opacity:.12,duration:1.96,ease:"sine.inOut"},1.08)
      .to(".hero-halo.h3",{scale:1.68,opacity:.08,duration:2.12,ease:"sine.inOut"},.98)
      .to(".hero-halos",{opacity:0,duration:.42,ease:"sine.in"},3.12);
    ${introTimeline}
    ${particleSeeds.map((_, index) => {
      const start = 1.34 + (index % 7) * 0.042 + Math.floor(index / 7) * 0.08;
      const x = 36 + (index % 5) * 13;
      const y = 32 + Math.floor(index / 5) * 10;
      const exitStart = 2.94 + (index % 5) * 0.07;
      const exitEnd = exitStart + 0.36;
      return `tl.fromTo(".p${index + 1}",{opacity:0,scale:.25,x:${-x},y:${-y}},{opacity:.82,scale:1,x:0,y:0,duration:.36,ease:"power2.out"},${start.toFixed(2)}).to(".p${index + 1}",{opacity:0,duration:.36,ease:"sine.in"},${exitStart.toFixed(2)}).set(".p${index + 1}",{opacity:0},${exitEnd.toFixed(2)});`;
    }).join("\n    ")}
    tl.to(".topline",{opacity:1,duration:.22,ease:"sine.out"},3.75)
      .to("#blank-scene",{opacity:1,duration:.18,ease:"sine.out"},3.35)
      .to(".orbit",{opacity:.25,scale:.82,duration:.35,ease:"power2.in"},3.25)
      .to(".glow",{opacity:.26,scale:1.25,duration:.62,ease:"sine.inOut"},3.1);
    ${transitionSweeps}
    ${cardAnimations}
    ${outroTimeline}
    tl.to("${lastCardSelector}",{opacity:0,y:-22,duration:.36,ease:"power2.in"},${outroStart.toFixed(2)})
      .to(".topline",{opacity:0,duration:.28,ease:"sine.in"},${(outroStart + 0.15).toFixed(2)})
      .to(".final-dim",{opacity:.96,duration:.62,ease:"sine.inOut"},${(outroStart + 0.3).toFixed(2)})
      .to("#root",{opacity:0,duration:.3,ease:"sine.in"},${Math.max(duration - 0.35, outroStart + 0.9).toFixed(2)});
    window.__timelines.main=tl;
  </script>
</body>
</html>`,
  };
}

function buildAifmanCards(model) {
  const defaults = [
    { title: "沟通能力", subtitle: "向上平行向下兼容", detail: "向上汇报、平行协作、向下管理都要有秩序", keyword: "必备能力" },
    { title: "解决问题", subtitle: "深入一线直面问题", detail: "深入一线找真问题，不做浮于表面的分析", keyword: "必备能力" },
    { title: "开会能力", subtitle: "准备目标结果", detail: "明确准备、目标明确、集体讨论出结果", keyword: "必备能力" },
  ];
  const explicitCards = normalizeAifmanCards(model?.aifmanCards || [], model?.beatCount || DEFAULT_BEAT_COUNT);
  if (explicitCards.length) return explicitCards;
  const beats = Array.isArray(model?.beats) ? model.beats : [];
  const beatCards = beats.map((beat, index) => {
    const parsed = cardFromTextPair(beat?.text || "", beat?.caption || "", index);
    return parsed;
  }).filter(Boolean);
  if (beatCards.length >= 2) return normalizeAifmanCards(beatCards, beats.length);
  return defaults.map((fallback, index) => {
    const beat = beats[index] || {};
    const text = String(beat.text || "").trim();
    const caption = String(beat.caption || "").trim();
    return {
      title: text && text.length <= 18 ? text : fallback.title,
      subtitle: caption && caption.length <= 24 ? caption : fallback.subtitle,
      detail: caption && caption.length > 24 ? caption : fallback.detail,
      keyword: fallback.keyword,
    };
  });
}

function normalizeAifmanCards(cards, preferredCount = DEFAULT_BEAT_COUNT) {
  const targetMax = clampCardCount(preferredCount);
  const rows = (Array.isArray(cards) ? cards : [])
    .map((card, index) => {
      const title = compactText(card?.title || card?.name || card?.text || "", 10);
      const subtitle = compactText(card?.subtitle || card?.caption || card?.summary || "", 18);
      const detail = compactText(card?.detail || card?.description || card?.body || card?.reason || subtitle || title, 42);
      const normalizedTitle = title || inferShortTitle(detail, index);
      if (!normalizedTitle && !subtitle && !detail) return null;
      return {
        title: limitChineseTitle(normalizedTitle || `重点${index + 1}`, 10),
        subtitle: limitChineseTitle(subtitle || detail || normalizedTitle, 18),
        detail: limitChineseTitle(detail || subtitle || normalizedTitle, 42),
        keyword: compactText(card?.keyword || "核心动作", 8),
      };
    })
    .filter(Boolean)
    .slice(0, targetMax);
  return rows.length >= 2 ? rows : [];
}

function extractAifmanCardsFromScript(script, preferredCount = DEFAULT_BEAT_COUNT) {
  const clean = String(script || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (!clean) return [];
  const markerPattern = /(?:^|[。！？!?；;\n]\s*)(?:第?\s*([一二三四五六七八九十]+)|([1-9]))[、.．:：，]\s*/g;
  const matches = [...clean.matchAll(markerPattern)];
  if (matches.length >= 2) {
    return matches.map((match, index) => {
      const start = match.index + match[0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index : clean.length;
      return cardFromSentence(clean.slice(start, end), index);
    }).filter(Boolean);
  }
  const lines = clean
    .split(/\n+/)
    .map((line) => line.replace(/^[，。！？、,.!?:：；;\s]+|[，。！？、,.!?:：；;\s]+$/g, "").trim())
    .filter((line) => line.length >= 4);
  if (lines.length >= 2) {
    const count = clampCardCount(preferredCount, lines.length);
    const bodyLines = lines.length > count ? lines.slice(1, count + 1) : lines.slice(0, count);
    return bodyLines.map((line, index) => cardFromSentence(line, index)).filter(Boolean);
  }
  const sentences = splitSentences(clean);
  const count = Math.max(2, Math.min(6, clampCardCount(preferredCount, inferAifmanCardCount(clean)), sentences.length || 2));
  const bodySentences = sentences.length > count ? sentences.slice(1, count + 1) : sentences.slice(0, count);
  return bodySentences.map((sentence, index) => cardFromSentence(sentence, index)).filter(Boolean);
}

function inferAifmanCardCount(script = "") {
  const clean = String(script || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (!clean) return DEFAULT_BEAT_COUNT;
  const markerPattern = /(?:^|[。！？!?；;\n]\s*)(?:第?\s*[一二三四五六七八九十]+|[1-9])[、.．:：，]/g;
  const markerCount = [...clean.matchAll(markerPattern)].length;
  if (markerCount >= 2) return clampCardCount(markerCount);
  const lines = clean
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4);
  if (lines.length >= 2) return clampCardCount(lines.length > 6 ? lines.length - 1 : lines.length);
  const sentenceCount = splitSentences(clean).length;
  if (sentenceCount >= 4) return clampCardCount(sentenceCount - 1);
  return clampCardCount(sentenceCount || DEFAULT_BEAT_COUNT);
}

function cardFromSentence(sentence, index = 0) {
  const text = String(sentence || "").replace(/^[，。！？、,.!?:：；;\s]+|[，。！？、,.!?:：；;\s]+$/g, "").trim();
  if (!text) return null;
  const parts = text.split(/[，,。；;：:]/).map((item) => item.trim()).filter(Boolean);
  const title = inferShortTitle(parts[0] || text, index);
  const subtitle = compactText(parts[1] || parts[0] || text, 18);
  const detail = compactText(parts.slice(1).join("，") || text, 42);
  return { title, subtitle, detail, keyword: "核心动作" };
}

function cardFromTextPair(text, caption, index = 0) {
  const source = String(caption || text || "").trim();
  if (!source) return null;
  return cardFromSentence(source, index);
}

function splitSentences(value = "") {
  return String(value || "")
    .split(/(?<=[。！？!?；;])|[|]/)
    .map((item) => item.replace(/^[，。！？、,.!?:：；;\s]+|[，。！？、,.!?:：；;\s]+$/g, "").trim())
    .filter(Boolean);
}

function inferShortTitle(value = "", index = 0) {
  const text = String(value || "").trim();
  const quoted = text.match(/[“"「『]?([\u4e00-\u9fa5A-Za-z]{2,8})(?:能力|方法|动作|习惯|思维|技巧|问题|误区|训练|练习)/);
  if (quoted) return limitChineseTitle(quoted[0].replace(/[“"「『」』]/g, ""), 10);
  const cleaned = text
    .replace(/^(不要|别|先|要|必须|一定|就是|所谓|真正|你要|孩子要)/, "")
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  if (cleaned.length >= 2) return limitChineseTitle(cleaned, 8);
  return `重点${index + 1}`;
}

function compactText(value = "", maxLength = 24) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function splitAifmanDisplayTitle(title = "", fallbackKeyword = "必备能力") {
  const clean = String(title || "")
    .replace(/[，。！？、,.!?:：；;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return { lead: "升到管理岗的", keyword: fallbackKeyword || "必备能力" };
  const keywordCandidates = [
    "必备能力",
    "核心能力",
    "关键能力",
    "三个能力",
    "三个方法",
    "三个动作",
    "避坑指南",
  ];
  const matched = keywordCandidates.find((item) => clean.includes(item));
  if (matched) {
    const lead = clean.replace(matched, "").trim() || "升到管理岗的";
    return { lead: limitChineseTitle(lead, 11), keyword: matched };
  }
  const deIndex = clean.lastIndexOf("的");
  if (deIndex >= 2 && deIndex < clean.length - 2) {
    return {
      lead: limitChineseTitle(clean.slice(0, deIndex + 1), 11),
      keyword: limitChineseTitle(clean.slice(deIndex + 1), 6),
    };
  }
  return {
    lead: limitChineseTitle(clean, 11),
    keyword: fallbackKeyword || "必备能力",
  };
}

function inferAifmanKeyword(title = "", script = "") {
  const text = `${title} ${script}`;
  if (/避坑|错误|别再|不要/.test(text)) return "避坑指南";
  if (/方法|怎么|如何|训练|练习/.test(text)) return "正确方法";
  if (/能力|管理|领导/.test(text)) return "必备能力";
  if (/动作|步骤|执行/.test(text)) return "核心动作";
  return "核心动作";
}

function resolveCs1Bgm({ bgmMode = "builtin_dark_pulse_128", bgmPath = "", duration = 15 } = {}) {
  const mode = String(bgmMode || "builtin_dark_pulse_128").trim();
  if (mode === "none") return { mode: "none", src: "", label: "", volume: 0, assets: {} };
  if (mode === "local") {
    const resolved = path.resolve(String(bgmPath || "").trim());
    const ext = path.extname(resolved).toLowerCase();
    const supported = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
    if (resolved && fs.existsSync(resolved) && supported.has(ext)) {
      return {
        mode: "local",
        src: `assets/bgm${ext}`,
        label: path.basename(resolved),
        volume: 0.16,
        assets: { [`assets/bgm${ext}`]: { copyFrom: resolved } },
      };
    }
  }
  return {
    mode: "builtin_dark_pulse_128",
    src: "assets/bgm-default-128bpm.wav",
    label: "管理岗卡片风 · 128BPM 暗色律动",
    volume: 0.16,
    assets: { "assets/bgm-default-128bpm.wav": writeCs1DefaultBgmWavBuffer(duration) },
  };
}

function writeCs1DefaultBgmWavBuffer(durationSeconds = 15) {
  const sampleRate = 44100;
  const duration = Math.max(1, Math.min(90, Number(durationSeconds || 0) || 15));
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
  const bpm = 128;
  const beat = 60 / bpm;
  const halfBeat = beat / 2;
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const fadeIn = Math.min(1, t / 1.2);
    const fadeOut = Math.min(1, (duration - t) / 1.4);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const beatPhase = t % beat;
    const halfPhase = t % halfBeat;
    const bass = Math.sin(2 * Math.PI * 96 * t) * 0.12;
    const mid = Math.sin(2 * Math.PI * 144 * t) * 0.05;
    const high = Math.sin(2 * Math.PI * 216 * t) * 0.025;
    const kick = beatPhase < 0.18
      ? Math.sin(2 * Math.PI * (70 + 42 * (1 - beatPhase / 0.18)) * t) * Math.exp(-beatPhase * 16) * 0.34
      : 0;
    const tickNoise = Math.sin((index + 17) * 12.9898) * 43758.5453;
    const tick = halfPhase < 0.026
      ? (tickNoise - Math.floor(tickNoise) - 0.5) * Math.exp(-halfPhase * 105) * 0.07
      : 0;
    const value = (bass + mid + high + kick + tick) * envelope;
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 2);
  }
  return buffer;
}

function limitChineseTitle(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function warmGrainFiles(model) {
  const hook = escapeHtml(model.hook);
  const question = escapeHtml(model.question);
  const action = escapeHtml(model.action);
  return {
    design: `## Style Prompt

HyperFrames warm-grain template language: cream paper, grain texture, forest green, ochre, terracotta, and serious printed-notice pacing.
`,
    index: `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=1920, height=1080"/><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><style>
*{box-sizing:border-box}@font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#f5f0e0;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif}#main-composition{position:relative;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(circle at 18% 20%,rgba(196,93,62,.2),rgba(196,93,62,0) 28%),radial-gradient(circle at 84% 80%,rgba(59,94,58,.18),rgba(59,94,58,0) 30%),#f5f0e0}.grain{position:absolute;inset:-50%;width:200%;height:200%;opacity:.8;background:repeating-linear-gradient(0deg,rgba(43,33,24,.045) 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,rgba(43,33,24,.032) 0 1px,transparent 1px 5px);z-index:100;pointer-events:none}.comp-layer{position:absolute;inset:0;pointer-events:none}.rule{position:absolute;left:0;right:0;height:2px;background:rgba(122,98,72,.28)}.top{top:155px}.bottom{bottom:140px}
</style></head><body><div id="main-composition" data-composition-id="main-video" data-width="1920" data-height="1080" data-start="0" data-duration="10"><div class="rule top" data-layout-ignore></div><div class="rule bottom" data-layout-ignore></div><div class="grain" data-layout-ignore></div><div id="intro-layer" class="comp-layer" data-composition-id="intro" data-composition-src="compositions/intro.html" data-start="0" data-duration="3.1" data-track-index="1"></div><div id="graphics-layer" class="comp-layer" data-composition-id="graphics" data-composition-src="compositions/graphics.html" data-start="0" data-duration="10" data-track-index="2"></div><div id="captions-layer" class="comp-layer" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="10" data-track-index="3"></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.to("#main-composition",{opacity:0,duration:.38,ease:"sine.in"},9.62);window.__timelines["main-video"]=tl;</script></div></body></html>`,
    compositions: {
      "intro.html": `<template id="intro-template"><div id="intro-root" data-composition-id="intro" data-width="1920" data-height="1080" data-duration="3.1"><div class="container"><div class="title-card"><p class="eyebrow">WARM GRAIN</p><h1>${hook}</h1><p>${escapeHtml(model.title)}</p></div></div><style>@font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}#intro-root .container{width:100%;height:100%;display:flex;align-items:center;padding:92px 120px;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif}#intro-root .title-card{width:980px;padding:48px 58px 54px;border-radius:28px;background:#3b5e3a;box-shadow:0 24px 70px rgba(43,33,24,.18);opacity:0}#intro-root .eyebrow{margin:0 0 22px;color:#f6d8a0;font-size:34px;font-weight:800;letter-spacing:.08em}#intro-root h1{margin:0;color:#f5f0e0;font-size:82px;font-weight:900;line-height:1.12}#intro-root p:last-child{margin:24px 0 0;color:#f6d8a0;font-size:36px;line-height:1.34}</style><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script>(()=>{const tl=gsap.timeline({paused:true});tl.fromTo("#intro-root .title-card",{opacity:0,xPercent:-120},{opacity:1,xPercent:0,duration:.72,ease:"power2.out"},.18).from("#intro-root .eyebrow",{y:24,opacity:0,duration:.36,ease:"power3.out"},.42).from("#intro-root h1",{y:42,opacity:0,duration:.48,ease:"expo.out"},.62).from("#intro-root p:last-child",{x:-28,opacity:0,duration:.38,ease:"sine.out"},1.08);window.__timelines=window.__timelines||{};window.__timelines.intro=tl;})();</script></div></template>`,
      "graphics.html": `<template id="graphics-template"><div id="graphics-root" data-layout-allow-overlap data-composition-id="graphics" data-width="1920" data-height="1080" data-duration="10"><div id="pill">${question}</div><div id="notice"><strong>Notice</strong><span>${action}</span></div><div id="final">Start now</div><style>@font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}#graphics-root{position:relative;width:1920px;height:1080px;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif;color:#2b2118}#pill{position:absolute;left:1060px;top:260px;width:650px;min-height:220px;border-radius:110px;background:#cc8832;display:flex;align-items:center;justify-content:center;text-align:center;padding:34px 56px;font-size:52px;font-weight:900;opacity:0}#notice{position:absolute;left:118px;top:320px;width:760px;display:grid;grid-template-columns:150px 1fr;gap:24px;padding:38px 44px;border-radius:28px;background:rgba(122,98,72,.14);border:2px solid rgba(122,98,72,.22);opacity:0}#notice strong{color:#8f2b20;font-size:44px}#notice span{font-size:35px;line-height:1.3;font-weight:800}#final{position:absolute;left:520px;top:710px;width:870px;height:190px;border-radius:38px;background:#cc8832;color:#2b2118;display:flex;align-items:center;justify-content:center;font-size:64px;font-weight:900;opacity:0}</style><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script>(()=>{const tl=gsap.timeline({paused:true});tl.fromTo("#pill",{opacity:0,y:-42,scale:.82},{opacity:1,y:0,scale:1,duration:.78,ease:"back.out(1.5)"},3.35).fromTo("#notice",{opacity:0,x:-46,scale:.96},{opacity:1,x:0,scale:1,duration:.62,ease:"power3.out"},3.65).to("#pill",{scale:1.06,duration:.3,repeat:4,yoyo:true,ease:"sine.inOut"},4.6).to("#pill",{opacity:0,scale:.86,duration:.32,ease:"power2.in"},6.25).to("#notice",{opacity:0,y:-24,duration:.32,ease:"power2.in"},6.25).fromTo("#final",{opacity:0,y:54,scale:.9},{opacity:1,y:0,scale:1,duration:.72,ease:"back.out(1.35)"},6.55);window.__timelines=window.__timelines||{};window.__timelines.graphics=tl;})();</script></div></template>`,
      "captions.html": `<template id="captions-template"><div id="captions-root" data-layout-allow-overlap data-composition-id="captions" data-width="1920" data-height="1080" data-duration="10"><div class="captions-container"><div id="caption-box"><span id="caption-text"></span></div></div><style>@font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}#captions-root .captions-container{width:100%;height:100%;display:flex;justify-content:center;align-items:flex-end;padding:0 130px 112px;pointer-events:none}#caption-box{max-width:1500px;padding:18px 42px;border-radius:28px;background:#7a6248;opacity:0;box-shadow:0 14px 32px rgba(43,33,24,.18)}#caption-text{display:block;color:#f5f0e0;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif;font-size:42px;font-weight:800;text-align:center;line-height:1.22}</style><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script>(()=>{const lines=[{text:${jsString(model.caption1)},start:.2,end:2.65},{text:${jsString(model.caption2)},start:3.15,end:6.25},{text:${jsString(model.caption3)},start:6.65,end:9.25}];const tl=gsap.timeline({paused:true});const box=document.querySelector("#caption-box");const textEl=document.querySelector("#caption-text");lines.forEach((line)=>{tl.to(box,{opacity:1,duration:.14,ease:"power2.out",overwrite:"auto",onStart:()=>{textEl.textContent=line.text}},line.start);tl.to(box,{opacity:0,duration:.14,ease:"power2.in",overwrite:"auto"},line.end)});window.__timelines=window.__timelines||{};window.__timelines.captions=tl;})();</script></div></template>`,
    },
  };
}

function officialTemplateFiles(model, templateId) {
  const configs = {
    "play-mode": {
      title: "Play Mode",
      bg: "#101827",
      accent: "#74f7c8",
      accent2: "#ffcf5a",
      text: "#f8fbff",
      muted: "#b9c5d8",
      shape: "bubble",
      motion: "elastic.out(1, 0.55)",
      label: "SOCIAL ENERGY",
    },
    "swiss-grid": {
      title: "Swiss Grid",
      bg: "#f5f5f0",
      accent: "#0057ff",
      accent2: "#111111",
      text: "#111111",
      muted: "#555555",
      shape: "grid",
      motion: "expo.out",
      label: "GRID SYSTEM",
    },
    "kinetic-type": {
      title: "Kinetic Type",
      bg: "#090909",
      accent: "#e63946",
      accent2: "#ffd60a",
      text: "#ffffff",
      muted: "#d8d8d8",
      shape: "type",
      motion: "back.out(1.8)",
      label: "KINETIC TYPE",
    },
    "decision-tree": {
      title: "Decision Tree",
      bg: "#10201c",
      accent: "#50d890",
      accent2: "#f6c85f",
      text: "#f4fff9",
      muted: "#b5d8cc",
      shape: "nodes",
      motion: "power3.out",
      label: "DECISION PATH",
    },
    "product-promo": {
      title: "Product Promo",
      bg: "#0d1020",
      accent: "#8da2ff",
      accent2: "#ff8f70",
      text: "#ffffff",
      muted: "#bac3e8",
      shape: "product",
      motion: "power4.out",
      label: "PRODUCT STORY",
    },
    "nyt-graph": {
      title: "NYT Graph",
      bg: "#fbf7ef",
      accent: "#d94f32",
      accent2: "#2d5f8b",
      text: "#171717",
      muted: "#5f5a52",
      shape: "chart",
      motion: "power2.out",
      label: "DATA STORY",
    },
    "blank": {
      title: "Blank",
      bg: "#151515",
      accent: "#f2f2f2",
      accent2: "#8b8b8b",
      text: "#ffffff",
      muted: "#c8c8c8",
      shape: "minimal",
      motion: "power2.out",
      label: "BLANK START",
    },
    "vignelli": {
      title: "Vignelli",
      bg: "#ffffff",
      accent: "#d71920",
      accent2: "#111111",
      text: "#111111",
      muted: "#4b4b4b",
      shape: "portrait",
      motion: "sine.inOut",
      label: "VIGNELLI",
      width: 1080,
      height: 1920,
    },
  };
  const config = configs[templateId] || configs.blank;
  const width = config.width || 1920;
  const height = config.height || 1080;
  const isPortrait = height > width;
  const title = escapeHtml(model.title);
  const hook = escapeHtml(model.hook);
  const question = escapeHtml(model.question);
  const action = escapeHtml(model.action);
  const scenePadding = isPortrait ? "116px 82px" : "96px 124px";
  const headlineSize = isPortrait ? "104px" : "102px";
  const subSize = isPortrait ? "42px" : "38px";
  const cardWidth = isPortrait ? "100%" : "1040px";
  const finalTop = isPortrait ? "1260px" : "720px";
  const chartBars = templateId === "nyt-graph" || templateId === "swiss-grid"
    ? `<div class="chart" data-layout-ignore><i style="height:46%"></i><i style="height:68%"></i><i style="height:92%"></i></div>`
    : "";
  const nodeMap = templateId === "decision-tree"
    ? `<div class="nodes" data-layout-ignore><b></b><b></b><b></b><span></span><span></span></div>`
    : "";
  const productShape = templateId === "product-promo"
    ? `<div class="device" data-layout-ignore><em></em><em></em><em></em></div>`
    : "";
  const typeShape = templateId === "kinetic-type"
    ? `<div class="type-wall" data-layout-ignore>NOW NOW NOW NOW</div>`
    : "";

  return {
    width,
    height,
    design: `## Style Prompt

Official HyperFrames example style: ${config.title}. Template id: \`${templateId}\`.

## Colors

- Background: \`${config.bg}\`
- Text: \`${config.text}\`
- Accent: \`${config.accent}\`
- Secondary: \`${config.accent2}\`

## Typography

- Microsoft YaHei UI for Chinese text
- Inter or Arial fallback for template labels
`,
    index: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, height=${height}" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    *{box-sizing:border-box}
    @font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}
    @font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}
    html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${config.bg};color:${config.text};font-family:"Microsoft YaHei UI","Microsoft YaHei",Arial,sans-serif}
    #root{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${config.bg}}
    .scene{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:${isPortrait ? 34 : 28}px;padding:${scenePadding};background:${config.bg};opacity:0}
    #scene-1{opacity:1}
    .kicker{width:max-content;max-width:100%;padding:10px 14px;border:2px solid ${config.accent};color:${config.accent};font:800 ${isPortrait ? 26 : 22}px Arial,sans-serif;letter-spacing:.08em}
    h1,h2{margin:0;max-width:${cardWidth};font-size:${headlineSize};line-height:1.06;color:${config.text};font-weight:900}
    p{margin:0;max-width:${cardWidth};font-size:${subSize};line-height:1.35;color:${config.muted};font-weight:700}
    .accent{color:${config.accent}}
    .panel{width:${cardWidth};padding:${isPortrait ? 34 : 30}px;border:2px solid ${config.accent};background:${config.bg};box-shadow:14px 14px 0 ${config.accent2};font-size:${subSize};line-height:1.35;font-weight:900;color:${config.text}}
    .orb{position:absolute;right:${isPortrait ? -180 : 120}px;top:${isPortrait ? 160 : 120}px;width:${isPortrait ? 520 : 420}px;height:${isPortrait ? 520 : 420}px;border-radius:${config.shape === "grid" ? "0" : "50%"};background:${config.accent};opacity:.18}
    .chart{position:absolute;right:${isPortrait ? 92 : 150}px;bottom:${isPortrait ? 190 : 130}px;display:flex;align-items:end;gap:24px;width:${isPortrait ? 520 : 470}px;height:${isPortrait ? 360 : 280}px;border-left:4px solid ${config.text};border-bottom:4px solid ${config.text}}
    .chart i{display:block;flex:1;background:${config.accent}}
    .nodes b{position:absolute;width:${isPortrait ? 210 : 190}px;height:${isPortrait ? 92 : 78}px;border-radius:18px;background:${config.accent};opacity:.95}
    .nodes b:nth-child(1){right:${isPortrait ? 120 : 300}px;top:${isPortrait ? 330 : 260}px}.nodes b:nth-child(2){right:${isPortrait ? 360 : 560}px;top:${isPortrait ? 500 : 430}px}.nodes b:nth-child(3){right:${isPortrait ? 120 : 300}px;top:${isPortrait ? 670 : 600}px}
    .device{position:absolute;right:${isPortrait ? 120 : 210}px;top:${isPortrait ? 310 : 230}px;width:${isPortrait ? 360 : 420}px;height:${isPortrait ? 620 : 520}px;border-radius:42px;border:12px solid ${config.accent};background:${config.accent2};box-shadow:0 32px 80px rgba(0,0,0,.25)}
    .device em{display:block;margin:42px auto;width:70%;height:46px;border-radius:23px;background:${config.bg};opacity:.75}
    .type-wall{position:absolute;left:-70px;bottom:${isPortrait ? 120 : 40}px;width:130%;font-size:${isPortrait ? 116 : 132}px;line-height:.88;font-weight:900;color:${config.accent};opacity:.18;transform:rotate(-7deg)}
    .minimal-rule{position:absolute;left:${isPortrait ? 82 : 124}px;right:${isPortrait ? 82 : 124}px;top:${isPortrait ? 260 : 190}px;height:2px;background:${config.accent}}
    #final{position:absolute;left:${isPortrait ? 82 : 124}px;top:${finalTop};width:${cardWidth}}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="${width}" data-height="${height}">
    <div class="orb" data-layout-ignore></div>
    <div class="minimal-rule" data-layout-ignore></div>
    ${chartBars}${nodeMap}${productShape}${typeShape}
    <section id="scene-1" class="scene clip" data-start="0" data-duration="3.2" data-track-index="1">
      <div class="kicker">${config.label}</div>
      <h1>${hook}</h1>
      <p>${title}</p>
    </section>
    <section id="scene-2" class="scene clip" data-start="3.05" data-duration="3.35" data-track-index="2">
      <div class="kicker">BEAT TWO</div>
      <h2>${question}</h2>
    </section>
    <section id="scene-3" class="scene clip" data-start="6.15" data-duration="3.85" data-track-index="3">
      <div class="kicker">OUTPUT</div>
      <h2><span class="accent">${config.title}</span></h2>
      <div id="final" class="panel">${action}</div>
    </section>
  </div>
  <script>
    window.__timelines=window.__timelines||{};
    const tl=gsap.timeline({paused:true});
    tl.from("#scene-1 .kicker",{y:28,opacity:0,duration:.35,ease:"power3.out"},.15)
      .from("#scene-1 h1",{y:60,opacity:0,duration:.58,ease:${jsString(config.motion)}},.35)
      .from("#scene-1 p",{x:-34,opacity:0,duration:.42,ease:"power2.out"},.86)
      .from(".orb",{scale:.72,opacity:0,duration:.82,ease:"sine.out"},.2);
    tl.fromTo("#scene-2",{opacity:0,x:${isPortrait ? 0 : 120},y:${isPortrait ? 120 : 0}},{opacity:1,x:0,y:0,duration:.45,ease:"power2.inOut"},3.05)
      .to("#scene-1",{opacity:0,x:${isPortrait ? 0 : -90},y:${isPortrait ? -90 : 0},duration:.45,ease:"power2.inOut"},3.05)
      .from("#scene-2 .kicker",{y:26,opacity:0,duration:.32,ease:"power3.out"},3.32)
      .from("#scene-2 h2",{scale:.96,opacity:0,duration:.56,ease:${jsString(config.motion)}},3.58);
    tl.fromTo("#scene-3",{opacity:0,y:${isPortrait ? 140 : 110}},{opacity:1,y:0,duration:.5,ease:"power3.inOut"},6.15)
      .to("#scene-2",{opacity:0,y:-90,duration:.5,ease:"power3.inOut"},6.15)
      .from("#scene-3 .kicker",{y:25,opacity:0,duration:.32,ease:"power2.out"},6.42)
      .from("#scene-3 h2",{y:54,opacity:0,duration:.5,ease:${jsString(config.motion)}},6.72)
      .from("#final",{x:${isPortrait ? 0 : 56},y:${isPortrait ? 42 : 0},opacity:0,duration:.44,ease:"power4.out"},7.2)
      .to("#root",{opacity:0,duration:.35,ease:"sine.in"},9.65);
    window.__timelines.main=tl;
  </script>
</body>
</html>`,
  };
}

