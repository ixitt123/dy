import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export const XIAOHEI_TRANSITION_MODES = ["none", "fade", "slide", "zoom", "smart"];

export function normalizeXiaoheiTransitionMode(value) {
  const normalized = String(value || "smart").trim().toLowerCase();
  return XIAOHEI_TRANSITION_MODES.includes(normalized) ? normalized : "smart";
}

export function xiaoheiVideoResolution(aspectRatio) {
  if (aspectRatio === "9:16") return { width: 1080, height: 1920 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

export function buildXiaoheiVideoFilter({ scenes, width, height, fps = 30, transitionMode = "smart", assPath, imageFit = "cover" }) {
  const mode = normalizeXiaoheiTransitionMode(transitionMode);
  const transitionDuration = mode === "none" ? 0 : Math.min(0.42, ...scenes.map((scene) => Math.max(0.12, sceneDuration(scene) * 0.22)));
  const filters = [];

  scenes.forEach((scene, index) => {
    const duration = sceneDuration(scene) + (index < scenes.length - 1 ? transitionDuration : 0);
    const fit = imageFit === "contain"
      ? `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`
      : `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    filters.push(
      `[${index}:v]${fit},setsar=1,fps=${fps},trim=duration=${duration.toFixed(3)},` +
      `setpts=PTS-STARTPTS,format=yuv420p[v${index}]`,
    );
  });

  let currentLabel = "v0";
  if (scenes.length > 1 && transitionDuration > 0) {
    let offset = sceneDuration(scenes[0]);
    for (let index = 1; index < scenes.length; index += 1) {
      const transition = transitionForScene(mode, index);
      const nextLabel = `vx${index}`;
      filters.push(
        `[${currentLabel}][v${index}]xfade=transition=${transition}:duration=${transitionDuration.toFixed(3)}:` +
        `offset=${offset.toFixed(3)}[${nextLabel}]`,
      );
      currentLabel = nextLabel;
      offset += sceneDuration(scenes[index]);
    }
  } else if (scenes.length > 1) {
    filters.push(`${scenes.map((_, index) => `[v${index}]`).join("")}concat=n=${scenes.length}:v=1:a=0[vconcat]`);
    currentLabel = "vconcat";
  }

  filters.push(`[${currentLabel}]ass='${escapeFilterPath(assPath)}'[vout]`);
  return { filter: filters.join(";"), transitionDuration };
}

export function writeXiaoheiAssSubtitles({ outputPath, scenes, width, height, compose = {} }) {
  const fontSize = Math.max(28, Math.round(Number(compose.subtitleSize || 48) * height / 1080));
  const marginV = Math.max(48, Math.round(height * 0.065));
  const maxChars = height > width ? 14 : 24;
  const maxLines = Math.max(1, Math.min(3, Number(compose.maxLines || 2)));
  const primary = assColor(compose.subtitleColor || "#ffffff");
  const keyword = assColor(compose.keywordColor || "#b7ff5a");
  const speed = Math.max(0.6, Math.min(1.6, Number(compose.animationSpeed || 1)));
  const enterMs = Math.round(520 / speed);
  const dialogues = compose.showSubtitles === false ? [] : scenes.map((scene) => {
    const text = wrapSubtitleText(scene.subtitle || scene.text || "", maxChars, maxLines);
    const styled = keywordAssText(text, scene.keywords, keyword, enterMs);
    return `Dialogue: 2,${assTime(scene.start_time)},${assTime(scene.end_time)},Default,,0,0,0,,{\\fad(100,90)}${styled}`;
  });
  dialogues.push(...bookendDialogues(scenes, compose, width, height, primary, fontSize));
  const outline = compose.outline === false ? 0 : 3;
  const shadow = compose.shadow === false ? 0 : 2;
  const content = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "ScaledBorderAndShadow: yes",
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Microsoft YaHei,${fontSize},${primary},${keyword},&H00151515,&H70000000,-1,0,0,0,100,100,0,0,1,${outline},${shadow},2,70,70,${marginV},1`,
    `Style: Bookend,Microsoft YaHei,${Math.round(fontSize * 1.65)},${primary},${keyword},&H00151515,&H50000000,-1,0,0,0,100,100,0,0,1,${outline},${shadow},5,80,80,80,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...dialogues,
    "",
  ].join("\n");
  fs.writeFileSync(outputPath, content, "utf8");
  return outputPath;
}

export async function renderXiaoheiVideo({ ffmpegPath, scenes, audioPath, backgroundAudioPath = "", outputPath, aspectRatio = "16:9", transitionMode = "smart", fps = 30, compose = {} }) {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error("FFmpeg 不可用，无法生成视频。");
  if (!Array.isArray(scenes) || !scenes.length) throw new Error("缺少可合成的分镜。");
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error("已确认的 TTS 音频文件不存在。");
  for (const scene of scenes) {
    if (!scene.image_path || !fs.existsSync(scene.image_path)) throw new Error(`分镜 #${scene.scene_index} 图片文件不存在。`);
  }

  const { width, height } = xiaoheiVideoResolution(aspectRatio);
  const assPath = path.join(path.dirname(outputPath), "video-subtitles.ass");
  writeXiaoheiAssSubtitles({ outputPath: assPath, scenes, width, height, compose });
  const built = buildXiaoheiVideoFilter({ scenes, width, height, fps, transitionMode, assPath, imageFit: compose.imageFit });
  let filter = built.filter;
  const transitionDuration = built.transitionDuration;
  const args = ["-y"];
  scenes.forEach((scene, index) => {
    const duration = sceneDuration(scene) + (index < scenes.length - 1 ? transitionDuration : 0);
    args.push("-loop", "1", "-framerate", String(fps), "-t", duration.toFixed(3), "-i", scene.image_path);
  });
  const ttsInputIndex = scenes.length;
  const ttsVolume = Math.max(0, Math.min(2, Number(compose.ttsVolume ?? 100) / 100));
  const bgmVolume = Math.max(0, Math.min(1, Number(compose.bgmVolume ?? 18) / 100));
  let audioMap = `${ttsInputIndex}:a:0`;
  args.push("-i", audioPath);
  if (backgroundAudioPath) {
    if (!fs.existsSync(backgroundAudioPath)) throw new Error("背景音乐文件不存在，请重新选择。");
    args.push("-stream_loop", "-1", "-i", backgroundAudioPath);
    filter += `;[${ttsInputIndex}:a]volume=${ttsVolume.toFixed(3)}[tts];[${ttsInputIndex + 1}:a]volume=${bgmVolume.toFixed(3)}[bgm];[tts][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
    audioMap = "[aout]";
  } else if (ttsVolume !== 1) {
    filter += `;[${ttsInputIndex}:a]volume=${ttsVolume.toFixed(3)}[aout]`;
    audioMap = "[aout]";
  }
  args.push(
    "-filter_complex", filter,
    "-map", "[vout]",
    "-map", audioMap,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-r", String(fps),
    "-c:a", "aac",
    "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    "-movflags", "+faststart",
    outputPath,
  );
  await runFfmpeg(ffmpegPath, args);
  return { outputPath, width, height, fps, transitionMode: normalizeXiaoheiTransitionMode(transitionMode) };
}

function transitionForScene(mode, index) {
  if (mode === "fade") return "fade";
  if (mode === "slide") return index % 2 ? "slideleft" : "slideright";
  if (mode === "zoom") return "zoomin";
  return ["fade", "smoothleft", "circleopen", "slideup"][(index - 1) % 4];
}

function sceneDuration(scene) {
  return Math.max(0.12, Number(scene.visual_duration || scene.duration || 0));
}

function escapeFilterPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function assTime(value) {
  const total = Math.max(0, Number(value || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const centiseconds = Math.floor((total - Math.floor(total)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function wrapSubtitleText(value, maxChars, maxLines = 3) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  const lines = [];
  let remaining = text;
  while (remaining.length > maxChars && lines.length < maxLines - 1) {
    let cut = maxChars;
    const window = remaining.slice(0, maxChars + 1);
    const punctuation = Math.max(...["，", "。", "！", "？", "；", ",", ".", "!", "?", ";"].map((char) => window.lastIndexOf(char)));
    if (punctuation >= Math.round(maxChars * 0.55)) cut = punctuation + 1;
    lines.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) lines.push(remaining);
  return lines.slice(0, maxLines).join("\n");
}

function assColor(value) {
  const match = String(value || "#ffffff").match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return "&H00FFFFFF";
  return `&H00${match[3]}${match[2]}${match[1]}`.toUpperCase();
}

function keywordAssText(value, keywords, color, enterMs) {
  const source = String(value || "");
  const ordered = [...new Set((keywords || []).map((item) => String(item || "").trim()).filter((item) => item && source.replace(/\n/g, "").includes(item)))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
  if (!ordered.length) return escapeAssText(source);
  const pattern = new RegExp(`(${ordered.map(escapeRegExp).join("|")})`, "g");
  let keywordIndex = 0;
  return source.split(pattern).map((part) => {
    if (!ordered.includes(part)) return escapeAssText(part);
    const delay = keywordIndex * 100;
    const peak = delay + Math.round(enterMs * 0.62);
    const settle = delay + enterMs;
    keywordIndex += 1;
    return `{\\1c${color}\\b1\\fscx78\\fscy78\\alpha&H80&\\t(${delay},${peak},\\fscx126\\fscy126\\alpha&H00&)\\t(${peak},${settle},\\fscx112\\fscy112)}${escapeAssText(part)}{\\rDefault}`;
  }).join("");
}

function bookendDialogues(scenes, compose, width, height, primary, fontSize) {
  if (!scenes.length) return [];
  const first = scenes[0];
  const last = scenes[scenes.length - 1];
  const videoEnd = Math.max(Number(last.end_time || 0), scenes.reduce((sum, scene) => sum + sceneDuration(scene), 0));
  const events = [];
  const add = (kind, item, start, end) => {
    if (!item?.enabled || !String(item.text || "").trim() || end - start < 0.18) return;
    const durationMs = Math.round((end - start) * 1000);
    const fade = Math.max(55, Math.min(150, Math.round(durationMs / 4)));
    const y = kind === "intro" ? Math.round(height * 0.43) : Math.round(height * 0.48);
    const text = escapeAssText(wrapSubtitleText(item.text, height > width ? 12 : 22, 2));
    events.push(`Dialogue: 5,${assTime(start)},${assTime(end)},Bookend,,0,0,0,,{\\an5\\pos(${Math.round(width / 2)},${y})\\fs${Math.round(fontSize * 1.65)}\\1c${primary}\\fad(${fade},${fade})}${text}`);
  };
  const introGap = Math.max(0, Number(first.start_time || 0));
  const introEnd = introGap >= 0.18
    ? introGap
    : Math.min(Number(first.end_time || 0), Math.max(0.45, Math.min(1.1, sceneDuration(first) * 0.3)));
  add("intro", compose.intro, 0, introEnd);
  const trailingGap = Math.max(0, videoEnd - Number(last.end_time || 0));
  const outroStart = trailingGap >= 0.18
    ? Number(last.end_time || 0)
    : Math.max(0, videoEnd - Math.max(0.45, Math.min(1.1, sceneDuration(last) * 0.3)));
  add("outro", compose.outro, outroStart, videoEnd);
  return events;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAssText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

function runFfmpeg(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    const stderr = [];
    child.stderr.on("data", (chunk) => {
      stderr.push(Buffer.from(chunk));
      if (stderr.length > 80) stderr.shift();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`视频合成失败（FFmpeg ${code}）：${Buffer.concat(stderr).toString("utf8").slice(-1800)}`));
    });
  });
}
