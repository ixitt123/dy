import {
  SEEK_LOCK_MS,
  clampTime,
  playablePreviewTime,
  seekValueToPreviewTime,
  shouldUseAnchoredClock,
} from "./kinetic-preview-clock.js";

const PREF_KEY = "dy:kinetic-text:preferences";
const FAVORITES_KEY = "dy:subtitle-template:favorites";
const ACTIVE_JOB_KEY = "dy:kinetic-text:active-job";
const BOOKEND_MIN_SECONDS = 0.18;
const BOOKEND_PRESET_TEXT = {
  intro: {
    title: () => state.project?.title || "动态大字视频",
    remember: () => "先记住这句话",
    core: () => "今天只讲一个重点",
    method: () => "正确方法只有一个",
    custom: () => "",
  },
  outro: {
    follow: () => "记得关注，持续分享实用内容",
    private: () => "需要完整资料，可以私聊我",
    save: () => "点赞收藏，方便以后再看",
    next: () => "关注我，下期继续",
    custom: () => "",
  },
};

const state = {
  page: null,
  effects: [],
  projects: [],
  project: null,
  currentTime: 0,
  playing: false,
  seeking: false,
  startedAt: 0,
  startTime: 0,
  raf: 0,
  saveTimer: 0,
  pendingSaveChanges: {},
  pendingTimelineChanges: {},
  pollTimer: 0,
  downloadsDir: "",
  audio: null,
  backgroundMedia: null,
  seekResumePlaying: false,
  seekCommitUntil: 0,
  mediaSeekTarget: null,
  mediaSeekTrustUntil: 0,
  overlayHitRegions: [],
  hoverOverlay: "",
  draggingOverlay: null,
  suppressCanvasClick: false,
  illustrationPlan: null,
  routeActive: false,
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

function mergeProjectChanges(base = {}, changes = {}) {
  const next = {
    ...base,
    ...changes,
  };
  if (Object.hasOwn(changes, "background")) next.background = { ...(base.background || {}), ...(changes.background || {}) };
  if (Object.hasOwn(changes, "audioMix")) next.audioMix = { ...(base.audioMix || {}), ...(changes.audioMix || {}) };
  if (Object.hasOwn(changes, "effectParams")) next.effectParams = { ...(base.effectParams || {}), ...(changes.effectParams || {}) };
  if (Object.hasOwn(changes, "bottomSubtitlePosition")) next.bottomSubtitlePosition = { ...(base.bottomSubtitlePosition || {}), ...(changes.bottomSubtitlePosition || {}) };
  if (Object.hasOwn(changes, "dynamicIllustration")) {
    next.dynamicIllustration = {
      ...(base.dynamicIllustration || {}),
      ...(changes.dynamicIllustration || {}),
      config: { ...(base.dynamicIllustration?.config || {}), ...(changes.dynamicIllustration?.config || {}) },
      outputs: { ...(base.dynamicIllustration?.outputs || {}), ...(changes.dynamicIllustration?.outputs || {}) },
    };
  }
  if (Object.hasOwn(changes, "bookends")) {
    next.bookends = {
      ...(base.bookends || {}),
      intro: { ...(base.bookends?.intro || {}), ...(changes.bookends?.intro || {}) },
      outro: { ...(base.bookends?.outro || {}), ...(changes.bookends?.outro || {}) },
    };
  }
  return next;
}

function acceptServerProject(project, { preserveTimelineDraft = true } = {}) {
  const next = preserveTimelineDraft && hasTimelineDraft()
    ? mergeProjectChanges(project, state.pendingTimelineChanges)
    : project;
  state.project = next;
  const index = state.projects.findIndex((item) => item.id === next?.id);
  if (index >= 0) state.projects[index] = next;
  return next;
}

function currentControlChanges() {
  const bottomSubtitles = $("#kineticBottomSubtitles");
  return bottomSubtitles ? { showBottomSubtitles: bottomSubtitles.checked } : {};
}

function formatTime(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function previewDuration() {
  const audioDuration = Number(state.audio?.duration);
  if (Number.isFinite(audioDuration) && audioDuration > 0) return audioDuration;
  return Math.max(0, Number(state.project?.duration || 0));
}

function previewSeekMaximum() {
  return Math.max(1, Number($("#kineticPreviewSeek")?.max || 1000));
}

function seekValueToTime(sliderValue) {
  return seekValueToPreviewTime(sliderValue, previewSeekMaximum(), previewDuration());
}

function syncPreviewMediaTime(time, { trustMs = SEEK_LOCK_MS } = {}) {
  const duration = previewDuration();
  const targetTime = playablePreviewTime(time, duration);
  state.mediaSeekTarget = targetTime;
  state.mediaSeekTrustUntil = performance.now() + Math.max(0, Number(trustMs || 0));
  try {
    if (state.audio && Number.isFinite(Number(state.audio.duration))) {
      state.audio.currentTime = Math.min(targetTime, Math.max(0, Number(state.audio.duration || 0)));
    } else if (state.audio) {
      state.audio.currentTime = targetTime;
    }
  } catch {}
  try {
    if (state.backgroundMedia instanceof HTMLVideoElement) {
      state.backgroundMedia.currentTime = targetTime % Math.max(state.backgroundMedia.duration || 1, 1);
    }
  } catch {}
}

function previewClockTime(timestamp) {
  const now = Number(timestamp || performance.now());
  const anchoredTime = () => state.startTime + (now - state.startedAt) / 1000;
  const mediaTime = state.audio && Number.isFinite(Number(state.audio.currentTime)) ? Number(state.audio.currentTime) : null;
  if (shouldUseAnchoredClock({
    now,
    lockUntil: state.seekCommitUntil,
    pendingSeekTime: state.mediaSeekTarget,
    pendingSeekUntil: state.mediaSeekTrustUntil,
    mediaTime,
  })) {
    return anchoredTime();
  }
  if (state.seekCommitUntil && now >= state.seekCommitUntil) state.seekCommitUntil = 0;
  if (state.mediaSeekTarget !== null) {
    state.mediaSeekTarget = null;
    state.mediaSeekTrustUntil = 0;
  }
  if (mediaTime !== null) {
    return mediaTime;
  }
  return anchoredTime();
}

function anchorPreviewClock(time, lockMs = 0) {
  state.currentTime = clampTime(time, previewDuration());
  state.startTime = state.currentTime;
  state.startedAt = performance.now();
  state.seekCommitUntil = lockMs > 0 ? state.startedAt + lockMs : 0;
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

function bookendPresetText(kind, preset) {
  return BOOKEND_PRESET_TEXT[kind]?.[preset]?.() || "";
}

function bookendWindowsFor(project = state.project) {
  // Use the canvas' visible body-subtitle intervals, never audio silence.
  const rows = (Array.isArray(project?.segments) ? project.segments : []).slice().sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  const duration = Math.max(0, Number(project?.duration || 0));
  if (!rows.length || duration <= 0) {
    return {
      basis: "video-visual-timeline",
      minimumSeconds: BOOKEND_MIN_SECONDS,
      intro: { start: 0, end: 0, duration: 0, blankSeconds: 0, available: false },
      outro: { start: duration, end: duration, duration: 0, blankSeconds: 0, available: false },
    };
  }
  const firstStart = Math.max(0, Math.min(duration, Number(rows[0].start || 0)));
  const lastEnd = Math.max(0, Math.min(duration, Number(rows[rows.length - 1].end || 0)));
  const introEnd = Math.max(0, firstStart - 0.09);
  const outroStart = Math.min(duration, lastEnd + 0.03);
  return {
    basis: "video-visual-timeline",
    minimumSeconds: BOOKEND_MIN_SECONDS,
    intro: { start: 0, end: introEnd, duration: introEnd, blankSeconds: firstStart, available: introEnd >= BOOKEND_MIN_SECONDS },
    outro: { start: outroStart, end: duration, duration: Math.max(0, duration - outroStart), blankSeconds: Math.max(0, duration - lastEnd), available: duration - outroStart >= BOOKEND_MIN_SECONDS },
  };
}

function renderBookendAvailability() {
  if (!state.project) return;
  const windows = bookendWindowsFor();
  for (const kind of ["intro", "outro"]) {
    const label = $(`#kinetic${kind === "intro" ? "Intro" : "Outro"}Availability`);
    if (!label) continue;
    const window = windows[kind];
    label.classList.toggle("ok", window.available);
    label.classList.toggle("warn", !window.available);
    const position = kind === "outro" ? "画面末尾" : "画面开头";
    label.textContent = window.available
      ? window.duration < 0.45
        ? `${position}有 ${window.blankSeconds.toFixed(2)} 秒无正文字幕，启用短${kind === "outro" ? "结尾" : "开头"}模式`
        : `${position}有 ${window.blankSeconds.toFixed(2)} 秒无正文字幕，实际显示 ${window.duration.toFixed(2)} 秒`
      : `${position}无正文字幕仅 ${window.blankSeconds.toFixed(2)} 秒，不足 ${windows.minimumSeconds.toFixed(2)} 秒，成片中自动跳过`;
  }
}

function renderBookendSettings() {
  if (!state.project) return;
  for (const kind of ["intro", "outro"]) {
    const prefix = kind === "intro" ? "Intro" : "Outro";
    const fallbackPreset = kind === "intro" ? "title" : "follow";
    const item = state.project.bookends?.[kind] || { enabled: false, preset: fallbackPreset, text: bookendPresetText(kind, fallbackPreset) };
    const enabled = $(`#kinetic${prefix}Enabled`);
    const preset = $(`#kinetic${prefix}Preset`);
    const text = $(`#kinetic${prefix}Text`);
    enabled.checked = item.enabled === true;
    preset.value = [...preset.options].some((option) => option.value === item.preset) ? item.preset : fallbackPreset;
    text.value = item.text || bookendPresetText(kind, preset.value);
  }
  renderBookendAvailability();
}

function updateBookend(kind, changes) {
  const current = state.project?.bookends?.[kind] || {};
  scheduleSave({ bookends: { [kind]: { ...current, ...changes } } });
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
  select.innerHTML = state.project
    ? `<option value="${escapeHtml(state.project.id)}">${escapeHtml(state.project.title)} · ${escapeHtml(state.project.effect?.name || "")}</option>`
    : '<option value="">等待 TTS 发送</option>';
  select.disabled = true;
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
    renderTimelineDraftStatus();
    return;
  }
  const segments = hasTimelineDraft() ? state.pendingTimelineChanges.segments : state.project.segments;
  container.innerHTML = segments.map((segment, index) => {
    const overrides = segment.overrides || {};
    const x = Number(overrides.x ?? state.project.effectParams?.x ?? 50);
    const y = Number(overrides.y ?? state.project.effectParams?.y ?? 50);
    const color = overrides.primaryColor || state.project.effectParams?.primaryColor || effectById(state.project.effectId)?.primary || "#ffffff";
    return `
      <div class="kinetic-timeline-row" data-segment-index="${index}">
        <span class="kinetic-segment-index">${index + 1}</span>
        <input data-field="start" type="number" min="0" step="0.01" value="${Number(segment.start).toFixed(2)}" readonly aria-readonly="true" />
        <input data-field="end" type="number" min="0" step="0.01" value="${Number(segment.end).toFixed(2)}" readonly aria-readonly="true" />
        <textarea data-field="text" rows="2" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true">${escapeHtml(segment.text)}</textarea>
        <input data-field="keywords" type="text" value="${escapeHtml((segment.keywords || []).join("、"))}" placeholder="每段1-2个，关键词不相邻" />
        <input data-field="lineBreaks" type="text" value="${escapeHtml((segment.lineBreaks || []).join(","))}" placeholder="如 6,12" title="按字符序号设置换行位置" />
        <div class="kinetic-position-inputs"><input data-field="x" type="number" min="5" max="95" value="${x}" /><input data-field="y" type="number" min="5" max="95" value="${y}" /></div>
        <input data-field="primaryColor" type="color" value="${color}" />
      </div>
    `;
  }).join("");
  renderTimelineDraftStatus();
}

function hasTimelineDraft() {
  return Array.isArray(state.pendingTimelineChanges?.segments) && state.pendingTimelineChanges.segments.length > 0;
}

function renderTimelineDraftStatus() {
  const button = $("#kineticConfirmTimeline");
  const status = $("#kineticTimelineDraftStatus");
  const dirty = Boolean(state.project && hasTimelineDraft());
  if (button) button.disabled = !dirty;
  if (status) {
    status.hidden = !dirty;
    status.textContent = dirty ? "有未确定修改" : "";
  }
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

function mediaUrl(kind, { download = false } = {}) {
  if (!state.project) return "";
  const suffix = download ? "&download=1" : "";
  return `/api/kinetic-text/file?id=${encodeURIComponent(state.project.id)}&kind=${encodeURIComponent(kind)}&v=${encodeURIComponent(state.project.updatedAt || Date.now())}${suffix}`;
}

function kineticDownloadDirectory() {
  return String(state.downloadsDir || "").replace(/[\\/]+$/, "");
}

function renderDownloadDirectory() {
  const container = $("#kineticDownloadPath");
  if (!container) return;
  const directory = kineticDownloadDirectory();
  container.textContent = directory ? `下载地址：${directory}` : "尚未选择下载地址";
  container.title = directory;
}

function syncGlobalDownloadDirectory(directory) {
  state.downloadsDir = String(directory || "");
  const input = document.querySelector("#downloadDirInput");
  const label = document.querySelector("#savePath");
  if (input) input.value = state.downloadsDir;
  if (label) label.textContent = `下载位置：${state.downloadsDir}`;
  renderDownloadDirectory();
}

async function chooseKineticDownloadDirectory() {
  const button = $("#kineticChooseDownloadDir");
  button.disabled = true;
  try {
    const response = await fetch("/api/downloads-dir/choose", { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "选择下载位置失败");
    if (!data.ok) {
      setProgress(state.project?.progress || 0, "已取消选择，下载位置未改变");
      return;
    }
    syncGlobalDownloadDirectory(data.downloadsDir);
    setProgress(state.project?.progress || 0, "下载位置已更新");
  } finally {
    button.disabled = false;
  }
}

function setRenderButtonBusy(busy) {
  const button = $("#kineticRenderFinal");
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? "正在生成…" : "下载视频";
}

function syncAudio() {
  if (state.audio) {
    state.audio.pause();
    state.audio.src = "";
  }
  state.audio = null;
  const source = state.project?.audioUrl || (state.project?.audioPath ? mediaUrl("tts") : "");
  if (!source) return;
  const audio = new Audio(source);
  audio.preload = "metadata";
  state.audio = audio;
  audio.addEventListener("loadedmetadata", () => {
    if (state.audio !== audio || !state.project) return;
    const duration = Number(audio.duration);
    if (!Number.isFinite(duration) || duration <= 0) return;
    state.currentTime = Math.min(state.currentTime, duration);
    if (Math.abs(Number(state.project.duration || 0) - duration) > 0.05) {
      // Old projects may contain a stale TTS metadata duration. The decoded audio
      // is the preview/export clock; only repair the project duration, never cues.
      scheduleSave({ duration });
    } else {
      drawPreview();
    }
  });
  audio.addEventListener("ended", () => {
    if (state.audio !== audio) return;
    state.currentTime = previewDuration();
    state.playing = false;
    cancelAnimationFrame(state.raf);
    $("#kineticPreviewPlay").textContent = "播放预览";
    drawPreview();
  });
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
    if (state.project.showBottomSubtitles && !["rolling-focus", "rolling-focus-left"].includes(template.renderMode)) {
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
  const duration = Math.max(0.01, previewDuration());
  $("#kineticPreviewSeek").value = String(Math.round((state.currentTime / duration) * previewSeekMaximum()));
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

function rollingFocusPreviewRows(segments = []) {
  return segments.flatMap((segment) => {
    const words = previewWords(segment);
    const clauses = [];
    let current = [];
    const flush = () => {
      if (current.length) clauses.push(current);
      current = [];
    };
    words.forEach((word, index) => {
      const token = String(word.text || "");
      const punctuation = /^[，。！？；：、,.!?;:]$/u.test(token);
      if (punctuation) {
        if (current.length) {
          current.push(word);
          flush();
        } else if (clauses.length) {
          clauses[clauses.length - 1].push(word);
        }
        return;
      }
      const previous = current[current.length - 1];
      const pauseBefore = previous && Number(word.start) - Number(previous.end) >= 0.18;
      if (pauseBefore) flush();
      current.push(word);
      const next = words[index + 1];
      if (next && Number(next.start) - Number(word.end) >= 0.18) flush();
    });
    flush();
    const visibleLength = (group) => group.reduce((sum, word) => (
      sum + [...String(word.text || "").replace(/[，。！？；：、,.!?;:\s]/gu, "")].length
    ), 0);
    const groups = clauses.flatMap((clause) => {
      const total = visibleLength(clause);
      if (total <= 8) return [clause];
      const target = Math.ceil(total / Math.ceil(total / 8));
      const chunks = [];
      let chunk = [];
      let count = 0;
      clause.forEach((word) => {
        const size = [...String(word.text || "").replace(/[，。！？；：、,.!?;:\s]/gu, "")].length;
        if (size === 0) {
          if (chunk.length) chunk.push(word);
          else if (chunks.length) chunks[chunks.length - 1].push(word);
          return;
        }
        if (chunk.length && count >= 3 && count + size > target) {
          chunks.push(chunk);
          chunk = [];
          count = 0;
        }
        chunk.push(word);
        count += size;
      });
      if (chunk.length) chunks.push(chunk);
      return chunks;
    });
    const separator = String(segment.text || "").includes(" ") ? " " : "";
    return groups.map((group, index) => ({
      ...segment,
      id: `${segment.id}-focus-${index + 1}`,
      sourceSegmentId: segment.id,
      text: group.map((word) => word.text).join(separator).replace(/[，。！？；：、,.!?;:]/gu, "").trim(),
      start: Math.max(Number(segment.start || 0), Number(group[0].start || 0)),
      end: Math.min(Number(segment.end || 0), Number(group[group.length - 1].end || segment.end || 0)),
    })).filter((row) => row.text);
  }).sort((a, b) => a.start - b.start);
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
  const forcedLines = source.split(/\\N|\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (forcedLines.length > 1) return forcedLines.slice(0, maxLines);
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

function wrapPreviewSubtitleText(value, maxChars = 14, maxLines = 2) {
  const source = String(value || "").trim().replace(/\s+/g, " ");
  if (!source || source.length <= maxChars || maxLines <= 1) return source;
  const chars = [...source];
  const lines = [];
  let cursor = 0;
  while (cursor < chars.length && lines.length < maxLines) {
    const remaining = chars.length - cursor;
    if (lines.length === maxLines - 1 || remaining <= maxChars) {
      lines.push(chars.slice(cursor).join(""));
      break;
    }
    const ideal = Math.min(chars.length, cursor + maxChars);
    let split = ideal;
    for (let index = ideal; index > Math.max(cursor + Math.floor(maxChars * 0.62), cursor); index -= 1) {
      if (/[，。！？；：、,.!?;:\s]/u.test(chars[index - 1] || "")) {
        split = index;
        break;
      }
    }
    lines.push(chars.slice(cursor, split).join("").trim());
    cursor = split;
  }
  return lines.filter(Boolean).join("\\N");
}

const KEYWORD_EMPHASIS_PALETTE = ["#FFD84D", "#69E7FF", "#B7FF5A", "#C59CFF"];
const KEYWORD_EMPHASIS_MODES = ["color", "scale", "box", "underline"];

function stableKeywordHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function keywordEmphasisSpec(seed, keyword) {
  const hash = stableKeywordHash(`${seed}:${keyword}`);
  return {
    mode: KEYWORD_EMPHASIS_MODES[hash % KEYWORD_EMPHASIS_MODES.length],
    color: KEYWORD_EMPHASIS_PALETTE[(hash >>> 8) % KEYWORD_EMPHASIS_PALETTE.length],
  };
}

function keywordRuns(text, keywords, seed) {
  const ordered = [...new Set((keywords || []).map((item) => String(item || "").trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  if (!ordered.length) return [{ text: String(text || ""), emphasis: null }];
  const pattern = new RegExp(`(${ordered.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  let emphasisIndex = 0;
  return String(text || "").split(pattern).filter(Boolean).map((part) => {
    const emphasis = ordered.includes(part) ? keywordEmphasisSpec(seed, part) : null;
    const result = { text: part, emphasis, emphasisIndex: emphasis ? emphasisIndex : -1 };
    if (emphasis) emphasisIndex += 1;
    return result;
  });
}

function keywordMotion(mode, elapsedMs, index) {
  const delay = Math.max(0, Number(index || 0)) * 90;
  const progress = Math.max(0, Math.min(1, (Number(elapsedMs || 0) - delay) / 520));
  const eased = 1 - ((1 - progress) ** 3);
  if (mode === "scale") {
    const scale = progress < 0.68
      ? 0.82 + (1.22 - 0.82) * (progress / 0.68)
      : 1.22 + (1.16 - 1.22) * ((progress - 0.68) / 0.32);
    return { scale, alpha: 0.35 + eased * 0.65, reveal: eased };
  }
  if (mode === "box") return { scale: 0.88 + eased * 0.12, alpha: 0.3 + eased * 0.7, reveal: eased };
  if (mode === "underline") return { scale: 1, alpha: 0.45 + eased * 0.55, reveal: eased };
  return { scale: 1, alpha: 0.35 + eased * 0.65, reveal: eased };
}

function drawKeywordCaptionText(ctx, text, keywords, x, y, options = {}) {
  const fontSize = Number(options.fontSize || 44);
  const fontFamily = options.fontFamily || "Microsoft YaHei";
  const weight = options.weight || 800;
  const maxWidth = options.maxWidth || ctx.canvas.width * 0.82;
  const maxLines = options.maxLines || 2;
  const lineHeight = fontSize * (options.lineHeight || 1.22);
  ctx.save();
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.globalAlpha = options.alpha ?? 1;
  const lines = canvasLines(ctx, text, maxWidth, maxLines);
  lines.forEach((line, lineIndex) => {
    const runs = keywordRuns(line, keywords, options.seed || "");
    const measured = runs.map((run) => {
      const motion = run.emphasis ? keywordMotion(run.emphasis.mode, options.elapsedMs, run.emphasisIndex) : { scale: 1, alpha: 1, reveal: 1 };
      const runSize = run.emphasis?.mode === "scale" ? fontSize * motion.scale : fontSize;
      ctx.font = `${weight} ${runSize}px ${fontFamily}`;
      return { ...run, motion, runSize, width: ctx.measureText(run.text).width };
    });
    const totalWidth = measured.reduce((sum, run) => sum + run.width, 0);
    let cursor = options.align === "left" ? x : options.align === "right" ? x - totalWidth : x - totalWidth / 2;
    const lineY = y + (lineIndex - (lines.length - 1) / 2) * lineHeight;
    measured.forEach((run) => {
      ctx.save();
      ctx.globalAlpha *= run.motion.alpha;
      ctx.font = `${weight} ${run.runSize}px ${fontFamily}`;
      ctx.textAlign = "left";
      if (run.emphasis?.mode === "box") {
        const padX = Math.max(5, fontSize * 0.11);
        const padY = Math.max(3, fontSize * 0.08);
        const boxWidth = (run.width + padX * 2) * run.motion.reveal;
        roundRectPath(ctx, cursor - padX, lineY - run.runSize * 0.56 - padY, boxWidth, run.runSize * 1.12 + padY * 2, Math.max(5, fontSize * 0.12));
        ctx.fillStyle = hexToRgba(run.emphasis.color, 0.18);
        ctx.fill();
        ctx.strokeStyle = run.emphasis.color;
        ctx.lineWidth = Math.max(2, fontSize * 0.045);
        ctx.stroke();
      }
      if (options.shadow !== false) {
        ctx.shadowColor = "rgba(0,0,0,.5)";
        ctx.shadowBlur = Math.max(2, fontSize * 0.12);
        ctx.shadowOffsetY = Math.max(1, fontSize * 0.04);
      }
      if (options.outline !== false && run.emphasis?.mode !== "box") {
        ctx.strokeStyle = options.outlineColor || "rgba(10,12,16,.88)";
        ctx.lineWidth = Math.max(1.5, fontSize * 0.055);
        ctx.strokeText(run.text, cursor, lineY);
      }
      ctx.fillStyle = run.emphasis?.color || options.color || "#fff";
      ctx.fillText(run.text, cursor, lineY);
      if (run.emphasis?.mode === "underline") {
        ctx.strokeStyle = run.emphasis.color;
        ctx.lineWidth = Math.max(2, fontSize * 0.055);
        ctx.beginPath();
        ctx.moveTo(cursor, lineY + run.runSize * 0.56);
        ctx.lineTo(cursor + run.width * run.motion.reveal, lineY + run.runSize * 0.56);
        ctx.stroke();
      }
      ctx.restore();
      cursor += run.width;
    });
  });
  ctx.restore();
  return { lines, height: Math.max(lineHeight, lines.length * lineHeight) };
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

function activeBookendAt(project, currentTime) {
  const windows = bookendWindowsFor(project);
  for (const kind of ["intro", "outro"]) {
    const item = project.bookends?.[kind];
    const window = windows[kind];
    if (item?.enabled && item.text && window.available && currentTime >= window.start && currentTime <= window.end) {
      return { kind, item, window };
    }
  }
  return null;
}

function drawOverlayDragGuide(ctx) {
  const target = state.draggingOverlay?.target || state.hoverOverlay;
  const region = state.overlayHitRegions.find((item) => item.target === target);
  if (!region) return;
  const labels = { bottom: "拖动底部关键词字幕", intro: "拖动开头文字", outro: "拖动结尾文字" };
  ctx.save();
  ctx.strokeStyle = "rgba(105,231,255,.95)";
  ctx.fillStyle = "rgba(8,13,22,.78)";
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(region.x, region.y, region.width, region.height);
  ctx.setLineDash([]);
  ctx.font = "600 13px Microsoft YaHei";
  const label = labels[target] || "拖动定位";
  const labelWidth = ctx.measureText(label).width + 16;
  const labelY = Math.max(2, region.y - 25);
  ctx.fillRect(region.x, labelY, labelWidth, 22);
  ctx.fillStyle = "#69E7FF";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, region.x + 8, labelY + 11);
  ctx.restore();
}

function drawBookendPreview(ctx, bookend, template, params, spec) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const scale = width / spec.outputWidth;
  const x = width * Number(bookend.item.position?.x ?? params.x ?? 50) / 100;
  const y = height * Number(bookend.item.position?.y ?? params.y ?? 64) / 100;
  const fontSize = Math.max(20, Number(params.fontSize || 88) * scale);
  const fontFamily = params.fontFamily || "Microsoft YaHei";
  const primary = params.primaryColor || template.primary || "#fff";
  const duration = Math.max(0.1, bookend.window.end - bookend.window.start);
  const enterWindow = Math.min(0.22, duration / 3);
  const exitWindow = Math.min(0.16, duration / 3);
  const elapsed = state.currentTime - bookend.window.start;
  const remaining = bookend.window.end - state.currentTime;
  const enter = Math.max(0, Math.min(1, elapsed / Math.max(0.04, enterWindow)));
  const alpha = Math.max(0, Math.min(1, enter, remaining / Math.max(0.04, exitWindow)));
  const movingY = y + (1 - enter) * fontSize * 0.18;
  const maxWidth = template.renderMode === "rolling-focus-left"
    ? (state.project.aspectRatio === "16:9" ? width * 0.48 : width * 0.82)
    : width * 0.82;
  state.overlayHitRegions.push({
    target: bookend.kind,
    anchorX: x,
    anchorY: y,
    x: template.renderMode === "rolling-focus-left" ? x - fontSize * 0.28 : x - maxWidth / 2,
    y: y - fontSize * 1.25,
    width: template.renderMode === "rolling-focus-left" ? maxWidth + fontSize * 0.9 : maxWidth,
    height: fontSize * 2.5,
  });
  if (template.renderMode === "rolling-focus-left") {
    const markerGap = fontSize * 0.62;
    drawCaptionText(ctx, bookend.item.text, x + markerGap, movingY, {
      fontSize,
      fontFamily,
      weight: 800,
      color: primary,
      align: "left",
      maxWidth: state.project.aspectRatio === "16:9" ? width * 0.48 : width * 0.82,
      maxLines: 2,
      alpha,
      outline: false,
      shadow: false,
    });
    if (enter >= 0.92) {
      drawCaptionText(ctx, "▶", x, y, {
        fontSize: fontSize * 0.72,
        fontFamily,
        weight: 800,
        color: primary,
        align: "left",
        maxLines: 1,
        alpha,
        outline: false,
        shadow: false,
      });
    }
  } else {
    drawCaptionText(ctx, `▶  ${bookend.item.text}`, x, movingY, {
      fontSize,
      fontFamily,
      weight: 800,
      color: primary,
      maxWidth: width * 0.82,
      maxLines: 2,
      alpha,
      outline: params.outlineEnabled !== false,
      shadow: params.shadowEnabled !== false,
    });
  }
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
  state.overlayHitRegions = [];
  const forceBlackBackground = state.project?.effectId === "rolling-focus-subtitle";
  ctx.fillStyle = forceBlackBackground ? "#000000" : "#07090d";
  ctx.fillRect(0, 0, width, height);
  const media = state.backgroundMedia;
  if (media && ((media instanceof HTMLImageElement && media.complete) || (media instanceof HTMLVideoElement && media.readyState >= 2))) drawCover(ctx, media, width, height);
  else if (!forceBlackBackground) {
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
    const landscapeScale = spec.outputWidth > spec.outputHeight ? 1.12 : 1;
    const fontSize = Math.max(20, Number(overrides.fontSize || params.fontSize || 88) * scale * landscapeScale);
    const primary = overrides.primaryColor || params.primaryColor || template.primary || "#fff";
    const accent = overrides.accentColor || params.accentColor || template.accent || "#ffd84d";
    const fontFamily = params.fontFamily || "Microsoft YaHei";
    const maxLines = Number(params.maxLines || 2);
    const words = previewWords(segment);
    const groups = previewWordGroups(words, segment.text);
    const localProgress = Math.max(0, Math.min(1, (state.currentTime - segment.start) / Math.max(0.1, segment.end - segment.start)));
    const enterMs = Math.min(220, Math.max(90, Math.round(150 / Math.max(0.5, Math.min(2, Number(params.animationSpeed || 1))))));
    const enter = Math.min(1, (state.currentTime - segment.start) / (enterMs / 1000));

    if (template.renderMode === "rolling-focus-left") {
      const rows = rollingFocusPreviewRows(state.project.segments);
      const focusIndex = rows.findIndex((row) => state.currentTime >= row.start - 0.09 && state.currentTime <= row.end);
      if (focusIndex >= 0) {
        const focusRow = rows[focusIndex];
        const previous = rows[focusIndex - 1];
        const reset = !previous || focusRow.start - previous.end > 1.2;
        const transition = reset ? 1 : Math.max(0, Math.min(1, (state.currentTime - (focusRow.start - 0.09)) / 0.22));
        const gap = fontSize * 1.28;
        const smallSize = fontSize * 0.54;
        const firstIndex = reset ? focusIndex : Math.max(0, focusIndex - 2);
        const lastIndex = Math.min(rows.length - 1, focusIndex + 2);
        for (let rowIndex = firstIndex; rowIndex <= lastIndex; rowIndex += 1) {
          const row = rows[rowIndex];
          const delta = rowIndex - focusIndex;
          const current = delta === 0;
          const wasCurrent = delta === -1 && !reset;
          const movingY = y + (delta + (reset ? 0 : 1 - transition)) * gap;
          const rowFontSize = current
            ? smallSize + (fontSize - smallSize) * transition
            : wasCurrent
              ? fontSize - (fontSize - smallSize) * transition
              : smallSize;
          const rowColor = (current && transition >= 0.5) || (wasCurrent && transition < 0.5)
            ? primary
            : (template.muted || "#B7B7B7");
          const markerGap = fontSize * 0.62;
          const rowX = current ? x + markerGap * transition : wasCurrent ? x + markerGap * (1 - transition) : x;
          const rowOptions = {
            fontSize: rowFontSize,
            fontFamily,
            weight: current || wasCurrent ? 800 : 500,
            color: rowColor,
            align: "left",
            maxWidth: state.project.aspectRatio === "16:9" ? width * 0.48 : width * 0.86,
            maxLines: 1,
            alpha: current ? 1 : Math.max(0.34, 0.7 - Math.abs(delta) * 0.14),
            outline: false,
            shadow: false,
            seed: row.sourceSegmentId || row.id,
          };
          drawCaptionText(ctx, row.text, rowX, movingY, rowOptions);
          if (current && transition >= 0.98) {
            drawCaptionText(ctx, "▶", x, movingY, {
              fontSize: fontSize * 0.72,
              fontFamily,
              weight: 800,
              color: primary,
              align: "left",
              maxLines: 1,
              outline: false,
              shadow: false,
            });
          }
        }
      }
    } else if (template.renderMode === "rolling-focus") {
      const lineGapBoost = Math.max(0, Number(params.lineGapBoost || 0));
      const gap = fontSize * (1.32 + lineGapBoost);
      const maxChars = state.project.aspectRatio === "16:9" ? 24 : state.project.aspectRatio === "1:1" ? 16 : 13;
      [segmentIndex - 1, segmentIndex, segmentIndex + 1].forEach((index) => {
        const row = state.project.segments[index];
        if (!row) return;
        const delta = index - segmentIndex;
        const current = delta === 0;
        const rowText = `${current ? "▶  " : ""}${wrapPreviewSubtitleText(row.text, maxChars, current ? 2 : 1)}`;
        const rowY = y + delta * gap + (1 - enter) * gap * 0.18;
        const rowOptions = {
          fontSize: current ? fontSize : fontSize * 0.64,
          fontFamily,
          color: current ? primary : (template.muted || "#7b8493"),
          maxWidth: width * 0.82,
          maxLines: current ? 2 : 1,
          alpha: current ? 1 : 0.67,
          outline: current && params.outlineEnabled !== false,
          shadow: current && params.shadowEnabled !== false,
          seed: row.sourceSegmentId || row.id,
        };
        drawCaptionText(ctx, rowText, x, rowY, rowOptions);
      });
    }

    if (state.project.showBottomSubtitles) {
      const bottomPosition = state.project.bottomSubtitlePosition || { x: 50, y: 94 };
      const bottomX = width * Number(bottomPosition.x ?? 50) / 100;
      const bottomY = height * Number(bottomPosition.y ?? 94) / 100;
      const bottomFontSize = Math.max(18, fontSize * 0.48);
      const bottomMaxWidth = width * 0.84;
      state.overlayHitRegions.push({
        target: "bottom",
        anchorX: bottomX,
        anchorY: bottomY,
        x: bottomX - bottomMaxWidth / 2,
        y: bottomY - bottomFontSize * 1.45,
        width: bottomMaxWidth,
        height: bottomFontSize * 2.9,
      });
      drawKeywordCaptionText(ctx, segment.text, segment.keywords, bottomX, bottomY, {
        fontSize: bottomFontSize,
        fontFamily,
        color: "#fff",
        maxWidth: width * 0.84,
        maxLines: 2,
        seed: segment.sourceSegmentId || segment.id,
        elapsedMs: Math.max(0, (state.currentTime - Number(segment.start || 0)) * 1000),
      });
    }
  } else if (template) {
    const bookend = activeBookendAt(state.project, state.currentTime);
    if (bookend) drawBookendPreview(ctx, bookend, template, params, spec);
  }
  drawOverlayDragGuide(ctx);
  const duration = Math.max(0.01, previewDuration());
  $("#kineticPreviewSeek").value = String(Math.round((state.currentTime / duration) * previewSeekMaximum()));
  $("#kineticCurrentTime").textContent = formatTime(state.currentTime);
  $("#kineticDuration").textContent = formatTime(duration);
}

function previewTick(timestamp) {
  if (!state.playing || !state.project) return;
  const duration = previewDuration();
  state.currentTime = clampTime(previewClockTime(timestamp), duration);
  if (state.backgroundMedia instanceof HTMLVideoElement) {
    const video = state.backgroundMedia;
    if (video.readyState >= 2 && Math.abs(video.currentTime - state.currentTime % Math.max(video.duration || 1, 1)) > 0.25) video.currentTime = state.currentTime % Math.max(video.duration || 1, 1);
  }
  if (duration <= 0 || state.currentTime >= duration - 0.005) {
    state.currentTime = duration;
    state.playing = false;
    state.audio?.pause();
    if (state.backgroundMedia instanceof HTMLVideoElement) state.backgroundMedia.pause();
    $("#kineticPreviewPlay").textContent = "播放预览";
    drawPreview();
    return;
  }
  drawPreview();
  state.raf = requestAnimationFrame(previewTick);
}

function startPreviewPlayback() {
  if (!state.project) return;
  const duration = previewDuration();
  if (duration <= 0) return;
  state.currentTime = playablePreviewTime(state.currentTime, duration);
  state.playing = true;
  state.seeking = false;
  $("#kineticPreviewPlay").textContent = "暂停预览";
  anchorPreviewClock(state.currentTime, state.seekCommitUntil ? Math.max(0, state.seekCommitUntil - performance.now()) : 0);
  if (state.audio) {
    const audio = state.audio;
    syncPreviewMediaTime(state.currentTime);
    audio.play().catch(() => {
      if (!state.playing || state.audio !== audio) return;
      state.playing = false;
      $("#kineticPreviewPlay").textContent = "播放预览";
      if (state.backgroundMedia instanceof HTMLVideoElement) state.backgroundMedia.pause();
      cancelAnimationFrame(state.raf);
      drawPreview();
    });
  }
  if (state.backgroundMedia instanceof HTMLVideoElement) { state.backgroundMedia.currentTime = state.currentTime % Math.max(state.backgroundMedia.duration || 1, 1); state.backgroundMedia.play().catch(() => {}); }
  cancelAnimationFrame(state.raf);
  state.raf = requestAnimationFrame(previewTick);
}

function playPreview() {
  if (!state.project || state.seeking) return;
  if (state.playing) {
    state.playing = false;
    $("#kineticPreviewPlay").textContent = "播放预览";
    state.audio?.pause();
    if (state.backgroundMedia instanceof HTMLVideoElement) state.backgroundMedia.pause();
    cancelAnimationFrame(state.raf);
    return;
  }
  startPreviewPlayback();
}

function canvasPoint(event) {
  const canvas = $("#kineticPreviewCanvas");
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width),
    y: (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height),
  };
}

function overlayAtPoint(point) {
  return [...state.overlayHitRegions].reverse().find((region) => (
    point.x >= region.x && point.x <= region.x + region.width
    && point.y >= region.y && point.y <= region.y + region.height
  )) || null;
}

function setOverlayPosition(target, xPercent, yPercent) {
  if (!state.project) return;
  const position = {
    x: Math.max(5, Math.min(95, Number(xPercent))),
    y: Math.max(8, Math.min(target === "bottom" ? 97 : 92, Number(yPercent))),
  };
  if (target === "bottom") {
    state.project.bottomSubtitlePosition = position;
    return;
  }
  const item = state.project.bookends?.[target];
  if (item) item.position = position;
}

function beginOverlayDrag(event) {
  if (!state.project || event.button !== 0) return;
  const canvas = event.currentTarget;
  const point = canvasPoint(event);
  const region = overlayAtPoint(point);
  if (!region) return;
  if (state.playing) playPreview();
  state.draggingOverlay = {
    target: region.target,
    pointerId: event.pointerId,
    offsetX: point.x - region.anchorX,
    offsetY: point.y - region.anchorY,
    startX: point.x,
    startY: point.y,
    moved: false,
  };
  state.hoverOverlay = region.target;
  canvas.style.cursor = "grabbing";
  try { canvas.setPointerCapture(event.pointerId); } catch {}
  event.preventDefault();
  drawPreview();
}

function moveOverlayDrag(event) {
  const canvas = event.currentTarget;
  const point = canvasPoint(event);
  if (!state.draggingOverlay) {
    const region = overlayAtPoint(point);
    const target = region?.target || "";
    canvas.style.cursor = target ? "grab" : "pointer";
    if (state.hoverOverlay !== target) {
      state.hoverOverlay = target;
      drawPreview();
    }
    return;
  }
  const drag = state.draggingOverlay;
  drag.moved ||= Math.hypot(point.x - drag.startX, point.y - drag.startY) > 3;
  const anchorX = point.x - drag.offsetX;
  const anchorY = point.y - drag.offsetY;
  setOverlayPosition(drag.target, anchorX / canvas.width * 100, anchorY / canvas.height * 100);
  event.preventDefault();
  drawPreview();
}

function finishOverlayDrag(event) {
  const canvas = event.currentTarget;
  const drag = state.draggingOverlay;
  if (!drag) return;
  try { canvas.releasePointerCapture(drag.pointerId); } catch {}
  state.draggingOverlay = null;
  state.suppressCanvasClick = drag.moved;
  canvas.style.cursor = state.hoverOverlay ? "grab" : "pointer";
  if (drag.target === "bottom") {
    scheduleSave({ bottomSubtitlePosition: { ...state.project.bottomSubtitlePosition } });
  } else {
    const item = state.project.bookends?.[drag.target];
    scheduleSave({ bookends: { [drag.target]: { ...item, position: { ...item.position } } } });
  }
  event.preventDefault();
}

function beginPreviewSeek(event) {
  if (!state.project || state.seeking) return;
  try {
    if (event?.pointerId !== undefined && event.currentTarget?.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
  } catch {}
  state.seekResumePlaying = state.playing;
  state.seeking = true;
  if (!state.playing) return;
  state.playing = false;
  state.audio?.pause();
  if (state.backgroundMedia instanceof HTMLVideoElement) state.backgroundMedia.pause();
  cancelAnimationFrame(state.raf);
}

function seekPreviewTo(sliderValue) {
  if (!state.project) return;
  const targetTime = seekValueToTime(sliderValue);
  anchorPreviewClock(targetTime, state.seeking ? SEEK_LOCK_MS : 0);
  syncPreviewMediaTime(targetTime, { trustMs: state.seeking ? SEEK_LOCK_MS : 0 });
  drawPreview();
  return targetTime;
}

function finishPreviewSeek(event) {
  if (!state.project || !state.seeking) return;
  const slider = event?.currentTarget || $("#kineticPreviewSeek");
  seekPreviewTo(slider?.value);
  try {
    if (event?.pointerId !== undefined && slider?.releasePointerCapture) slider.releasePointerCapture(event.pointerId);
  } catch {}
  const shouldResume = state.seekResumePlaying;
  state.seeking = false;
  state.seekResumePlaying = false;
  if (shouldResume) startPreviewPlayback();
}

function renderOutputs() {
  const container = $("#kineticOutputs");
  if (!container || !state.project) return;
  const outputs = state.project.outputs || {};
  container.innerHTML = [
    outputs.materialZip ? `<a href="${mediaUrl("package")}" target="_blank">打开素材包 ZIP</a>` : "",
    outputs.srtPath ? `<a href="${mediaUrl("srt")}" target="_blank">打开字幕 SRT</a>` : "",
    outputs.finalVideo ? `<a href="${mediaUrl("video")}" target="_blank">播放最终 MP4</a>` : "",
    outputs.finalVideo ? `<button class="primary" type="button" data-open-kinetic-output>打开视频位置</button>` : "",
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

function illustrationConfigFromForm() {
  return {
    enabled: $("#kineticIllustrationEnabled")?.checked === true,
    presetId: $("#kineticIllustrationPreset")?.value || "prompt-garden",
  };
}

function renderIllustrationPromptSlots() {
  const container = $("#kineticIllustrationPromptSlots");
  const plan = state.illustrationPlan;
  if (!container) return;
  if (!plan?.prompts?.length) {
    container.innerHTML = "<small>正在读取分层提示词…</small>";
    return;
  }
  container.innerHTML = plan.prompts.map((item) => `
    <div class="kinetic-illustration-slot" data-illustration-slot="${item.index}">
      <strong>元素 ${item.index}</strong>
      <textarea rows="4" readonly>${escapeHtml(item.prompt)}</textarea>
      <label class="ghost">${item.uploadedPath ? "替换图片" : "上传对应图片"}<input type="file" accept="image/png,image/jpeg,image/webp,image/bmp" data-illustration-upload="${item.index}" hidden /></label>
      <small>${item.uploadedPath ? "已上传，可直接合成" : "尚未上传"}</small>
    </div>
  `).join("");
  const buildButton = $("#kineticBuildUploadedIllustration");
  if (buildButton) buildButton.disabled = !plan.ready;
}

async function loadIllustrationPlan() {
  if (!state.project) return;
  const presetId = $("#kineticIllustrationPreset")?.value || "prompt-garden";
  const data = await postJson("/api/kinetic-text/illustration-plan", { projectId: state.project.id, presetId });
  state.illustrationPlan = data.plan;
  renderIllustrationPromptSlots();
}

async function uploadIllustrationSlot(index, file) {
  if (!state.project || !file) return;
  const status = $("#kineticIllustrationStatus");
  status.textContent = `正在上传元素 ${index}…`;
  const data = await postJson("/api/kinetic-text/illustration-upload", {
    projectId: state.project.id,
    presetId: $("#kineticIllustrationPreset")?.value || "prompt-garden",
    index,
    name: file.name,
    data: await fileToDataUrl(file),
  });
  state.illustrationPlan = data.plan;
  renderIllustrationPromptSlots();
  status.textContent = data.plan.ready ? "分层图片已全部上传，可以直接合成。" : `元素 ${index} 已上传，请继续上传其余元素。`;
}

function renderIllustrationSettings() {
  const config = state.project?.dynamicIllustration?.config || readPreferences().illustration || {};
  const enabled = $("#kineticIllustrationEnabled");
  if (enabled) enabled.checked = config.enabled === true;
  const presetId = config.presetId || "prompt-garden";
  const preset = $("#kineticIllustrationPreset");
  if (preset) preset.value = presetId;
  if (state.illustrationPlan?.presetId !== presetId) loadIllustrationPlan().catch(() => {});
  const outputs = state.project?.dynamicIllustration?.presets?.[presetId]?.outputs
    || state.project?.dynamicIllustration?.outputs
    || {};
  const container = $("#kineticIllustrationOutputs");
  if (!container) return;
  container.hidden = !outputs.mp4;
  container.innerHTML = outputs.mp4 ? [
    `<a href="${mediaUrl("illustrationMp4")}" target="_blank">播放 MP4 预览</a>`,
    `<a href="${mediaUrl("illustrationGif", { download: true })}">下载循环 GIF</a>`,
    `<a href="${mediaUrl("illustrationReport")}" target="_blank">查看关键帧检查报告</a>`,
  ].join("") : "";
  const status = $("#kineticIllustrationStatus");
  if (status && outputs.mp4) status.textContent = config.enabled
    ? "动态背景特效已启用：15fps MP4、循环 GIF、分层清单和关键帧检查均已保存。"
    : "动态背景素材已生成，但当前未启用；开启后会直接应用，无需重新生成。";
}

async function setIllustrationEnabled(enabled) {
  if (!state.project) return;
  const control = $("#kineticIllustrationEnabled");
  const status = $("#kineticIllustrationStatus");
  const dynamic = state.project.dynamicIllustration || {};
  const outputs = dynamic.outputs || {};
  const generatedPath = outputs.mp4 || "";
  const generatedActive = Boolean(generatedPath && state.project.background?.path === generatedPath);
  const previousBackground = generatedActive
    ? (dynamic.previousBackground || { mode: "black", path: "", name: "" })
    : { ...(state.project.background || { mode: "black", path: "", name: "" }) };
  const config = { ...illustrationConfigFromForm(), enabled };
  const changes = {
    dynamicIllustration: { config, previousBackground },
  };
  if (enabled && generatedPath) {
    changes.background = { mode: "video", path: generatedPath, name: "手绘循环动态背景.mp4" };
  } else if (!enabled && generatedActive) {
    changes.background = previousBackground;
  }
  control.disabled = true;
  savePreferences({ illustration: config });
  try {
    const data = await postJson("/api/kinetic-text/update", { projectId: state.project.id, changes });
    acceptServerProject(data.project);
    renderProject();
    status.textContent = enabled
      ? (generatedPath ? "动态背景特效已启用并应用。" : "已启用；请生成一次动态背景素材。")
      : "动态背景特效已关闭，已恢复之前的背景。";
  } catch (error) {
    control.checked = !enabled;
    status.textContent = error.message;
  } finally {
    control.disabled = false;
  }
}

async function generateIllustration(force = false, sourceMode = "api") {
  if (!state.project) return;
  const button = $("#kineticGenerateIllustration");
  const status = $("#kineticIllustrationStatus");
  const config = illustrationConfigFromForm();
  config.enabled = true;
  $("#kineticIllustrationEnabled").checked = true;
  savePreferences({ illustration: config });
  button.disabled = true;
  status.textContent = force
    ? "正在重新生成当前预设的独立分层素材…"
    : "正在读取缓存；首次使用时按官方工作流生成分层素材…";
  setProgress(2, "准备官方动态插画工作流");
  try {
    const data = await postJson("/api/kinetic-text/illustration", { projectId: state.project.id, config: { ...config, sourceMode }, force });
    saveActiveJob(data.job);
    pollJob(data.job.id, {
      onComplete: () => {
        button.disabled = false;
        status.textContent = config.enabled
          ? "生成完成，动态 MP4 已自动设为当前背景；GIF 和检查报告可直接下载。"
          : "素材生成完成；当前开关关闭，所以没有替换现有背景。";
      },
      onFailed: (job) => {
        button.disabled = false;
        status.textContent = job.error || "动态背景生成失败。";
      },
    }).catch((error) => {
      button.disabled = false;
      status.textContent = error.message;
      setProgress(0, error.message);
    });
  } catch (error) {
    button.disabled = false;
    status.textContent = error.message;
    setProgress(0, error.message);
  }
}

function renderProject() {
  const project = state.project;
  renderProjects();
  renderEffects();
  renderTimeline();
  renderTimelineRuleStatus();
  renderDownloadDirectory();
  if (!project) { drawPreview(); return; }
  renderBookendSettings();
  renderIllustrationSettings();
  $("#kineticTextTitle").value = project.title || "";
  $("#kineticAspectRatio").value = project.aspectRatio || "9:16";
  $("#kineticFrameRate").value = String(Number(project.frameRate) === 60 ? 60 : 30);
  const previewSpec = previewOutputSize(project.aspectRatio || "9:16");
  $("#kineticPreviewSpec").textContent = `${previewSpec.outputWidth}×${previewSpec.outputHeight} · ${Number(project.frameRate) === 60 ? 60 : 30}fps`;
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
  const id = preferredId || state.project?.id || "";
  state.project = id ? state.projects.find((project) => project.id === id) || null : null;
  state.pendingTimelineChanges = {};
  localStorage.removeItem("dy:kinetic-text:project-id");
  renderProject();
}

function clearTimelineState(message = "等待 TTS 发送已确认字幕时间轴") {
  clearTimeout(state.saveTimer);
  state.saveTimer = 0;
  state.project = null;
  state.pendingTimelineChanges = {};
  state.pendingSaveChanges = {};
  state.currentTime = 0;
  state.playing = false;
  localStorage.removeItem("dy:kinetic-text:project-id");
  localStorage.removeItem("dy:handoff:kinetic-text:audio");
  localStorage.removeItem("dy:handoff:kinetic-text:text");
  localStorage.removeItem("dy:kinetic-text:last-text-handoff");
  syncAudio();
  renderProject();
  setProgress(0, message);
}

function scheduleSave(changes = {}) {
  if (!state.project) return;
  state.project = mergeProjectChanges(state.project, changes);
  state.pendingSaveChanges = mergeProjectChanges(state.pendingSaveChanges, changes);
  renderEffects();
  renderBookendAvailability();
  drawPreview();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    const changesToSave = state.pendingSaveChanges;
    state.pendingSaveChanges = {};
    try {
      const data = await postJson("/api/kinetic-text/update", { projectId: state.project.id, changes: changesToSave });
      acceptServerProject(data.project);
      renderProjects();
      renderTimelineRuleStatus();
    } catch (error) {
      state.pendingSaveChanges = mergeProjectChanges(changesToSave, state.pendingSaveChanges);
      setProgress(state.project.progress || 0, `自动保存失败：${error.message}`);
    }
  }, 550);
}

function applyTimelineInput(input) {
  const row = input.closest(".kinetic-timeline-row");
  const index = Number(row?.dataset.segmentIndex);
  if (!Number.isInteger(index) || !state.project?.segments[index]) return;
  const field = input.dataset.field;
  const baseSegments = hasTimelineDraft() ? state.pendingTimelineChanges.segments : state.project.segments;
  const segments = baseSegments.map((segment, segmentIndex) => {
    if (segmentIndex !== index) return segment;
    if (field === "keywords") return { ...segment, keywords: input.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) };
    if (field === "lineBreaks") return { ...segment, lineBreaks: [...new Set(input.value.split(/[,，、\s]+/).map(Number).filter((value) => Number.isInteger(value) && value > 0 && value < String(segment.text || "").length))].sort((a, b) => a - b) };
    if (["x", "y", "primaryColor"].includes(field)) return { ...segment, overrides: { ...(segment.overrides || {}), [field]: ["x", "y"].includes(field) ? Number(input.value) : input.value } };
    if (["start", "end"].includes(field)) return { ...segment, [field]: Number(input.value) };
    return { ...segment, [field]: input.value };
  });
  const changes = { segments, duration: Math.max(...segments.map((item) => Number(item.end || 0)), state.project.duration || 0) };
  state.pendingTimelineChanges = mergeProjectChanges(state.pendingTimelineChanges, changes);
  renderTimelineDraftStatus();
  setProgress(state.project.progress || 0, "字幕已修改，点击“确定修改”后保存");
}

function sharedTimelineFromPayload(payload = {}) {
  const rows = Array.isArray(payload.sentence_timeline) && payload.sentence_timeline.length
    ? payload.sentence_timeline
    : Array.isArray(payload.subtitle_timeline)
      ? payload.subtitle_timeline
      : [];
  return rows.map((row, index) => ({
    ...row,
    index,
    start: Number(row.start || 0),
    end: Number(row.end || 0),
    text: String(row.text || "").trim(),
  })).filter((row) => row.text && row.end > row.start);
}

async function applySharedTimelineToKineticProject(payload = {}) {
  const project = state.projects.find((item) => String(item.ttsJobId || "") === String(payload.id || ""));
  const rows = sharedTimelineFromPayload(payload);
  if (!project || !rows.length) return null;
  const segments = rows.map((row, index) => ({
    ...row,
    id: row.id || `segment-${index + 1}`,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    lineBreaks: Array.isArray(row.lineBreaks) ? row.lineBreaks : [],
    overrides: {},
  }));
  const finalText = String(payload.final_text || payload.text || segments.map((item) => item.text || "").join("") || project.text || "");
  const sourceText = String(payload.original_text || payload.final_text || project.originalText || finalText || "");
  const data = await postJson("/api/kinetic-text/update", {
    projectId: project.id,
    changes: {
      title: payload.title || payload.seo_title || payload.publish_title || project.title,
      text: finalText,
      audioPath: String(payload.audio_path || ""),
      audioUrl: String(payload.audio_url || ""),
      scriptPath: String(payload.script_path || ""),
      subtitlePath: String(payload.subtitle_path || payload.timed_subtitle_path || ""),
      timestampedTextPath: String(payload.timestamped_text_path || payload.timed_subtitle_path || ""),
      originalText: sourceText,
      recognizedText: String(payload.recognized_text || ""),
      wordTimeline: Array.isArray(payload.word_timeline) ? payload.word_timeline : [],
      sentenceTimeline: rows,
      alignmentStatus: String(payload.alignment_status || ""),
      alignmentConfirmedAt: String(payload.alignment_confirmed_at || ""),
      ttsHandoffId: String(payload.handoff_id || ""),
      ttsHandoffRevision: String(payload.handoff_revision || ""),
      ttsSharedUpdatedAt: String(payload.sharedUpdatedAt || payload.sent_at || payload.sentAt || ""),
      segments,
      duration: Math.max(...segments.map((item) => Number(item.end || 0)), Number(payload.audio_duration || payload.duration || 0)),
      subtitleSource: "shared-production-timeline",
    },
  });
  const projectIndex = state.projects.findIndex((item) => item.id === data.project.id);
  if (projectIndex >= 0) state.projects[projectIndex] = data.project;
  if (state.project?.id === data.project.id) {
    acceptServerProject(data.project);
    renderProject();
  }
  return data.project;
}

async function confirmTimelineChanges() {
  if (!state.project || !hasTimelineDraft()) {
    setProgress(state.project?.progress || 0, "没有待确认的字幕修改");
    return;
  }
  const changesToSave = state.pendingTimelineChanges;
  state.pendingTimelineChanges = {};
  renderTimelineDraftStatus();
  setProgress(state.project.progress || 0, "正在保存已确认字幕修改...");
  try {
    const data = await postJson("/api/kinetic-text/update", { projectId: state.project.id, changes: changesToSave });
    acceptServerProject(data.project, { preserveTimelineDraft: false });
    renderProjects();
    renderProject();
    setProgress(state.project.progress || 0, "字幕修改已确认保存");
  } catch (error) {
    state.pendingTimelineChanges = mergeProjectChanges(changesToSave, state.pendingTimelineChanges);
    renderTimelineDraftStatus();
    setProgress(state.project.progress || 0, `字幕保存失败：${error.message || error}`);
  }
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
  acceptServerProject(data.project);
  if (kind === "background" && state.project.dynamicIllustration?.config?.enabled) {
    const config = { ...state.project.dynamicIllustration.config, enabled: false };
    const updated = await postJson("/api/kinetic-text/update", {
      projectId: state.project.id,
      changes: { dynamicIllustration: { config, previousBackground: state.project.background } },
    });
    acceptServerProject(updated.project);
    savePreferences({ illustration: config });
  }
  savePreferences({ backgroundMode: state.project.background.mode, audioSource: state.project.audioMix.source });
  renderProject();
}

async function pollJob(jobId, options = {}) {
  clearTimeout(state.pollTimer);
  const data = await jsonFetch(`/api/kinetic-text/job?id=${encodeURIComponent(jobId)}`);
  const job = data.job;
  setProgress(job.progress, job.stage);
  if (job.status === "completed") {
    clearActiveJob(job.id);
    await refreshProjects(job.projectId);
    if (options.renderOnComplete && job.type === "render") {
      const videoPath = job.result?.videoPath || state.project?.outputs?.finalVideo || kineticDownloadDirectory();
      setProgress(100, `视频已保存：${videoPath}`);
      setRenderButtonBusy(false);
    }
    if (typeof options.onComplete === "function") options.onComplete(job);
    return job;
  }
  if (job.status === "failed") {
    clearActiveJob(job.id);
    setProgress(job.progress || 0, `${job.stage}：${job.error}`);
    if (options.renderOnComplete) setRenderButtonBusy(false);
    if (typeof options.onFailed === "function") options.onFailed(job);
    return job;
  }
  state.pollTimer = setTimeout(() => pollJob(jobId, options).catch((error) => {
    setProgress(job.progress, error.message);
    if (options.renderOnComplete) setRenderButtonBusy(false);
  }), 1000);
}

function saveActiveJob(job, options = {}) {
  try {
    if (!job?.id) return;
    localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({
      id: String(job.id),
      type: String(job.type || ""),
      renderOnComplete: options.renderOnComplete === true,
    }));
  } catch {}
}

function clearActiveJob(jobId = "") {
  try {
    // 用户可叠加多个任务（如 materials 与 render 并发），先完成的 job
    // 不能清掉后启动 job 的持久化 ID，否则刷新后后者无法恢复。
    if (jobId) {
      const saved = readActiveJob();
      if (saved?.id && String(saved.id) !== String(jobId)) return;
    }
    localStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {}
}

function readActiveJob() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_JOB_KEY) || "null"); } catch { return null; }
}

async function restoreActiveJob() {
  const saved = readActiveJob();
  if (!saved?.id) return;
  try {
    const data = await jsonFetch(`/api/kinetic-text/job?id=${encodeURIComponent(saved.id)}`);
    const job = data.job;
    if (!job || job.status === "completed" || job.status === "failed") {
      clearActiveJob();
      return;
    }
    if (saved.renderOnComplete && job.type === "render") setRenderButtonBusy(true);
    setProgress(job.progress || 0, job.stage || "已恢复上次任务");
    state.pollTimer = setTimeout(() => pollJob(job.id, { renderOnComplete: saved.renderOnComplete && job.type === "render" }).catch((error) => {
      setProgress(0, error.message);
      if (saved.renderOnComplete) setRenderButtonBusy(false);
    }), 1000);
  } catch (error) {
    // 同上：只有任务明确不存在才清除；服务暂时不可达时保留 ID。
    const message = String(error?.message || "");
    if (/不存在|没有|not.?found|404/i.test(message)) clearActiveJob();
  }
}

async function saveProjectImmediately() {
  if (!state.project) return null;
  clearTimeout(state.saveTimer);
  const changesToSave = mergeProjectChanges(state.pendingSaveChanges, currentControlChanges());
  state.pendingSaveChanges = {};
  state.project = mergeProjectChanges(state.project, changesToSave);
  const data = await postJson("/api/kinetic-text/update", { projectId: state.project.id, changes: changesToSave });
  acceptServerProject(data.project);
  return state.project;
}

async function receiveTts(payload, { navigate = true } = {}) {
  const rows = sharedTimelineFromPayload(payload || {});
  const confirmed = String(payload?.alignment_status || payload?.metadata?.alignment_status || "") === "confirmed";
  if (!payload?.id || !confirmed || !rows.length) {
    clearTimelineState("TTS 参数为空或无效，字幕时间轴已清空");
    return null;
  }
  const existing = state.projects.find((project) => String(project.ttsJobId) === String(payload.id));
  clearTimelineState("正在接收新的 TTS 参数");
  if (existing) {
    state.project = await applySharedTimelineToKineticProject(payload) || existing;
    await refreshProjects(state.project.id);
    renderProject();
    if (navigate) window.workbenchNavigate?.("kinetic-text");
    return state.project;
  }
  const preferences = readPreferences();
  const data = await postJson("/api/kinetic-text/create", {
    tts: payload,
    effectId: preferences.effectId,
    aspectRatio: preferences.aspectRatio || "9:16",
    frameRate: Number(preferences.frameRate) === 60 ? 60 : 30,
    videoProjectId: window.videoProjects?.current?.()?.id || localStorage.getItem("active-video-project-id") || "",
  });
  state.pendingTimelineChanges = {};
  state.project = data.project;
  await refreshProjects(state.project.id);
  if (navigate) window.workbenchNavigate?.("kinetic-text");
  return state.project;
}

async function receiveText(payload = {}) {
  clearTimelineState("文案直传不会生成字幕时间轴，请从 TTS 页面发送已确认参数");
  window.workbenchNavigate?.("kinetic-text");
  return null;
}

function bindBookendControl(kind) {
  const prefix = kind === "intro" ? "Intro" : "Outro";
  const enabled = $(`#kinetic${prefix}Enabled`);
  const preset = $(`#kinetic${prefix}Preset`);
  const text = $(`#kinetic${prefix}Text`);
  enabled.addEventListener("change", () => updateBookend(kind, { enabled: enabled.checked }));
  preset.addEventListener("change", () => {
    const nextText = preset.value === "custom" ? text.value : bookendPresetText(kind, preset.value);
    text.value = nextText;
    updateBookend(kind, { preset: preset.value, text: nextText });
  });
  text.addEventListener("input", () => {
    preset.value = "custom";
    updateBookend(kind, { preset: "custom", text: text.value });
  });
}

function bindEvents() {
  bindBookendControl("intro");
  bindBookendControl("outro");
  $("#kineticTextRefresh").addEventListener("click", () => refreshProjects().catch((error) => setProgress(0, error.message)));
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
    const changes = { effectId: effect.id, effectParams: { ...effect.defaultParams } };
    if (effect.id === "rolling-focus-subtitle") {
      changes.background = { mode: "black", path: "", name: "" };
    }
    scheduleSave(changes);
    if (effect.id === "rolling-focus-subtitle") syncBackgroundMedia();
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
  $("#kineticConfirmTimeline").addEventListener("click", () => confirmTimelineChanges());
  $("#kineticTextTitle").addEventListener("input", (event) => {
    const title = event.target.value;
    const intro = state.project?.bookends?.intro;
    if (intro?.preset === "title") {
      $("#kineticIntroText").value = title;
      scheduleSave({ title, bookends: { intro: { ...intro, text: title } } });
    } else scheduleSave({ title });
  });
  $("#kineticAspectRatio").addEventListener("change", (event) => {
    savePreferences({ aspectRatio: event.target.value });
    scheduleSave({ aspectRatio: event.target.value });
    const spec = previewOutputSize(event.target.value);
    const frameRate = Number($("#kineticFrameRate").value) === 60 ? 60 : 30;
    $("#kineticPreviewSpec").textContent = `${spec.outputWidth}×${spec.outputHeight} · ${frameRate}fps`;
    drawPreview();
  });
  $("#kineticFrameRate").addEventListener("change", (event) => {
    const frameRate = Number(event.target.value) === 60 ? 60 : 30;
    savePreferences({ frameRate });
    scheduleSave({ frameRate });
    const spec = previewOutputSize($("#kineticAspectRatio").value || state.project?.aspectRatio || "9:16");
    $("#kineticPreviewSpec").textContent = `${spec.outputWidth}×${spec.outputHeight} · ${frameRate}fps`;
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
    const illustration = { ...illustrationConfigFromForm(), enabled: false };
    const enabled = $("#kineticIllustrationEnabled");
    if (enabled) enabled.checked = false;
    savePreferences({ illustration });
    scheduleSave({
      background: { mode: event.target.value },
      dynamicIllustration: { config: illustration, previousBackground: { ...state.project.background, mode: event.target.value } },
    });
  });
  $("#kineticIllustrationEnabled").addEventListener("change", (event) => {
    setIllustrationEnabled(event.target.checked).catch((error) => {
      $("#kineticIllustrationStatus").textContent = error.message;
    });
  });
  $("#kineticIllustrationPreset").addEventListener("change", () => {
    const config = illustrationConfigFromForm();
    savePreferences({ illustration: config });
    state.illustrationPlan = null;
    renderIllustrationSettings();
    loadIllustrationPlan().catch((error) => { $("#kineticIllustrationStatus").textContent = error.message; });
  });
  $("#kineticGenerateIllustration").addEventListener("click", () => generateIllustration(false, "api"));
  $("#kineticRegenerateIllustration").addEventListener("click", () => generateIllustration(true, "api"));
  $("#kineticBuildUploadedIllustration").addEventListener("click", () => generateIllustration(true, "uploaded"));
  $("#kineticCopyIllustrationPrompts").addEventListener("click", async () => {
    const prompts = state.illustrationPlan?.prompts || [];
    if (!prompts.length) await loadIllustrationPlan();
    const text = (state.illustrationPlan?.prompts || []).map((item) => `元素 ${item.index}\n${item.prompt}`).join("\n\n");
    await navigator.clipboard.writeText(text);
    $("#kineticIllustrationStatus").textContent = "全部分层提示词已复制。";
  });
  $("#kineticIllustrationPromptSlots").addEventListener("change", (event) => {
    const input = event.target.closest("[data-illustration-upload]");
    if (!input) return;
    uploadIllustrationSlot(Number(input.dataset.illustrationUpload), input.files?.[0]).catch((error) => {
      $("#kineticIllustrationStatus").textContent = error.message;
    });
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
  $("#kineticPreviewPlay").addEventListener("click", playPreview);
  $("#kineticPreviewCanvas").addEventListener("pointerdown", beginOverlayDrag);
  $("#kineticPreviewCanvas").addEventListener("pointermove", moveOverlayDrag);
  $("#kineticPreviewCanvas").addEventListener("pointerup", finishOverlayDrag);
  $("#kineticPreviewCanvas").addEventListener("pointercancel", finishOverlayDrag);
  $("#kineticPreviewCanvas").addEventListener("pointerleave", (event) => {
    if (state.draggingOverlay) return;
    state.hoverOverlay = "";
    event.currentTarget.style.cursor = "pointer";
    drawPreview();
  });
  $("#kineticPreviewCanvas").addEventListener("click", () => {
    if (state.suppressCanvasClick) {
      state.suppressCanvasClick = false;
      return;
    }
    playPreview();
  });
  $("#kineticPreviewCanvas").addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    playPreview();
  });
  $("#kineticPreviewRestart").addEventListener("click", () => {
    state.currentTime = 0;
    state.startTime = 0;
    state.startedAt = performance.now();
    if (state.audio) state.audio.currentTime = 0;
    if (state.backgroundMedia instanceof HTMLVideoElement) state.backgroundMedia.currentTime = 0;
    drawPreview();
  });
  $("#kineticPreviewSeek").addEventListener("pointerdown", beginPreviewSeek);
  $("#kineticPreviewSeek").addEventListener("input", (event) => {
    beginPreviewSeek(event);
    seekPreviewTo(event.target.value);
  });
  $("#kineticPreviewSeek").addEventListener("pointerup", finishPreviewSeek);
  $("#kineticPreviewSeek").addEventListener("change", finishPreviewSeek);
  $("#kineticPreviewSeek").addEventListener("pointercancel", finishPreviewSeek);
  $("#kineticPreviewSeek").addEventListener("blur", finishPreviewSeek);
  $("#kineticGenerateMaterials").addEventListener("click", async () => {
    if (!state.project) return;
    const data = await postJson("/api/kinetic-text/materials", { projectId: state.project.id });
    saveActiveJob(data.job);
    pollJob(data.job.id).catch((error) => setProgress(0, error.message));
  });
  $("#kineticChooseDownloadDir").addEventListener("click", () => {
    chooseKineticDownloadDirectory().catch((error) => setProgress(state.project?.progress || 0, error.message));
  });
  $("#kineticOutputs").addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-open-kinetic-output]") : null;
    const filePath = button ? state.project?.outputs?.finalVideo : "";
    if (!filePath) return;
    postJson("/api/open-path", { filePath }).catch((error) => setProgress(state.project?.progress || 0, error.message));
  });
  $("#kineticRenderFinal").addEventListener("click", async () => {
    if (!state.project) return;
    setRenderButtonBusy(true);
    setProgress(3, "保存当前编辑");
    try {
      await saveProjectImmediately();
      const data = await postJson("/api/kinetic-text/render", { projectId: state.project.id });
      saveActiveJob(data.job, { renderOnComplete: true });
      pollJob(data.job.id, { renderOnComplete: true }).catch((error) => {
        setRenderButtonBusy(false);
        setProgress(0, error.message);
      });
    } catch (error) {
      setRenderButtonBusy(false);
      setProgress(0, error.message);
    }
  });
  window.addEventListener("kinetic-text-handoff", (event) => receiveTts(event.detail).catch((error) => setProgress(0, error.message)));
  window.addEventListener("kinetic-text-text-handoff", (event) => receiveText(event.detail).catch((error) => setProgress(0, error.message)));
  document.addEventListener("workbench:route", (event) => {
    const nextActive = event.detail?.page === "kinetic-text";
    if (!nextActive && state.routeActive) clearTimelineState();
    state.routeActive = nextActive;
  });
}

export async function initKineticTextModule() {
  state.page = document.querySelector("#kineticTextPage");
  if (!state.page) return;
  const [effectsData, providersData, statusData] = await Promise.all([
    jsonFetch("/api/kinetic-text/effects"),
    jsonFetch("/api/kinetic-text/providers").catch(() => ({ providers: [] })),
    jsonFetch("/api/status").catch(() => ({ downloadsDir: "" })),
  ]);
  state.effects = effectsData.effects || [];
  syncGlobalDownloadDirectory(statusData.downloadsDir || "");
  const providerSelect = $("#kineticTextProvider");
  const preferences = readPreferences();
  providerSelect.innerHTML = '<option value="">自动选择</option>' + (providersData.providers || []).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label || item.id)}</option>`).join("");
  if ([...providerSelect.options].some((option) => option.value === preferences.provider)) providerSelect.value = preferences.provider;
  providerSelect.addEventListener("change", () => savePreferences({ provider: providerSelect.value }));
  bindEvents();
  window.kineticTextProduction = { receiveTts, receiveText, refresh: refreshProjects };
  await refreshProjects();
  await restoreActiveJob();
}
