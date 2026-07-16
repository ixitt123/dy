import { postJson } from "./api.js";

const HANDOFF_KEY = "dy:handoff:money-printer:audio";
const PREF_KEY = "dy:money-printer:preferences";
const KINETIC_PREF_KEY = "dy:kinetic-text:preferences";
const POLL_INTERVAL_MS = 2500;

const state = {
  page: null,
  effects: [],
  status: null,
  handoff: null,
  segments: [],
  task: null,
  pollTimer: 0,
  raf: 0,
  playing: false,
  currentTime: 0,
  startedAt: 0,
  startTime: 0,
  previewReady: false,
};

function $(selector) {
  return state.page?.querySelector(selector) || document.querySelector(selector);
}

const els = {};

export function initMoneyPrinterModule() {
  state.page = document.getElementById("moneyPrinterPage");
  if (!state.page) return;
  cacheElements();
  bindEvents();
  initialize().catch((error) => setStatus("初始化失败", error.message, true));
  window.moneyPrinterProduction = { receiveTts, refresh: refreshStatus };
}

function cacheElements() {
  Object.assign(els, {
    apiBadge: $("#moneyPrinterApiBadge"),
    handoffBadge: $("#moneyPrinterHandoffBadge"),
    rootPath: $("#moneyPrinterRootPath"),
    status: $("#moneyPrinterStatus"),
    detail: $("#moneyPrinterDetail"),
    startApi: $("#moneyPrinterStartApi"),
    refresh: $("#moneyPrinterRefresh"),
    openDocs: $("#moneyPrinterOpenDocs"),
    openRoot: $("#moneyPrinterOpenRoot"),
    openTasks: $("#moneyPrinterOpenTasks"),
    subject: $("#moneyPrinterSubject"),
    source: $("#moneyPrinterSource"),
    transition: $("#moneyPrinterTransition"),
    localMaterials: $("#moneyPrinterLocalMaterials"),
    submit: $("#moneyPrinterSubmit"),
    effect: $("#moneyPrinterEffect"),
    aspect: $("#moneyPrinterAspect"),
    frameRate: $("#moneyPrinterFrameRate"),
    fontSize: $("#moneyPrinterFontSize"),
    fontSizeValue: $("#moneyPrinterFontSizeValue"),
    primaryColor: $("#moneyPrinterPrimaryColor"),
    accentColor: $("#moneyPrinterAccentColor"),
    maxLines: $("#moneyPrinterMaxLines"),
    ttsVolume: $("#moneyPrinterTtsVolume"),
    ttsVolumeValue: $("#moneyPrinterTtsVolumeValue"),
    bottomSubtitles: $("#moneyPrinterBottomSubtitles"),
    previewTitle: $("#moneyPrinterPreviewTitle"),
    previewSpec: $("#moneyPrinterPreviewSpec"),
    previewPlay: $("#moneyPrinterPreviewPlay"),
    previewRestart: $("#moneyPrinterPreviewRestart"),
    renderFinal: $("#moneyPrinterRenderFinal"),
    progressFill: $("#moneyPrinterProgressFill"),
    progressStage: $("#moneyPrinterProgressStage"),
    progressPercent: $("#moneyPrinterProgressPercent"),
    sourceVideo: $("#moneyPrinterSourceVideo"),
    sourceAudio: $("#moneyPrinterSourceAudio"),
    canvas: $("#moneyPrinterPreviewCanvas"),
    empty: $("#moneyPrinterPreviewEmpty"),
    seek: $("#moneyPrinterPreviewSeek"),
    currentTime: $("#moneyPrinterCurrentTime"),
    duration: $("#moneyPrinterDuration"),
    taskId: $("#moneyPrinterTaskId"),
    taskState: $("#moneyPrinterTaskState"),
    materialSummary: $("#moneyPrinterMaterialSummary"),
    taskVideos: $("#moneyPrinterTaskVideos"),
    timelineSummary: $("#moneyPrinterTimelineSummary"),
    timeline: $("#moneyPrinterTimeline"),
    assets: $("#moneyPrinterAssets"),
    apiLogs: $("#moneyPrinterApiLogs"),
  });
}

async function initialize() {
  const [effectsData] = await Promise.all([
    fetchJson("/api/money-printer/effects").catch(() => ({ effects: [] })),
    refreshStatus(),
  ]);
  state.effects = effectsData.effects || [];
  renderEffectOptions();
  await applyDefaultPreferences();
  loadStoredHandoff();
  renderAll();
}

function bindEvents() {
  els.startApi?.addEventListener("click", startApi);
  els.refresh?.addEventListener("click", refreshStatus);
  els.openDocs?.addEventListener("click", () => openTarget("docs"));
  els.openRoot?.addEventListener("click", () => openTarget("root"));
  els.openTasks?.addEventListener("click", () => openTarget("tasks"));
  els.submit?.addEventListener("click", submitForPreview);
  els.renderFinal?.addEventListener("click", renderFinalVideo);
  els.source?.addEventListener("change", () => {
    state.page.classList.toggle("money-printer-local-source", els.source.value === "local");
    savePreferences();
  });
  for (const input of [els.effect, els.aspect, els.frameRate, els.fontSize, els.primaryColor, els.accentColor, els.maxLines, els.ttsVolume, els.bottomSubtitles, els.transition]) {
    input?.addEventListener("input", () => { savePreferences(); updateSettingOutputs(); drawPreview(); renderTimeline(); });
    input?.addEventListener("change", () => { savePreferences(); updateSettingOutputs(); drawPreview(); renderTimeline(); });
  }
  els.subject?.addEventListener("input", savePreferences);
  els.previewPlay?.addEventListener("click", togglePreview);
  els.canvas?.addEventListener("click", togglePreview);
  els.previewRestart?.addEventListener("click", restartPreview);
  els.seek?.addEventListener("input", () => seekPreview(Number(els.seek.value || 0)));
  els.sourceVideo?.addEventListener("loadedmetadata", drawPreview);
  els.sourceVideo?.addEventListener("seeked", drawPreview);
  els.sourceAudio?.addEventListener("ended", pausePreview);
  window.addEventListener("money-printer-handoff", (event) => receiveTts(event.detail));
  document.addEventListener("workbench:route", (event) => {
    if (event.detail?.page === "money-printer") {
      loadStoredHandoff();
      renderAll();
    }
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || `请求失败：${response.status}`);
  return data;
}

function renderEffectOptions() {
  if (!els.effect) return;
  els.effect.innerHTML = (state.effects || []).map((effect) => (
    `<option value="${escapeAttr(effect.id)}">${escapeHtml(effect.number ? `${effect.number}. ` : "")}${escapeHtml(effect.name || effect.id)}</option>`
  )).join("");
}

async function applyDefaultPreferences() {
  const kineticPrefs = readJsonStorage(KINETIC_PREF_KEY, {});
  const moneyPrefs = readJsonStorage(PREF_KEY, {});
  let latestKinetic = null;
  try {
    const data = await fetchJson("/api/kinetic-text/projects");
    const projects = Array.isArray(data.projects) ? data.projects : [];
    latestKinetic = projects.find((item) => item.id === localStorage.getItem("dy:kinetic-text:project-id")) || projects[0] || null;
  } catch {}
  const effectId = moneyPrefs.effectId || latestKinetic?.effectId || kineticPrefs.effectId || state.effects[0]?.id || "";
  const effect = state.effects.find((item) => item.id === effectId) || state.effects[0] || {};
  const params = {
    ...(effect.defaultParams || {}),
    ...(latestKinetic?.effectParams || {}),
    ...(moneyPrefs.effectParams || {}),
  };
  setSelectValue(els.effect, effectId);
  setSelectValue(els.aspect, moneyPrefs.aspectRatio || latestKinetic?.aspectRatio || kineticPrefs.aspectRatio || "9:16");
  setSelectValue(els.frameRate, String(moneyPrefs.frameRate || latestKinetic?.frameRate || kineticPrefs.frameRate || 30));
  setSelectValue(els.maxLines, String(params.maxLines || 2));
  els.fontSize.value = String(params.fontSize || 88);
  els.primaryColor.value = params.primaryColor || effect.primary || "#ffffff";
  els.accentColor.value = params.accentColor || effect.accent || "#ffd84d";
  els.ttsVolume.value = String(moneyPrefs.ttsVolume ?? latestKinetic?.audioMix?.ttsVolume ?? kineticPrefs.ttsVolume ?? 100);
  els.bottomSubtitles.checked = moneyPrefs.showBottomSubtitles ?? latestKinetic?.showBottomSubtitles ?? kineticPrefs.showBottomSubtitles ?? true;
  setSelectValue(els.transition, moneyPrefs.transition || "auto");
  setSelectValue(els.source, moneyPrefs.source || "pexels");
  state.page.classList.toggle("money-printer-local-source", els.source.value === "local");
  updateSettingOutputs();
}

function loadStoredHandoff() {
  const stored = readJsonStorage(HANDOFF_KEY, null);
  if (stored?.id && (!state.handoff || String(stored.id) !== String(state.handoff.id))) receiveTts(stored, { navigate: false });
}

function receiveTts(payload = {}, { navigate = true } = {}) {
  state.handoff = payload;
  state.task = null;
  state.previewReady = false;
  state.currentTime = 0;
  state.segments = normalizeSegments(payload.subtitle_timeline?.length ? payload.subtitle_timeline : payload.sentence_timeline, payload);
  if (!els.subject.value.trim()) els.subject.value = payload.title || payload.seo_title || payload.publish_title || "MoneyPrinter 视频";
  if (payload.audio_url) els.sourceAudio.src = payload.audio_url;
  else els.sourceAudio.removeAttribute("src");
  if (navigate) window.workbenchNavigate?.("money-printer");
  renderAll();
  savePreferences();
}

function normalizeSegments(timeline = [], payload = {}) {
  const rows = Array.isArray(timeline) ? timeline : [];
  const fallbackText = String(payload.text || payload.final_text || "").trim();
  if (!rows.length && fallbackText) {
    const duration = Number(payload.audio_duration || payload.duration || 0) || Math.max(1, fallbackText.length / 5);
    return [{ id: "mpt-segment-1", start: 0, end: duration, text: fallbackText }];
  }
  return rows.map((item, index) => {
    const start = Number(item.start ?? item.start_time ?? item.startTime ?? 0);
    const end = Number(item.end ?? item.end_time ?? item.endTime ?? start + 1);
    const text = String(item.text || item.sentence || item.subtitle || "").trim();
    return {
      id: String(item.id || `mpt-segment-${index + 1}`),
      start,
      end: Math.max(start + 0.1, end),
      text,
      searchTerm: automaticSearchTerm(text, payload),
      material: null,
      transition: "",
      keywords: inferKeywords(text),
      words: Array.isArray(item.words) ? item.words : [],
    };
  }).filter((item) => item.text).sort((a, b) => a.start - b.start);
}

function renderAll() {
  renderHandoff();
  renderTimeline();
  renderTask();
  updateButtons();
  drawPreview();
}

function renderHandoff() {
  const confirmed = hasConfirmedHandoff();
  els.handoffBadge.textContent = confirmed ? `音频 #${state.handoff.display_number || state.handoff.id}` : "等待 TTS";
  els.previewSpec.textContent = confirmed
    ? `${state.segments.length} 段字幕 · ${els.aspect.value} · ${els.frameRate.value}fps`
    : "等待 TTS 三件套";
  if (!confirmed) {
    setStatus("等待已确认 TTS", "请先在 TTS 语音页确认最终文案、音频和字幕时间轴，再发送到 MoneyPrinter。", true);
  }
}

function renderTimeline() {
  if (!els.timeline) return;
  if (!state.segments.length) {
    els.timelineSummary.textContent = "等待 TTS";
    els.timeline.innerHTML = '<p class="money-printer-empty">尚未接收已确认字幕时间轴。</p>';
    return;
  }
  const source = els.source?.value || "pexels";
  els.timelineSummary.textContent = `共 ${state.segments.length} 段字幕 / ${matchedMaterialCount()} 段素材 / 转场${transitionLabel(els.transition.value)}`;
  els.timeline.innerHTML = state.segments.map((segment, index) => `
    <article class="money-printer-timeline-row">
      <span class="money-printer-segment-index">${String(index + 1).padStart(2, "0")}</span>
      <span>${formatTime(segment.start)}</span>
      <span>${formatTime(segment.end)}</span>
      <p>${escapeHtml(segment.text)}</p>
      <strong>${escapeHtml(segment.searchTerm || automaticSearchTerm(segment.text, state.handoff))}</strong>
      <div class="money-printer-material-cell">
        ${segment.thumbnail ? `<img src="${escapeAttr(segment.thumbnail)}" alt="" loading="lazy" />` : ""}
        <span title="${escapeAttr(segment.material?.url || "")}">${escapeHtml(segment.material?.name || segment.material?.url || (segment.materialReused ? "复用相邻素材" : `${source} 自动匹配`))}</span>
      </div>
      <span>${escapeHtml(segment.transition || transitionLabel(els.transition.value))}</span>
    </article>
  `).join("");
}

function renderTask() {
  const task = state.task;
  els.taskId.textContent = task?.task_id || "未创建";
  els.taskState.textContent = task?.stateLabel || "等待中";
  const videos = [
    ...(Array.isArray(task?.combined_videos) ? task.combined_videos.map((url) => ({ label: "官方混剪预览", url })) : []),
    ...(Array.isArray(task?.videos) ? task.videos.map((url) => ({ label: "MoneyPrinter 输出", url })) : []),
    ...(task?.finalVideoUrl ? [{ label: "最终动态大字成片", url: task.finalVideoUrl }] : []),
  ];
  els.taskVideos.innerHTML = videos.length
    ? videos.map((item) => `<div class="money-printer-video-row"><a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)}</a></div>`).join("")
    : "<p>预览完成后这里会显示官方混剪和最终视频。</p>";
  els.materialSummary.textContent = state.segments.length
    ? `字幕 ${state.segments.length} 段 · 已匹配 ${matchedMaterialCount()} 段 · 复用 ${state.segments.filter((item) => item.materialReused).length} 段`
    : "等待匹配";
}

async function refreshStatus() {
  try {
    const data = await fetchJson("/api/money-printer/status");
    renderStatus(data);
    if (data.api?.online) await loadAssets();
    return data;
  } catch (error) {
    setStatus("状态读取失败", error.message, true);
    return null;
  }
}

function renderStatus(status) {
  state.status = status;
  const installed = Boolean(status.installed);
  const online = Boolean(status.api?.online);
  els.apiBadge.textContent = online ? "API 在线" : installed ? "API 未启动" : "未安装";
  els.apiBadge.className = `money-printer-badge ${online ? "ready" : installed ? "warning" : "error"}`;
  els.rootPath.textContent = status.root || "";
  els.startApi.disabled = !installed || online;
  els.openDocs.disabled = !online;
  els.openRoot.disabled = !installed;
  els.openTasks.disabled = !installed;
  renderLogs(status.process?.logs || []);
  if (hasConfirmedHandoff()) {
    setStatus(
      online ? "MoneyPrinterTurbo 已就绪" : installed ? "MoneyPrinterTurbo 已安装，等待启动 API" : "未找到 MoneyPrinterTurbo",
      online ? `API：${status.api.baseUrl}` : installed ? "首次启动会通过 uv 准备依赖，可能需要几分钟。" : "请确认 integrations/moneyprinterturbo 子模块已初始化。",
      !installed,
    );
  }
  updateButtons();
}

async function startApi() {
  els.startApi.disabled = true;
  setStatus("正在启动 MoneyPrinterTurbo API", "首次启动会安装/校验 Python 依赖。");
  try {
    const data = await postJson("/api/money-printer/start-api", {});
    renderStatus(data);
    if (!data.api?.online) {
      const timer = window.setInterval(async () => {
        const next = await refreshStatus();
        if (next?.api?.online) window.clearInterval(timer);
      }, 3000);
    }
  } catch (error) {
    setStatus("启动失败", error.message, true);
  } finally {
    els.startApi.disabled = Boolean(state.status?.api?.online);
  }
}

async function submitForPreview() {
  if (!hasConfirmedHandoff()) {
    setStatus("缺少已确认 TTS", "请先从 TTS 语音页发送已确认音频和时间戳字幕。", true);
    return;
  }
  if (!state.status?.api?.online) {
    setStatus("API 未启动", "请先启动 MoneyPrinterTurbo API。", true);
    return;
  }
  stopPolling();
  state.previewReady = false;
  setProgress(4, "提交 MoneyPrinterTurbo 素材任务");
  try {
    state.segments = state.segments.map((segment) => ({ ...segment, searchTerm: automaticSearchTerm(segment.text, state.handoff) }));
    renderTimeline();
    const payload = buildMptPayload();
    const data = await postJson("/api/money-printer/generate", payload);
    state.task = data.task;
    setProgress(10, `任务已创建：${state.task?.task_id || "-"}`);
    pollTask(state.task?.task_id);
    state.pollTimer = window.setInterval(() => pollTask(state.task?.task_id), POLL_INTERVAL_MS);
  } catch (error) {
    setStatus("创建任务失败", error.message, true);
    setProgress(0, error.message);
  } finally {
    updateButtons();
  }
}

function buildMptPayload() {
  const durations = state.segments.map((item) => Math.max(1, item.end - item.start));
  const averageDuration = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 5;
  return {
    video_subject: els.subject.value.trim() || state.handoff.title || "MoneyPrinter 视频",
    video_script: state.handoff.text || state.handoff.final_text || state.segments.map((item) => item.text).join("\n"),
    video_terms: state.segments.map((item) => item.searchTerm).filter(Boolean),
    video_source: els.source.value,
    video_materials: els.localMaterials.value.trim(),
    video_aspect: els.aspect.value,
    video_count: 1,
    video_clip_duration: Math.max(1, Math.min(12, Math.round(averageDuration))),
    video_concat_mode: "sequential",
    video_transition_mode: transitionPayloadValue(),
    match_materials_to_script: true,
    custom_audio_file: state.handoff.audio_path || "",
    bgm_type: "none",
    subtitle_enabled: false,
  };
}

async function pollTask(taskId) {
  if (!taskId) return;
  try {
    const data = await fetchJson(`/api/money-printer/task?id=${encodeURIComponent(taskId)}`);
    state.task = data.task;
    setProgress(state.task.progress || 0, state.task.stateLabel || "生成中");
    renderTask();
    if (Number(state.task.state) === 1) {
      stopPolling();
      applyTaskMaterials(state.task);
      bindPreviewVideo(state.task);
      setProgress(100, "素材匹配完成，可以预览");
      setStatus("预览已就绪", "当前预览使用 MoneyPrinterTurbo 混剪素材、已确认 TTS 音频和动态大字字幕模板。");
    } else if (Number(state.task.state) === -1) {
      stopPolling();
      setStatus("MoneyPrinterTurbo 任务失败", "请展开 API 日志或检查素材 API 配置。", true);
    }
  } catch (error) {
    stopPolling();
    setStatus("任务轮询失败", error.message, true);
  } finally {
    updateButtons();
  }
}

function applyTaskMaterials(task = {}) {
  const materials = Array.isArray(task.localMaterials) && task.localMaterials.length
    ? task.localMaterials
    : Array.isArray(task.materials)
      ? task.materials
      : [];
  let lastMaterial = null;
  state.segments = state.segments.map((segment, index) => {
    const materialValue = materials[index] || lastMaterial || materials.find(Boolean) || "";
    const material = materialValue ? { url: String(materialValue), name: shortName(materialValue) } : null;
    if (material) lastMaterial = material;
    return {
      ...segment,
      material,
      materialReused: Boolean(material && !materials[index]),
      transition: chooseTransition(segment, state.segments[index + 1], material),
    };
  });
  renderTimeline();
  renderTask();
}

function bindPreviewVideo(task = {}) {
  const videoUrl = Array.isArray(task.combined_videos) && task.combined_videos[0]
    ? task.combined_videos[0]
    : Array.isArray(task.videos) && task.videos[0]
      ? task.videos[0]
      : "";
  if (videoUrl) {
    els.sourceVideo.src = videoUrl;
    els.sourceVideo.load();
    state.previewReady = true;
    els.empty.hidden = true;
  }
  if (state.handoff?.audio_url) {
    els.sourceAudio.src = state.handoff.audio_url;
    els.sourceAudio.load();
  }
  drawPreview();
}

async function renderFinalVideo() {
  if (!state.previewReady || !state.task) {
    setStatus("还不能下载", "请先完成自动匹配素材并预览。", true);
    return;
  }
  pausePreview();
  els.renderFinal.disabled = true;
  setProgress(4, "开始合成最终视频");
  try {
    const settings = currentSettings();
    const data = await postJson("/api/money-printer/render-final", {
      title: els.subject.value.trim() || state.handoff.title || "MoneyPrinter 视频",
      tts: state.handoff,
      text: state.handoff.text || state.handoff.final_text || "",
      task: state.task,
      background_video: state.task.localCombinedVideos?.[0] || state.task.combined_videos?.[0] || state.task.videos?.[0] || "",
      segments: state.segments,
      settings,
    });
    state.task = { ...state.task, finalVideoUrl: data.videoUrl, finalOutputPath: data.outputPath };
    renderTask();
    setProgress(100, "最终视频已保存到统一下载目录");
    setStatus("最终视频已生成", data.outputPath || "已保存。");
  } catch (error) {
    setStatus("最终合成失败", error.message, true);
    setProgress(0, error.message);
  } finally {
    els.renderFinal.disabled = false;
    updateButtons();
  }
}

function currentSettings() {
  const effect = state.effects.find((item) => item.id === els.effect.value) || state.effects[0] || {};
  return {
    effectId: els.effect.value || effect.id,
    aspectRatio: els.aspect.value || "9:16",
    frameRate: Number(els.frameRate.value) === 60 ? 60 : 30,
    ttsVolume: Number(els.ttsVolume.value || 100) / 100,
    showBottomSubtitles: els.bottomSubtitles.checked,
    effectParams: {
      ...(effect.defaultParams || {}),
      fontSize: Number(els.fontSize.value || 88),
      primaryColor: els.primaryColor.value || effect.primary || "#ffffff",
      accentColor: els.accentColor.value || effect.accent || "#ffd84d",
      maxLines: Number(els.maxLines.value || 2),
    },
  };
}

function savePreferences() {
  const settings = currentSettings();
  localStorage.setItem(PREF_KEY, JSON.stringify({
    effectId: settings.effectId,
    aspectRatio: settings.aspectRatio,
    frameRate: settings.frameRate,
    ttsVolume: Number(els.ttsVolume.value || 100),
    showBottomSubtitles: settings.showBottomSubtitles,
    transition: els.transition.value,
    source: els.source.value,
    subject: els.subject.value,
    effectParams: settings.effectParams,
  }));
}

function updateSettingOutputs() {
  els.fontSizeValue.textContent = els.fontSize.value;
  els.ttsVolumeValue.textContent = `${els.ttsVolume.value}%`;
  els.previewSpec.textContent = state.handoff
    ? `${state.segments.length} 段字幕 · ${els.aspect.value} · ${els.frameRate.value}fps`
    : "等待 TTS 三件套";
}

function drawPreview() {
  const canvas = els.canvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#05080d";
  ctx.fillRect(0, 0, width, height);
  const video = els.sourceVideo;
  if (state.previewReady && video?.readyState >= 2) {
    drawCover(ctx, video, width, height);
  }
  const segment = state.segments.find((item) => state.currentTime >= item.start && state.currentTime <= item.end);
  if (segment) drawSubtitle(ctx, segment, width, height);
  else if (!state.previewReady) drawCenteredText(ctx, hasConfirmedHandoff() ? "点击“自动匹配素材并预览”" : "等待 TTS 三件套", width, height);
  syncPreviewClock();
}

function drawCover(ctx, media, width, height) {
  const sourceWidth = media.videoWidth || 16;
  const sourceHeight = media.videoHeight || 9;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  try { ctx.drawImage(media, x, y, drawWidth, drawHeight); } catch {}
}

function drawSubtitle(ctx, segment, width, height) {
  const fontSize = Math.max(24, Math.round(Number(els.fontSize.value || 88) * width / 1080));
  const primary = els.primaryColor.value || "#ffffff";
  const accent = els.accentColor.value || "#ffd84d";
  const lines = wrapText(ctx, segment.text, Math.min(width * 0.82, fontSize * 11), fontSize, Number(els.maxLines.value || 2));
  const y = Math.round(height * 0.56 - ((lines.length - 1) * fontSize * 0.62));
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${fontSize}px "Microsoft YaHei", sans-serif`;
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,.65)";
  ctx.shadowBlur = Math.max(8, fontSize * 0.16);
  lines.forEach((line, index) => {
    const yy = y + index * fontSize * 1.18;
    ctx.lineWidth = Math.max(4, fontSize * 0.08);
    ctx.strokeStyle = "rgba(8,10,14,.92)";
    ctx.strokeText(line, width / 2, yy);
    ctx.fillStyle = keywordMatch(line, segment.keywords) ? accent : primary;
    ctx.fillText(line, width / 2, yy);
  });
  if (els.bottomSubtitles.checked) {
    ctx.font = `700 ${Math.max(18, Math.round(fontSize * 0.42))}px "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,.82)";
    ctx.lineWidth = 4;
    const bottom = truncateText(ctx, segment.text, width * 0.84);
    ctx.strokeText(bottom, width / 2, height * 0.92);
    ctx.fillText(bottom, width / 2, height * 0.92);
  }
  ctx.restore();
}

function drawCenteredText(ctx, text, width, height) {
  ctx.fillStyle = "#8793a8";
  ctx.font = '700 18px "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
}

function togglePreview() {
  if (!state.previewReady) return;
  if (state.playing) pausePreview();
  else playPreview();
}

function playPreview() {
  state.playing = true;
  state.startedAt = performance.now();
  state.startTime = state.currentTime;
  els.previewPlay.textContent = "暂停预览";
  try { els.sourceVideo.currentTime = state.currentTime; } catch {}
  try { els.sourceAudio.currentTime = state.currentTime; } catch {}
  els.sourceVideo.play().catch(() => {});
  els.sourceAudio.play().catch(() => {});
  tickPreview();
}

function pausePreview() {
  state.playing = false;
  els.previewPlay.textContent = "播放预览";
  els.sourceVideo?.pause();
  els.sourceAudio?.pause();
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
}

function restartPreview() {
  state.currentTime = 0;
  seekPreview(0);
  drawPreview();
}

function seekPreview(value) {
  const duration = previewDuration();
  const next = duration * Math.max(0, Math.min(1000, Number(value || 0))) / 1000;
  state.currentTime = next;
  state.startTime = next;
  state.startedAt = performance.now();
  try { els.sourceVideo.currentTime = next; } catch {}
  try { els.sourceAudio.currentTime = next; } catch {}
  drawPreview();
}

function tickPreview() {
  if (!state.playing) return;
  const duration = previewDuration();
  state.currentTime = Math.min(duration, state.startTime + (performance.now() - state.startedAt) / 1000);
  if (state.currentTime >= duration) pausePreview();
  drawPreview();
  state.raf = requestAnimationFrame(tickPreview);
}

function syncPreviewClock() {
  const duration = previewDuration();
  els.seek.value = String(duration > 0 ? Math.round((state.currentTime / duration) * 1000) : 0);
  els.currentTime.textContent = formatTime(state.currentTime);
  els.duration.textContent = formatTime(duration);
}

function previewDuration() {
  const audioDuration = Number(els.sourceAudio?.duration || 0);
  if (Number.isFinite(audioDuration) && audioDuration > 0) return audioDuration;
  return Math.max(0, ...state.segments.map((item) => Number(item.end || 0)), Number(state.handoff?.audio_duration || state.handoff?.duration || 0));
}

async function loadAssets() {
  try {
    const data = await fetchJson("/api/money-printer/assets");
    if (!data.apiOnline) {
      els.assets.innerHTML = "<p>API 启动后显示本地 BGM 和本地素材。</p>";
      return;
    }
    const bgm = Array.isArray(data.bgm) ? data.bgm : [];
    const materials = Array.isArray(data.materials) ? data.materials : [];
    els.assets.innerHTML = `
      <div><strong>BGM</strong><span>${bgm.length} 个</span></div>
      <div><strong>本地素材</strong><span>${materials.length} 个</span></div>
      <small>本地素材来自 MoneyPrinterTurbo 的 storage/local_videos 目录。</small>
    `;
  } catch {
    els.assets.innerHTML = "<p>素材列表读取失败。</p>";
  }
}

function hasConfirmedHandoff() {
  return Boolean(state.handoff?.id && state.handoff?.audio_path && String(state.handoff.alignment_status || "") === "confirmed" && state.segments.length);
}

function updateButtons() {
  const ready = hasConfirmedHandoff();
  els.submit.disabled = !ready || !state.status?.api?.online;
  els.renderFinal.disabled = !ready || !state.previewReady || !state.task;
}

function setStatus(title, detail = "", isError = false) {
  els.status.textContent = title;
  els.detail.textContent = detail;
  state.page.classList.toggle("money-printer-error", Boolean(isError));
}

function setProgress(value, stage = "等待开始") {
  const percent = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  els.progressFill.style.width = `${percent}%`;
  els.progressPercent.textContent = `${percent}%`;
  els.progressStage.textContent = stage;
}

function renderLogs(logs = []) {
  els.apiLogs.textContent = logs.length ? logs.slice(-80).join("\n") : "暂无 API 启动日志。";
}

function stopPolling() {
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.pollTimer = 0;
}

async function openTarget(target) {
  try {
    await postJson("/api/money-printer/open", { target });
  } catch (error) {
    setStatus("打开失败", error.message, true);
  }
}

function transitionPayloadValue() {
  const value = els.transition.value;
  if (value === "fade") return "FadeIn";
  if (value === "slide") return "SlideIn";
  if (value === "none") return "none";
  return "Shuffle";
}

function transitionLabel(value) {
  return ({ auto: "自动", fade: "交叉淡化", slide: "滑动", none: "无转场" })[value] || "自动";
}

function chooseTransition(segment, next, material) {
  const mode = els.transition.value;
  if (mode !== "auto") return transitionLabel(mode);
  if (!next) return "无转场";
  const sameTheme = keywordMatch(next.text, segment.keywords) || (material?.name && next.material?.name === material.name);
  return sameTheme ? "交叉淡化" : "滑动";
}

function automaticSearchTerm(text, payload = {}) {
  const source = `${payload.title || ""} ${payload.seo_title || ""} ${text || ""}`.toLowerCase();
  const map = [
    [/人工智能|ai|智能/u, "artificial intelligence technology"],
    [/英语|英文|单词/u, "english learning classroom"],
    [/数学|高考|考试|学习/u, "students studying classroom"],
    [/家长|孩子|老师|学校/u, "parent child school teacher"],
    [/金钱|财富|工资|赚钱/u, "money finance work"],
    [/工作|职场|公司|老板/u, "office work business"],
    [/健康|运动|身体/u, "healthy lifestyle exercise"],
    [/旅行|城市|生活/u, "city daily life people"],
    [/情绪|焦虑|压力/u, "emotional stress daily life"],
  ];
  const matched = map.find(([pattern]) => pattern.test(source));
  if (matched) return matched[1];
  const ascii = String(text || "").match(/[A-Za-z][A-Za-z0-9 -]{2,36}/g);
  if (ascii?.length) return ascii[0].trim().slice(0, 48);
  return "daily life people";
}

function inferKeywords(text) {
  const matches = String(text || "").match(/[\u4e00-\u9fff]{2,6}|[A-Za-z0-9%]{3,}/gu) || [];
  return [...new Set(matches)].slice(0, 2);
}

function matchedMaterialCount() {
  return state.segments.filter((item) => item.material).length;
}

function readJsonStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
}

function setSelectValue(select, value) {
  if (!select) return;
  const text = String(value || "");
  if ([...select.options].some((option) => option.value === text)) select.value = text;
}

function formatTime(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function wrapText(ctx, text, maxWidth, fontSize, maxLines = 2) {
  ctx.font = `800 ${fontSize}px "Microsoft YaHei", sans-serif`;
  const chars = [...String(text || "")];
  const lines = [];
  let line = "";
  for (const char of chars) {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth && lines.length < maxLines - 1) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function truncateText(ctx, text, maxWidth) {
  let value = String(text || "");
  while (value.length > 4 && ctx.measureText(value).width > maxWidth) value = `${value.slice(0, -2)}…`;
  return value;
}

function keywordMatch(text, keywords = []) {
  const source = String(text || "");
  return (keywords || []).some((keyword) => keyword && source.includes(keyword));
}

function drawSafeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shortName(value) {
  return String(value || "").split(/[\\/]/).pop() || String(value || "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
