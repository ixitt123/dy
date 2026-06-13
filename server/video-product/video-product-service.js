import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const TIMELINE_STATUSES = new Set([
  "pending",
  "binding_assets",
  "building_timeline",
  "rendering",
  "exporting_draft",
  "completed",
  "failed",
]);

const OUTPUT_TYPES = new Set(["jianying", "mp4", "package", "template_mp4", "mix_mp4"]);
const IMAGE_REQUIRED_OUTPUT_TYPES = new Set(["jianying", "mp4", "package"]);
const MP4_OUTPUT_TYPES = new Set(["mp4", "template_mp4", "mix_mp4"]);

const OUTPUT_TYPE_LABELS = {
  jianying: "路线 C：剪映半成品素材包",
  mp4: "路线 B：AI 图文成片 MP4",
  template_mp4: "路线 A：模板快剪 MP4",
  mix_mp4: "路线 D：下载素材混剪 MP4",
  package: "标准素材包",
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

function timelineToAss(scenes, { width = 1080, height = 1920 } = {}) {
  const marginV = Math.max(132, Math.round(height * 0.13));
  const fontSize = Math.max(42, Math.round(height * 0.029));
  const titleSize = Math.max(48, Math.round(height * 0.034));
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
    `Style: Premium,Microsoft YaHei,${fontSize},&H00FFFFFF,&H0000D7FF,&H00161616,&H99000000,-1,0,0,0,100,100,0,0,1,3,0,2,96,96,${marginV},1`,
    `Style: Keyword,Microsoft YaHei,${titleSize},&H0000D7FF,&H00FFFFFF,&H00111111,&H99000000,-1,0,0,0,102,102,0,0,1,4,0,2,96,96,${marginV + 8},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  for (const scene of scenes) {
    const text = assCaptionText(scene.subtitle_text || scene.narration_text || "");
    if (!text) continue;
    const style = String(scene.title_text || "").length <= 16 && Number(scene.scene_index || 0) === 1 ? "Keyword" : "Premium";
    const effectText = `{\\fad(120,120)\\t(0,220,\\fscx106\\fscy106)}${text}`;
    lines.push([
      "Dialogue: 0",
      assTimestamp(scene.start_time),
      assTimestamp(scene.end_time),
      style,
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

function assCaptionText(text) {
  const value = String(text || "").trim();
  if (value.length <= 18) return assEscape(value);
  const chunks = [];
  for (let index = 0; index < value.length; index += 16) {
    chunks.push(value.slice(index, index + 16));
  }
  return assEscape(chunks.slice(0, 3).join("\\N"));
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
  return titleClip(text, 14);
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
      ass_subtitles: Boolean(timelineFiles.assPath),
      title_card: project.output_type === "template_mp4",
      end_cta: project.output_type === "template_mp4",
      cover: Boolean(timelineFiles.coverPath),
      publish_text: true,
    },
    files: {
      mp4: mp4Path ? path.basename(mp4Path) : "",
      final_mp4: fs.existsSync(path.join(timelineFiles.projectDir, "final.mp4")) ? "final.mp4" : "",
      cover: timelineFiles.coverPath ? path.basename(timelineFiles.coverPath) : "",
      timeline: path.basename(timelineFiles.timelinePath || "timeline.json"),
      subtitles_srt: path.basename(timelineFiles.srtPath || "subtitles.srt"),
      subtitles_ass: timelineFiles.assPath ? path.basename(timelineFiles.assPath) : "",
      manifest: path.basename(timelineFiles.manifestPath || "project_manifest.json"),
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
  ffmpegPath,
  onProgress = () => {},
  onIdle = () => {},
}) {
  const outputRoot = ensureDir(path.join(baseDir, "video-products"));
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
    return {
      directors,
      audioJobs,
      imageAssets,
      downloadedVideos,
      bgmAssets,
      timelines: taskStore.listTimelineProjects({ limit: 50 }).map((row) => sourceProject(row, { includeScenes: false })),
      platforms: Object.entries(PLATFORM_PRESETS).map(([id, value]) => ({ id, ...value })),
      outputTypes: Object.entries(OUTPUT_TYPE_LABELS).map(([id, label]) => ({ id, label })),
    };
  }

  function selectImagesForScenes({ directorId, imageSource = "director", selectedImageIds = [], manualBindings = {} } = {}) {
    const all = listImageAssets(500);
    const selectedSet = new Set((Array.isArray(selectedImageIds) ? selectedImageIds : [])
      .map((id) => String(id || ""))
      .filter(Boolean));
    const selected = selectedSet.size ? all.filter((asset) => selectedSet.has(String(asset.id))) : all;
    const directorScoped = selected.filter((asset) => (
      asset.source_type === "director" && String(asset.source_id || "").startsWith(`${directorId}:`)
    ));
    const pool = imageSource === "director" && directorScoped.length ? directorScoped : selected;
    return { pool, all, directorScoped, manualBindings };
  }

  function bindSceneImage(scene, index, bindingContext) {
    const manualAssetId = String(bindingContext.manualBindings?.[scene.scene_index] || bindingContext.manualBindings?.[index + 1] || "");
    if (manualAssetId) {
      const manual = bindingContext.all.find((asset) => String(asset.id) === manualAssetId);
      if (manual) return manual;
    }
    const exact = bindingContext.pool.find((asset) => (
      asset.source_type === "director" && String(asset.source_id || "") === `${bindingContext.directorId}:${scene.scene_index}`
    ));
    if (exact) return exact;
    return bindingContext.pool[index % Math.max(1, bindingContext.pool.length)] || null;
  }

  async function buildTimeline(input = {}) {
    const directorId = Number(input.source_director_project_id || input.director_project_id || 0);
    const audioAssetId = Number(input.audio_asset_id || input.tts_job_id || 0);
    const outputType = OUTPUT_TYPES.has(String(input.output_type || "")) ? String(input.output_type) : "jianying";
    const needsImages = IMAGE_REQUIRED_OUTPUT_TYPES.has(outputType);
    const needsDownloadedVideo = outputType === "mix_mp4";
    const director = taskStore.getDirectorProject(directorId);
    const audio = taskStore.getTtsJob(audioAssetId);
    const platformId = String(input.platform || director?.platform || "douyin");
    const platform = platformPreset(platformId);
    const blockers = [];

    if (!director || director.status !== "completed") blockers.push("缺少已完成的 AI 导演项目。");
    if (!audio || audio.status !== "completed" || !audio.audio_path || !fs.existsSync(audio.audio_path)) {
      blockers.push("缺少已生成的 TTS 音频。");
    }

    const directorScenes = director ? taskStore.listDirectorScenes(director.id) : [];
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
    const rawDurations = timelineSourceScenes.map(normalizeSceneDuration);
    const rawTotal = rawDurations.reduce((sum, value) => sum + value, 0) || directorScenes.length * 3;
    const targetDuration = audioDuration > 0 ? audioDuration : rawTotal;
    const scale = rawTotal > 0 ? targetDuration / rawTotal : 1;

    let cursor = 0;
    const scenes = timelineSourceScenes.map((scene, index) => {
      const image = needsImages ? bindSceneImage(scene, index, bindingContext) : null;
      const video = needsDownloadedVideo ? downloadedVideos[index % Math.max(1, downloadedVideos.length)] : null;
      const isLastScene = index === timelineSourceScenes.length - 1;
      const duration = isLastScene
        ? Number(Math.max(0.75, targetDuration - cursor).toFixed(3))
        : Number(Math.max(0.75, rawDurations[index] * scale).toFixed(3));
      const start = Number(cursor.toFixed(3));
      cursor += duration;
      const end = Number((isLastScene ? targetDuration : cursor).toFixed(3));
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
        start: 0,
        duration: targetDuration,
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
      duration: Number((scenes.at(-1)?.end_time || targetDuration || 0).toFixed(3)),
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

  function writeTimelineFiles(project, timeline) {
    const baseName = `${project.id}_${safeFileName(timeline.director?.title || "video-product")}`;
    const projectDir = ensureDir(project.output_dir || path.join(outputRoot, baseName));
    const mediaDir = ensureDir(path.join(projectDir, "media"));
    const imageDir = ensureDir(path.join(mediaDir, "images"));
    const audioDir = ensureDir(path.join(mediaDir, "audio"));
    const videoDir = ensureDir(path.join(mediaDir, "videos"));

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
    const bgmSource = findBgmAsset();
    let packagedBgm = "";
    if (bgmSource && fs.existsSync(bgmSource)) {
      const ext = path.extname(bgmSource) || ".mp3";
      packagedBgm = path.join(audioDir, `bgm${ext}`);
      fs.copyFileSync(bgmSource, packagedBgm);
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
        }] : [],
        subtitles: timeline.tracks.subtitles,
      },
      output_type: project.output_type,
      status: project.status,
      created_at: project.created_at,
      updated_at: new Date().toISOString(),
    };

    const timelinePath = writeJson(path.join(projectDir, "timeline.json"), timelineJson);
    const srtPath = path.join(projectDir, "subtitles.srt");
    fs.writeFileSync(srtPath, timelineToSrt(packagedScenes), "utf8");
    const assPath = path.join(projectDir, "subtitles.ass");
    fs.writeFileSync(assPath, timelineToAss(packagedScenes, { width, height }), "utf8");
    const titleText = publishTitle;
    fs.writeFileSync(path.join(projectDir, "title.txt"), `${titleText}\n`, "utf8");
    fs.writeFileSync(path.join(projectDir, "description.txt"), [
      titleText,
      "",
      "如果你也想把知识讲清楚，先把学习方式换成可执行的动作。",
    ].join("\n"), "utf8");
    fs.writeFileSync(path.join(projectDir, "hashtags.txt"), "#短视频 #知识口播 #AI成片 #抖音 #视频号 #小红书\n", "utf8");
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
        bgm_note: packagedBgm ? "已接入本地 BGM 并按语音优先混音。" : "未找到本地 BGM 素材，路线 A 会在质量报告中标记为待补资源。",
        ass_subtitles: true,
        motion_template: project.output_type === "template_mp4",
        motion_template_version: project.output_type === "template_mp4" ? "route-a-kinetic-v2" : "",
        optimized_publish_title: titleText,
        publish_package: true,
      },
      audio_binding: timeline.metadata?.audio_binding || null,
      files: {
        timeline: path.basename(timelinePath),
        subtitles: path.basename(srtPath),
        ass_subtitles: path.basename(assPath),
        audio: packagedAudio ? path.relative(projectDir, packagedAudio) : "",
        bgm: packagedBgm ? path.relative(projectDir, packagedBgm) : "",
        images: packagedScenes.map((scene) => path.relative(projectDir, scene.packaged_image_path || "")),
        videos: packagedScenes.map((scene) => path.relative(projectDir, scene.packaged_video_path || "")).filter(Boolean),
        title: "title.txt",
        description: "description.txt",
        hashtags: "hashtags.txt",
        render_report: "render_report.json",
      },
      blockers: timeline.blockers,
      routes: {
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
    const titleLines = splitTitleLines(publishTitle, 11).slice(0, 2);
    const titleLine1 = ffmpegDrawText(titleLines[0] || publishTitle);
    const titleLine2 = ffmpegDrawText(titleLines[1] || "");
    const narration = timelineFiles.packagedScenes.map((scene) => scene.narration_text || scene.subtitle_text || "").join("");
    const routeLabel = ffmpegDrawText("路线 A / 口播快剪");
    const hookLabel = ffmpegDrawText(titleClip(timelineFiles.packagedScenes[0]?.subtitle_text || timelineFiles.packagedScenes[0]?.narration_text || publishTitle, 18));
    const ctaText = ffmpegDrawText(/英语/.test(narration) ? "别只收藏，今天就开口练" : "关注我，把方法变成结果");
    const fontPath = "C:/Windows/Fonts/msyh.ttc";
    const boldFontPath = fs.existsSync("C:/Windows/Fonts/msyhbd.ttc") ? "C:/Windows/Fonts/msyhbd.ttc" : fontPath;
    const outputPath = path.join(timelineFiles.projectDir, `${safeFileName(timelineFiles.timelineJson.name || `timeline_${project.id}`)}_template.mp4`);
    const subtitlePath = timelineFiles.assPath || timelineFiles.srtPath;
    const subtitleFilter = `subtitles='${ffmpegFilterPath(subtitlePath)}'`;
    const ctaStart = Math.max(0, duration - 5).toFixed(3);
    const ctaY = Math.round(height * 0.61);
    const filters = [
      `drawbox=x=0:y=0:w=${width}:h=${height}:color=0x09101B:t=fill`,
      `drawbox=x=0:y=0:w=${width}:h=${Math.round(height * 0.2)}:color=0x111C2F@0.82:t=fill`,
      `drawbox=x=0:y=${Math.round(height * 0.72)}:w=${width}:h=${Math.round(height * 0.2)}:color=0x000000@0.18:t=fill`,
      `drawbox=x=44:y=78:w=${width - 88}:h=2:color=0xE7C76C@0.45:t=fill`,
      `drawbox=x=52:y=102:w=10:h=116:color=0xE7C76C:t=fill:enable='lt(t\\,3.6)'`,
      `drawbox=x=58:y=98:w=236:h=52:color=0xE7C76C@0.14:t=fill`,
      `drawtext=fontfile='${ffmpegFilterPath(fontPath)}':text='${routeLabel}':x=82:y=112:fontsize=25:fontcolor=0xE7C76C:box=1:boxcolor=0x07101B@0.52:boxborderw=12`,
      `drawtext=fontfile='${ffmpegFilterPath(boldFontPath)}':text='${titleLine1}':x=86:y=245:fontsize=72:fontcolor=white:box=1:boxcolor=0x07101B@0.72:boxborderw=24:enable='lt(t\\,3.6)'`,
      titleLine2 ? `drawtext=fontfile='${ffmpegFilterPath(boldFontPath)}':text='${titleLine2}':x=86:y=335:fontsize=72:fontcolor=0xE7C76C:box=1:boxcolor=0x07101B@0.72:boxborderw=24:enable='lt(t\\,3.6)'` : "",
      `drawtext=fontfile='${ffmpegFilterPath(fontPath)}':text='${hookLabel}':x=86:y=462:fontsize=34:fontcolor=0xBFD3EA:box=1:boxcolor=0x07101B@0.56:boxborderw=16:enable='lt(t\\,3.6)'`,
      `drawbox=x=68:y='520+18*sin(t*0.9)':w=${width - 136}:h=6:color=0xE7C76C@0.22:t=fill`,
      `drawbox=x=86:y='560+16*sin(t*0.7)':w=${Math.round((width - 172) * 0.68)}:h=6:color=0x6CA8FF@0.24:t=fill`,
      subtitleFilter,
      `drawbox=x=68:y=${ctaY}:w=${width - 136}:h=178:color=0xE7C76C@0.12:t=fill:enable='gte(t\\,${ctaStart})'`,
      `drawtext=fontfile='${ffmpegFilterPath(boldFontPath)}':text='${ctaText}':x=(w-text_w)/2:y=${ctaY + 54}:fontsize=44:fontcolor=0xE7C76C:box=1:boxcolor=0x07101B@0.58:boxborderw=18:enable='gte(t\\,${ctaStart})'`,
      `drawtext=fontfile='${ffmpegFilterPath(fontPath)}':text='${ffmpegDrawText("把这一句发给正在学的人")}':x=(w-text_w)/2:y=${ctaY + 126}:fontsize=30:fontcolor=white:enable='gte(t\\,${ctaStart})'`,
      `drawbox=x=0:y=${height - 14}:w=${width}:h=14:color=0x152133:t=fill`,
      `drawbox=x=0:y=${height - 14}:w='iw*t/${duration}':h=14:color=0xE7C76C:t=fill`,
    ].filter(Boolean);
    for (const scene of timelineFiles.packagedScenes) {
      const label = ffmpegDrawText(conciseSceneLabel(scene));
      if (!label) continue;
      const sceneNo = ffmpegDrawText(`0${scene.scene_index}`.slice(-2));
      const sceneEnable = ffmpegEnableBetween(scene.start_time, scene.end_time);
      filters.push(
        `drawtext=fontfile='${ffmpegFilterPath(fontPath)}':text='${label}':x=68:y=190:fontsize=30:fontcolor=0xDDE7F4:box=1:boxcolor=0x07101B@0.52:boxborderw=14:enable='${sceneEnable}'`,
        `drawbox=x=68:y=650:w=${width - 136}:h=148:color=0x0D1726@0.88:t=fill:enable='${sceneEnable}'`,
        `drawbox=x=68:y=650:w=8:h=148:color=0xE7C76C:t=fill:enable='${sceneEnable}'`,
        `drawtext=fontfile='${ffmpegFilterPath(fontPath)}':text='${sceneNo}':x=96:y=672:fontsize=28:fontcolor=0xE7C76C:enable='${sceneEnable}'`,
        `drawtext=fontfile='${ffmpegFilterPath(boldFontPath)}':text='${label}':x=96:y=715:fontsize=50:fontcolor=white:box=1:boxcolor=0x07101B@0.18:boxborderw=8:enable='${sceneEnable}'`,
      );
    }
    const args = [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=0x101624:s=${width}x${height}:r=${project.fps}:d=${duration}`,
    ];
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
      "-pix_fmt", "yuv420p",
    );
    if (voiceInput >= 0 && bgmInput >= 0) {
      const fadeStart = Math.max(0, duration - 1.2).toFixed(2);
      args.push(
        "-filter_complex",
        `[${voiceInput}:a]volume=1.0[a_voice];[${bgmInput}:a]volume=0.12,atrim=0:${duration.toFixed(3)},afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeStart}:d=1.2[a_bgm];[a_voice][a_bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:a", "aac",
        "-shortest",
      );
    } else if (voiceInput >= 0) {
      args.push("-map", "0:v", "-map", `${voiceInput}:a`, "-c:a", "aac", "-shortest");
    } else if (bgmInput >= 0) {
      args.push("-map", "0:v", "-map", `${bgmInput}:a`, "-c:a", "aac", "-shortest");
    } else {
      args.push("-map", "0:v", "-an");
    }
    args.push(outputPath);
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
        has_ass_subtitles: Boolean(timelineFiles.assPath && fs.existsSync(timelineFiles.assPath)),
        has_cover: Boolean(timelineFiles.coverPath),
        publish_title: publishTitle,
        title_optimized: !titleLooksGeneric(publishTitle),
        motion_template_version: project.output_type === "template_mp4" ? "route-a-kinetic-v2" : "",
        duration: Number((media.duration || 0).toFixed(3)),
        file_size: stats?.size || 0,
      },
      reviewed_at: new Date().toISOString(),
    };
  }

  async function processProject(projectId) {
    let project = taskStore.getTimelineProject(projectId);
    if (!project) return;
    const input = safeJson(project.metadata_json, {});

    try {
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
      const outputType = OUTPUT_TYPES.has(project.output_type) ? project.output_type : "jianying";
      updateProject(project.id, {
        status: MP4_OUTPUT_TYPES.has(outputType) ? "rendering" : "exporting_draft",
        progress: MP4_OUTPUT_TYPES.has(outputType) ? 52 : 58,
        current_step: MP4_OUTPUT_TYPES.has(outputType) ? `正在准备 ${OUTPUT_TYPE_LABELS[outputType] || "MP4"} 渲染素材` : "正在导出剪映半成品素材包",
      });

      const timelineFiles = writeTimelineFiles(project, timeline);
      const draftPath = writeDraftReference(timelineFiles.projectDir, project, timelineFiles);
      project = updateProject(project.id, {
        output_dir: timelineFiles.projectDir,
        timeline_path: timelineFiles.timelinePath,
        srt_path: timelineFiles.srtPath,
        manifest_path: timelineFiles.manifestPath,
        draft_path: draftPath,
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
            warnings: ["当前路线输出素材包，不执行 MP4 画面质检。"],
            errors: [],
          },
        }));
      }

      updateProject(project.id, {
        status: "completed",
        progress: 100,
        current_step: MP4_OUTPUT_TYPES.has(outputType) ? `${OUTPUT_TYPE_LABELS[outputType] || "MP4"} 已生成` : outputType === "package" ? "素材包已生成" : "剪映半成品素材包已生成",
        output_dir: timelineFiles.projectDir,
        timeline_path: timelineFiles.timelinePath,
        srt_path: timelineFiles.srtPath,
        manifest_path: timelineFiles.manifestPath,
        draft_path: draftPath,
        mp4_path: mp4Path,
        completed_at: new Date().toISOString(),
      });
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
    const directorId = Number(input.source_director_project_id || input.director_project_id || 0);
    const audioId = Number(input.audio_asset_id || input.tts_job_id || 0);
    const outputType = OUTPUT_TYPES.has(String(input.output_type || "")) ? String(input.output_type) : "jianying";
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
        title: String(input.title || ""),
        output_type: outputType,
        route_label: OUTPUT_TYPE_LABELS[outputType] || outputType,
        image_source: String(input.image_source || "director"),
        image_asset_ids: Array.isArray(input.image_asset_ids) ? input.image_asset_ids : [],
        manual_bindings: input.manual_bindings || {},
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
      output_type: OUTPUT_TYPES.has(String(input.output_type || "")) ? String(input.output_type) : "jianying",
    };
  }

  function getProject(id) {
    return sourceProject(taskStore.getTimelineProject(id));
  }

  function listProjects(limit = 50) {
    return taskStore.listTimelineProjects({ limit }).map((row) => sourceProject(row, { includeScenes: false }));
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
    listSources,
    importBgmAsset,
    resolveOutputPath,
    outputRoot,
  };
}
