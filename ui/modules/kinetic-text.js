const PREF_KEY = "dy:kinetic-text:preferences";
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
  grid.innerHTML = state.effects.map((effect) => `
    <button class="kinetic-effect-card${state.project?.effectId === effect.id ? " active" : ""}" type="button" data-effect-id="${effect.id}">
      <span class="kinetic-effect-number">${String(effect.number).padStart(2, "0")}</span>
      <span class="kinetic-effect-demo effect-${effect.number}" style="--effect-primary:${effect.primary};--effect-accent:${effect.accent}">
        <i>动态</i><b>大字</b>
      </span>
      <strong>${escapeHtml(effect.name)}</strong>
      <small>${escapeHtml(effect.description)}</small>
    </button>
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

function tokenRows(segment, effectNumber) {
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
    let values;
    if ([6, 12].includes(effectNumber)) values = line.match(/.{1,7}/g) || [line];
    else if ([8, 13].includes(effectNumber)) values = line.match(/.{1,4}/g) || [line];
    else values = [...line].filter((item) => item.trim());
    return values.map((text, indexInRow) => ({ text, row, rowCount: displayLines.length, indexInRow, countInRow: values.length }));
  });
}

function easeOutBack(value) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function drawToken(ctx, token, x, y, options) {
  const { progress, index, effectNumber, color, fontSize, fontFamily } = options;
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
  if ([1, 3, 13].includes(effectNumber)) scaleX = Math.max(0.05, Math.cos((1 - delayed) * Math.PI / 2));
  if (effectNumber === 2) { rotation = (1 - delayed) * -0.5; offsetX = (1 - delayed) * (index % 2 ? 90 : -90); offsetY = (1 - delayed) * 70; }
  if (effectNumber === 4 || effectNumber === 9) { scaleX = scaleY = 1 + (1 - delayed) * 1.1; ctx.filter = `blur(${(1 - delayed) * 9}px)`; }
  if ([5, 8, 10].includes(effectNumber)) { scaleX = scaleY = Math.max(0.2, eased); offsetY = (1 - delayed) * 75; }
  if (effectNumber === 7) { scaleX = Math.max(0.05, Math.cos((1 - delayed) * Math.PI / 2)); ctx.shadowColor = color; ctx.shadowBlur = 14; }
  if ([6, 11].includes(effectNumber)) ctx.filter = `blur(${(1 - delayed) * 5}px)`;
  ctx.translate(offsetX, offsetY);
  ctx.rotate(rotation);
  ctx.scale(scaleX, scaleY);
  ctx.font = `800 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = effectNumber === 7 ? "#985467" : "rgba(0,0,0,.72)";
  ctx.lineWidth = effectNumber === 7 ? 4 : 2;
  ctx.fillStyle = color;
  ctx.strokeText(token, 0, 0);
  ctx.fillText(token, 0, 0);
  ctx.restore();
}

function tokenPosition(effectNumber, index, count, centerX, centerY, layout = {}) {
  const centered = index - (count - 1) / 2;
  const rowOffset = (Number(layout.row || 0) - (Number(layout.rowCount || 1) - 1) / 2) * 95;
  const horizontalStep = Math.min(66, 750 / Math.max(1, count - 1));
  if (effectNumber === 1) return [centerX + centered * horizontalStep, centerY + rowOffset + Math.abs(centered) * Math.min(28, 165 / Math.max(1, (count - 1) / 2))];
  if (effectNumber === 2) return [centerX + centered * horizontalStep, centerY + rowOffset + centered * Math.min(31, 250 / Math.max(1, count - 1))];
  if (effectNumber === 6) return [centerX + [-210, -60, 165, -175, 80, 225][index % 6], centerY + rowOffset + [-125, -35, -95, 95, 80, 135][index % 6]];
  if (effectNumber === 8) return [centerX + (index % 2 ? 95 : -95), centerY + rowOffset + centered * Math.min(54, 260 / Math.max(1, count - 1))];
  if (effectNumber === 9) return [centerX + centered * horizontalStep, centerY + rowOffset + (index % 2 ? 58 : -38)];
  if (effectNumber === 10) return [centerX + centered * horizontalStep, centerY + rowOffset + (index % 2 ? 48 : -30)];
  if (effectNumber === 11) return [centerX + centered * horizontalStep, centerY + rowOffset + (index % 3 - 1) * 68];
  if (effectNumber === 12) return [Math.max(140, centerX - 215), centerY + rowOffset - 105 + index * 52];
  if (effectNumber === 13) return [centerX + (index % 2 ? 100 : -90), centerY + rowOffset + centered * Math.min(47, 250 / Math.max(1, count - 1))];
  return [centerX + centered * horizontalStep, centerY + rowOffset];
}

function drawPreview() {
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
  const effectNumber = Number(effect?.number || 1);
  const segment = state.project.segments.find((item) => state.currentTime >= item.start && state.currentTime <= item.end);
  if (segment) {
    const localDuration = Math.max(0.1, Math.min(0.65, segment.end - segment.start));
    const progress = Math.max(0, Math.min(1, (state.currentTime - segment.start) / localDuration));
    const overrides = segment.overrides || {};
    const params = state.project.effectParams || {};
    const centerX = width * Number(overrides.x ?? params.x ?? 50) / 100;
    const centerY = height * Number(overrides.y ?? params.y ?? 50) / 100;
    const fontSize = Math.max(26, Math.min(110, Number(overrides.fontSize || params.fontSize || 92) / 2));
    const tokens = tokenRows(segment, effectNumber);
    const keywords = segment.keywords || [];
    tokens.forEach((entry, index) => {
      const token = entry.text;
      const highlighted = keywords.some((keyword) => keyword && (token.includes(keyword) || keyword.includes(token)));
      const color = highlighted || (effectNumber === 8 && index % 2) || (effectNumber === 13 && index % 2)
        ? (overrides.accentColor || params.accentColor || effect?.accent || "#ffe66b")
        : (overrides.primaryColor || params.primaryColor || effect?.primary || "#fff");
      const [x, y] = tokenPosition(effectNumber, entry.indexInRow, entry.countInRow, centerX, centerY, entry);
      drawToken(ctx, effectNumber === 12 ? `▶ ${token}` : token, x, y, { progress, index, effectNumber, color, fontSize: effectNumber === 6 || effectNumber === 12 ? fontSize * 0.68 : fontSize, fontFamily: params.fontFamily || "Microsoft YaHei" });
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
  $("#kineticBackgroundMode").value = project.background?.mode || "black";
  $("#kineticBackgroundName").textContent = project.background?.name ? `当前：${project.background.name}` : "当前：纯黑背景";
  $("#kineticAudioSource").value = project.audioMix?.source || "none";
  $("#kineticBgmName").textContent = project.audioMix?.localName || "未上传背景音乐";
  $("#kineticTtsVolume").value = String(project.audioMix?.ttsVolume ?? 100);
  $("#kineticBgVolume").value = String(project.audioMix?.backgroundVolume ?? 18);
  $("#kineticTtsVolumeValue").value = `${project.audioMix?.ttsVolume ?? 100}%`;
  $("#kineticBgVolumeValue").value = `${project.audioMix?.backgroundVolume ?? 18}%`;
  $("#kineticBottomSubtitles").checked = project.showBottomSubtitles === true;
  $("#kineticSubtitleSource").textContent = project.subtitleSource === "provider" ? "精确时间轴" : "估算时间轴，可在下方校正";
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
    const effect = effectById(card.dataset.effectId);
    savePreferences({ effectId: effect.id });
    scheduleSave({ effectId: effect.id, effectParams: { ...effect.defaultParams } });
    $("#kineticEffectName").textContent = effect.name;
  });
  $("#kineticTimeline").addEventListener("input", (event) => { if (event.target.dataset.field) applyTimelineInput(event.target); });
  $("#kineticTextTitle").addEventListener("input", (event) => scheduleSave({ title: event.target.value }));
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
