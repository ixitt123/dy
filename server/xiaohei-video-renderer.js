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

export function buildXiaoheiVideoFilter({ scenes, width, height, fps = 30, transitionMode = "smart", assPath }) {
  const mode = normalizeXiaoheiTransitionMode(transitionMode);
  const transitionDuration = mode === "none" ? 0 : Math.min(0.42, ...scenes.map((scene) => Math.max(0.12, sceneDuration(scene) * 0.22)));
  const filters = [];

  scenes.forEach((scene, index) => {
    const duration = sceneDuration(scene) + (index < scenes.length - 1 ? transitionDuration : 0);
    filters.push(
      `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},setsar=1,fps=${fps},trim=duration=${duration.toFixed(3)},` +
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

export function writeXiaoheiAssSubtitles({ outputPath, scenes, width, height }) {
  const fontSize = Math.max(42, Math.round(height * (height > width ? 0.038 : 0.048)));
  const marginV = Math.max(48, Math.round(height * 0.065));
  const maxChars = height > width ? 14 : 24;
  const dialogues = scenes.map((scene) => {
    const text = wrapSubtitleText(scene.subtitle || scene.text || "", maxChars);
    return `Dialogue: 0,${assTime(scene.start_time)},${assTime(scene.end_time)},Default,,0,0,0,,{\\fad(90,110)}${escapeAssText(text)}`;
  });
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
    `Style: Default,Microsoft YaHei,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00151515,&H70000000,-1,0,0,0,100,100,0,0,1,3,0,2,70,70,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...dialogues,
    "",
  ].join("\n");
  fs.writeFileSync(outputPath, content, "utf8");
  return outputPath;
}

export async function renderXiaoheiVideo({ ffmpegPath, scenes, audioPath, outputPath, aspectRatio = "16:9", transitionMode = "smart", fps = 30 }) {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error("FFmpeg 不可用，无法生成视频。");
  if (!Array.isArray(scenes) || !scenes.length) throw new Error("缺少可合成的分镜。");
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error("已确认的 TTS 音频文件不存在。");
  for (const scene of scenes) {
    if (!scene.image_path || !fs.existsSync(scene.image_path)) throw new Error(`分镜 #${scene.scene_index} 图片文件不存在。`);
  }

  const { width, height } = xiaoheiVideoResolution(aspectRatio);
  const assPath = path.join(path.dirname(outputPath), "video-subtitles.ass");
  writeXiaoheiAssSubtitles({ outputPath: assPath, scenes, width, height });
  const { filter, transitionDuration } = buildXiaoheiVideoFilter({ scenes, width, height, fps, transitionMode, assPath });
  const args = ["-y"];
  scenes.forEach((scene, index) => {
    const duration = sceneDuration(scene) + (index < scenes.length - 1 ? transitionDuration : 0);
    args.push("-loop", "1", "-framerate", String(fps), "-t", duration.toFixed(3), "-i", scene.image_path);
  });
  args.push(
    "-i", audioPath,
    "-filter_complex", filter,
    "-map", "[vout]",
    "-map", `${scenes.length}:a:0`,
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

function wrapSubtitleText(value, maxChars) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  const lines = [];
  let remaining = text;
  while (remaining.length > maxChars && lines.length < 2) {
    let cut = maxChars;
    const window = remaining.slice(0, maxChars + 1);
    const punctuation = Math.max(...["，", "。", "！", "？", "；", ",", ".", "!", "?", ";"].map((char) => window.lastIndexOf(char)));
    if (punctuation >= Math.round(maxChars * 0.55)) cut = punctuation + 1;
    lines.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) lines.push(remaining);
  return lines.slice(0, 3).join("\n");
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
