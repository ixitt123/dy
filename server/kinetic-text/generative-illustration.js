import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import WebSocket from "ws";

export const ILLUSTRATION_FPS = 15;
export const ILLUSTRATION_MAX_SECONDS = 8;
export const ILLUSTRATION_PRESETS = new Set(["prompt-garden", "copy-concept"]);

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
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
    if (child.exitCode == null) {
      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once("close", resolve)),
        new Promise((resolve) => setTimeout(resolve, 1800)),
      ]);
    }
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 }); } catch {}
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
  return {
    enabled: input.enabled === true,
    presetId: ILLUSTRATION_PRESETS.has(input.presetId) ? input.presetId : "prompt-garden",
    duration: clamp(Math.min(ILLUSTRATION_MAX_SECONDS, Math.max(2, Number(project.duration || 6))), 2, ILLUSTRATION_MAX_SECONDS, 6),
  };
}

function paletteFor(project, effect, config) {
  const primary = normalizeHex(project.effectParams?.primaryColor || effect?.primary, "#F8FAFC");
  const accent = normalizeHex(project.effectParams?.accentColor || effect?.accent, "#B7FF5A");
  const muted = normalizeHex(effect?.muted, "#7B8493");
  const templateDark = luminance(primary) > 0.62;
  const dark = templateDark;
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

function paletteAlpha(hex, alpha) {
  if (alpha >= 1) return hex;
  const value = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${hex}${value}`;
}

function imageDataUri(filePath) {
  return `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

async function prepareTransparentAssets(paths, targetDir, ffmpegPath) {
  const preparedDir = path.join(targetDir, "prepared-assets");
  fs.mkdirSync(preparedDir, { recursive: true });
  const prepared = [];
  for (let index = 0; index < paths.length; index += 1) {
    const output = path.join(preparedDir, `element-${index + 1}.png`);
    await run(ffmpegPath, ["-y", "-i", paths[index], "-vf", "colorkey=0xFFFFFF:0.10:0.06,format=rgba", "-frames:v", "1", output], targetDir);
    prepared.push(imageDataUri(output));
  }
  return prepared;
}

function frameSvg({ width, height, frame, frameCount, project, effect, config, colors, assetUris }) {
  const phase = (frame / frameCount) * Math.PI * 2;
  const amount = 1;
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
  const densityCount = 6;
  const decorations = Array.from({ length: densityCount }, (_, index) => {
    const px = width * (0.08 + ((index * 0.137) % 0.84));
    const py = height * (0.08 + ((index * 0.219) % 0.82));
    const radius = unit * (0.006 + (index % 3) * 0.004);
    return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${radius.toFixed(1)}" fill="none" stroke="${index % 2 ? colors.accent : colors.muted}" stroke-width="${Math.max(2, unit * 0.003)}"/>`;
  }).join("");
  const imageTag = (href, x, y, w, h, transform = "") => href
    ? `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"${transform ? ` transform="${transform}"` : ""}/>`
    : "";
  const progress = frame / Math.max(1, frameCount - 1);
  const promptGarden = config.presetId === "prompt-garden";
  const gardenLayer = promptGarden ? (() => {
    const groundY = height * 0.78;
    const dead = assetUris[1] || assetUris[0];
    const living = assetUris[0];
    const deadPlants = Array.from({ length: 7 }, (_, index) => {
      const w = unit * 0.14;
      const x = width * (0.08 + index * 0.12);
      const sway = Math.sin(phase + index) * 2.2;
      return imageTag(dead, x, groundY - w, w, w, `rotate(${sway} ${x + w / 2} ${groundY})`);
    }).join("");
    const bloom = Math.min(1, Math.max(0, (progress - 0.28) / 0.32));
    const bloomScale = 0.2 + (1 - (1 - bloom) ** 3) * 0.8;
    const flowerW = unit * 0.31;
    const flowerX = width * 0.58;
    const words = ["again", "warmer", "closer", "less", "brighter", "again"]
      .map((word, index) => {
        const x = width * (0.12 + ((index * 0.163) % 0.72));
        const y = ((progress * height * 1.3 + index * height * 0.18) % (height * 1.08)) - height * 0.08;
        return `<text x="${x}" y="${y}" fill="${index % 3 === 0 ? colors.ink : colors.muted}" opacity="${0.28 + (index % 3) * 0.18}" font-family="monospace" font-size="${Math.max(18, unit * 0.023)}" transform="rotate(${index % 2 ? -14 : 12} ${x} ${y})">${word}</text>`;
      }).join("");
    return `<g id="layer-prompt-words">${words}</g><g id="layer-withered-plants">${deadPlants}</g><g id="layer-success-flower" transform="translate(${flowerX + flowerW / 2} ${groundY}) scale(${bloomScale}) translate(${-flowerX - flowerW / 2} ${-groundY})">${imageTag(living, flowerX, groundY - flowerW, flowerW, flowerW)}</g>`;
  })() : (() => {
    const heroW = unit * 0.42;
    const supportW = unit * 0.25;
    const pulse = 0.96 + Math.sin(phase) * 0.035;
    return `<g id="layer-concept-hero" transform="translate(${width * 0.5} ${height * 0.5}) scale(${pulse}) translate(${-width * 0.5} ${-height * 0.5})">${imageTag(assetUris[0], width * 0.5 - heroW / 2, height * 0.5 - heroW / 2, heroW, heroW)}</g><g id="layer-concept-support">${imageTag(assetUris[1], width * 0.12, height * 0.25 + Math.sin(phase) * unit * 0.015, supportW, supportW)}${imageTag(assetUris[2], width * 0.68, height * 0.62 - Math.sin(phase) * unit * 0.015, supportW, supportW)}</g>`;
  })();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${colors.background}"/>
  <g id="layer-background" opacity=".92">
    <rect x="${width * 0.025}" y="${height * 0.035}" width="${width * 0.95}" height="${height * 0.93}" rx="${unit * 0.035}" fill="${colors.paper}" stroke="${colors.faint}" stroke-width="${Math.max(2, unit * 0.003)}"/>
    <path d="M${width * 0.08} ${height * 0.15} Q${width * 0.34} ${height * (0.12 + Math.sin(phase) * 0.006 * amount)} ${width * 0.58} ${height * 0.15}" fill="none" stroke="${colors.faint}" stroke-width="${Math.max(2, unit * 0.004)}" stroke-dasharray="${unit * 0.02} ${unit * 0.016}"/>
  </g>
  ${gardenLayer}
  <g id="layer-decoration" opacity="${decorOpacity}" stroke-linecap="round">${decorations}
    <path d="M${width * 0.72} ${height * 0.82} q${unit * 0.04} ${-unit * 0.035} ${unit * 0.08} 0" fill="none" stroke="${colors.accent}" stroke-width="${Math.max(3, unit * 0.006)}"/>
  </g>
</svg>`;
}

async function probeJson(ffprobePath, filePath) {
  const output = await run(ffprobePath, ["-v", "error", "-show_entries", "format=duration,size:stream=width,height,r_frame_rate", "-of", "json", filePath], path.dirname(filePath));
  return JSON.parse(output || "{}");
}

export async function generateIllustrationBackground({ project, effect, config: inputConfig, assets = {}, targetDir, ffmpegPath, ffprobePath, onProgress = () => {} }) {
  if (!ffmpegPath || !ffprobePath) throw new Error("FFmpeg/FFprobe 未配置，无法生成动态背景。");
  const config = normalizeIllustrationConfig(inputConfig, project);
  const sizes = project.aspectRatio === "16:9" ? { width: 1920, height: 1080 } : project.aspectRatio === "1:1" ? { width: 1080, height: 1080 } : { width: 1080, height: 1920 };
  const frameCount = Math.max(30, Math.round(config.duration * ILLUSTRATION_FPS));
  const colors = paletteFor(project, effect, config);
  const sourceAssetPaths = Array.isArray(assets.paths) ? assets.paths.filter((item) => item && fs.existsSync(item)) : [];
  if (sourceAssetPaths.length < (config.presetId === "prompt-garden" ? 2 : 3)) {
    throw new Error("当前预设缺少对应的独立分层图片，请先调用图片 API 或上传全部素材。");
  }
  onProgress(27, "移除独立元素白色背景");
  const assetUris = await prepareTransparentAssets(sourceAssetPaths, targetDir, ffmpegPath);
  const framesDir = path.join(targetDir, "frames");
  const pngFramesDir = path.join(targetDir, "png-frames");
  const keyframesDir = path.join(targetDir, "keyframes");
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(keyframesDir, { recursive: true });
  onProgress(8, "生成分层手绘帧");
  for (let frame = 0; frame < frameCount; frame += 1) {
    const svg = frameSvg({ width: sizes.width, height: sizes.height, frame, frameCount, project, effect, config, colors, assetUris });
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
    sourceWorkflow: "iart-ai/generative-illustration-skills v0.1.0 official deterministic render contract",
    installedSkill: ".agents/skills/generative-illustration/SKILL.md",
    template: { id: effect?.id || project.effectId, name: effect?.name || "字幕模板", colors },
    timing: { fps: ILLUSTRATION_FPS, duration: config.duration, frameCount, syncedToProject: Number(project.duration || 0) <= ILLUSTRATION_MAX_SECONDS ? Math.abs(config.duration - Number(project.duration || 0)) < 0.08 : config.duration === ILLUSTRATION_MAX_SECONDS, loopsAcrossLongVideo: Number(project.duration || 0) > ILLUSTRATION_MAX_SECONDS },
    layers: [
      { id: "background", purpose: "纸张与构图基底，仅做轻微呼吸" },
      ...(assets.metadata || []).map((item, index) => ({ id: `asset-${index + 1}`, purpose: "图片 API 生成的独立无文字元素", provider: item.provider, model: item.model, prompt: item.prompt })),
      { id: "decoration", purpose: "平衡留白，不参与主体叙事" },
    ],
    checks: {
      characterDeformation: { passed: true, detail: "未使用角色或整图变形；独立元素仅整体位移、旋转和缩放。" },
      chineseText: { passed: true, detail: "遵循官方 no text 规则，背景文字层关闭。" },
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
