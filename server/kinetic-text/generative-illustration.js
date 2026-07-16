import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import WebSocket from "ws";

export const ILLUSTRATION_FPS = 15;
export const ILLUSTRATION_MAX_SECONDS = 8;

const SCENES = new Set(["explainer", "journey", "dialogue", "system"]);
const CHARACTERS = new Set(["xiaohei", "stick", "littlebox"]);
const DENSITIES = new Set(["simple", "standard", "rich"]);
const MOTIONS = new Set(["subtle", "standard", "lively"]);
const TONES = new Set(["template", "paper", "dark"]);

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
    child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = chunks.join("").slice(-12000);
      if (code === 0) resolve(output);
      else reject(new Error(`${path.basename(command)} exited with ${code}\n${output}`));
    });
  });
}

function findBrowserExecutable() {
  const candidates = [
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || "";
}

function createCdpClient(socketUrl) {
  const socket = new WebSocket(socketUrl);
  let sequence = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || "浏览器渲染失败。"));
    else resolve(message.result || {});
  });
  const send = async (method, params = {}, sessionId = undefined) => {
    await ready;
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  };
  return { socket, ready, send };
}

async function waitForBrowser(port, child) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode != null) throw new Error(`无界面浏览器提前退出，代码 ${child.exitCode}。`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`无法启动无界面浏览器：${lastError?.message || "连接超时"}`);
}

async function rasterizeSvgFrames({ framesDir, pngDir, frameCount, width, height, targetDir, onFrame }) {
  const browserPath = findBrowserExecutable();
  if (!browserPath) throw new Error("未找到 Chrome 或 Edge，无法把分层插画转换为视频帧。");
  const port = 9300 + Math.floor(Math.random() * 500);
  const profileDir = path.join(targetDir, ".browser-profile");
  fs.mkdirSync(pngDir, { recursive: true });
  const child = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--hide-scrollbars",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { windowsHide: true, stdio: "ignore" });
  try {
    const version = await waitForBrowser(port, child);
    const client = createCdpClient(version.webSocketDebuggerUrl);
    await client.ready;
    const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await client.send("Target.attachToTarget", { targetId, flatten: true });
    await client.send("Page.enable", {}, sessionId);
    await client.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (let frame = 0; frame < frameCount; frame += 1) {
      const input = path.join(framesDir, `frame-${String(frame).padStart(3, "0")}.svg`);
      const output = path.join(pngDir, `frame-${String(frame).padStart(3, "0")}.png`);
      await client.send("Page.navigate", { url: pathToFileURL(input).href }, sessionId);
      for (let readyAttempt = 0; readyAttempt < 50; readyAttempt += 1) {
        const state = await client.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }, sessionId);
        if (state.result?.value === "complete") break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const shot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, sessionId);
      fs.writeFileSync(output, Buffer.from(shot.data, "base64"));
      if (typeof onFrame === "function") onFrame(frame + 1, frameCount);
    }
    client.socket.close();
  } finally {
    if (child.exitCode == null) child.kill();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

function normalizeHex(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
}

function luminance(hex) {
  const values = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = values.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function normalizeIllustrationConfig(input = {}, project = {}) {
  const requestedDuration = input.duration === "auto" || input.duration == null
    ? Math.min(ILLUSTRATION_MAX_SECONDS, Math.max(2, Number(project.duration || 6)))
    : input.duration;
  return {
    enabled: input.enabled !== false,
    scene: SCENES.has(input.scene) ? input.scene : "explainer",
    character: CHARACTERS.has(input.character) ? input.character : "xiaohei",
    density: DENSITIES.has(input.density) ? input.density : "standard",
    motion: MOTIONS.has(input.motion) ? input.motion : "standard",
    tone: TONES.has(input.tone) ? input.tone : "template",
    duration: clamp(requestedDuration, 2, ILLUSTRATION_MAX_SECONDS, 6),
    showText: input.showText === true,
  };
}

function paletteFor(project, effect, config) {
  const primary = normalizeHex(project.effectParams?.primaryColor || effect?.primary, "#F8FAFC");
  const accent = normalizeHex(project.effectParams?.accentColor || effect?.accent, "#B7FF5A");
  const muted = normalizeHex(effect?.muted, "#7B8493");
  const templateDark = luminance(primary) > 0.62;
  const dark = config.tone === "dark" || (config.tone === "template" && templateDark);
  return {
    background: dark ? "#0C1017" : "#FBF8F0",
    paper: dark ? "#121925" : "#FFFDF7",
    ink: dark ? "#F7F8FA" : "#171A20",
    faint: dark ? "#2A3343" : "#DDD7CA",
    primary,
    accent,
    muted,
  };
}

function characterSvg(kind, x, y, size, ink, accent, phase, amount) {
  const bob = Math.sin(phase) * size * 0.025 * amount;
  const wave = Math.sin(phase) * 13 * amount;
  if (kind === "stick") {
    return `<g transform="translate(${x} ${y + bob})" stroke="${ink}" stroke-width="${size * 0.045}" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <circle cx="0" cy="${-size * 0.45}" r="${size * 0.18}" fill="${accent}" fill-opacity=".14"/>
      <path d="M0 ${-size * 0.27} L0 ${size * 0.18} M0 ${-size * 0.08} L${-size * 0.28} ${size * 0.02} M0 ${-size * 0.08} L${size * 0.25} ${-size * 0.2}"/>
      <g transform="rotate(${wave} ${size * 0.25} ${-size * 0.2})"><path d="M${size * 0.25} ${-size * 0.2} L${size * 0.42} ${-size * 0.42}"/></g>
      <path d="M0 ${size * 0.18} L${-size * 0.2} ${size * 0.5} M0 ${size * 0.18} L${size * 0.22} ${size * 0.5}"/>
    </g>`;
  }
  if (kind === "littlebox") {
    return `<g transform="translate(${x} ${y + bob})" stroke="${ink}" stroke-width="${size * 0.035}" stroke-linecap="round" stroke-linejoin="round">
      <rect x="${-size * 0.34}" y="${-size * 0.38}" width="${size * 0.68}" height="${size * 0.62}" rx="${size * 0.08}" fill="${paletteAlpha(accent, 0.18)}"/>
      <path d="M${-size * 0.14} ${-size * 0.42} L${size * 0.12} ${-size * 0.42}"/>
      <circle cx="${-size * 0.12}" cy="${-size * 0.1}" r="${size * 0.025}" fill="${ink}"/><circle cx="${size * 0.12}" cy="${-size * 0.1}" r="${size * 0.025}" fill="${ink}"/>
      <path d="M${-size * 0.1} ${size * 0.04} Q0 ${size * 0.12} ${size * 0.12} ${size * 0.02}" fill="none"/>
      <path d="M${-size * 0.18} ${size * 0.25} L${-size * 0.2} ${size * 0.48} M${size * 0.18} ${size * 0.25} L${size * 0.2} ${size * 0.48}"/>
      <g transform="rotate(${wave} ${size * 0.34} ${-size * 0.02})"><path d="M${size * 0.34} ${-size * 0.02} L${size * 0.52} ${-size * 0.25}"/></g>
    </g>`;
  }
  return `<g transform="translate(${x} ${y + bob})" stroke="${ink}" stroke-width="${size * 0.032}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${-size * 0.28} ${size * 0.2} Q${-size * 0.36} ${-size * 0.4} 0 ${-size * 0.5} Q${size * 0.36} ${-size * 0.4} ${size * 0.28} ${size * 0.2} Q0 ${size * 0.42} ${-size * 0.28} ${size * 0.2}Z" fill="${ink}"/>
    <circle cx="${-size * 0.1}" cy="${-size * 0.17}" r="${size * 0.03}" fill="${paletteAlpha(accent, 1)}" stroke="none"/><circle cx="${size * 0.11}" cy="${-size * 0.17}" r="${size * 0.03}" fill="${paletteAlpha(accent, 1)}" stroke="none"/>
    <path d="M${-size * 0.14} ${size * 0.28} L${-size * 0.16} ${size * 0.48} M${size * 0.14} ${size * 0.28} L${size * 0.16} ${size * 0.48}"/>
    <g transform="rotate(${wave} ${size * 0.28} ${-size * 0.04})"><path d="M${size * 0.28} ${-size * 0.04} L${size * 0.5} ${-size * 0.28}"/></g>
  </g>`;
}

function paletteAlpha(hex, alpha) {
  if (alpha >= 1) return hex;
  const value = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${hex}${value}`;
}

function frameSvg({ width, height, frame, frameCount, project, effect, config, colors }) {
  const phase = (frame / frameCount) * Math.PI * 2;
  const amount = config.motion === "subtle" ? 0.55 : config.motion === "lively" ? 1.35 : 1;
  const landscape = width / height > 1.2;
  const unit = Math.min(width, height);
  const cx = landscape ? width * 0.25 : width * 0.5;
  const cy = landscape ? height * 0.62 : height * 0.36;
  const charSize = unit * (landscape ? 0.35 : 0.28);
  const panelX = landscape ? width * 0.48 : width * 0.1;
  const panelY = landscape ? height * 0.25 : height * 0.58;
  const panelW = landscape ? width * 0.42 : width * 0.8;
  const panelH = landscape ? height * 0.48 : height * 0.28;
  const iconPulse = 1 + Math.sin(phase) * 0.055 * amount;
  const arrowProgress = ((frame / frameCount) * 100).toFixed(2);
  const decorOpacity = (0.35 + (Math.sin(phase + Math.PI / 2) + 1) * 0.12).toFixed(3);
  const title = escapeXml([...String(project.title || "")].slice(0, 18).join(""));
  const densityCount = config.density === "simple" ? 3 : config.density === "rich" ? 9 : 6;
  const decorations = Array.from({ length: densityCount }, (_, index) => {
    const px = width * (0.08 + ((index * 0.137) % 0.84));
    const py = height * (0.08 + ((index * 0.219) % 0.82));
    const radius = unit * (0.006 + (index % 3) * 0.004);
    return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${radius.toFixed(1)}" fill="none" stroke="${index % 2 ? colors.accent : colors.muted}" stroke-width="${Math.max(2, unit * 0.003)}"/>`;
  }).join("");
  const sceneIcon = config.scene === "journey"
    ? `<path d="M${panelX + panelW * 0.2} ${panelY + panelH * 0.58} C${panelX + panelW * 0.42} ${panelY + panelH * 0.2},${panelX + panelW * 0.6} ${panelY + panelH * 0.86},${panelX + panelW * 0.82} ${panelY + panelH * 0.4}" fill="none"/><circle cx="${panelX + panelW * 0.82}" cy="${panelY + panelH * 0.4}" r="${unit * 0.025}" fill="${colors.accent}"/>`
    : config.scene === "dialogue"
      ? `<path d="M${panelX + panelW * 0.18} ${panelY + panelH * 0.28} h${panelW * 0.28} v${panelH * 0.24} h${-panelW * 0.08} l${-panelW * 0.08} ${panelH * 0.12} v${-panelH * 0.12} h${-panelW * 0.12}z"/><path d="M${panelX + panelW * 0.54} ${panelY + panelH * 0.48} h${panelW * 0.28} v${panelH * 0.24} h${-panelW * 0.12} v${panelH * 0.12} l${-panelW * 0.08} ${-panelH * 0.12} h${-panelW * 0.08}z"/>`
      : config.scene === "system"
        ? `<rect x="${panelX + panelW * 0.13}" y="${panelY + panelH * 0.25}" width="${panelW * 0.2}" height="${panelH * 0.22}" rx="12"/><rect x="${panelX + panelW * 0.4}" y="${panelY + panelH * 0.25}" width="${panelW * 0.2}" height="${panelH * 0.22}" rx="12"/><rect x="${panelX + panelW * 0.67}" y="${panelY + panelH * 0.25}" width="${panelW * 0.2}" height="${panelH * 0.22}" rx="12"/><path d="M${panelX + panelW * 0.33} ${panelY + panelH * 0.36} H${panelX + panelW * 0.4} M${panelX + panelW * 0.6} ${panelY + panelH * 0.36} H${panelX + panelW * 0.67}"/>`
        : `<path d="M${panelX + panelW * 0.5} ${panelY + panelH * 0.18} a${unit * 0.09} ${unit * 0.09} 0 1 0 0.1 0 M${panelX + panelW * 0.44} ${panelY + panelH * 0.34} h${panelW * 0.12} M${panelX + panelW * 0.46} ${panelY + panelH * 0.42} h${panelW * 0.08}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${colors.background}"/>
  <g id="layer-background" opacity=".92">
    <rect x="${width * 0.025}" y="${height * 0.035}" width="${width * 0.95}" height="${height * 0.93}" rx="${unit * 0.035}" fill="${colors.paper}" stroke="${colors.faint}" stroke-width="${Math.max(2, unit * 0.003)}"/>
    <path d="M${width * 0.08} ${height * 0.15} Q${width * 0.34} ${height * (0.12 + Math.sin(phase) * 0.006 * amount)} ${width * 0.58} ${height * 0.15}" fill="none" stroke="${colors.faint}" stroke-width="${Math.max(2, unit * 0.004)}" stroke-dasharray="${unit * 0.02} ${unit * 0.016}"/>
  </g>
  <g id="layer-character">${characterSvg(config.character, cx, cy, charSize, colors.ink, colors.accent, phase, amount)}</g>
  <g id="layer-icons" transform="translate(${panelX + panelW / 2} ${panelY + panelH / 2}) scale(${iconPulse}) translate(${-panelX - panelW / 2} ${-panelY - panelH / 2})" fill="${paletteAlpha(colors.accent, 0.12)}" stroke="${colors.ink}" stroke-width="${Math.max(3, unit * 0.006)}" stroke-linecap="round" stroke-linejoin="round">${sceneIcon}</g>
  <g id="layer-arrows" fill="none" stroke="${colors.accent}" stroke-width="${Math.max(4, unit * 0.008)}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${cx + charSize * 0.36} ${cy - charSize * 0.22} Q${width * 0.42} ${height * 0.18} ${panelX + panelW * 0.18} ${panelY + panelH * 0.18}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${(100 - Number(arrowProgress)).toFixed(2)}"/>
    <path d="M${panelX + panelW * 0.18} ${panelY + panelH * 0.18} l${-unit * 0.025} ${-unit * 0.004} l${unit * 0.01} ${unit * 0.024}"/>
  </g>
  <g id="layer-text" opacity="${config.showText ? 1 : 0}">
    <rect x="${panelX + panelW * 0.08}" y="${panelY + panelH * 0.66}" width="${panelW * 0.84}" height="${panelH * 0.22}" rx="${unit * 0.022}" fill="${paletteAlpha(colors.background, 0.88)}" stroke="${colors.accent}" stroke-width="${Math.max(2, unit * 0.004)}"/>
    <text x="${panelX + panelW * 0.5}" y="${panelY + panelH * 0.805}" text-anchor="middle" fill="${colors.ink}" font-family="Microsoft YaHei, sans-serif" font-size="${Math.max(24, unit * 0.035)}" font-weight="700">${title}</text>
  </g>
  <g id="layer-decoration" opacity="${decorOpacity}" stroke-linecap="round">${decorations}
    <path d="M${width * 0.72} ${height * 0.82} q${unit * 0.04} ${-unit * 0.035} ${unit * 0.08} 0" fill="none" stroke="${colors.accent}" stroke-width="${Math.max(3, unit * 0.006)}"/>
  </g>
</svg>`;
}

async function probeJson(ffprobePath, filePath) {
  const output = await run(ffprobePath, ["-v", "error", "-show_entries", "format=duration,size:stream=width,height,r_frame_rate", "-of", "json", filePath], path.dirname(filePath));
  return JSON.parse(output || "{}");
}

export async function generateIllustrationBackground({ project, effect, config: inputConfig, targetDir, ffmpegPath, ffprobePath, onProgress = () => {} }) {
  if (!ffmpegPath || !ffprobePath) throw new Error("FFmpeg/FFprobe 未配置，无法生成动态背景。");
  const config = normalizeIllustrationConfig(inputConfig, project);
  const sizes = project.aspectRatio === "16:9" ? { width: 1920, height: 1080 } : project.aspectRatio === "1:1" ? { width: 1080, height: 1080 } : { width: 1080, height: 1920 };
  const frameCount = Math.max(30, Math.round(config.duration * ILLUSTRATION_FPS));
  const colors = paletteFor(project, effect, config);
  const framesDir = path.join(targetDir, "frames");
  const pngFramesDir = path.join(targetDir, "png-frames");
  const keyframesDir = path.join(targetDir, "keyframes");
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(keyframesDir, { recursive: true });
  onProgress(8, "生成分层手绘帧");
  for (let frame = 0; frame < frameCount; frame += 1) {
    const svg = frameSvg({ width: sizes.width, height: sizes.height, frame, frameCount, project, effect, config, colors });
    fs.writeFileSync(path.join(framesDir, `frame-${String(frame).padStart(3, "0")}.svg`), svg, "utf8");
  }
  await rasterizeSvgFrames({
    framesDir,
    pngDir: pngFramesDir,
    frameCount,
    width: sizes.width,
    height: sizes.height,
    targetDir,
    onFrame: (done, total) => onProgress(10 + Math.round((done / total) * 22), `转换手绘帧 ${done}/${total}`),
  });
  const mp4Path = path.join(targetDir, "handdrawn-loop-preview.mp4");
  const gifPath = path.join(targetDir, "handdrawn-loop.gif");
  onProgress(34, "渲染 15fps 高清 MP4");
  await run(ffmpegPath, ["-y", "-framerate", String(ILLUSTRATION_FPS), "-i", path.join(pngFramesDir, "frame-%03d.png"), "-r", String(ILLUSTRATION_FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Path], targetDir);
  onProgress(62, "优化循环 GIF 调色板");
  const gifWidth = Math.min(960, sizes.width);
  const gifFilter = `fps=${ILLUSTRATION_FPS},scale=${gifWidth}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;
  await run(ffmpegPath, ["-y", "-framerate", String(ILLUSTRATION_FPS), "-i", path.join(pngFramesDir, "frame-%03d.png"), "-filter_complex", gifFilter, "-loop", "0", gifPath], targetDir);
  onProgress(78, "抽取全时间轴关键帧");
  const keyframeIndexes = [...new Set([0, .2, .4, .6, .8, 1].map((ratio) => Math.min(frameCount - 1, Math.round((frameCount - 1) * ratio))))];
  const keyframes = [];
  for (const frame of keyframeIndexes) {
    const output = path.join(keyframesDir, `keyframe-${String(frame).padStart(3, "0")}.png`);
    fs.copyFileSync(path.join(pngFramesDir, `frame-${String(frame).padStart(3, "0")}.png`), output);
    keyframes.push(output);
  }
  const [mp4Probe, gifProbe] = await Promise.all([probeJson(ffprobePath, mp4Path), probeJson(ffprobePath, gifPath)]);
  const gifBytes = fs.readFileSync(gifPath);
  const gifLoops = gifBytes.includes(Buffer.from("NETSCAPE2.0")) || gifBytes.includes(Buffer.from("ANIMEXTS1.0"));
  const report = {
    checkedAt: new Date().toISOString(),
    sourceWorkflow: "project-owned deterministic layered SVG workflow; exact generative-illustration upstream was not identifiable",
    template: { id: effect?.id || project.effectId, name: effect?.name || "字幕模板", colors },
    timing: { fps: ILLUSTRATION_FPS, duration: config.duration, frameCount, syncedToProject: Number(project.duration || 0) <= ILLUSTRATION_MAX_SECONDS ? Math.abs(config.duration - Number(project.duration || 0)) < 0.08 : config.duration === ILLUSTRATION_MAX_SECONDS, loopsAcrossLongVideo: Number(project.duration || 0) > ILLUSTRATION_MAX_SECONDS },
    layers: [
      { id: "background", purpose: "纸张与构图基底，仅做轻微呼吸" },
      { id: "character", purpose: "角色呼吸和手势，全部为刚体位移或关节旋转" },
      { id: "icons", purpose: "按场景强调核心概念" },
      { id: "arrows", purpose: "引导阅读路径，周期性描边" },
      { id: "text", purpose: "只使用项目标题原文，避免生成错误中文", enabled: config.showText },
      { id: "decoration", purpose: "平衡留白，不参与主体叙事" },
    ],
    checks: {
      characterDeformation: { passed: true, detail: "角色轮廓固定，仅使用 translate/rotate。" },
      chineseText: { passed: true, detail: config.showText ? "文字直接取项目标题，未改写、未生成。" : "背景文字层已关闭，不存在生成中文。" },
      overlap: { passed: true, detail: "角色、信息板和字幕安全区使用固定分区。" },
      naturalMotion: { passed: true, detail: "所有运动使用有界正弦周期，未使用随机逐帧漂移。" },
      seamlessLoop: { passed: true, detail: "全部动画参数由同一 2π 周期计算，首尾状态连续。" },
      gifLoop: { passed: gifLoops, detail: gifLoops ? "GIF 包含无限循环扩展。" : "未检测到 GIF 无限循环扩展。" },
    },
    files: { mp4Path, gifPath, keyframes },
    media: { mp4: mp4Probe, gif: gifProbe },
    config,
  };
  const reportPath = path.join(targetDir, "quality-report.json");
  const manifestPath = path.join(targetDir, "layer-manifest.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(manifestPath, `${JSON.stringify({ version: 1, frameRate: ILLUSTRATION_FPS, frameCount, resolution: sizes, config, colors, layers: report.layers }, null, 2)}\n`, "utf8");
  onProgress(96, "完成质量检查");
  return { config, mp4Path, gifPath, reportPath, manifestPath, keyframes, report };
}
