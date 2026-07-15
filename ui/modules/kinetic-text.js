const PREF_KEY = "dy:kinetic-text:preferences";
const FAVORITES_KEY = "dy:subtitle-template:favorites";
const HANDOFF_KEY = "dy:handoff:kinetic-text:audio";
const TEXT_HANDOFF_KEY = "dy:handoff:kinetic-text:text";

const state = {
  page: null,
  effects: [],
  projects: [],
  project: null,
  currentTime: 0,
  playing: false,
  startedAt: 0,
  startTime: 0,
  raf: 0,
  saveTimer: 0,
  pollTimer: 0,
  audio: null,
  backgroundMedia: null,
};

function $(selector, root = state.page || document) {
  return root?.querySelector(selector);
}

function readPreferences() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { return {}; }
}

function savePreferences(changes = {}) {
  const next = { ...readPreferences(), ...changes };
  localStorage.setItem(PREF_KEY, JSON.stringify(next));
  return next;
}

function readFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")); } catch { return new Set(); }
}

function toggleFavorite(templateId) {
  const favorites = readFavorites();
  if (favorites.has(templateId)) favorites.delete(templateId);
  else favorites.add(templateId);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  renderEffects();
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || `请求失败：${response.status}`);
  return data;
}

function postJson(url, body) {
  return jsonFetch(url, { method: "POST", body: JSON.stringify(body) });
}

function formatTime(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function shortFileName(value) {
  const text = String(value || "");
  return text.split(/[\\/]/).pop() || text;
}

function effectById(id) {
  return state.effects.find((item) => item.id === id) || state.effects[0] || null;
}

function setProgress(progress = 0, stage = "等待开始") {
  const value = Math.max(0, Math.min(100, Number(progress || 0)));
  $("#kineticProgressFill").style.width = `${value}%`;
  $("#kineticProgressPercent").textContent = `${Math.round(value)}%`;
  $("#kineticProgressStage").textContent = stage;
}

function renderProjects() {
  const select = $("#kineticTextProjectSelect");
  if (!select) return;
  select.innerHTML = state.projects.length
    ? state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)} · ${escapeHtml(project.effect?.name || "")}</option>`).join("")
    : '<option value="">等待 TTS 发送</option>';
  if (state.project) select.value = state.project.id;
}

function renderEffects() {
  const grid = $("#kineticEffectGrid");
  if (!grid) return;
  const favorites = readFavorites();
  grid.innerHTML = state.effects.map((effect) => `
    <article class="kinetic-template-card${state.project?.effectId === effect.id ? " active" : ""}" data-effect-id="${effect.id}">
      <div class="kinetic-template-preview" style="--effect-primary:${effect.primary};--effect-accent:${effect.accent}">
        <video muted loop playsinline preload="none" poster="${escapeHtml(effect.previewImage || "")}" aria-label="${escapeHtml(effect.name)} 动态预览">
          <source src="${escapeHtml(effect.previewVideo || "")}" type="video/mp4" />
        </video>
        <img src="${escapeHtml(effect.previewImage || "")}" alt="${escapeHtml(effect.name)} 缩略图" loading="lazy" />
        <span class="kinetic-template-live">动态预览</span>
        <button class="kinetic-template-favorite${favorites.has(effect.id) ? " active" : ""}" type="button" data-action="favorite" aria-label="${favorites.has(effect.id) ? "取消收藏" : "收藏"}">${favorites.has(effect.id) ? "★" : "☆"}</button>
      </div>
      <div class="kinetic-template-copy">
        <div><strong>${escapeHtml(effect.name)}</strong><span>${escapeHtml(effect.scene || "短视频")}</span></div>
        <p>${escapeHtml(effect.description)}</p>
        <div class="kinetic-template-meta">
          <span>${effect.requiresWordTiming ? "需要逐词时间轴" : "支持句级时间轴"}</span>
          <span>9:16 / 16:9</span>
        </div>
        <button class="kinetic-template-use" type="button" data-action="select">${state.project?.effectId === effect.id ? "正在使用" : "立即使用"}</button>
      </div>
    </article>
  `).join("");
}

function renderTimeline() {
  const container = $("#kineticTimeline");
  if (!container) return;
  if (!state.project?.segments?.length) {
    container.innerHTML = '<p class="kinetic-empty">发送已确认的 TTS 后，这里会显示可编辑字幕时间轴。</p>';
    return;
  }
  container.innerHTML = state.project.segments.map((segment, index) => {
    const overrides = segment.overrides || {};
    const x = Number(overrides.x ?? state.project.effectParams?.x ?? 50);
    const y = Number(overrides.y ?? state.project.effectParams?.y ?? 50);
    const color = overrides.primaryColor || state.project.effectParams?.primaryColor || effectById(state.project.effectId)?.primary || "#ffffff";
    return `
      <div class="kinetic-timeline-row" data-segment-index="${index}">
        <span class="kinetic-segment-index">${index + 1}</span>
        <input data-field="start" type="number" min="0" step="0.01" value="${Number(segment.start).toFixed(2)}" />
        <input data-field="end" type="number" min="0" step="0.01" value="${Number(segment.end).toFixed(2)}" />
        <textarea data-field="text" rows="2">${escapeHtml(segment.text)}</textarea>
        <input data-field="keywords" type="text" value="${escapeHtml((segment.keywords || []).join("、"))}" placeholder="重点词" />
        <input data-field="lineBreaks" type="text" value="${escapeHtml((segment.lineBreaks || []).join(","))}" placeholder="如 6,12" title="按字符序号设置换行位置" />
        <div class="kinetic-position-inputs"><input data-field="x" type="number" min="5" max="95" value="${x}" /><input data-field="y" type="number" min="5" max="95" value="${y}" /></div>
        <input data-field="primaryColor" type="color" value="${color}" />
      </div>
    `;
  }).join("");
}

function renderTimelineRuleStatus() {
  const container = $("#kineticTimelineRuleStatus");
  if (!container) return;
  const validation = state.project?.timelineValidation;
  if (!state.project || !validation) {
    container.hidden = true;
    container.textContent = "";
    return;
  }
  const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
  container.hidden = false;
  container.classList.toggle("warn", warnings.length > 0);
  container.classList.toggle("ok", warnings.length === 0);
  container.textContent = warnings.length
    ? `时间轴规则提醒：${warnings.slice(0, 2).join("；")}${warnings.length > 2 ? ` 等 ${warnings.length} 项` : ""}`
    : "时间轴规则已应用：音频、文案、时间戳字幕按同一项目绑定。";
}

function mediaUrl(kind) {
  return state.project ? `/api/kinetic-text/file?id=${encodeURIComponent(state.project.id)}&kind=${encodeURIComponent(kind)}&v=${encodeURIComponent(state.project.updatedAt || Date.now())}` : "";
}

function syncAudio() {
  if (state.audio) {
    state.audio.pause();
    state.audio.src = "";
  }
  state.audio = null;
  const source = state.project?.audioUrl || (state.project?.audioPath ? mediaUrl("tts") : "");
  if (!source) return;
  state.audio = new Audio(source);
  state.audio.preload = "metadata";
  state.audio.addEventListener("ended", () => { state.playing = false; cancelAnimationFrame(state.raf); drawPreview(); });
}

function syncBackgroundMedia() {
  const previous = state.backgroundMedia;
  if (previous instanceof HTMLVideoElement) previous.pause();
  state.backgroundMedia = null;
  const mode = state.project?.background?.mode;
  if (!state.project || mode === "black" || !state.project.background.path) return;
  if (mode === "image") {
    const image = new Image();
    image.onload = drawPreview;
    image.src = mediaUrl("background");
    state.backgroundMedia = image;
  } else {
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.preload = "auto";
    video.src = mediaUrl("background");
    video.addEventListener("loadeddata", drawPreview);
    state.backgroundMedia = video;
  }
}

function drawCover(ctx, media, width, height) {
  const mediaWidth = media.videoWidth || media.naturalWidth || width;
  const mediaHeight = media.videoHeight || media.naturalHeight || height;
  const scale = Math.max(width / mediaWidth, height / mediaHeight);
  const drawWidth = mediaWidth * scale;
  const drawHeight = mediaHeight * scale;
  ctx.drawImage(media, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function splitPreviewByMode(line, tokenMode = "char") {
  const source = String(line || "").trim();
  if (!source) return [];
  if (tokenMode === "line") return [source];
  if (tokenMode === "phrase") return source.match(/.{1,6}/g) || [source];
  if (tokenMode === "word") {
    const spaced = source.split(/\s+/).filter(Boolean);
    if (spaced.length > 1) return spaced;
    return source.match(/[A-Za-z0-9%]+|[\u4e00-\u9fff]{1,3}|[^\s]/g) || [source];
  }
  return [...source].filter((item) => item.trim());
}

function tokenRows(segment, effect = {}) {
  const source = String(segment.text || "").trim();
  const breaks = [...new Set((segment.lineBreaks || [])
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0 && value < source.length))]
    .sort((a, b) => a - b);
  const lines = [];
  let start = 0;
  for (const end of [...breaks, source.length]) {
    const line = source.slice(start, end).trim();
    if (line) lines.push(line);
    start = end;
  }
  const displayLines = lines.length ? lines : [source];
  return displayLines.flatMap((line, row) => {
    const values = splitPreviewByMode(line, effect.tokenMode || "char");
    return values.map((text, indexInRow) => ({ text, row, rowCount: displayLines.length, indexInRow, countInRow: values.length }));
  });
}

function easeOutBack(value) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function drawToken(ctx, token, x, y, options) {
  const { progress, index, effectId, motion, color, fontSize, fontFamily } = options;
  const delayed = Math.max(0, Math.min(1, (progress - index * 0.07) / Math.max(0.15, 1 - index * 0.04)));
  const eased = easeOutBack(delayed);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = Math.max(0, Math.min(1, delayed));
  let scaleX = eased;
  let scaleY = eased;
  let rotation = 0;
  let offsetX = 0;
  let offsetY = 0;
  if (["mask-rise", "wipe", "outline"].includes(motion)) scaleX = Math.max(0.05, Math.cos((1 - delayed) * Math.PI / 2));
  if (motion === "slide") { rotation = (1 - delayed) * -0.45; offsetX = (1 - delayed) * (index % 2 ? 84 : -84); offsetY = (1 - delayed) * 52; }
  if (["focus", "soft-blur"].includes(motion)) { scaleX = scaleY = 1 + (1 - delayed) * 1.08; ctx.filter = `blur(${(1 - delayed) * 8}px)`; }
  if (["slam", "block", "pop", "karaoke"].includes(motion)) { scaleX = scaleY = Math.max(0.2, eased); offsetY = (1 - delayed) * 58; }
  if (["neon", "gaming-stream"].includes(motion) || ["neon-pulse", "gaming-stream"].includes(effectId)) { scaleX = Math.max(0.05, Math.cos((1 - delayed) * Math.PI / 2)); ctx.shadowColor = color; ctx.shadowBlur = 16; }
  if (motion === "glitch") { ctx.filter = `blur(${(1 - delayed) * 4}px)`; rotation = (Math.sin(index * 5 + delayed * 12) * 0.08) * (1 - delayed); offsetX = Math.sin(index * 9) * 10 * (1 - delayed); }
  if (motion === "wave") { offsetY = Math.sin(index * 0.9 + delayed * Math.PI) * 30 * (1 - delayed); }
  if (motion === "assemble") ctx.filter = `blur(${(1 - delayed) * 5}px)`;
  if (motion === "typewriter") scaleX = scaleY = 1;
  if (motion === "elastic") { scaleX = scaleY = 0.75 + eased * 0.28; rotation = (1 - delayed) * -0.18; }
  ctx.translate(offsetX, offsetY);
  ctx.rotate(rotation);
  ctx.scale(scaleX, scaleY);
  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ["neon-pulse", "gaming-stream"].includes(effectId) ? color : "rgba(0,0,0,.72)";
  ctx.lineWidth = ["neon-pulse", "gaming-stream", "outline-trace"].includes(effectId) ? 4 : 2;
  ctx.fillStyle = color;
  ctx.strokeText(token, 0, 0);
  ctx.fillText(token, 0, 0);
  ctx.restore();
}

function tokenPosition(effect = {}, index, count, centerX, centerY, layout = {}) {
  const layoutId = effect.layout || "center";
  const centered = index - (count - 1) / 2;
  const rowOffset = (Number(layout.row || 0) - (Number(layout.rowCount || 1) - 1) / 2) * 95;
  const horizontalStep = Math.min(66, 750 / Math.max(1, count - 1));
  if (layoutId === "lower-third") return [centerX + centered * Math.min(56, horizontalStep), 422 + rowOffset * 0.22];
  if (layoutId === "impact") return [centerX + centered * Math.min(78, horizontalStep), centerY + rowOffset + (index % 2 ? 28 : -20)];
  if (layoutId === "diagonal") return [centerX + centered * horizontalStep, centerY + rowOffset + centered * Math.min(31, 250 / Math.max(1, count - 1))];
  if (layoutId === "stack") return [centerX + centered * Math.min(62, horizontalStep), centerY + rowOffset + (index % 2 ? 38 : -24)];
  if (layoutId === "stairs") return [centerX - 220 + index * Math.min(72, horizontalStep), centerY + rowOffset - 66 + index * 30];
  if (layoutId === "side-notes") {
    if (index === Math.floor((count - 1) / 2)) return [centerX, centerY + rowOffset];
    return [centerX + (index % 2 ? 220 : -220), centerY + rowOffset + (index - count / 2) * 28];
  }
  if (layoutId === "scatter") return [centerX + [-235, -90, 180, -190, 75, 215, -20, 130][index % 8], centerY + rowOffset + [-120, -45, -105, 95, 75, 128, 130, 15][index % 8]];
  if (layoutId === "vertical") return [centerX + Number(layout.row || 0) * 70, centerY + (index - (count - 1) / 2) * 58];
  if (layoutId === "wave") return [centerX + centered * Math.min(54, horizontalStep), centerY + rowOffset + Math.sin(index * 0.95) * 42];
  if (layoutId === "line-left") return [Math.max(110, centerX - 195) + index * Math.min(48, horizontalStep), centerY + rowOffset];
  if (layoutId === "question-card") return [centerX + centered * Math.min(56, horizontalStep), centerY + rowOffset - 20];
  if (layoutId === "sticker") return [centerX + centered * Math.min(70, horizontalStep), centerY + rowOffset + (index % 2 ? 34 : -22)];
  if (layoutId === "orbit") {
    if (index === 0) return [centerX, centerY + rowOffset];
    const angle = ((index - 1) / Math.max(1, count - 1)) * Math.PI * 2 - Math.PI / 2;
    return [centerX + Math.cos(angle) * 215, centerY + rowOffset + Math.sin(angle) * 105];
  }
  return [centerX + centered * horizontalStep, centerY + rowOffset];
}

function drawLegacyPreview() {
  const canvas = $("#kineticPreviewCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  const media = state.backgroundMedia;
  if (media && ((media instanceof HTMLImageElement && media.complete) || (media instanceof HTMLVideoElement && media.readyState >= 2))) drawCover(ctx, media, width, height);
  $("#kineticPreviewEmpty").hidden = Boolean(state.project);
  if (!state.project) return;
  const effect = effectById(state.project.effectId);
  const segment = state.project.segments.find((item) => state.currentTime >= item.start && state.currentTime <= item.end);
  if (segment) {
    const localDuration = Math.max(0.1, Math.min(0.65, segment.end - segment.start));
    const progress = Math.max(0, Math.min(1, (state.currentTime - segment.start) / localDuration));
    const overrides = segment.overrides || {};
    const params = state.project.effectParams || {};
    const centerX = width * Number(overrides.x ?? params.x ?? 50) / 100;
    const centerY = height * Number(overrides.y ?? params.y ?? 50) / 100;
    const fontSize = Math.max(26, Math.min(110, Number(overrides.fontSize || params.fontSize || 92) / 2));
    const tokens = tokenRows(segment, effect);
    const keywords = segment.keywords || [];
    tokens.forEach((entry, index) => {
      const token = entry.text;
      const highlighted = keywords.some((keyword) => keyword && (token.includes(keyword) || keyword.includes(token)));
      const alternatingAccent = ["beast-highlight", "keyword-orbit", "lyric-wave", "gaming-stream", "sticker-bounce"].includes(effect?.id) && index % 2;
      const color = highlighted || alternatingAccent
        ? (overrides.accentColor || params.accentColor || effect?.accent || "#ffe66b")
        : (overrides.primaryColor || params.primaryColor || effect?.primary || "#fff");
      const [x, y] = tokenPosition(effect, entry.indexInRow, entry.countInRow, centerX, centerY, entry);
      const tokenFontSize = ["scatter-assemble", "main-side-notes", "podcast-lower-third", "minimal-subtitle"].includes(effect?.id)
        ? fontSize * 0.72
        : ["beat-word-pop", "punch-zoom", "gaming-stream"].includes(effect?.id)
          ? fontSize * 1.08
          : fontSize;
      drawToken(ctx, effect?.id === "podcast-lower-third" ? `• ${token}` : token, x, y, { progress, index, effectId: effect?.id, motion: effect?.motion, color, fontSize: tokenFontSize, fontFamily: params.fontFamily || "Microsoft YaHei" });
    });
    if (state.project.showBottomSubtitles) {
      ctx.save();
      ctx.font = "700 24px Microsoft YaHei";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(0,0,0,.85)";
      ctx.fillStyle = "#fff";
      ctx.strokeText(segment.text, width / 2, height - 24);
      ctx.fillText(segment.text, width / 2, height - 24);
      ctx.restore();
    }
  }
  const duration = Math.max(0.01, Number(state.project.duration || 0));
  $("#kineticPreviewSeek").value = String(Math.round((state.currentTime / duration) * 1000));
  $("#kineticCurrentTime").textContent = formatTime(state.currentTime);
  $("#kineticDuration").textContent = formatTime(duration);
}

function previewOutputSize(aspectRatio = "9:16") {
  if (aspectRatio === "16:9") return { canvasWidth: 960, canvasHeight: 540, outputWidth: 1920, outputHeight: 1080 };
  if (aspectRatio === "1:1") return { canvasWidth: 640, canvasHeight: 640, outputWidth: 1080, outputHeight: 1080 };
  return { canvasWidth: 540, canvasHeight: 960, outputWidth: 1080, outputHeight: 1920 };
}

function previewWords(segment) {
  const timed = Array.isArray(segment?.words) ? segment.words.filter((word) => word?.text) : [];
  if (timed.length) return timed;
  const text = String(segment?.text || "");
  const tokens = text.includes(" ") ? text.split(/\s+/).filter(Boolean) : (text.match(/[A-Za-z0-9%]+|[\u4e00-\u9fff]|[^\s]/g) || []);
  const duration = Math.max(0.1, Number(segment?.end || 0) - Number(segment?.start || 0));
  return tokens.map((token, index) => ({
    text: token,
    start: Number(segment.start || 0) + duration * index / Math.max(1, tokens.length),
    end: Number(segment.start || 0) + duration * (index + 1) / Math.max(1, tokens.length),
    estimated: true,
  }));
}

function previewWordGroups(words, sourceText = "") {
  const groups = [];
  let current = [];
  let chars = 0;
  words.forEach((word) => {
    if (/^[，。！？；：、,.!?;:]$/u.test(String(word.text || ""))) {
      if (current.length) current.push(word);
      else if (groups.length) groups[groups.length - 1].push(word);
      return;
    }
    const size = Math.max(1, [...String(word.text || "")].length);
    if (current.length >= 5 || (current.length >= 2 && chars + size > 8)) {
      groups.push(current);
      current = [];
      chars = 0;
    }
    current.push(word);
    chars += size;
  });
  if (current.length) groups.push(current);
  const separator = String(sourceText).includes(" ") ? " " : "";
  return groups.map((group) => ({ words: group, text: group.map((word) => word.text).join(separator), start: group[0].start, end: group[group.length - 1].end }));
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha = 1) {
  const match = String(hex || "#101216").match(/^#?([0-9a-f]{6})$/i);
  const value = match ? match[1] : "101216";
  return `rgba(${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)},${alpha})`;
}

function canvasLines(ctx, text, maxWidth, maxLines = 2) {
  const source = String(text || "").trim();
  if (!source) return [];
  const units = source.includes(" ") ? source.split(/(\s+)/).filter(Boolean) : [...source];
  const lines = [];
  let line = "";
  for (const unit of units) {
    const next = line + unit;
    if (line && ctx.measureText(next).width > maxWidth && lines.length < maxLines - 1) {
      lines.push(line.trim());
      line = unit.trimStart();
    } else line = next;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, maxLines);
}

function drawCaptionText(ctx, text, x, y, options = {}) {
  const fontSize = Number(options.fontSize || 44);
  const fontFamily = options.fontFamily || "Microsoft YaHei";
  const weight = options.weight || 800;
  const maxWidth = options.maxWidth || ctx.canvas.width * 0.82;
  const maxLines = options.maxLines || 2;
  const lineHeight = fontSize * (options.lineHeight || 1.22);
  ctx.save();
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = options.align || "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.globalAlpha = options.alpha ?? 1;
  if (options.shadow !== false) {
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = Math.max(2, fontSize * 0.12);
    ctx.shadowOffsetY = Math.max(1, fontSize * 0.04);
  }
  const lines = canvasLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, index) => {
    const lineY = y + (index - (lines.length - 1) / 2) * lineHeight;
    if (options.outline !== false) {
      ctx.strokeStyle = options.outlineColor || "rgba(10,12,16,.88)";
      ctx.lineWidth = Math.max(1.5, fontSize * 0.055);
      ctx.strokeText(line, x, lineY);
    }
    ctx.fillStyle = options.color || "#fff";
    ctx.fillText(line, x, lineY);
  });
  ctx.restore();
  return { lines, height: Math.max(lineHeight, lines.length * lineHeight) };
}

function drawWordRun(ctx, words, currentTime, x, y, options = {}) {
  const fontSize = Number(options.fontSize || 44);
  const fontFamily = options.fontFamily || "Microsoft YaHei";
  const separator = options.sourceText?.includes(" ") ? " " : "";
  ctx.save();
  ctx.font = `900 ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const widths = words.map((word, index) => ctx.measureText(word.text + (index < words.length - 1 ? separator : "")).width);
  let cursor = x - widths.reduce((sum, width) => sum + width, 0) / 2;
  words.forEach((word, index) => {
    const active = currentTime >= Number(word.start) && currentTime < Number(word.end);
    const token = word.text + (index < words.length - 1 ? separator : "");
    ctx.save();
    if (active) {
      const progress = Math.max(0, Math.min(1, (currentTime - Number(word.start)) / Math.max(0.04, Number(word.end) - Number(word.start))));
      const scale = 1 + Math.sin(progress * Math.PI) * 0.1;
      ctx.translate(cursor + widths[index] / 2, y);
      ctx.scale(scale, scale);
      ctx.translate(-(cursor + widths[index] / 2), -y);
    }
    ctx.strokeStyle = "rgba(10,12,16,.88)";
    ctx.lineWidth = Math.max(1.5, fontSize * 0.055);
    ctx.fillStyle = active ? options.accent : options.primary;
    ctx.strokeText(token, cursor, y);
    ctx.fillText(token, cursor, y);
    ctx.restore();
    cursor += widths[index];
  });
  ctx.restore();
}

function drawPreview() {
  const canvas = $("#kineticPreviewCanvas");
  if (!canvas) return;
  const spec = previewOutputSize(state.project?.aspectRatio || "9:16");
  if (canvas.width !== spec.canvasWidth || canvas.height !== spec.canvasHeight) {
    canvas.width = spec.canvasWidth;
    canvas.height = spec.canvasHeight;
  }
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#07090d";
  ctx.fillRect(0, 0, width, height);
  const media = state.backgroundMedia;
  if (media && ((media instanceof HTMLImageElement && media.complete) || (media instanceof HTMLVideoElement && media.readyState >= 2))) drawCover(ctx, media, width, height);
  else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#171b23");
    gradient.addColorStop(1, "#07090d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  $("#kineticPreviewEmpty").hidden = Boolean(state.project);
  if (!state.project) return;

  const template = effectById(state.project.effectId);
  const params = state.project.effectParams || {};
  const segmentIndex = state.project.segments.findIndex((item) => state.currentTime >= item.start && state.currentTime <= item.end);
  const segment = state.project.segments[segmentIndex];
  if (segment && template) {
    const scale = width / spec.outputWidth;
    const overrides = segment.overrides || {};
    const x = width * Number(overrides.x ?? params.x ?? 50) / 100;
    const y = height * Number(overrides.y ?? params.y ?? 64) / 100;
    const fontSize = Math.max(20, Number(overrides.fontSize || params.fontSize || 88) * scale);
    const primary = overrides.primaryColor || params.primaryColor || template.primary || "#fff";
    const accent = overrides.accentColor || params.accentColor || template.accent || "#ffd84d";
    const fontFamily = params.fontFamily || "Microsoft YaHei";
    const maxLines = Number(params.maxLines || 2);
    const words = previewWords(segment);
    const groups = previewWordGroups(words, segment.text);
    const localProgress = Math.max(0, Math.min(1, (state.currentTime - segment.start) / Math.max(0.1, segment.end - segment.start)));
    const enter = Math.min(1, (state.currentTime - segment.start) / 0.16);

    if (template.renderMode === "rolling-focus") {
      const gap = fontSize * 1.5;
      [segmentIndex - 1, segmentIndex, segmentIndex + 1].forEach((index) => {
        const row = state.project.segments[index];
        if (!row) return;
        const delta = index - segmentIndex;
        const current = delta === 0;
        drawCaptionText(ctx, `${current ? "▶  " : ""}${row.text}`, x, y + delta * gap + (1 - enter) * gap * 0.18, {
          fontSize: current ? fontSize : fontSize * 0.63,
          fontFamily,
          color: current ? primary : (template.muted || "#7b8493"),
          maxWidth: width * 0.82,
          maxLines: current ? 2 : 1,
          alpha: current ? 1 : 0.48,
          outline: current && params.outlineEnabled !== false,
          shadow: current && params.shadowEnabled !== false,
        });
      });
    } else if (template.renderMode === "word-highlight") {
      const activeGroup = groups.find((group) => state.currentTime >= group.start && state.currentTime <= group.end) || groups[0];
      drawWordRun(ctx, activeGroup?.words || words, state.currentTime, x, y, { fontSize, fontFamily, primary, accent, sourceText: segment.text });
    } else if (template.renderMode === "karaoke-sweep") {
      const text = segment.text;
      drawCaptionText(ctx, text, x, y, { fontSize, fontFamily, color: primary, maxWidth: width * 0.84, maxLines });
      ctx.save();
      ctx.beginPath();
      ctx.rect(width * 0.08, 0, width * 0.84 * localProgress, height);
      ctx.clip();
      drawCaptionText(ctx, text, x, y, { fontSize, fontFamily, color: accent, maxWidth: width * 0.84, maxLines });
      ctx.restore();
    } else if (template.renderMode === "center-statement") {
      drawCaptionText(ctx, segment.text, x, y + (1 - enter) * fontSize * 0.25, { fontSize, fontFamily, color: primary, maxWidth: width * 0.78, maxLines, alpha: enter, outline: false, shadow: params.shadowEnabled !== false });
    } else if (template.renderMode === "keyword-emphasis") {
      drawCaptionText(ctx, segment.text, x, y, { fontSize, fontFamily, color: primary, maxWidth: width * 0.82, maxLines });
      const active = words.find((word) => state.currentTime >= word.start && state.currentTime < word.end && (segment.keywords || []).some((keyword) => String(keyword).includes(word.text) || String(word.text).includes(keyword)));
      if (active) drawCaptionText(ctx, active.text, x, Math.min(height * 0.88, y + fontSize * 1.22), { fontSize: fontSize * 1.16, fontFamily, color: accent, maxLines: 1 });
    } else if (template.renderMode === "phrase-pop") {
      const activeGroup = groups.find((group) => state.currentTime >= group.start && state.currentTime <= group.end) || groups[0];
      const groupText = activeGroup?.text || segment.text;
      drawCaptionText(ctx, groupText, x, y + (1 - enter) * fontSize * 0.3, { fontSize: fontSize * (0.92 + enter * 0.08), fontFamily, color: (segment.keywords || []).some((keyword) => groupText.includes(keyword)) ? accent : primary, maxWidth: width * 0.84, maxLines: 2 });
    } else if (template.renderMode === "dialogue-two-line") {
      ctx.save();
      ctx.font = `800 ${fontSize}px ${fontFamily}`;
      const lines = canvasLines(ctx, segment.text, width * 0.72, 2);
      const cardHeight = Math.max(fontSize * 2.2, lines.length * fontSize * 1.25 + fontSize * 0.8);
      const cardWidth = width * 0.82;
      roundRectPath(ctx, x - cardWidth / 2, y - cardHeight / 2, cardWidth, cardHeight, fontSize * 0.28);
      ctx.fillStyle = hexToRgba("#0d1118", Number(params.backgroundOpacity ?? 78) / 100);
      ctx.fill();
      ctx.restore();
      drawCaptionText(ctx, segment.speaker || `讲述 ${segmentIndex + 1}`, x - width * 0.37, y - cardHeight * 0.68, { fontSize: fontSize * 0.43, fontFamily, color: accent, align: "left", maxLines: 1, outline: false });
      drawCaptionText(ctx, segment.text, x, y, { fontSize, fontFamily, color: primary, maxWidth: width * 0.72, maxLines: 2, outline: false });
    } else if (template.renderMode === "documentary-minimal") {
      drawCaptionText(ctx, segment.text, x, y, { fontSize, fontFamily, weight: 500, color: primary, maxWidth: width * 0.76, maxLines, outline: false, shadow: true, alpha: Math.min(1, enter * 1.2) });
    } else if (template.renderMode === "caption-card") {
      ctx.save();
      ctx.font = `800 ${fontSize}px ${fontFamily}`;
      const lines = canvasLines(ctx, segment.text, width * 0.68, maxLines);
      const widest = Math.max(...lines.map((line) => ctx.measureText(line).width), fontSize * 4);
      const cardWidth = Math.min(width * 0.84, widest + fontSize * 1.05);
      const cardHeight = lines.length * fontSize * 1.24 + fontSize * 0.72;
      roundRectPath(ctx, x - cardWidth / 2, y - cardHeight / 2, cardWidth, cardHeight, fontSize * 0.3);
      ctx.fillStyle = hexToRgba("#101216", Number(params.backgroundOpacity ?? 74) / 100);
      ctx.fill();
      ctx.restore();
      drawCaptionText(ctx, segment.text, x, y, { fontSize, fontFamily, color: primary, maxWidth: width * 0.68, maxLines, outline: false });
    } else if (template.renderMode === "keyword-tags") {
      drawCaptionText(ctx, segment.text, x, y - fontSize * 0.38, { fontSize, fontFamily, color: primary, maxWidth: width * 0.82, maxLines });
      const tags = (segment.keywords || []).slice(0, 3);
      ctx.save();
      ctx.font = `800 ${fontSize * 0.45}px ${fontFamily}`;
      const tagWidths = tags.map((tag) => ctx.measureText(tag).width + fontSize * 0.65);
      let cursor = x - (tagWidths.reduce((sum, value) => sum + value, 0) + Math.max(0, tags.length - 1) * fontSize * 0.18) / 2;
      tags.forEach((tag, index) => {
        const tagWidth = tagWidths[index];
        const tagHeight = fontSize * 0.72;
        roundRectPath(ctx, cursor, y + fontSize * 0.72, tagWidth, tagHeight, tagHeight / 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.fillStyle = "#101216";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tag, cursor + tagWidth / 2, y + fontSize * 1.08);
        cursor += tagWidth + fontSize * 0.18;
      });
      ctx.restore();
    }

    if (state.project.showBottomSubtitles) drawCaptionText(ctx, segment.text, width / 2, height * 0.94, { fontSize: Math.max(18, fontSize * 0.48), fontFamily, color: "#fff", maxWidth: width * 0.84, maxLines: 2 });
  }
  const duration = Math.max(0.01, Number(state.project.duration || 0));
  $("#kineticPreviewSeek").value = String(Math.round((state.currentTime / duration) * 1000));
  $("#kineticCurrentTime").textContent = formatTime(state.currentTime);
  $("#kineticDuration").textContent = formatTime(duration);
}

function previewTick(timestamp) {
  if (!state.playing || !state.project) return;
  if (state.audio && !state.audio.paused) state.currentTime = state.audio.currentTime;
  else state.currentTime = state.startTime + (timestamp - state.startedAt) / 1000;
  if (state.backgroundMedia instanceof HTMLVideoElement) {
    const video = state.backgroundMedia;
    if (video.readyState >= 2 && Math.abs(video.currentTime - state.currentTime % Math.max(video.duration || 1, 1)) > 0.25) video.currentTime = state.currentTime % Math.max(video.duration || 1, 1);
  }
  if (state.currentTime >= state.project.duration) {
    state.currentTime = 0;
    state.playing = false;
    state.audio?.pause();
    if (state.backgroundMedia instanceof HTMLVideoElement) state.backgroundMedia.pause();
    drawPreview();
    return;
  }
  drawPreview();
  state.raf = requestAnimationFrame(previewTick);
}

function playPreview() {
  if (!state.project) return;
  state.playing = !state.playing;
  $("#kineticPreviewPlay").textContent = state.playing ? "暂停预览" : "播放预览";
  if (!state.playing) {
    state.audio?.pause();
    if (state.backgroundMedia instanceof HTMLVideoElement) state.backgroundMedia.pause();
    cancelAnimationFrame(state.raf);
    return;
  }
  state.startedAt = performance.now();
  state.startTime = state.currentTime;
  if (state.audio) { state.audio.currentTime = state.currentTime; state.audio.play().catch(() => {}); }
  if (state.backgroundMedia instanceof HTMLVideoElement) { state.backgroundMedia.currentTime = state.currentTime % Math.max(state.backgroundMedia.duration || 1, 1); state.backgroundMedia.play().catch(() => {}); }
  state.raf = requestAnimationFrame(previewTick);
}

function renderOutputs() {
  const container = $("#kineticOutputs");
  if (!container || !state.project) return;
  const outputs = state.project.outputs || {};
  container.innerHTML = [
    outputs.materialZip ? `<a href="${mediaUrl("package")}" target="_blank">打开素材包 ZIP</a>` : "",
    outputs.srtPath ? `<a href="${mediaUrl("srt")}" target="_blank">打开字幕 SRT</a>` : "",
    outputs.finalVideo ? `<a class="primary-link" href="${mediaUrl("video")}" target="_blank">播放最终 MP4</a>` : "",
  ].filter(Boolean).join("");
}

function renderReceivedFiles() {
  const container = $("#kineticReceivedFiles");
  if (!container || !state.project) return;
  const rows = [
    { label: "音频", path: state.project.audioPath, url: state.project.audioUrl || mediaUrl("tts"), kind: "tts" },
    { label: "文案", path: state.project.scriptPath, url: mediaUrl("script"), kind: "script" },
    { label: "时间戳字幕", path: state.project.timestampedTextPath || state.project.subtitlePath, url: state.project.timestampedTextPath ? mediaUrl("timestamped") : mediaUrl("subtitle"), kind: "timestamped" },
  ];
  container.innerHTML = rows.map((item) => {
    const ready = Boolean(item.path || item.url);
    const name = ready ? shortFileName(item.path || item.url) : "未接收";
    return ready
      ? `<a class="kinetic-file-pill ready" href="${escapeHtml(item.url)}" target="_blank" title="${escapeHtml(item.path || item.url)}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(name)}</strong></a>`
      : `<span class="kinetic-file-pill"><span>${escapeHtml(item.label)}</span><strong>未接收</strong></span>`;
  }).join("");
}

function renderProject() {
  const project = state.project;
  renderProjects();
  renderEffects();
  renderTimeline();
  renderTimelineRuleStatus();
  if (!project) { drawPreview(); return; }
  $("#kineticTextTitle").value = project.title || "";
  $("#kineticAspectRatio").value = project.aspectRatio || "9:16";
  const previewSpec = previewOutputSize(project.aspectRatio || "9:16");
  $("#kineticPreviewSpec").textContent = `${previewSpec.outputWidth}×${previewSpec.outputHeight} · 30fps`;
  $("#kineticBackgroundMode").value = project.background?.mode || "black";
  $("#kineticBackgroundName").textContent = project.background?.name ? `当前：${project.background.name}` : "当前：纯黑背景";
  $("#kineticAudioSource").value = project.audioMix?.source || "none";
  $("#kineticBgmName").textContent = project.audioMix?.localName || "未上传背景音乐";
  $("#kineticTtsVolume").value = String(project.audioMix?.ttsVolume ?? 100);
  $("#kineticBgVolume").value = String(project.audioMix?.backgroundVolume ?? 18);
  $("#kineticTtsVolumeValue").value = `${project.audioMix?.ttsVolume ?? 100}%`;
  $("#kineticBgVolumeValue").value = `${project.audioMix?.backgroundVolume ?? 18}%`;
  $("#kineticBottomSubtitles").checked = project.showBottomSubtitles === true;
  const params = project.effectParams || {};
  $("#kineticFontFamily").value = params.fontFamily || "Microsoft YaHei";
  $("#kineticFontSize").value = String(params.fontSize ?? 88);
  $("#kineticFontSizeValue").value = String(params.fontSize ?? 88);
  $("#kineticPrimaryColor").value = params.primaryColor || "#ffffff";
  $("#kineticAccentColor").value = params.accentColor || "#ffd84d";
  $("#kineticMaxLines").value = String(params.maxLines ?? 2);
  $("#kineticAnimationSpeed").value = String(Math.round(Number(params.animationSpeed ?? 1) * 100));
  $("#kineticAnimationSpeedValue").value = `${Number(params.animationSpeed ?? 1).toFixed(2)}×`;
  $("#kineticBackgroundOpacity").value = String(params.backgroundOpacity ?? 72);
  $("#kineticBackgroundOpacityValue").value = `${params.backgroundOpacity ?? 72}%`;
  $("#kineticOutlineEnabled").checked = params.outlineEnabled !== false;
  $("#kineticShadowEnabled").checked = params.shadowEnabled !== false;
  const sourceLabels = {
    provider: "Provider 原生时间轴",
    estimated_audio_duration: "按音频时长估算，可在下方校正",
    estimated: "估算时间轴，可在下方校正",
  };
  $("#kineticSubtitleSource").textContent = sourceLabels[project.subtitleSource] || "估算时间轴，可在下方校正";
  $("#kineticEffectName").textContent = effectById(project.effectId)?.name || "动态大字";
  setProgress(project.progress || 0, project.stage || "编辑中");
  renderOutputs();
  renderReceivedFiles();
  syncAudio();
  syncBackgroundMedia();
  drawPreview();
}

async function refreshProjects(preferredId = "") {
  const data = await jsonFetch("/api/kinetic-text/projects");
  state.projects = data.projects || [];
  const id = preferredId || state.project?.id || localStorage.getItem("dy:kinetic-text:project-id") || state.projects[0]?.id;
  state.project = state.projects.find((project) => project.id === id) || state.projects[0] || null;
  if (state.project) localStorage.setItem("dy:kinetic-text:project-id", state.project.id);
  renderProject();
}

function scheduleSave(changes = {}) {
  if (!state.project) return;
  state.project = {
    ...state.project,
    ...changes,
    background: { ...state.project.background, ...(changes.background || {}) },
    audioMix: { ...state.project.audioMix, ...(changes.audioMix || {}) },
    effectParams: { ...state.project.effectParams, ...(changes.effectParams || {}) },
  };
  renderEffects();
  drawPreview();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    try {
      const data = await postJson("/api/kinetic-text/update", { projectId: state.project.id, changes: state.project });
      state.project = data.project;
      const index = state.projects.findIndex((item) => item.id === state.project.id);
      if (index >= 0) state.projects[index] = state.project;
      renderProjects();
      renderTimelineRuleStatus();
    } catch (error) {
      setProgress(state.project.progress || 0, `自动保存失败：${error.message}`);
    }
  }, 550);
}

function applyTimelineInput(input) {
  const row = input.closest(".kinetic-timeline-row");
  const index = Number(row?.dataset.segmentIndex);
  if (!Number.isInteger(index) || !state.project?.segments[index]) return;
  const field = input.dataset.field;
  const segments = state.project.segments.map((segment, segmentIndex) => {
    if (segmentIndex !== index) return segment;
    if (field === "keywords") return { ...segment, keywords: input.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) };
    if (field === "lineBreaks") return { ...segment, lineBreaks: [...new Set(input.value.split(/[,，、\s]+/).map(Number).filter((value) => Number.isInteger(value) && value > 0 && value < String(segment.text || "").length))].sort((a, b) => a - b) };
    if (["x", "y", "primaryColor"].includes(field)) return { ...segment, overrides: { ...(segment.overrides || {}), [field]: ["x", "y"].includes(field) ? Number(input.value) : input.value } };
    if (["start", "end"].includes(field)) return { ...segment, [field]: Number(input.value) };
    return { ...segment, [field]: input.value };
  });
  scheduleSave({ segments, duration: Math.max(...segments.map((item) => Number(item.end || 0)), state.project.duration || 0) });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

async function uploadFile(kind, file) {
  if (!state.project || !file) return;
  setProgress(5, `上传${kind === "background" ? "背景" : "背景音乐"}`);
  const dataUrl = await fileToDataUrl(file);
  const data = await postJson("/api/kinetic-text/upload", { projectId: state.project.id, kind, name: file.name, data: dataUrl });
  state.project = data.project;
  savePreferences({ backgroundMode: state.project.background.mode, audioSource: state.project.audioMix.source });
  renderProject();
}

async function pollJob(jobId) {
  clearTimeout(state.pollTimer);
  const data = await jsonFetch(`/api/kinetic-text/job?id=${encodeURIComponent(jobId)}`);
  const job = data.job;
  setProgress(job.progress, job.stage);
  if (job.status === "completed") {
    await refreshProjects(job.projectId);
    return;
  }
  if (job.status === "failed") {
    setProgress(job.progress || 0, `${job.stage}：${job.error}`);
    return;
  }
  state.pollTimer = setTimeout(() => pollJob(jobId).catch((error) => setProgress(job.progress, error.message)), 1000);
}

async function receiveTts(payload) {
  if (!payload?.id) throw new Error("没有可用的 TTS 音频。");
  const existing = state.projects.find((project) => String(project.ttsJobId) === String(payload.id));
  if (existing) {
    state.project = existing;
    renderProject();
    window.workbenchNavigate?.("kinetic-text");
    return existing;
  }
  const preferences = readPreferences();
  const data = await postJson("/api/kinetic-text/create", {
    tts: payload,
    effectId: preferences.effectId,
    aspectRatio: preferences.aspectRatio || "9:16",
    videoProjectId: window.videoProjects?.current?.()?.id || localStorage.getItem("active-video-project-id") || "",
  });
  state.project = data.project;
  await refreshProjects(state.project.id);
  window.workbenchNavigate?.("kinetic-text");
  return state.project;
}

async function receiveText(payload = {}) {
  const text = String(payload.text || "").trim();
  if (!text) throw new Error("没有可用的文案。");
  const preferences = readPreferences();
  const data = await postJson("/api/kinetic-text/create", {
    title: payload.title || "文案动态大字视频",
    text,
    source: payload.source || "rewrite",
    effectId: preferences.effectId,
    aspectRatio: preferences.aspectRatio || "9:16",
    videoProjectId: payload.videoProjectId || window.videoProjects?.current?.()?.id || localStorage.getItem("active-video-project-id") || "",
  });
  state.project = data.project;
  await refreshProjects(state.project.id);
  if (payload.sentAt) localStorage.setItem("dy:kinetic-text:last-text-handoff", String(payload.sentAt));
  window.workbenchNavigate?.("kinetic-text");
  return state.project;
}

function bindEvents() {
  $("#kineticTextRefresh").addEventListener("click", () => refreshProjects().catch((error) => setProgress(0, error.message)));
  $("#kineticTextProjectSelect").addEventListener("change", (event) => {
    state.project = state.projects.find((item) => item.id === event.target.value) || null;
    if (state.project) localStorage.setItem("dy:kinetic-text:project-id", state.project.id);
    state.currentTime = 0;
    renderProject();
  });
  $("#kineticEffectGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-effect-id]");
    if (!card || !state.project) return;
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "favorite") {
      toggleFavorite(card.dataset.effectId);
      return;
    }
    if (action !== "select" && !event.target.closest(".kinetic-template-preview")) return;
    const effect = effectById(card.dataset.effectId);
    savePreferences({ effectId: effect.id });
    scheduleSave({ effectId: effect.id, effectParams: { ...effect.defaultParams } });
    $("#kineticEffectName").textContent = effect.name;
  });
  $("#kineticEffectGrid").addEventListener("pointerover", (event) => {
    const card = event.target.closest("[data-effect-id]");
    const video = card?.querySelector("video");
    if (video && video.readyState !== 0) video.play().catch(() => {});
    else if (video) { video.load(); video.play().catch(() => {}); }
  });
  $("#kineticEffectGrid").addEventListener("pointerout", (event) => {
    const card = event.target.closest("[data-effect-id]");
    const video = card?.querySelector("video");
    if (video) { video.pause(); video.currentTime = 0; }
  });
  $("#kineticTimeline").addEventListener("input", (event) => { if (event.target.dataset.field) applyTimelineInput(event.target); });
  $("#kineticTextTitle").addEventListener("input", (event) => scheduleSave({ title: event.target.value }));
  $("#kineticAspectRatio").addEventListener("change", (event) => {
    savePreferences({ aspectRatio: event.target.value });
    scheduleSave({ aspectRatio: event.target.value });
    const spec = previewOutputSize(event.target.value);
    $("#kineticPreviewSpec").textContent = `${spec.outputWidth}×${spec.outputHeight} · 30fps`;
    drawPreview();
  });
  $("#kineticFontFamily").addEventListener("input", (event) => scheduleSave({ effectParams: { fontFamily: event.target.value } }));
  $("#kineticFontSize").addEventListener("input", (event) => {
    $("#kineticFontSizeValue").value = event.target.value;
    scheduleSave({ effectParams: { fontSize: Number(event.target.value) } });
  });
  $("#kineticPrimaryColor").addEventListener("input", (event) => scheduleSave({ effectParams: { primaryColor: event.target.value } }));
  $("#kineticAccentColor").addEventListener("input", (event) => scheduleSave({ effectParams: { accentColor: event.target.value } }));
  $("#kineticMaxLines").addEventListener("change", (event) => scheduleSave({ effectParams: { maxLines: Number(event.target.value) } }));
  $("#kineticAnimationSpeed").addEventListener("input", (event) => {
    const value = Number(event.target.value) / 100;
    $("#kineticAnimationSpeedValue").value = `${value.toFixed(2)}×`;
    scheduleSave({ effectParams: { animationSpeed: value } });
  });
  $("#kineticBackgroundOpacity").addEventListener("input", (event) => {
    $("#kineticBackgroundOpacityValue").value = `${event.target.value}%`;
    scheduleSave({ effectParams: { backgroundOpacity: Number(event.target.value) } });
  });
  $("#kineticOutlineEnabled").addEventListener("change", (event) => scheduleSave({ effectParams: { outlineEnabled: event.target.checked } }));
  $("#kineticShadowEnabled").addEventListener("change", (event) => scheduleSave({ effectParams: { shadowEnabled: event.target.checked } }));
  $("#kineticResetTemplate").addEventListener("click", () => {
    if (!state.project) return;
    const effect = effectById(state.project.effectId);
    scheduleSave({ effectParams: { ...effect.defaultParams } });
    renderProject();
  });
  $("#kineticBackgroundMode").addEventListener("change", (event) => {
    savePreferences({ backgroundMode: event.target.value });
    scheduleSave({ background: { mode: event.target.value } });
  });
  $("#kineticAudioSource").addEventListener("change", (event) => {
    savePreferences({ audioSource: event.target.value });
    scheduleSave({ audioMix: { source: event.target.value } });
  });
  $("#kineticTtsVolume").addEventListener("input", (event) => {
    $("#kineticTtsVolumeValue").value = `${event.target.value}%`;
    savePreferences({ ttsVolume: Number(event.target.value) });
    scheduleSave({ audioMix: { ttsVolume: Number(event.target.value) } });
  });
  $("#kineticBgVolume").addEventListener("input", (event) => {
    $("#kineticBgVolumeValue").value = `${event.target.value}%`;
    savePreferences({ backgroundVolume: Number(event.target.value) });
    scheduleSave({ audioMix: { backgroundVolume: Number(event.target.value) } });
  });
  $("#kineticBottomSubtitles").addEventListener("change", (event) => {
    savePreferences({ showBottomSubtitles: event.target.checked });
    scheduleSave({ showBottomSubtitles: event.target.checked });
  });
  $("#kineticChooseBackground").addEventListener("click", () => $("#kineticBackgroundFile").click());
  $("#kineticChooseBgm").addEventListener("click", () => $("#kineticBgmFile").click());
  $("#kineticBackgroundFile").addEventListener("change", (event) => uploadFile("background", event.target.files?.[0]).catch((error) => setProgress(0, error.message)));
  $("#kineticBgmFile").addEventListener("change", (event) => uploadFile("bgm", event.target.files?.[0]).catch((error) => setProgress(0, error.message)));
  $("#kineticAnalyze").addEventListener("click", async () => {
    if (!state.project) return;
    setProgress(5, "分析重点词和换行");
    try {
      const data = await postJson("/api/kinetic-text/analyze", { projectId: state.project.id, provider: $("#kineticTextProvider").value });
      state.project = data.project;
      renderProject();
      setProgress(100, data.aiUsed ? `分析完成 · ${data.provider}` : "分析完成 · 本地规则");
    } catch (error) { setProgress(0, error.message); }
  });
  $("#kineticPreviewPlay").addEventListener("click", playPreview);
  $("#kineticPreviewRestart").addEventListener("click", () => {
    state.currentTime = 0;
    if (state.audio) state.audio.currentTime = 0;
    if (state.backgroundMedia instanceof HTMLVideoElement) state.backgroundMedia.currentTime = 0;
    drawPreview();
  });
  $("#kineticPreviewSeek").addEventListener("input", (event) => {
    state.currentTime = (Number(event.target.value) / 1000) * Number(state.project?.duration || 0);
    if (state.audio) state.audio.currentTime = state.currentTime;
    drawPreview();
  });
  $("#kineticGenerateMaterials").addEventListener("click", async () => {
    if (!state.project) return;
    const data = await postJson("/api/kinetic-text/materials", { projectId: state.project.id });
    pollJob(data.job.id).catch((error) => setProgress(0, error.message));
  });
  $("#kineticRenderFinal").addEventListener("click", async () => {
    if (!state.project) return;
    const data = await postJson("/api/kinetic-text/render", { projectId: state.project.id });
    pollJob(data.job.id).catch((error) => setProgress(0, error.message));
  });
  window.addEventListener("kinetic-text-handoff", (event) => receiveTts(event.detail).catch((error) => setProgress(0, error.message)));
  window.addEventListener("kinetic-text-text-handoff", (event) => receiveText(event.detail).catch((error) => setProgress(0, error.message)));
}

export async function initKineticTextModule() {
  state.page = document.querySelector("#kineticTextPage");
  if (!state.page) return;
  const [effectsData, providersData] = await Promise.all([
    jsonFetch("/api/kinetic-text/effects"),
    jsonFetch("/api/kinetic-text/providers").catch(() => ({ providers: [] })),
  ]);
  state.effects = effectsData.effects || [];
  const providerSelect = $("#kineticTextProvider");
  const preferences = readPreferences();
  providerSelect.innerHTML = '<option value="">自动选择</option>' + (providersData.providers || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label || item.id)}</option>`).join("");
  if ([...providerSelect.options].some((option) => option.value === preferences.provider)) providerSelect.value = preferences.provider;
  providerSelect.addEventListener("change", () => savePreferences({ provider: providerSelect.value }));
  bindEvents();
  window.kineticTextProduction = { receiveTts, receiveText, refresh: refreshProjects };
  await refreshProjects();
  try {
    const payload = JSON.parse(localStorage.getItem(HANDOFF_KEY) || "null");
    if (payload?.id && !state.projects.some((project) => String(project.ttsJobId) === String(payload.id))) await receiveTts(payload);
  } catch {}
  try {
    const payload = JSON.parse(localStorage.getItem(TEXT_HANDOFF_KEY) || "null");
    if (payload?.text && String(payload.sentAt || "") !== localStorage.getItem("dy:kinetic-text:last-text-handoff")) {
      await receiveText(payload);
      if (payload.sentAt) localStorage.setItem("dy:kinetic-text:last-text-handoff", String(payload.sentAt));
    }
  } catch {}
}
