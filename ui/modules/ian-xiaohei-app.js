const state = {
  config: null,
  plan: null,
  ttsJob: null,
  selectedTtsJob: null,
  audioJobs: [],
  images: [],
  outputDir: "",
  promptsText: "",
  voiceChoices: new Map(),
  savedApis: [],
  musicPresets: [],
  selectedMusic: null,
  referenceProfile: null,
  referenceCloneDraft: null,
  referenceStylePresets: [],
  pendingUploads: new Map(),
  confirmingUploads: new Set(),
  generatingImages: new Set(),
  imageBatchGenerating: false,
  imageBatchProgress: null,
  localImagePickerActive: false,
  lastStablePlan: null,
  buttonFeedbackTimers: new Map(),
  previewImageCache: new Map(),
  previewFrame: 0,
  renderedVideo: null,
  backgroundAudio: null,
  projectId: localStorage.getItem("ian-xiaohei-project-id") || `xiaohei-${Date.now()}`,
};
const embeddedMode = new URLSearchParams(window.location.search).get("embedded") === "1";
localStorage.setItem("ian-xiaohei-project-id", state.projectId);
const PROMPT_PLAN_CACHE_VERSION = 2;
const PROMPT_PLAN_CACHE_PREFIX = "ian-xiaohei-prompt-plan";
const PROMPT_PLAN_LATEST_KEY = `${PROMPT_PLAN_CACHE_PREFIX}:latest`;
const PURPOSE_STORAGE_KEY = "ian-xiaohei-selected-purpose";
const COMPOSE_SETTINGS_KEY = "ian-xiaohei-compose-settings-v1";

function startStandalonePageSession() {
  if (embeddedMode) return;
  const sessionId = `xiaohei-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let pageExitReason = "close";
  const markReload = () => {
    pageExitReason = "reload";
    window.setTimeout(() => { pageExitReason = "close"; }, 2000);
  };
  const postSession = (url, keepalive = false, details = {}) => {
    const body = JSON.stringify({ sessionId, ...details });
    if (keepalive && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive,
    }).catch(() => {});
  };
  window.navigation?.addEventListener?.("navigate", (event) => {
    if (event.navigationType === "reload") markReload();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r")) markReload();
  }, true);
  postSession("/api/page-open");
  setInterval(() => postSession("/api/heartbeat"), 3000);
  window.addEventListener("pagehide", () => postSession("/api/page-close", true, { reason: pageExitReason }));
  window.addEventListener("pageshow", (event) => {
    pageExitReason = "close";
    if (event.persisted) postSession("/api/page-open");
  });
}

startStandalonePageSession();

const PURPOSE_TEMPLATE_META = {
  article: {
    name: "小黑 Skill · 纯白手绘解释图",
    description: "白纸、黑色小人、橙色流程线，适合正文拆解。",
    tags: ["正文", "手绘"],
    accent: "#f0bd69",
    line: "#71d7ff",
    visual: "xiaohei",
    previewImage: "/assets/xiaohei-skills/ian-xiaohei-illustrations.webp",
  },
  "xiaohei-scenes": {
    name: "小黑实物场景 · ian-xiaohei-scenes",
    description: "用纸片、按钮、门和小装置，把歌词段落变成具体场景。",
    tags: ["实物", "场景"],
    accent: "#58c4dd",
    line: "#f0bd69",
    visual: "scenes",
    previewImage: "/assets/xiaohei-skills/ian-xiaohei-scenes.webp",
  },
  "visual-ip": {
    name: "视觉 IP · visual-ip-illustrations",
    description: "统一角色和手势语言，适合做连续视频里的识别点。",
    tags: ["IP", "角色"],
    accent: "#ff8bb3",
    line: "#72d5b7",
    visual: "ip",
    previewImage: "/assets/xiaohei-skills/visual-ip-illustrations.webp",
  },
  littlebox: {
    name: "小盒 · 5km-littlebox",
    description: "小盒子、格子和局部空间，适合解释结构和关系。",
    tags: ["小盒", "结构"],
    accent: "#9dd36a",
    line: "#71d7ff",
    visual: "box",
    previewImage: "/assets/xiaohei-skills/littlebox-illustrations.webp",
  },
  "stick-figure": {
    name: "火柴人 · stick-figure",
    description: "线条更轻，动作更直接，适合节奏快的分镜表达。",
    tags: ["火柴人", "分镜"],
    accent: "#f6d764",
    line: "#ff7068",
    visual: "stick",
    previewImage: "/assets/xiaohei-skills/stick-figure-illustrations.webp",
  },
  "handdrawn-tech": {
    name: "手绘技术页 · handdrawn-tech",
    description: "粗线页面、输入输出和标注线，适合工具/AI/流程题材。",
    tags: ["技术", "页面"],
    accent: "#71d7ff",
    line: "#72d5b7",
    visual: "tech",
    previewImage: "/assets/xiaohei-skills/handdrawn-tech-illustrations.webp",
  },
  "ian-handdrawn-ppt": {
    name: "Ian 手绘 PPT · handdrawn-ppt",
    description: "更像手绘演示页，中心图更强，适合方法论拆解。",
    tags: ["PPT", "手绘"],
    accent: "#c7a6ff",
    line: "#f0bd69",
    visual: "ppt",
    previewImage: "/assets/xiaohei-skills/ian-handdrawn-ppt.webp",
  },
  capybara: {
    name: "松弛水豚 · capybara",
    description: "情绪更松弛，适合温和吐槽、陪伴感和轻反差内容。",
    tags: ["松弛", "情绪"],
    accent: "#d5a05f",
    line: "#72d5b7",
    visual: "capybara",
    previewImage: "/assets/xiaohei-skills/capybara-illustrations.webp",
  },
  wechat: {
    name: "公众号配图 · 图文叙事",
    description: "更像文章内页配图，留白更稳，适合长文段落。",
    tags: ["公众号", "图文"],
    accent: "#72d5b7",
    line: "#f0bd69",
    visual: "wechat",
  },
  knowledge: {
    name: "知识观点 · 认知锚点",
    description: "突出判断、问题和反差，适合观点类短视频。",
    tags: ["观点", "解释"],
    accent: "#806bff",
    line: "#72d5b7",
    visual: "knowledge",
  },
  workflow: {
    name: "方法流程 · 系统装置",
    description: "输入、处理、输出的流程感更强，适合方法论。",
    tags: ["流程", "系统"],
    accent: "#71d7ff",
    line: "#f0bd69",
    visual: "workflow",
  },
  "cover-reference": {
    name: "封面参考 · 强钩子画面",
    description: "更强调第一眼冲突和核心物件，可做封面参考。",
    tags: ["封面", "钩子"],
    accent: "#ff7068",
    line: "#806bff",
    visual: "cover",
  },
};

const els = {
  titleInput: document.querySelector("#titleInput"),
  minimaxStatus: document.querySelector("#minimaxStatus"),
  minimaxApiKey: document.querySelector("#minimaxApiKey"),
  minimaxModel: document.querySelector("#minimaxModel"),
  savedApiSelect: document.querySelector("#savedApiSelect"),
  savedApiDetail: document.querySelector("#savedApiDetail"),
  saveMinimaxSettings: document.querySelector("#saveMinimaxSettings"),
  testMinimaxSettings: document.querySelector("#testMinimaxSettings"),
  deleteMinimaxApi: document.querySelector("#deleteMinimaxApi"),
  integrationStatus: document.querySelector("#integrationStatus"),
  copyInput: document.querySelector("#copyInput"),
  voiceSelect: document.querySelector("#voiceSelect"),
  emotionSelect: document.querySelector("#emotionSelect"),
  speedSelect: document.querySelector("#speedSelect"),
  aspectRatioSelect: document.querySelector("#aspectRatioSelect"),
  frameRate: document.querySelector("#xiaoheiFrameRate"),
  imageFit: document.querySelector("#xiaoheiImageFit"),
  ttsVolume: document.querySelector("#xiaoheiTtsVolume"),
  ttsVolumeValue: document.querySelector("#xiaoheiTtsVolumeValue"),
  chooseBgm: document.querySelector("#chooseXiaoheiBgm"),
  bgmFile: document.querySelector("#xiaoheiBgmFile"),
  bgmName: document.querySelector("#xiaoheiBgmName"),
  bgmVolume: document.querySelector("#xiaoheiBgmVolume"),
  bgmVolumeValue: document.querySelector("#xiaoheiBgmVolumeValue"),
  showSubtitles: document.querySelector("#xiaoheiShowSubtitles"),
  subtitleSize: document.querySelector("#xiaoheiSubtitleSize"),
  subtitleSizeValue: document.querySelector("#xiaoheiSubtitleSizeValue"),
  subtitleColor: document.querySelector("#xiaoheiSubtitleColor"),
  keywordColor: document.querySelector("#xiaoheiKeywordColor"),
  subtitleLines: document.querySelector("#xiaoheiSubtitleLines"),
  subtitleSpeed: document.querySelector("#xiaoheiSubtitleSpeed"),
  subtitleSpeedValue: document.querySelector("#xiaoheiSubtitleSpeedValue"),
  subtitleOutline: document.querySelector("#xiaoheiSubtitleOutline"),
  subtitleShadow: document.querySelector("#xiaoheiSubtitleShadow"),
  introEnabled: document.querySelector("#xiaoheiIntroEnabled"),
  introPreset: document.querySelector("#xiaoheiIntroPreset"),
  introText: document.querySelector("#xiaoheiIntroText"),
  outroEnabled: document.querySelector("#xiaoheiOutroEnabled"),
  outroPreset: document.querySelector("#xiaoheiOutroPreset"),
  outroText: document.querySelector("#xiaoheiOutroText"),
  purposeSelect: document.querySelector("#purposeSelect"),
  voiceDescription: document.querySelector("#voiceDescription"),
  previewVoice: document.querySelector("#previewVoice"),
  setDefaultVoice: document.querySelector("#setDefaultVoice"),
  deleteVoice: document.querySelector("#deleteVoice"),
  localAudioInput: document.querySelector("#localAudioInput"),
  musicPreset: document.querySelector("#musicPreset"),
  musicPromptExtra: document.querySelector("#musicPromptExtra"),
  musicLyrics: document.querySelector("#musicLyrics"),
  generateMusic: document.querySelector("#generateMusic"),
  referenceStyleSelect: document.querySelector("#referenceStyleSelect"),
  setDefaultReferenceStyle: document.querySelector("#setDefaultReferenceStyle"),
  deleteReferenceStyle: document.querySelector("#deleteReferenceStyle"),
  musicStatus: document.querySelector("#musicStatus"),
  musicPreviewPanel: document.querySelector("#musicPreviewPanel"),
  musicPreviewTitle: document.querySelector("#musicPreviewTitle"),
  musicPreview: document.querySelector("#musicPreview"),
  referenceAudioInput: document.querySelector("#referenceAudioInput"),
  referenceCloneName: document.querySelector("#referenceCloneName"),
  referenceCloneConsent: document.querySelector("#referenceCloneConsent"),
  analyzeReferenceAudio: document.querySelector("#analyzeReferenceAudio"),
  createReferenceClone: document.querySelector("#createReferenceClone"),
  confirmReferenceClone: document.querySelector("#confirmReferenceClone"),
  discardReferenceClone: document.querySelector("#discardReferenceClone"),
  referenceCloneControls: document.querySelector("#referenceCloneControls"),
  referenceCloneDefault: document.querySelector("#referenceCloneDefault"),
  referenceProfile: document.querySelector("#referenceProfile"),
  referenceClonePreviewPanel: document.querySelector("#referenceClonePreviewPanel"),
  referenceClonePreviewTitle: document.querySelector("#referenceClonePreviewTitle"),
  referenceClonePreview: document.querySelector("#referenceClonePreview"),
  generateAudio: document.querySelector("#generateAudio"),
  confirmAudio: document.querySelector("#confirmAudio"),
  audioPreviewPanel: document.querySelector("#audioPreviewPanel"),
  audioPreviewTitle: document.querySelector("#audioPreviewTitle"),
  audioPreview: document.querySelector("#audioPreview"),
  audioJobs: document.querySelector("#audioJobs"),
  generateImages: document.querySelector("#generateImages"),
  planPrompts: document.querySelector("#planPrompts"),
  copyPrompts: document.querySelector("#copyPrompts"),
  openOutputDir: document.querySelector("#openOutputDir"),
  refreshOutputs: document.querySelector("#refreshOutputs"),
  statusLabel: document.querySelector("#statusLabel"),
  statusDetail: document.querySelector("#statusDetail"),
  progressStep: document.querySelector("#progressStep"),
  progressPercent: document.querySelector("#progressPercent"),
  progressBar: document.querySelector("#progressBar"),
  promptResults: document.querySelector("#promptResults"),
  outputHistory: document.querySelector("#outputHistory"),
  outputHistoryPanel: document.querySelector("#outputHistoryPanel"),
  outputHistoryCount: document.querySelector("#outputHistoryCount"),
  outputDirLabel: document.querySelector("#outputDirLabel"),
  planCount: document.querySelector("#planCount"),
  videoPreview: document.querySelector("#xiaoheiVideoPreview"),
  videoPreviewStage: document.querySelector("#xiaoheiVideoStage"),
  videoPreviewCanvas: document.querySelector("#xiaoheiVideoCanvas"),
  videoPreviewEmpty: document.querySelector("#videoPreviewEmpty"),
  videoPreviewSpec: document.querySelector("#videoPreviewSpec"),
  videoPreviewPlay: document.querySelector("#videoPreviewPlay"),
  videoPreviewRestart: document.querySelector("#videoPreviewRestart"),
  videoPreviewSeek: document.querySelector("#videoPreviewSeek"),
  videoPreviewCurrent: document.querySelector("#videoPreviewCurrent"),
  videoPreviewDuration: document.querySelector("#videoPreviewDuration"),
  videoTransitionMode: document.querySelector("#videoTransitionMode"),
  videoRenderStatus: document.querySelector("#videoRenderStatus"),
  downloadXiaoheiVideo: document.querySelector("#downloadXiaoheiVideo"),
  timelineRefresh: document.querySelector("#xiaoheiTimelineRefresh"),
  timelineRuleStatus: document.querySelector("#xiaoheiTimelineRuleStatus"),
  subtitleTimeline: document.querySelector("#xiaoheiSubtitleTimeline"),
  timelineStatus: document.querySelector("#xiaoheiTimelineStatus"),
  templateGrid: document.querySelector("#xiaoheiTemplateGrid"),
  templateSummary: document.querySelector("#xiaoheiTemplateSummary"),
  ttsSourcePill: document.querySelector("#ttsSourcePill"),
  ttsSourceTitle: document.querySelector("#ttsSourceTitle"),
  ttsSourceMeta: document.querySelector("#ttsSourceMeta"),
  ttsSourceText: document.querySelector("#ttsSourceText"),
};

init().catch((error) => setStatus("初始化失败", error.message || String(error), 0, true));

async function init() {
  if (embeddedMode) document.body.classList.add("embedded-production-mode");
  hydratePurposeSelect();
  renderPurposeTemplates();
  bindEvents();
  restoreComposeSettings();
  window.addEventListener("message", handleParentHandoff);
  window.addEventListener("focus", () => {
    if (state.localImagePickerActive) setTimeout(() => { state.localImagePickerActive = false; }, 250);
  });
  await Promise.all([loadConfig(), loadAudioJobs()]);
  const restored = restorePromptPlanCache();
  if (restored) {
    setStatus("已恢复提示词计划", `刷新前生成的 ${state.plan?.shots?.length || 0} 个分镜提示词已恢复。`, 100, false, "本地缓存");
  }
  void loadOutputs().catch(() => {});
  if (embeddedMode) window.parent.postMessage({ type: "video-factory:xiaohei-ready" }, window.location.origin);
}

async function handleParentHandoff(event) {
  if (event.origin !== window.location.origin || event.data?.type !== "video-factory:xiaohei-handoff") return;
  const handoff = event.data.handoff || {};
  const job = handoff.ttsJob || {};
  if (!job.id || job.status !== "completed" || !isTtsAlignmentConfirmed(job)) {
    setStatus("缺少已确认音频", "请先在 TTS 语音页检查并确认最终文案和字幕时间轴。", 0, true);
    return;
  }
  state.projectId = String(handoff.projectId || state.projectId);
  localStorage.setItem("ian-xiaohei-project-id", state.projectId);
  const handoffTitle = handoff.title || handoff.projectTitle || "小黑配图视频";
  const handoffText = handoff.text || confirmedTtsText(job);
  els.titleInput.value = handoffTitle;
  els.copyInput.value = handoffText;
  state.ttsJob = job;
  try {
    const data = await fetchJson("/api/ian-xiaohei/audio-select", {
      method: "POST",
      body: JSON.stringify({ project_id: state.projectId, job_id: job.id }),
    });
    state.selectedTtsJob = data.job;
    state.ttsJob = data.job;
    syncTtsSource(data.job, { title: handoffTitle, text: handoffText });
    resetVisualWorkflow();
    await loadAudioJobs();
    const restored = false;
    setStatus(
      restored ? "已恢复提示词计划" : "已接收 TTS 资产",
      restored
        ? `刷新前生成的 ${state.plan?.shots?.length || 0} 个分镜提示词已恢复。`
        : "文案、音频和同步时间戳已绑定，可以根据真实时间轴分析分镜配图。",
      100,
      false,
      restored ? "本地缓存" : "等待分镜分析",
    );
  } catch (error) {
    setStatus("TTS 资产接收失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

function syncTtsSource(job, { title = "", text = "" } = {}) {
  if (!job) {
    if (els.ttsSourcePill) els.ttsSourcePill.textContent = "等待 TTS 发送";
    if (els.ttsSourceTitle) els.ttsSourceTitle.textContent = "还没有绑定 TTS 音频";
    if (els.ttsSourceMeta) els.ttsSourceMeta.textContent = "请先在 TTS 语音页生成并确认字幕时间轴，然后发送到小黑配图软件。";
    if (els.ttsSourceText) els.ttsSourceText.textContent = "收到后，这里会显示 TTS 最终文案，不在本页手动输入。";
    renderSubtitleTimeline(null);
    hideAudio();
    return;
  }
  const finalText = String(text || confirmedTtsText(job) || job.text || "").trim();
  const titleText = String(title || els.titleInput?.value || job.title || job.seo_title || job.voice_name || `TTS 音频 #${job.id}`).trim();
  if (els.titleInput) els.titleInput.value = titleText;
  if (els.copyInput) els.copyInput.value = finalText;
  const timeline = Array.isArray(job.subtitle_timeline) ? job.subtitle_timeline : [];
  const duration = Number(job.audio_duration || job.metadata?.audio_duration || job.duration || 0);
  if (els.ttsSourcePill) els.ttsSourcePill.textContent = "已绑定 TTS";
  if (els.ttsSourceTitle) els.ttsSourceTitle.textContent = titleText || `TTS 音频 #${job.id}`;
  if (els.ttsSourceMeta) {
    els.ttsSourceMeta.textContent = [
      `音频 #${job.id}`,
      job.voice_name || job.provider || "",
      duration > 0 ? `${duration.toFixed(1)} 秒` : "",
      timeline.length ? `${timeline.length} 段同步字幕` : "已确认同步时间轴",
    ].filter(Boolean).join(" · ");
  }
  if (els.ttsSourceText) els.ttsSourceText.textContent = finalText || "这条 TTS 资产暂时没有最终文案。";
  showAudio(job.audio_url || `/api/tts/audio?id=${job.id}`, `已绑定 TTS 音频 #${job.id}`);
  renderSubtitleTimeline(job);
}

function timelineSource(job = state.selectedTtsJob || state.ttsJob) {
  if (!job) return [];
  if (Array.isArray(job.subtitle_timeline) && job.subtitle_timeline.length) return job.subtitle_timeline;
  if (Array.isArray(job.sentence_timeline) && job.sentence_timeline.length) return job.sentence_timeline;
  if (Array.isArray(job.metadata?.subtitle_timeline) && job.metadata.subtitle_timeline.length) return job.metadata.subtitle_timeline;
  if (Array.isArray(job.metadata?.sentence_timeline) && job.metadata.sentence_timeline.length) return job.metadata.sentence_timeline;
  return [];
}

function normalizeTimelineRow(item = {}, index = 0) {
  const start = Number(item.start ?? item.startTime ?? item.from ?? 0);
  const end = Number(item.end ?? item.endTime ?? item.to ?? start);
  const keywords = Array.isArray(item.keywords)
    ? item.keywords.join("，")
    : String(item.keywords || item.keyword || item.focus || item.keywords_text || "");
  const position = item.position && typeof item.position === "object"
    ? [item.position.x, item.position.y].filter((value) => value !== undefined && value !== "").join(",")
    : String(item.position || item.xy || item.subtitlePosition || "");
  return {
    index,
    start: Number.isFinite(start) ? start : 0,
    end: Number.isFinite(end) ? end : 0,
    text: String(item.text || item.subtitle || item.sentence || ""),
    keywords,
    breakAt: String(item.breakAt || item.break_at || item.lineBreak || ""),
    position,
    color: String(item.color || item.subtitleColor || els.subtitleColor?.value || "#ffffff"),
  };
}

function timelineRows(job = state.selectedTtsJob || state.ttsJob) {
  return timelineSource(job).map((item, index) => normalizeTimelineRow(item, index));
}

function formatTimelineValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function renderSubtitleTimeline(job = state.selectedTtsJob || state.ttsJob) {
  if (!els.subtitleTimeline) return;
  const rows = timelineRows(job);
  if (!job) {
    els.subtitleTimeline.className = "xiaohei-subtitle-timeline empty";
    els.subtitleTimeline.textContent = "等待 TTS 语音页发送已确认的字幕时间轴。";
    if (els.timelineStatus) els.timelineStatus.textContent = "小黑页面只接收 TTS 语音页发送的最终文案、音频和同步时间戳。";
    if (els.timelineRuleStatus) els.timelineRuleStatus.hidden = true;
    return;
  }
  if (!rows.length) {
    els.subtitleTimeline.className = "xiaohei-subtitle-timeline empty";
    els.subtitleTimeline.textContent = "这条 TTS 资产暂时没有字幕时间轴，请回到 TTS 语音页重新识别后再发送。";
    if (els.timelineStatus) els.timelineStatus.textContent = "缺少字幕时间轴。";
    if (els.timelineRuleStatus) els.timelineRuleStatus.hidden = true;
    return;
  }
  els.subtitleTimeline.className = "xiaohei-subtitle-timeline";
  els.subtitleTimeline.innerHTML = rows.map((row) => `
    <div class="xiaohei-timeline-row" data-row-index="${row.index}">
      <span class="xiaohei-row-index">${row.index + 1}</span>
      <input data-field="start" inputmode="decimal" value="${escapeAttr(formatTimelineValue(row.start))}" readonly aria-readonly="true" />
      <input data-field="end" inputmode="decimal" value="${escapeAttr(formatTimelineValue(row.end))}" readonly aria-readonly="true" />
      <textarea data-field="text" rows="2">${escapeHtml(row.text)}</textarea>
      <input data-field="keywords" value="${escapeAttr(row.keywords)}" />
      <input data-field="breakAt" placeholder="如 6,12" value="${escapeAttr(row.breakAt)}" />
      <input data-field="position" placeholder="如 5,88" value="${escapeAttr(row.position)}" />
      <input data-field="color" type="color" value="${escapeAttr(/^#[0-9a-f]{6}$/i.test(row.color) ? row.color : "#ffffff")}" />
    </div>
  `).join("");
  const duration = Math.max(0, ...rows.map((row) => Number(row.end || 0)));
  if (els.timelineStatus) els.timelineStatus.textContent = `共 ${rows.length} 段字幕 / ${duration.toFixed(1)} 秒，修改字幕文字后会同步小黑文案和分镜输入。`;
  updateTimelineRuleStatus(rows);
}

function updateTimelineRuleStatus(rows = timelineRows()) {
  if (!els.timelineRuleStatus) return;
  const longRows = rows
    .map((row, index) => ({ index: index + 1, length: String(row.text || "").length }))
    .filter((row) => row.length > 32);
  if (!longRows.length) {
    els.timelineRuleStatus.hidden = true;
    els.timelineRuleStatus.textContent = "";
    return;
  }
  els.timelineRuleStatus.hidden = false;
  els.timelineRuleStatus.textContent = `时间轴规则提醒：第 ${longRows.slice(0, 4).map((row) => row.index).join("、")} 条字幕偏长，建议按语义拆短。`;
}

function collectSubtitleTimelineRows() {
  return [...(els.subtitleTimeline?.querySelectorAll(".xiaohei-timeline-row") || [])].map((row, index) => {
    const value = (field) => row.querySelector(`[data-field="${field}"]`)?.value || "";
    return normalizeTimelineRow({
      start: value("start"),
      end: value("end"),
      text: value("text"),
      keywords: value("keywords"),
      breakAt: value("breakAt"),
      position: value("position"),
      color: value("color"),
    }, index);
  });
}

function applySubtitleTimelineRows(rows = []) {
  const timeline = rows.map((row) => ({
    start: row.start,
    end: row.end,
    text: row.text,
    keywords: row.keywords.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean),
    breakAt: row.breakAt,
    position: row.position,
    color: row.color,
  }));
  const finalText = rows.map((row) => row.text.trim()).filter(Boolean).join("");
  [state.selectedTtsJob, state.ttsJob].filter(Boolean).forEach((job) => {
    job.subtitle_timeline = timeline;
    job.sentence_timeline = timeline;
    job.final_text = finalText || job.final_text || job.text || "";
    job.text = finalText || job.text || "";
    job.metadata = {
      ...(job.metadata || {}),
      subtitle_timeline: timeline,
      sentence_timeline: timeline,
      final_text: finalText || job.metadata?.final_text || "",
    };
  });
  if (els.copyInput) els.copyInput.value = finalText;
  if (els.ttsSourceText) els.ttsSourceText.textContent = finalText || "这条 TTS 资产暂时没有最终文案。";
  updateTimelineRuleStatus(rows);
  if (state.plan?.shots?.length) resetVisualWorkflow("字幕时间轴已修改，请重新按 TTS 时间轴分析分镜配图。");
}

function handleSubtitleTimelineInput(event) {
  if (!event.target.closest("[data-field]")) return;
  const rows = collectSubtitleTimelineRows();
  applySubtitleTimelineRows(rows);
  if (els.timelineStatus) els.timelineStatus.textContent = `已同步 ${rows.length} 段字幕到小黑当前文案。`;
}

async function persistSharedSubtitleText() {
  const job = state.selectedTtsJob || state.ttsJob;
  const rows = collectSubtitleTimelineRows();
  if (!job?.id || !rows.length) return;
  if (els.timelineStatus) els.timelineStatus.textContent = "正在自动保存字幕...";
  try {
    const timeline = rows.map((row) => ({
      start: row.start,
      end: row.end,
      text: row.text.trim(),
    }));
    const finalText = timeline.map((row) => row.text).join("");
    const data = await fetchJson("/api/tts/alignment/sync", {
      method: "POST",
      body: JSON.stringify({
        id: job.id,
        title: els.titleInput?.value || job.title || "",
        text: finalText,
        sentenceTimeline: timeline,
        subtitleTimeline: timeline,
        duration: Number(job.audio_duration || job.duration || 0),
        source: "xiaohei-video",
        confirmationMode: "shared_production_timeline",
      }),
    });
    state.selectedTtsJob = data.job;
    state.ttsJob = data.job;
    syncTtsSource(data.job, { title: els.titleInput?.value || "", text: data.job?.final_text || finalText });
    if (embeddedMode) {
      window.parent.postMessage({
        type: "video-factory:xiaohei-shared-timeline-updated",
        payload: data.job,
      }, window.location.origin);
    }
    if (els.timelineStatus) els.timelineStatus.textContent = `已自动保存 ${timeline.length} 段字幕，原时间戳保持不变。`;
  } catch (error) {
    if (els.timelineStatus) els.timelineStatus.textContent = `自动保存失败：${error.payload?.message || error.message || error}`;
  }
}

async function refreshSubtitleTimelineFromTts() {
  const job = state.selectedTtsJob || state.ttsJob;
  if (!job?.id) {
    setStatus("缺少 TTS 资产", "请先从 TTS 语音页发送已确认的文案、音频和字幕时间轴。", 0, true);
    setButtonFeedback(els.timelineRefresh, "error", "缺少 TTS");
    return;
  }
  setButtonFeedback(els.timelineRefresh, "loading", "同步中");
  try {
    const data = await fetchJson(`/api/ian-xiaohei/tts-job?id=${encodeURIComponent(job.id)}`);
    state.selectedTtsJob = data.job;
    state.ttsJob = data.job;
    syncTtsSource(data.job, { title: els.titleInput?.value || "", text: confirmedTtsText(data.job) });
    resetVisualWorkflow("已同步最新字幕时间轴，请重新分析分镜配图。");
    setButtonFeedback(els.timelineRefresh, "success", "已同步");
  } catch (error) {
    setStatus("同步时间轴失败", error.payload?.message || error.message || String(error), 0, true);
    setButtonFeedback(els.timelineRefresh, "error", "同步失败");
  }
}

function bindEvents() {
  els.planPrompts.addEventListener("click", () => createPlan());
  els.saveMinimaxSettings.addEventListener("click", () => saveMinimaxSettings());
  els.testMinimaxSettings.addEventListener("click", () => testMinimaxSettings());
  els.deleteMinimaxApi.addEventListener("click", () => deleteMinimaxApi());
  els.generateImages.addEventListener("click", () => generateCompleteWorkflow());
  els.timelineRefresh?.addEventListener("click", () => refreshSubtitleTimelineFromTts());
  els.subtitleTimeline?.addEventListener("input", handleSubtitleTimelineInput);
  els.subtitleTimeline?.addEventListener("focusout", (event) => {
    if (event.target.matches('[data-field="text"]')) persistSharedSubtitleText();
  });
  els.generateAudio.addEventListener("click", () => generateAudioOnly());
  els.confirmAudio.addEventListener("click", () => confirmCurrentAudio());
  els.generateMusic.addEventListener("click", () => generateMusicMaterial());
  els.analyzeReferenceAudio.addEventListener("click", () => analyzeReferenceAudio());
  els.createReferenceClone.addEventListener("click", () => createReferenceClone());
  els.confirmReferenceClone.addEventListener("click", () => confirmReferenceClone());
  els.discardReferenceClone.addEventListener("click", () => discardReferenceClone());
  els.setDefaultReferenceStyle.addEventListener("click", () => setCurrentReferenceStyleDefault());
  els.deleteReferenceStyle.addEventListener("click", () => deleteCurrentReferenceStyle());
  els.musicPreset.addEventListener("change", () => {
    renderSelectedMusicStatus(state.config?.music || {});
  });
  els.previewVoice.addEventListener("click", () => previewCurrentVoice());
  els.setDefaultVoice.addEventListener("click", () => setCurrentVoiceDefault());
  els.deleteVoice.addEventListener("click", () => deleteCurrentVoice());
  els.voiceSelect.addEventListener("change", () => renderVoiceDescription());
  els.savedApiSelect.addEventListener("change", () => renderSavedApiDetail());
  els.aspectRatioSelect.addEventListener("change", () => resetVisualWorkflow("视频比例已改变，请重新生成分镜计划。"));
  els.chooseBgm.addEventListener("click", () => els.bgmFile.click());
  els.bgmFile.addEventListener("change", (event) => uploadXiaoheiBgm(event.target.files?.[0]));
  for (const element of [els.frameRate, els.imageFit, els.showSubtitles, els.subtitleColor, els.keywordColor, els.subtitleLines, els.subtitleOutline, els.subtitleShadow, els.introEnabled, els.introPreset, els.introText, els.outroEnabled, els.outroPreset, els.outroText]) {
    element.addEventListener("change", handleComposeSettingsChange);
  }
  for (const element of [els.ttsVolume, els.bgmVolume, els.subtitleSize, els.subtitleSpeed]) {
    element.addEventListener("input", handleComposeSettingsChange);
  }
  els.purposeSelect.addEventListener("change", () => {
    localStorage.setItem(PURPOSE_STORAGE_KEY, els.purposeSelect.value || "article");
    renderPurposeTemplates();
    resetVisualWorkflow("视觉模板已改变，请重新生成分镜计划。");
  });
  els.copyPrompts.addEventListener("click", () => copyAllPrompts());
  els.openOutputDir.addEventListener("click", () => openOutputDir());
  els.refreshOutputs.addEventListener("click", () => loadOutputs());
  els.audioJobs.addEventListener("click", handleAudioJobAction);
  els.promptResults.addEventListener("click", handlePromptAction);
  els.promptResults.addEventListener("change", handlePromptFileChange);
  els.promptResults.addEventListener("toggle", handlePromptDetailsToggle, true);
  els.outputHistory.addEventListener("click", handleOutputHistoryAction);
  els.videoPreviewPlay.addEventListener("click", toggleVideoPreviewPlayback);
  els.videoPreviewRestart.addEventListener("click", restartVideoPreview);
  els.videoPreviewStage.addEventListener("click", toggleVideoPreviewPlayback);
  els.videoPreviewSeek.addEventListener("input", seekVideoPreview);
  els.videoTransitionMode.addEventListener("change", () => {
    state.renderedVideo = null;
    updateVideoDownloadState();
    drawVideoPreview();
  });
  els.downloadXiaoheiVideo.addEventListener("click", downloadRenderedVideo);
  els.audioPreview.addEventListener("play", startVideoPreviewLoop);
  els.audioPreview.addEventListener("pause", stopVideoPreviewLoop);
  els.audioPreview.addEventListener("ended", stopVideoPreviewLoop);
  els.audioPreview.addEventListener("loadedmetadata", syncVideoPreview);
  els.audioPreview.addEventListener("timeupdate", syncVideoPreviewTime);
}

async function loadConfig() {
  const data = await fetchJson("/api/ian-xiaohei/config");
  state.config = data;
  state.outputDir = data.outputDir || "";
  els.outputDirLabel.textContent = state.outputDir;
  const preferredPurpose = els.purposeSelect.value || localStorage.getItem(PURPOSE_STORAGE_KEY) || "article";
  els.purposeSelect.innerHTML = (data.purposes || [])
    .map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
  if ([...els.purposeSelect.options].some((option) => option.value === preferredPurpose)) {
    els.purposeSelect.value = preferredPurpose;
  }
  renderPurposeTemplates();
  els.aspectRatioSelect.innerHTML = (data.aspectRatios || [{ id: "16:9", label: "16:9 横版（默认）" }])
    .map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === "16:9" ? "selected" : ""}>${escapeHtml(item.label)}</option>`)
    .join("");
  els.emotionSelect.innerHTML = (data.tts?.emotions || ["自然"])
    .map((item) => `<option value="${escapeAttr(item)}" ${item === "自然" ? "selected" : ""}>${escapeHtml(item)}</option>`)
    .join("");
  els.speedSelect.innerHTML = (data.tts?.speeds || [1])
    .map((speed) => `<option value="${speed}" ${Number(speed) === 1 ? "selected" : ""}>${Number(speed).toFixed(1)}×</option>`)
    .join("");
  els.minimaxStatus.textContent = data.tts?.minimaxConfigured
    ? "已配置，可生成配音和固化试听样音"
    : "未配置，请填写 API Key";
  els.minimaxStatus.className = data.tts?.minimaxConfigured ? "success" : "error";
  els.minimaxModel.value = data.tts?.minimaxModel || "speech-2.6-hd";
  renderSavedApis(data.savedApis || []);
  renderIntegrationStatus(data.integrations || {});
  renderVoiceChoices(data.tts || {});
  renderMusicPresets(data.music || {}, data.referenceAudio || {});
}

function hydratePurposeSelect() {
  if (!els.purposeSelect || els.purposeSelect.options.length) return;
  els.purposeSelect.innerHTML = Object.entries(PURPOSE_TEMPLATE_META)
    .map(([id, meta]) => `<option value="${escapeAttr(id)}">${escapeHtml(meta.name || id)}</option>`)
    .join("");
  const preferredPurpose = localStorage.getItem(PURPOSE_STORAGE_KEY) || "article";
  if ([...els.purposeSelect.options].some((option) => option.value === preferredPurpose)) {
    els.purposeSelect.value = preferredPurpose;
  }
}

function renderSavedApis(savedApis) {
  state.savedApis = Array.isArray(savedApis) ? savedApis : [];
  if (!els.savedApiSelect) return;
  if (!state.savedApis.length) {
    els.savedApiSelect.innerHTML = `<option value="">暂无已保存 API</option>`;
    renderSavedApiDetail();
    return;
  }
  els.savedApiSelect.innerHTML = state.savedApis.map((item) => `
    <option value="${escapeAttr(item.id)}">
      ${escapeHtml(item.activeDefault ? "默认 · " : "")}${escapeHtml(item.group)} · ${escapeHtml(item.label)}${item.apiKeyMask ? ` · ${escapeHtml(item.apiKeyMask)}` : ""}
    </option>
  `).join("");
  if (state.savedApis.some((item) => item.id === "minimax")) els.savedApiSelect.value = "minimax";
  renderSavedApiDetail();
}

function renderSavedApiDetail() {
  if (!els.savedApiDetail) return;
  const item = state.savedApis?.find((api) => api.id === els.savedApiSelect?.value);
  if (!item) {
    els.savedApiDetail.textContent = "没有读取到已保存 API。请先到系统设置保存 API。";
    els.savedApiDetail.className = "api-detail warning";
    return;
  }
  const detail = [
    item.activeDefault ? "当前默认" : "",
    item.feature,
    item.model ? `模型：${item.model}` : "",
    item.baseUrl ? `Base URL：${item.baseUrl}` : "",
    item.apiKeyMask ? `Key：${item.apiKeyMask}` : "",
  ].filter(Boolean).join(" ｜ ");
  els.savedApiDetail.textContent = detail || "已保存。";
  els.savedApiDetail.className = `api-detail ${item.activeDefault ? "success" : ""}`;
}

function renderIntegrationStatus(integrations) {
  if (!els.integrationStatus) return;
  const items = [
    `剪映草稿目录：${integrations.jianyingDraftDir ? "已配置" : "未配置"}`,
    `输出目录：${integrations.outputDir ? "正常" : "异常"}`,
  ];
  els.integrationStatus.textContent = items.join(" ｜ ");
  els.integrationStatus.className = `integration-status ${integrations.jianyingDraftDir && integrations.outputDir ? "success" : "warning"}`;
}

function renderPurposeTemplates() {
  if (!els.templateGrid || !els.purposeSelect) return;
  const options = [...els.purposeSelect.options].map((option) => ({
    id: option.value,
    label: option.textContent || option.value,
  })).filter((item) => item.id);
  if (!options.length) {
    els.templateGrid.innerHTML = '<div class="empty">正在读取小黑视觉模板。</div>';
    return;
  }
  const current = els.purposeSelect.value || options[0].id;
  if (els.templateSummary) {
    const selected = options.find((item) => item.id === current) || options[0];
    const meta = PURPOSE_TEMPLATE_META[selected.id] || {};
    els.templateSummary.textContent = `${meta.name || selected.label} · 后台调用小黑分镜、提示词、素材包和剪映草稿模块。`;
  }
  const selected = options.find((item) => item.id === current) || options[0];
  const meta = PURPOSE_TEMPLATE_META[selected.id] || {};
  const tags = meta.tags || [selected.label, "Skill"];
  els.templateGrid.innerHTML = `
    <article class="xiaohei-template-selected" style="--template-accent:${escapeAttr(meta.accent || "#f0bd69")};--template-line:${escapeAttr(meta.line || "#71d7ff")}">
      <div class="xiaohei-template-visual${meta.previewImage ? " has-preview" : ""}" data-template-visual="${escapeAttr(meta.visual || "xiaohei")}" aria-hidden="true">
        ${meta.previewImage ? `<img class="xiaohei-template-preview" src="${escapeAttr(meta.previewImage)}" alt="" decoding="async" fetchpriority="high" width="640" height="360" />` : ""}
        <span class="xiaohei-template-mark"></span>
        <span class="xiaohei-template-stroke stroke-a"></span>
        <span class="xiaohei-template-stroke stroke-b"></span>
      </div>
      <div class="xiaohei-template-copy">
        <span class="xiaohei-template-current">当前使用</span>
        <strong>${escapeHtml(meta.name || selected.label)}</strong>
        <p>${escapeHtml(meta.description || "调用小黑视频风格生成模块，自动完成分镜和素材包规划。")}</p>
        <div class="xiaohei-template-meta">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      </div>
    </article>
  `;
}

function renderMusicPresets(music, referenceAudio = {}) {
  const generatedPresets = (Array.isArray(music.presets) ? music.presets : [])
    .map((preset) => ({ ...preset, source: preset.source || "minimax_music" }));
  const localAssets = (Array.isArray(music.localAssets) ? music.localAssets : [])
    .map((asset) => ({ ...asset, source: "local_bgm" }));
  state.musicPresets = [...generatedPresets, ...localAssets];
  state.referenceStylePresets = Array.isArray(referenceAudio.stylePresets) ? referenceAudio.stylePresets : [];
  renderReferenceStyleChoices();
  if (!state.musicPresets.length) {
    els.musicPreset.innerHTML = '<option value="">暂无音乐预设</option>';
    els.musicStatus.textContent = "当前没有可用音乐预设。";
    return;
  }
  els.musicPreset.innerHTML = state.musicPresets.map((preset, index) => `
    <option value="${escapeAttr(preset.id)}">${index + 1}. ${escapeHtml(preset.source === "local_bgm" ? "本地预制 · " : "在线生成 · ")}${escapeHtml(preset.label)}${preset.instrumental ? " · 纯音乐" : ""}</option>
  `).join("");
  renderSelectedMusicStatus(music);
}

function renderReferenceStyleChoices() {
  if (!els.referenceStyleSelect) return;
  const presets = state.referenceStylePresets;
  if (!presets.length) {
    els.referenceStyleSelect.innerHTML = '<option value="">暂未保存参考配乐风格</option>';
    els.setDefaultReferenceStyle.disabled = true;
    els.deleteReferenceStyle.disabled = true;
    return;
  }
  const defaultPreset = presets.find((preset) => preset.is_default) || presets[0];
  els.referenceStyleSelect.innerHTML = presets.map((preset, index) => {
    const bpm = Math.round(Number(preset.profile?.target_bpm || preset.profile?.estimated_bpm || 120));
    const defaultLabel = preset.is_default ? "默认 · " : "";
    return `<option value="${escapeAttr(preset.id)}" ${preset.id === defaultPreset.id ? "selected" : ""}>${index + 1}. ${escapeHtml(defaultLabel + preset.name)} · ${bpm} BPM</option>`;
  }).join("");
  els.setDefaultReferenceStyle.disabled = false;
  els.deleteReferenceStyle.disabled = false;
}

function currentReferenceStylePreset() {
  return state.referenceStylePresets.find((preset) => preset.id === els.referenceStyleSelect?.value) || null;
}

function currentMusicPreset() {
  return state.musicPresets.find((preset) => preset.id === els.musicPreset.value) || state.musicPresets[0] || null;
}

function isLocalMusicPreset(preset) {
  return preset?.source === "local_bgm" || String(preset?.id || "").startsWith("local_bgm:");
}

function renderSelectedMusicStatus(music = {}) {
  const preset = currentMusicPreset();
  if (!preset) {
    els.musicStatus.textContent = "当前没有可用音乐预设。";
    return;
  }
  state.selectedMusic = preset;
  if (isLocalMusicPreset(preset)) {
    els.generateMusic.textContent = "试听本地音频";
    els.musicStatus.textContent = `${preset.label}：${preset.description || "本地预制音频，可直接试听。"}`;
    return;
  }
  els.generateMusic.textContent = "生成音乐素材";
  els.musicStatus.textContent = music.configured
    ? `${preset.label}：${preset.description || "可生成本地 mp3 素材。"}`
    : "MiniMax API 未配置；仍可选择下方“本地预制”音频试听。";
}

async function generateMusicMaterial() {
  const preset = currentMusicPreset();
  if (!preset) {
    setStatus("没有音乐预设", "请先刷新配置或检查 MiniMax 配置。", 0, true);
    return;
  }
  if (isLocalMusicPreset(preset)) {
    if (!preset.audio_url) {
      setStatus("本地音频不可用", "这个本地预制音频缺少可试听地址。", 0, true);
      return;
    }
    state.selectedMusic = preset;
    els.musicPreview.src = preset.audio_url;
    els.musicPreviewTitle.textContent = `本地预制 · ${preset.label}`;
    els.musicPreviewPanel.hidden = false;
    els.musicStatus.textContent = `已载入本地预制音频：${preset.fileName || preset.label}`;
    setStatus("已载入本地预制音频", preset.fileName || preset.label, 100, false, "本地音乐素材");
    return;
  }
  const lyrics = (els.musicLyrics.value.trim() || els.copyInput.value.trim()).slice(0, 3200);
  if (!preset.instrumental && !lyrics) {
    setStatus("缺少歌词", "唱歌和搞怪音乐需要歌词或口号；也可以选择纯音乐 BGM 预设。", 0, true);
    return;
  }
  setBusy(true);
  els.musicStatus.textContent = `正在生成：${preset.label}，请等待 MiniMax 返回 mp3。`;
  setStatus("正在生成音乐素材", `${preset.label} · ${preset.description || ""}`, 35, false, "MiniMax Music");
  try {
    const data = await fetchJson("/api/ian-xiaohei/music", {
      method: "POST",
      body: JSON.stringify({
        preset_id: preset.id,
        style_preset_id: currentReferenceStylePreset()?.id || "",
        title: els.titleInput.value.trim(),
        lyrics,
        prompt_extra: els.musicPromptExtra.value.trim(),
      }),
    });
    if (data.audio_url) {
      els.musicPreview.src = data.audio_url;
      els.musicPreviewTitle.textContent = `${data.preset_label || preset.label} · ${data.model || ""}`;
      els.musicPreviewPanel.hidden = false;
    }
    els.musicStatus.textContent = `${data.message || "音乐素材已生成。"} ${data.audio_path || ""}`;
    setStatus("音乐素材已生成", data.audio_path || "可以在下方试听。", 100, false, "完成");
  } catch (error) {
    els.musicStatus.textContent = error.payload?.message || error.message || String(error);
    setStatus("音乐生成失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function analyzeReferenceAudio() {
  const file = els.referenceAudioInput.files?.[0];
  if (!file) {
    setStatus("缺少参考音频", "请先上传一个参考视频或音频。", 0, true);
    return;
  }
  setBusy(true);
  state.referenceCloneDraft = null;
  els.referenceCloneControls.hidden = true;
  resetReferenceClonePreview();
  renderReferenceProfile(null, "正在读取并分析参考音频...");
  setStatus("正在分析参考音频", "正在提取 BPM、响度、峰值和结尾收束。", 25, false, "参考音频分析");
  try {
    const mediaData = await readFileDataUrl(file);
    const data = await fetchJson("/api/ian-xiaohei/reference-audio/analyze", {
      method: "POST",
      body: JSON.stringify({
        media_data: mediaData,
        media_mime: file.type,
        file_name: file.name,
      }),
    });
    state.referenceProfile = data.profile;
    state.referenceCloneDraft = null;
    resetReferenceClonePreview();
    els.referenceCloneControls.hidden = false;
    renderReferenceProfile(data.profile);
    setStatus("参考音频分析完成", data.profile?.summary || "已生成音频风格参数。", 100, false, "完成");
  } catch (error) {
    renderReferenceProfile(null, error.payload?.message || error.message || String(error));
    setStatus("参考音频分析失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function createReferenceClone() {
  if (!state.referenceProfile) {
    setStatus("缺少参考音频", "请先分析授权参考视频或音频。", 0, true);
    return;
  }
  const voiceName = els.referenceCloneName.value.trim();
  if (!voiceName || !els.referenceCloneConsent.checked) {
    setStatus("克隆资料不完整", "请填写音色名称并确认拥有该声音的长期克隆与生成授权。", 0, true);
    return;
  }
  setBusy(true);
  setStatus("正在创建克隆音色", "正在自动提取清晰人声、调用 MiniMax 创建克隆，并生成固定试听。", 35, false, "创建克隆与试听");
  try {
    const data = await fetchJson("/api/ian-xiaohei/reference-audio/clone-draft", {
      method: "POST",
      body: JSON.stringify({
        voice_name: voiceName,
        preferred_name: `xiaohei-${Date.now().toString().slice(-8)}`,
        consent_confirmed: true,
        profile: state.referenceProfile,
      }),
    });
    state.referenceCloneDraft = data.draft;
    els.referenceClonePreview.src = data.draft.preview_url;
    els.referenceClonePreviewTitle.textContent = `${data.draft.voice_name} · 克隆音色试听`;
    els.referenceClonePreviewPanel.hidden = false;
    els.referenceCloneControls.hidden = true;
    setStatus("克隆试听已生成", "请先试听。满意后点“确认加入预设音色”；不满意可永久删除这次临时克隆。", 100, false, "等待试听确认");
  } catch (error) {
    setStatus("创建克隆音色失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function confirmReferenceClone() {
  const draft = state.referenceCloneDraft;
  if (!draft?.id) {
    setStatus("没有可确认的克隆试听", "请先创建并试听克隆音色。", 0, true);
    return;
  }
  setBusy(true);
  try {
    const data = await fetchJson("/api/ian-xiaohei/reference-audio/clone-confirm", {
      method: "POST",
      body: JSON.stringify({
        draft_id: draft.id,
        set_default: els.referenceCloneDefault.checked,
        save_style: true,
        tags: ["授权克隆", "小黑视频", "口播"],
      }),
    });
    state.referenceCloneDraft = null;
    els.referenceCloneName.value = "";
    els.referenceCloneConsent.checked = false;
    els.referenceCloneDefault.checked = false;
    resetReferenceClonePreview();
    els.referenceCloneControls.hidden = true;
    await loadConfig();
    const styleName = data.style_preset?.name ? `；已同时保存“${data.style_preset.name}”配乐风格` : "";
    setStatus("克隆音色已加入预设", `“${data.asset?.voice_name || "新音色"}”现在可在配音音色中直接选择${styleName}。`, 100, false, "完成");
  } catch (error) {
    setStatus("保存克隆音色失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function discardReferenceClone() {
  const draft = state.referenceCloneDraft;
  if (!draft?.id) return;
  if (!window.confirm(`放弃“${draft.voice_name}”的克隆试听？本地临时文件和 MiniMax 临时音色都会永久删除。`)) return;
  setBusy(true);
  try {
    await fetchJson("/api/ian-xiaohei/reference-audio/clone-discard", {
      method: "POST",
      body: JSON.stringify({ draft_id: draft.id }),
    });
    state.referenceCloneDraft = null;
    resetReferenceClonePreview();
    els.referenceCloneControls.hidden = false;
    setStatus("临时克隆已删除", "没有加入配音音色库。可以换一段更清晰的授权样本后重新创建。", 100, false, "已删除");
  } catch (error) {
    setStatus("删除临时克隆失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

function resetReferenceClonePreview() {
  els.referenceClonePreview.removeAttribute("src");
  els.referenceClonePreview.load();
  els.referenceClonePreviewPanel.hidden = true;
}

async function setCurrentReferenceStyleDefault() {
  const preset = currentReferenceStylePreset();
  if (!preset) return;
  try {
    await fetchJson("/api/ian-xiaohei/reference-audio/style-default", {
      method: "POST",
      body: JSON.stringify({ id: preset.id }),
    });
    await loadConfig();
    setStatus("默认配乐风格已更新", `“${preset.name}”会优先用于后续音乐素材生成。`, 100, false, "完成");
  } catch (error) {
    setStatus("设置默认风格失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

async function deleteCurrentReferenceStyle() {
  const preset = currentReferenceStylePreset();
  if (!preset) return;
  if (!window.confirm(`永久删除配乐风格“${preset.name}”？删除后不提供恢复。`)) return;
  try {
    await fetchJson("/api/ian-xiaohei/reference-audio/style-delete", {
      method: "POST",
      body: JSON.stringify({ id: preset.id }),
    });
    await loadConfig();
    setStatus("配乐风格已删除", `“${preset.name}”已从本地风格库移除。`, 100, false, "完成");
  } catch (error) {
    setStatus("删除配乐风格失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

function renderReferenceProfile(profile, message = "") {
  if (!els.referenceProfile) return;
  if (!profile) {
    els.referenceProfile.className = "reference-profile empty";
    els.referenceProfile.textContent = message || "还没有分析参考音频。";
    return;
  }
  els.referenceProfile.className = "reference-profile";
  els.referenceProfile.innerHTML = [
    `<strong>${escapeHtml(profile.summary || "参考音频风格")}</strong>`,
    `时长：${Number(profile.duration || 0).toFixed(1)}s`,
    `目标节拍：${Math.round(Number(profile.target_bpm || 120))} BPM`,
    `目标响度：${Number(profile.target_lufs || -14).toFixed(1)} LUFS`,
    `平均音量：${Number(profile.mean_volume_db || 0).toFixed(1)} dB`,
    `峰值：${Number(profile.max_volume_db || 0).toFixed(1)} dB`,
    `结尾收束：${Number(profile.ending_fade_seconds || 2.5).toFixed(1)}s`,
  ].map((line) => `<div>${line}</div>`).join("");
}

async function saveMinimaxSettings() {
  const apiKey = els.minimaxApiKey.value.trim();
  if (!apiKey && !state.config?.tts?.minimaxConfigured) {
    setStatus("缺少 API Key", "请填写 MiniMax（稀宇）API Key。", 0, true);
    return;
  }
  els.saveMinimaxSettings.disabled = true;
  try {
    await fetchJson("/api/tts/settings", {
      method: "POST",
      body: JSON.stringify({
        provider: "minimax",
        api_key: apiKey,
        base_url: state.config?.tts?.minimaxBaseUrl || "https://api.minimaxi.com",
        model: els.minimaxModel.value || "speech-2.6-hd",
      }),
    });
    els.minimaxApiKey.value = "";
    await loadConfig();
    setStatus("MiniMax 配置已保存", "API Key 仅保存在本地；点击某个音色的“试听当前音色”时才会生成并缓存该音色样音。", 100);
  } catch (error) {
    setStatus("配置保存失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    els.saveMinimaxSettings.disabled = false;
  }
}

async function testMinimaxSettings() {
  const selected = state.savedApis?.find((item) => item.id === els.savedApiSelect?.value);
  if (!selected) {
    setStatus("没有可测试的 API", "请先到系统设置保存 API。", 0, true);
    return;
  }
  setBusy(true);
  setStatus(`正在测试 ${selected.label}`, "正在验证本地保存的 API 配置。", 35, false, "测试连接");
  try {
    const data = selected.id === "minimax"
      ? await fetchJson("/api/ian-xiaohei/test-minimax", { method: "POST", body: "{}" })
      : await fetchJson("/api/settings/test-provider", {
        method: "POST",
        body: JSON.stringify({ id: selected.id }),
      });
    await loadConfig();
    setStatus(data.ok ? `${selected.label} 连接正常` : `${selected.label} 连接异常`, data.message || "测试完成。", 100, !data.ok, "测试完成");
  } catch (error) {
    setStatus(`${selected.label} 测试失败`, error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function deleteMinimaxApi() {
  if (!window.confirm("删除本地保存的 MiniMax API Key？删除后预设试听和语音生成会停止，已生成的音频文件不会删除。")) return;
  setBusy(true);
  try {
    await fetchJson("/api/tts/settings", {
      method: "POST",
      body: JSON.stringify({ provider: "minimax", clear_secret: true }),
    });
    els.minimaxApiKey.value = "";
    await loadConfig();
    setStatus("MiniMax API 已删除", "本地配置已清空。重新生成语音前需要再次填写 API Key。", 100);
  } catch (error) {
    setStatus("删除 API 失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

function renderVoiceChoices(tts) {
  state.voiceChoices.clear();
  const assets = Array.isArray(tts.voiceAssets) ? tts.voiceAssets : [];
  const presetInfo = new Map((tts.voices || []).flatMap((voice) => [
    [`${voice.provider || ""}:${voice.id}`, voice],
    [voice.id, voice],
  ]));
  const options = [];
  for (const asset of assets) {
    const info = presetInfo.get(`${asset.provider || ""}:${asset.voice_id}`) || presetInfo.get(asset.voice_id) || {};
    const providerLabel = asset.provider_label || info.providerLabel || asset.provider || "";
    const key = `asset:${asset.id}`;
    state.voiceChoices.set(key, {
      voiceAssetId: Number(asset.id),
      provider: asset.provider,
      providerLabel,
      voiceId: asset.voice_id,
      voiceName: asset.voice_name,
      voiceType: asset.voice_type,
      model: asset.metadata?.target_model || asset.metadata?.model || info.model || "",
      description: asset.description || info.description || "",
      category: info.category || asset.metadata?.category || "",
      useCase: info.useCase || "",
      previewUrl: asset.preview_url || "",
      supportsEmotion: asset.supports_emotion !== false && info.supportsEmotion !== false,
      supportsSpeed: asset.supports_speed !== false && info.supportsSpeed !== false,
      isDefault: Boolean(asset.is_default),
    });
    const presetLabel = [info.category, info.useCase || "平台预设"].filter(Boolean).join(" / ");
    const baseLabel = `${asset.is_default ? "默认 · " : ""}${asset.voice_name} · ${asset.voice_type === "clone" ? "我的克隆音色" : presetLabel}`;
    options.push({
      key,
      label: `${baseLabel}${providerLabel ? ` - ${providerLabel}` : ""}`,
      selected: Boolean(asset.is_default || Number(tts.defaultVoice?.id || 0) === Number(asset.id)),
    });
  }
  if (!options.length) {
    els.voiceSelect.innerHTML = '<option value="">请先在系统设置中配置 MiniMax</option>';
    renderVoiceDescription();
    return;
  }
  const selectedIndex = Math.max(0, options.findIndex((item) => item.selected));
  els.voiceSelect.innerHTML = options.map((item, index) => (
    `<option value="${escapeAttr(item.key)}" ${index === selectedIndex ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  )).join("");
  renderVoiceDescription();
}

function renderVoiceDescription() {
  const choice = currentVoiceChoice();
  if (!choice) {
    els.voiceDescription.textContent = "请先配置 MiniMax API Key 或创建克隆音色。";
    return;
  }
  els.voiceDescription.textContent = [
    choice.voiceType === "clone" ? "我的克隆音色" : "精选预设",
    choice.category,
    choice.useCase,
    choice.description,
  ].filter(Boolean).join(" · ");
  const supported = choice.supportsEmotion && choice.supportsSpeed;
  els.setDefaultVoice.disabled = !supported;
}

function currentVoiceChoice() {
  return state.voiceChoices.get(els.voiceSelect.value) || null;
}

async function previewCurrentVoice() {
  const choice = currentVoiceChoice();
  if (!choice) {
    setStatus("无法试听", "请先选择可用音色。", 0, true);
    return;
  }
  if (choice.previewUrl) {
    showAudio(choice.previewUrl, `${choice.voiceName} · 音色试听`);
    return;
  }
  setBusy(true);
  setStatus("正在生成试听", `正在生成“${choice.voiceName}”的真实试听音频。`, 25, false, "音色试听");
  try {
    const data = await fetchJson("/api/ian-xiaohei/voice-preview", {
      method: "POST",
      body: JSON.stringify({
        voice_asset_id: choice.voiceAssetId,
        provider: choice.provider,
        voice_id: choice.voiceId,
        voice_name: choice.voiceName,
        model: choice.model,
      }),
    });
    if (data.preview_url) {
      choice.previewUrl = data.preview_url;
      showAudio(data.preview_url, `${choice.voiceName} · 音色试听`);
    } else {
      const job = await pollTtsJob(data.job.id, "正在生成真实试听");
      showAudio(job.audio_url, `${choice.voiceName} · 音色试听`);
    }
    setStatus("试听已生成", "可以直接播放对比声音效果。", 100, false, "完成");
  } catch (error) {
    setStatus("试听失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function setCurrentVoiceDefault() {
  const choice = currentVoiceChoice();
  if (!choice?.voiceAssetId) return;
  try {
    await fetchJson("/api/ian-xiaohei/voice-default", {
      method: "POST",
      body: JSON.stringify({ id: choice.voiceAssetId }),
    });
    await loadConfig();
    setStatus("默认音色已更新", `${choice.voiceName} 已设为默认。`, 100);
  } catch (error) {
    setStatus("设置失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

async function deleteCurrentVoice() {
  const choice = currentVoiceChoice();
  if (!choice?.voiceAssetId) return;
  if (!window.confirm(`永久删除“${choice.voiceName}”？删除后不提供恢复。`)) return;
  try {
    await fetchJson("/api/ian-xiaohei/voice-delete", {
      method: "POST",
      body: JSON.stringify({ id: choice.voiceAssetId }),
    });
    await loadConfig();
    setStatus("音色已永久删除", `${choice.voiceName} 已从配音音色中移除。`, 100);
  } catch (error) {
    setStatus("删除失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

async function createPlan() {
  setButtonFeedback(els.planPrompts, "loading", "正在分析");
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少 TTS 资产", "请先在 TTS 语音页发送已确认的文案、音频和同步时间戳。", 0, true);
    setButtonFeedback(els.planPrompts, "error", "缺少 TTS 资产");
    return null;
  }
  if (
    !state.selectedTtsJob
    || !isTtsAlignmentConfirmed(state.selectedTtsJob)
    || normalizeComparableText(confirmedTtsText(state.selectedTtsJob)) !== normalizeComparableText(payload.text)
  ) {
    setStatus("请先从 TTS 发送", "小黑配图只接收 TTS 语音页确认后的最终文案、音频和字幕时间轴。", 0, true);
    setButtonFeedback(els.planPrompts, "error", "请先从 TTS 发送");
    return null;
  }
  setBusy(true);
  setStatus("正在按 TTS 时间轴分析分镜", "正在结合已确认音频时长、同步字幕和文案语义生成分镜提示词。", 35, false, "TTS 时间轴分析");
  try {
    const data = await fetchJson("/api/ian-xiaohei/timeline-plan", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        project_id: state.projectId,
        tts_job_id: state.selectedTtsJob.id,
      }),
    });
    state.plan = data;
    state.images = [];
    state.previewImageCache.clear();
    state.renderedVideo = null;
    state.pendingUploads.clear();
    renderPlan(data);
    renderImages([], []);
    savePromptPlanCache(data, payload);
    setStatus("分镜配图分析完成", data.analysisNote || `已生成 ${data.shots?.length || 0} 个配图方案。`, 100, false, "等待上传图片");
    setButtonFeedback(els.planPrompts, "success", "已生成分镜");
    return data;
  } catch (error) {
    setStatus("分镜分析失败", error.payload?.message || error.message || String(error), 0, true);
    setButtonFeedback(els.planPrompts, "error", "分析失败");
    return null;
  } finally {
    setBusy(false);
  }
}

async function generateAudioOnly() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少文案", "请先输入需要配音的文案。", 0, true);
    return null;
  }
  setBusy(true);
  try {
    const job = els.localAudioInput.files?.[0]
      ? await uploadAndValidateAudio(payload)
      : await generateTts(payload);
    state.ttsJob = job;
    showAudio(job.audio_url || `/api/tts/audio?id=${job.id}`, `音频 #${job.id} · 待确认`);
    await loadAudioJobs();
    if (isTtsAlignmentConfirmed(job)) {
      setStatus("音频和字幕已确认", "可以试听并点击“确定本视频使用”。", 100, false, "等待试听确认");
    } else {
      setStatus("音频生成完成，字幕待校准", "请到 TTS 语音页检查最终识别文案和时间轴，确认后再返回选择。", 100, false, "等待字幕确认");
    }
    return job;
  } catch (error) {
    setStatus("音频生成失败", error.payload?.message || error.message || String(error), 100, true);
    return null;
  } finally {
    setBusy(false);
  }
}

async function confirmCurrentAudio() {
  const job = state.ttsJob;
  if (!job || job.status !== "completed" || !isTtsAlignmentConfirmed(job)) {
    setStatus("字幕尚未确认", "请先到 TTS 语音页检查并确认最终文案和字幕时间轴。", 0, true);
    return null;
  }
  const text = confirmedTtsText(job);
  if (!text) {
    setStatus("缺少最终文案", "这条 TTS 音频没有最终文案，不能用于小黑配图。", 0, true);
    return null;
  }
  if (els.copyInput) els.copyInput.value = text;
  try {
    const data = await fetchJson("/api/ian-xiaohei/audio-select", {
      method: "POST",
      body: JSON.stringify({ project_id: state.projectId, job_id: job.id }),
    });
    state.selectedTtsJob = data.job;
    state.ttsJob = data.job;
    resetVisualWorkflow();
    await loadAudioJobs();
    syncTtsSource(data.job, { title: els.titleInput?.value || "", text });
    setStatus("TTS 资产已确定", "文案、音频和字幕时间轴将严格使用这条 TTS 资产。", 100, false, "可以继续生成");
    return data.job;
  } catch (error) {
    setStatus("确认失败", error.payload?.message || error.message || String(error), 100, true);
    return null;
  }
}

async function generateCompleteWorkflow() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少 TTS 资产", "请先在 TTS 语音页发送已确认的文案、音频和同步时间戳。", 0, true);
    return;
  }
  if (
    !state.selectedTtsJob
    || !isTtsAlignmentConfirmed(state.selectedTtsJob)
    || normalizeComparableText(confirmedTtsText(state.selectedTtsJob)) !== normalizeComparableText(payload.text)
  ) {
    setStatus("请先从 TTS 发送", "当前项目还没有来自 TTS 的最终文案、音频和同步时间戳，不能生成素材包。", 0, true);
    return;
  }
  if (!state.plan?.shots?.length) {
    setStatus("缺少分镜计划", "请先点击“根据 TTS 时间轴分析分镜配图”，再逐段上传确认图片。", 0, true);
    return;
  }
  const missingImages = missingShotImages(state.plan, state.images);
  if (missingImages.length) {
    setStatus(
      "缺少分镜图片",
      `请先补齐这些分镜图片：${missingImages.map((shot) => `#${shot.index} ${shot.sourceText || shot.topic || ""}`).join("；")}`,
      0,
      true,
    );
    return;
  }

  setBusy(true);
  try {
    const ttsJob = state.selectedTtsJob;
    state.ttsJob = ttsJob;
    showAudio(ttsJob.audio_url || `/api/tts/audio?id=${ttsJob.id}`, `已确定使用 · 音频 #${ttsJob.id}`);

    setStatus("正在合成小黑视频", "正在按字幕时间轴组合分镜图片、转场、大字字幕和已确认 TTS 音频。", 88, false, "合成 MP4");
    els.videoRenderStatus.textContent = "正在生成 MP4，请保持页面打开…";
    const exported = await fetchJson("/api/ian-xiaohei/render-video", {
      method: "POST",
      body: JSON.stringify({
        project_id: state.projectId,
        tts_job_id: ttsJob.id,
        plan: state.plan,
        images: state.images,
        transition_mode: els.videoTransitionMode.value || "smart",
        compose: composeSettings(),
        background_audio: state.backgroundAudio,
      }),
    });
    state.renderedVideo = exported;
    updateVideoDownloadState();
    await loadOutputs();
    if (!exported.videoUrl) throw new Error("视频已经处理，但没有返回 MP4 地址。");
    els.videoRenderStatus.textContent = `MP4 已生成 · ${exported.width}×${exported.height} · ${exported.fps}fps`;
    setStatus(
      "小黑视频已生成",
      "请在预览确认后点击右侧“下载视频”。",
      100,
      false,
      "MP4 完成",
    );
  } catch (error) {
    els.videoRenderStatus.textContent = error.payload?.message || error.message || String(error);
    setStatus("生成失败", error.payload?.message || error.message || String(error), 100, true, "已停止");
  } finally {
    setBusy(false);
  }
}

async function generateTts(payload) {
  const choice = currentVoiceChoice();
  if (!choice) throw new Error("请先选择可用音色。");
  if (!choice.supportsEmotion || !choice.supportsSpeed) throw new Error("当前音色不同时支持情感和语速。");
  setStatus("正在生成 TTS", "使用选中的音色、情感和语速生成完整口播音频。", 8, false, "提交配音");
  const queued = await fetchJson("/api/ian-xiaohei/tts", {
    method: "POST",
    body: JSON.stringify({
      project_id: state.projectId,
      text: payload.text,
      provider: choice.provider,
      voice_id: choice.voiceId,
      voice_name: choice.voiceName,
      voice_asset_id: choice.voiceAssetId,
      model: choice.model,
      speed: Number(els.speedSelect.value || 1),
      emotion: els.emotionSelect.value || "自然",
    }),
  });
  return pollTtsJob(queued.job.id);
}

async function pollTtsJob(id, label = "正在生成 TTS") {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const data = await fetchJson(`/api/ian-xiaohei/tts-job?id=${encodeURIComponent(id)}`);
    const job = data.job;
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error || "TTS 生成失败。");
    setStatus(
      label,
      job.stage || (job.status === "processing" ? "语音合成中。" : "等待语音任务。"),
      Number(job.progress || 0),
      false,
      job.stage || "生成配音",
    );
    await delay(1000);
  }
  throw new Error("TTS 生成超时。");
}

async function uploadAndValidateAudio(payload) {
  const file = els.localAudioInput.files[0];
  setStatus("正在核对本地 TTS", "正在识别音频，并检查是否与输入文案一致。", 8, false, "上传并识别");
  const audioData = await readFileDataUrl(file);
  const data = await fetchJson("/api/ian-xiaohei/upload-audio", {
    method: "POST",
    body: JSON.stringify({
      project_id: state.projectId,
      text: payload.text,
      audio_data: audioData,
      audio_mime: file.type,
    }),
  });
  return data.job;
}

async function loadAudioJobs() {
  const data = await fetchJson(`/api/ian-xiaohei/audio-jobs?project_id=${encodeURIComponent(state.projectId)}`);
  state.audioJobs = data.jobs || [];
  state.selectedTtsJob = data.selected || null;
  if (!state.ttsJob && state.selectedTtsJob) state.ttsJob = state.selectedTtsJob;
  if (state.selectedTtsJob) syncTtsSource(state.selectedTtsJob, { title: els.titleInput?.value || "" });
  else if (!state.ttsJob) syncTtsSource(null);
  renderAudioJobs();
}

function renderAudioJobs() {
  if (!state.audioJobs.length) {
    els.audioJobs.className = "audio-job-list empty";
    els.audioJobs.textContent = "当前项目还没有从 TTS 接收音频。";
    return;
  }
  els.audioJobs.className = "audio-job-list";
  els.audioJobs.innerHTML = state.audioJobs.map((job) => {
    const selected = Boolean(job.metadata?.selected_for_project);
    const alignmentConfirmed = isTtsAlignmentConfirmed(job);
    const alignmentLabel = alignmentConfirmed
      ? "字幕已确认"
      : job.alignment_status === "review_required"
        ? "字幕待检查"
        : job.alignment_status === "failed"
          ? "字幕校准失败"
          : "字幕处理中";
    return `
      <article class="audio-job ${selected ? "selected" : ""}">
        <div>
          <strong>TTS 音频 #${job.id} · ${escapeHtml(job.voice_name || job.provider || "配音")} ${selected ? "· 本视频使用" : ""}</strong>
          <p>${escapeHtml(job.emotion || "自然")} · ${Number(job.speed || 1).toFixed(1)}× · ${escapeHtml(statusLabel(job.status))} · ${escapeHtml(alignmentLabel)}</p>
        </div>
        <div class="audio-job-actions">
          ${job.status === "completed" ? `<button type="button" data-audio-action="preview" data-id="${job.id}">试听</button>` : ""}
          ${job.status === "completed" && alignmentConfirmed && !selected ? `<button type="button" data-audio-action="select" data-id="${job.id}">使用</button>` : ""}
          ${!["waiting", "processing"].includes(job.status) ? `<button type="button" class="danger" data-audio-action="delete" data-id="${job.id}">删除</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

async function handleAudioJobAction(event) {
  const button = event.target.closest("[data-audio-action]");
  if (!button) return;
  const job = state.audioJobs.find((item) => Number(item.id) === Number(button.dataset.id));
  if (!job) return;
  const action = button.dataset.audioAction;
  if (action === "preview") {
    state.ttsJob = job;
    showAudio(job.audio_url, `音频 #${job.id} · ${job.voice_name || job.provider}`);
    return;
  }
  if (action === "select") {
    state.ttsJob = job;
    await confirmCurrentAudio();
    return;
  }
  if (action === "delete" && window.confirm(`删除音频 #${job.id}？音频文件也会删除。`)) {
    try {
      const data = await fetchJson("/api/ian-xiaohei/audio-delete", {
        method: "POST",
        body: JSON.stringify({ project_id: state.projectId, job_id: job.id }),
      });
      state.ttsJob = data.selected || null;
      await loadAudioJobs();
      if (data.selected) showAudio(data.selected.audio_url, `自动使用 · 音频 #${data.selected.id}`);
      else hideAudio();
      resetVisualWorkflow();
      setStatus("音频已删除", data.selected ? `已自动改用音频 #${data.selected.id}。` : "当前项目暂无可用音频。", 100);
    } catch (error) {
      setStatus("删除失败", error.payload?.message || error.message || String(error), 100, true);
    }
  }
}

async function handlePromptFileChange(event) {
  const input = event.target.closest("[data-shot-upload]");
  state.localImagePickerActive = false;
  if (!input?.files?.[0]) return;
  if (!ensurePromptPlanAvailable()) return;
  const index = Number(input.dataset.shotUpload);
  if (!(state.plan?.shots || []).some((shot) => Number(shot.index) === index)) {
    setStatus("图片没有对应分镜", `当前文件选择来自 #${index}，但计划里找不到这个分镜。`, 0, true);
    return;
  }
  const file = input.files[0];
  const dataUrl = await readFileDataUrl(file);
  state.pendingUploads.set(index, { dataUrl, mimeType: file.type, fileName: file.name });
  input.value = "";
  renderPlan(state.plan);
}

function handlePromptDetailsToggle(event) {
  const details = event.target.closest("details[data-prompt-details]");
  if (!details?.open) return;
  const index = Number(details.dataset.promptDetails);
  const shot = state.plan?.shots?.find((item) => Number(item.index) === index);
  const content = details.querySelector("[data-prompt-content]");
  if (content && !content.dataset.loaded) {
    content.textContent = shot ? shotPromptBlock(shot, state.plan) : "";
    content.dataset.loaded = "1";
  }
}

async function handlePromptAction(event) {
  const button = event.target.closest("[data-prompt-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  const action = button.dataset.promptAction;
  if (action === "confirm-all-images") {
    if (!ensurePromptPlanAvailable()) return;
    await uploadAllPendingShotImages(button);
    return;
  }
  if (action === "generate-all-images") {
    if (!ensurePromptPlanAvailable()) return;
    await generateAllMissingShotImages(button);
    return;
  }
  if (action === "choose-image") {
    if (!ensurePromptPlanAvailable()) return;
    savePromptPlanCache(state.plan);
    state.localImagePickerActive = true;
    els.promptResults.querySelector(`[data-shot-upload="${index}"]`)?.click();
    return;
  }
  if (action === "copy-prompt") {
    if (!ensurePromptPlanAvailable()) return;
    const shot = state.plan?.shots?.find((item) => Number(item.index) === index);
    if (!shot) return;
    try {
      await navigator.clipboard.writeText(shotPromptBlock(shot, state.plan));
      setStatus("已复制单张提示词", `#${index} 会作为独立任务生成 1 张图片。`, 100);
      setButtonFeedback(button, "success", "已复制");
    } catch (error) {
      setStatus("复制失败", error.message || String(error), 0, true);
      setButtonFeedback(button, "error", "复制失败");
    }
    return;
  }
  if (action === "cancel-image") {
    if (!ensurePromptPlanAvailable()) return;
    state.pendingUploads.delete(index);
    savePromptPlanCache(state.plan);
    renderPlan(state.plan);
    return;
  }
  if (action === "confirm-image") {
    if (!ensurePromptPlanAvailable()) return;
    await uploadShotImage(index, { button });
  }
}

async function uploadShotImage(index, { button = null, render = true, silent = false } = {}) {
  const safeIndex = Number(index);
  const pending = state.pendingUploads.get(safeIndex);
  const shot = state.plan?.shots?.find((item) => Number(item.index) === safeIndex);
  if (!pending || !shot || !state.plan) {
    if (button) setButtonFeedback(button, "error", "没有待确认");
    return false;
  }
  if (state.confirmingUploads.has(safeIndex)) return false;
  state.confirmingUploads.add(safeIndex);
  if (button) {
    button.disabled = true;
    setButtonFeedback(button, "loading", "确认中");
  }
  const existing = state.images.find((image) => Number(image.index) === Number(index));
  if (!silent) setStatus("正在替换分镜图片", `正在裁剪并绑定分镜 #${safeIndex}。`, 55, false, "本地图片");
  try {
    const data = await fetchJson("/api/ian-xiaohei/upload-shot-image", {
      method: "POST",
      body: JSON.stringify({
        batchId: state.plan.batchId,
        plan: state.plan,
        shot,
        aspectRatio: state.plan.aspectRatio,
        image_data: pending.dataUrl,
        image_mime: pending.mimeType,
        replace_asset_id: existing?.assetId || "",
      }),
    });
    state.images = [
      ...state.images.filter((image) => Number(image.index) !== Number(index)),
      data.image,
    ].sort((left, right) => Number(left.index) - Number(right.index));
    state.previewImageCache.delete(Number(index));
    state.renderedVideo = null;
    state.pendingUploads.delete(index);
    savePromptPlanCache(state.plan);
    if (render) {
      renderPlan(state.plan);
      renderImages(state.images, []);
    }
    if (!silent) setStatus("本地图片已绑定", `分镜 #${safeIndex} 后续只使用这张已确认图片。`, 100, false, "完成");
    if (button?.isConnected) setButtonFeedback(button, "success", "已确认");
    return true;
  } catch (error) {
    if (!silent) setStatus("图片替换失败", error.payload?.message || error.message || String(error), 100, true);
    if (button?.isConnected) setButtonFeedback(button, "error", "确认失败");
    return false;
  } finally {
    state.confirmingUploads.delete(safeIndex);
    if (button?.isConnected) button.disabled = false;
  }
}

async function generateShotImage(index) {
  const safeIndex = Number(index);
  const shot = state.plan?.shots?.find((item) => Number(item.index) === safeIndex);
  if (!shot || !state.plan) return { ok: false, message: "没有找到对应提示词。" };
  if (state.images.some((image) => Number(image.index) === safeIndex && image.assetId)) {
    return { ok: true, skipped: true };
  }
  state.generatingImages.add(safeIndex);
  renderPlan(state.plan);
  try {
    const data = await fetchJson("/api/ian-xiaohei/generate-shot", {
      method: "POST",
      body: JSON.stringify({
        batchId: state.plan.batchId,
        plan: state.plan,
        aspectRatio: promptAspectRatio(state.plan),
        provider: "",
        shot: {
          ...shot,
          prompt: shotPromptBlock(shot, state.plan),
        },
      }),
    });
    state.images = [
      ...state.images.filter((image) => Number(image.index) !== safeIndex),
      data.image,
    ].sort((left, right) => Number(left.index) - Number(right.index));
    state.previewImageCache.delete(safeIndex);
    state.renderedVideo = null;
    savePromptPlanCache(state.plan);
    return { ok: true, image: data.image };
  } catch (error) {
    return { ok: false, message: error.payload?.message || error.message || String(error) };
  } finally {
    state.generatingImages.delete(safeIndex);
    renderPlan(state.plan);
    renderImages(state.images, []);
  }
}

function missingImageGenerationIndexes(plan = state.plan) {
  const bound = new Set(state.images.filter((image) => image?.assetId).map((image) => Number(image.index)));
  const pending = new Set([...state.pendingUploads.keys()].map(Number));
  return (plan?.shots || [])
    .map((shot) => Number(shot.index))
    .filter((index) => !bound.has(index) && !pending.has(index));
}

async function generateAllMissingShotImages(button) {
  if (state.imageBatchGenerating) return;
  const indexes = missingImageGenerationIndexes(state.plan);
  if (!indexes.length) {
    setButtonFeedback(button, "success", "图片已齐全");
    setStatus("无需生成图片", "已有素材位和待确认的本地图片已全部跳过。", 100);
    return;
  }
  state.imageBatchGenerating = true;
  state.imageBatchProgress = { current: 0, total: indexes.length };
  renderPlan(state.plan);
  let successCount = 0;
  const failed = [];
  try {
    for (const [position, index] of indexes.entries()) {
      state.imageBatchProgress = { current: position + 1, total: indexes.length };
      setStatus(
        "正在一键生成图片",
        `正在生成分镜 #${index}（${position + 1}/${indexes.length}），成功后会立即绑定。`,
        Math.round(((position + 1) / indexes.length) * 90),
        false,
        "图片 API",
      );
      renderPlan(state.plan);
      const result = await generateShotImage(index);
      if (result.ok) successCount += result.skipped ? 0 : 1;
      else failed.push({ index, message: result.message });
    }
  } finally {
    state.imageBatchGenerating = false;
    state.imageBatchProgress = null;
    renderPlan(state.plan);
    renderImages(state.images, failed);
  }
  if (failed.length) {
    setStatus(
      "图片批量生成部分完成",
      `成功并绑定 ${successCount} 张；失败：${failed.map((item) => `#${item.index}`).join("、")}。可再次点击仅重试空缺项。`,
      100,
      true,
      "部分完成",
    );
    return;
  }
  setStatus("图片已全部生成", `成功生成并绑定 ${successCount} 张图片，可以直接预览或生成视频。`, 100, false, "完成");
}

async function uploadAllPendingShotImages(button) {
  const indexes = pendingUploadIndexes(state.plan);
  if (!indexes.length) {
    setButtonFeedback(button, "success", "全部已确认");
    setStatus("全部图片已确认", "当前没有待确认的图片。", 100);
    return;
  }
  setButtonFeedback(button, "loading", `确认中 0/${indexes.length}`);
  let successCount = 0;
  const failed = [];
  for (const [position, index] of indexes.entries()) {
    setButtonFeedback(button, "loading", `确认中 ${position + 1}/${indexes.length}`);
    setStatus("正在批量确认图片", `正在确认分镜 #${index}（${position + 1}/${indexes.length}）。`, Math.round(((position + 1) / indexes.length) * 90), false, "本地图片");
    const ok = await uploadShotImage(index, { render: false, silent: true });
    if (ok) successCount += 1;
    else failed.push(index);
  }
  renderPlan(state.plan);
  renderImages(state.images, []);
  const latestButton = els.promptResults.querySelector('[data-prompt-action="confirm-all-images"]') || button;
  if (failed.length) {
    setStatus("部分图片确认失败", `已确认 ${successCount} 张，失败：#${failed.join("、#")}。`, 100, true);
    setButtonFeedback(latestButton, "error", `失败 ${failed.length} 张`, 2200);
    return;
  }
  setStatus("全部图片已确认", `已确认 ${successCount} 张本地图片，后续生成视频会使用这些图片。`, 100, false, "完成");
  setButtonFeedback(latestButton, "success", "全部已确认", 2400);
}

async function loadOutputs() {
  const data = await fetchJson("/api/ian-xiaohei/outputs");
  state.outputDir = data.outputDir || state.outputDir;
  els.outputDirLabel.textContent = state.outputDir;
  renderHistory(data.batches || []);
  const currentBatch = state.plan?.batchId
    ? (data.batches || []).find((batch) => batch.id === state.plan.batchId)
    : null;
  if (currentBatch?.videoUrl) {
    state.renderedVideo = {
      videoUrl: currentBatch.videoUrl,
      downloadUrl: currentBatch.downloadUrl,
      downloadName: currentBatch.downloadName,
      transitionMode: currentBatch.transitionMode || "smart",
    };
    if (currentBatch.transitionMode) els.videoTransitionMode.value = currentBatch.transitionMode;
  }
  const persistedImages = cacheableBoundImages(currentBatch?.boundImages || []);
  if (state.plan && persistedImages.length) {
    state.images = persistedImages;
    renderPlan(state.plan);
    renderImages(state.images, []);
    savePromptPlanCache(state.plan);
  }
  updateVideoDownloadState();
}

async function openOutputDir() {
  await fetchJson("/api/ian-xiaohei/open-output", { method: "POST", body: "{}" });
}

function formPayload() {
  const sourceJob = state.selectedTtsJob || state.ttsJob;
  const sourceText = confirmedTtsText(sourceJob);
  return {
    title: els.titleInput?.value.trim() || sourceJob?.title || sourceJob?.seo_title || "小黑配图视频",
    text: els.copyInput?.value.trim() || sourceText,
    purpose: els.purposeSelect?.value || "article",
    aspectRatio: els.aspectRatioSelect?.value || "16:9",
  };
}

function promptPlanCacheKey(projectId = state.projectId) {
  return `${PROMPT_PLAN_CACHE_PREFIX}:v${PROMPT_PLAN_CACHE_VERSION}:${String(projectId || "default")}`;
}

function promptPlanCacheSignature(payload = formPayload(), job = state.selectedTtsJob || state.ttsJob) {
  return JSON.stringify({
    projectId: String(state.projectId || ""),
    ttsJobId: Number(job?.id || 0),
    title: normalizeComparableText(payload.title),
    text: normalizeComparableText(payload.text),
    purpose: String(payload.purpose || "article"),
    aspectRatio: String(payload.aspectRatio || "16:9"),
  });
}

function promptPlanCacheMatches(cached) {
  let signature;
  try {
    signature = JSON.parse(cached?.signature || "{}");
  } catch {
    return false;
  }
  const currentJob = state.selectedTtsJob || state.ttsJob;
  if (String(signature.projectId || "") !== String(state.projectId || "")) return false;
  if (Number(signature.ttsJobId || 0) !== Number(currentJob?.id || 0)) return false;
  const currentText = normalizeComparableText(confirmedTtsText(currentJob) || formPayload().text);
  const cachedText = normalizeComparableText(cached?.plan?.sourceText || signature.text);
  return !currentText || !cachedText || currentText === cachedText;
}

function savePromptPlanCache(plan, payload = formPayload()) {
  if (!plan?.shots?.length || !state.projectId) return;
  try {
    const key = promptPlanCacheKey();
    localStorage.setItem(key, JSON.stringify({
      version: PROMPT_PLAN_CACHE_VERSION,
      savedAt: new Date().toISOString(),
      signature: promptPlanCacheSignature(payload),
      plan,
      boundImages: cacheableBoundImages(state.images),
    }));
    localStorage.setItem(PROMPT_PLAN_LATEST_KEY, key);
    removeOlderPromptPlanCaches(key);
  } catch {
    // The plan remains usable in memory even if browser storage is unavailable.
  }
}

function removeOlderPromptPlanCaches(keepKey) {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(`${PROMPT_PLAN_CACHE_PREFIX}:`) && key !== PROMPT_PLAN_LATEST_KEY && key !== keepKey) {
      localStorage.removeItem(key);
    }
  }
}

function cacheableBoundImages(images = []) {
  return images
    .filter((image) => image?.confirmed && (image.imagePath || image.assetId))
    .map((image) => ({
      index: Number(image.index),
      topic: String(image.topic || ""),
      purpose: String(image.purpose || ""),
      imagePath: String(image.imagePath || ""),
      imageUrl: String(image.imageUrl || "").startsWith("data:") ? "" : String(image.imageUrl || ""),
      thumbnailUrl: String(image.thumbnailUrl || "").startsWith("data:") ? "" : String(image.thumbnailUrl || ""),
      assetId: String(image.assetId || ""),
      provider: String(image.provider || "local"),
      model: String(image.model || "local-file"),
      source: String(image.source || "local_upload"),
      aspectRatio: String(image.aspectRatio || ""),
      confirmed: true,
    }))
    .sort((left, right) => left.index - right.index);
}

function restorePromptPlanCache() {
  if (!state.projectId || !(state.selectedTtsJob || state.ttsJob)) return false;
  const key = promptPlanCacheKey();
  try {
    const latestKey = localStorage.getItem(PROMPT_PLAN_LATEST_KEY);
    if (latestKey && latestKey !== key) return false;
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (
      cached?.version !== PROMPT_PLAN_CACHE_VERSION
      || !promptPlanCacheMatches(cached)
      || !cached.plan?.shots?.length
      || cached.plan.skillProfileVersion !== 2
    ) return false;
    localStorage.setItem(PROMPT_PLAN_LATEST_KEY, key);
    removeOlderPromptPlanCaches(key);
    state.plan = cached.plan;
    const cachedPurpose = String(cached.plan.purpose || "article");
    if ([...els.purposeSelect.options].some((option) => option.value === cachedPurpose)) {
      els.purposeSelect.value = cachedPurpose;
      localStorage.setItem(PURPOSE_STORAGE_KEY, cachedPurpose);
      renderPurposeTemplates();
    }
    const cachedAspectRatio = String(cached.plan.aspectRatio || "16:9");
    if ([...els.aspectRatioSelect.options].some((option) => option.value === cachedAspectRatio)) {
      els.aspectRatioSelect.value = cachedAspectRatio;
    }
    if (els.titleInput && !els.titleInput.value.trim()) els.titleInput.value = cached.plan.title || "";
    if (els.copyInput && !els.copyInput.value.trim()) els.copyInput.value = cached.plan.sourceText || "";
    state.images = cacheableBoundImages(cached.boundImages || []);
    state.pendingUploads.clear();
    renderPlan(state.plan);
    renderImages(state.images, []);
    return true;
  } catch {
    localStorage.removeItem(key);
    return false;
  }
}

function ensurePromptPlanAvailable() {
  if (state.plan?.shots?.length) return true;
  if (state.lastStablePlan?.shots?.length) {
    state.plan = state.lastStablePlan;
    renderPlan(state.plan);
    renderImages(state.images, []);
    return true;
  }
  if (restorePromptPlanCache()) return true;
  setStatus("提示词计划未恢复", "当前分镜计划不在内存里，请重新按 TTS 时间轴分析分镜配图。", 0, true);
  return false;
}

function promptJobLimit(count = 1) {
  return Math.min(Math.max(Number(count || 1), 1), 10);
}

function promptAspectRatio(plan = state.plan) {
  return String(plan?.aspectRatio || els.aspectRatioSelect?.value || "16:9");
}

function shotPromptBlock(shot = {}, plan = state.plan) {
  const ratio = promptAspectRatio(plan);
  const skillName = shot.skillName || plan?.skillName || shot.skillId || "";
  return [
    "单张图片素材生成任务",
    "",
    "复制下面整段到生图工具：",
    "",
    "请直接生成一张图片素材。",
    "不要解释，不要分析，不要复述提示词，不要给优化建议，直接出图。",
    "只生成一张图，不要拼图，不要多宫格，不要组图，不要缩略图合集。",
    `本次只生成当前这一张独立的 ${ratio} 图片素材。`,
    "不要把多个画面、多个编号、多个镜头合并到同一张画布。",
    "图片里不要出现数字编号角标，不要出现分格边框。",
    "",
    "项目：小黑视频风格生成",
    `锁定 Skill：${skillName}`,
    `本镜头任务：${shot.topic || ""}`,
    `本镜头角色：${shot.role || ""}`,
    `结构类型（只作为理解，不写进画面）：${shot.structureType || ""}`,
    `核心意思：${shot.coreIdea || ""}`,
    `主体动作：${shot.xiaoheiAction || ""}`,
    `视觉隐喻：${shot.visualMetaphor || ""}`,
    `构图：${shot.composition || ""}`,
    `对应原文：${shot.sourceText || ""}`,
    "",
    "画面文字规则：保留当前 Skill 原本允许的少量中文手写标注；不要把整段原文、标题、编号或说明文字写进画面。",
    "单张约束：只输出一张高质量图片；禁止 Collage（拼贴图）、Contact Sheet（缩略图合集）、九宫格、拼图、组图、分屏故事板。",
    "",
    String(shot.prompt || "").trim(),
    "",
    "输出要求：单张高质量图片素材，主体明确，风格统一，符合锁定 Skill；画面可以直接用于短视频剪辑。",
  ].filter(Boolean).join("\n");
}

function promptPlanText(shots = [], plan = state.plan) {
  return shots.map((shot) => shotPromptBlock(shot, plan)).join("\n\n--- 下一张图片：必须单独复制这一段，不要和上一段一起发送 ---\n\n");
}

function pendingUploadIndexes(plan = state.plan) {
  const validIndexes = new Set((plan?.shots || []).map((shot) => Number(shot.index)));
  return [...state.pendingUploads.keys()]
    .map((index) => Number(index))
    .filter((index) => validIndexes.has(index))
    .sort((left, right) => left - right);
}

function promptBatchActionMarkup(plan = state.plan) {
  const shots = plan?.shots || [];
  const pendingCount = pendingUploadIndexes(plan).length;
  const generationCount = missingImageGenerationIndexes(plan).length;
  const allConfirmed = Boolean(shots.length && pendingCount === 0 && !missingShotImages(plan, state.images).length);
  const label = pendingCount > 0 ? `全部确认使用（${pendingCount}）` : allConfirmed ? "全部已确认" : "等待添加图片";
  const hint = pendingCount > 0
    ? "会按编号逐张确认当前已添加的本地图片。"
    : allConfirmed
      ? "所有分镜图片都已绑定。"
      : "添加本地图片素材后可批量确认。";
  return `
    <div class="prompt-batch-actions">
      <button type="button" data-prompt-action="confirm-all-images" ${pendingCount > 0 ? "" : "disabled"} class="${allConfirmed ? "is-confirmed action-feedback is-success" : ""}">${label}</button>
      <button type="button" class="primary" data-prompt-action="generate-all-images" ${generationCount > 0 && !state.imageBatchGenerating ? "" : "disabled"}>${state.imageBatchGenerating ? `正在生成 ${state.imageBatchProgress?.current || 0}/${state.imageBatchProgress?.total || generationCount}` : generationCount > 0 ? `一键生成图片（${generationCount}）` : "图片已齐全"}</button>
      <span>${hint}</span>
    </div>
  `;
}

function renderPlan(plan) {
  const shots = plan?.shots || [];
  els.planCount.textContent = String(shots.length);
  state.promptsText = promptPlanText(shots, plan);
  if (!shots.length) {
    els.promptResults.className = "prompt-list empty";
    els.promptResults.textContent = "还没有生成提示词。";
    syncVideoPreview();
    return;
  }
  state.lastStablePlan = plan;
  const ratioStyle = previewRatioStyle(plan.aspectRatio);
  els.promptResults.className = "prompt-list";
  els.promptResults.innerHTML = `${promptBatchActionMarkup(plan)}${shots.map((shot) => {
    const image = state.images.find((item) => Number(item.index) === Number(shot.index));
    const pending = state.pendingUploads.get(Number(shot.index));
    const generating = state.generatingImages.has(Number(shot.index));
    return `
      <article class="prompt-card" data-shot-card="${shot.index}">
        <h3>#${shot.index} ${escapeHtml(shot.topic)}</h3>
        <p class="meta">${shot.startTime !== undefined ? `${formatTime(shot.startTime)}–${formatTime(shot.endTime)} · ${Number(shot.duration || 0).toFixed(1)} 秒 · ` : ""}${escapeHtml(shot.role || "自动角色")} · ${escapeHtml(shot.structureType)}</p>
        <p class="meta">已锁定 Skill：${escapeHtml(shot.skillName || plan.skillName || shot.skillId || "")}</p>
        <div class="semantic-binding">
          <strong>对应原文</strong>
          <p>${escapeHtml(shot.sourceText || "")}</p>
          <dl>
            <dt>核心意思</dt><dd>${escapeHtml(shot.coreIdea || "")}</dd>
            <dt>主体动作</dt><dd>${escapeHtml(shot.xiaoheiAction || "")}</dd>
            <dt>视觉隐喻</dt><dd>${escapeHtml(shot.visualMetaphor || "")}</dd>
          </dl>
        </div>
        <details data-prompt-details="${shot.index}">
          <summary>查看完整生图提示词</summary>
          <pre data-prompt-content></pre>
        </details>
        <div class="prompt-actions">
          <button type="button" data-prompt-action="copy-prompt" data-index="${shot.index}">复制本张提示词</button>
          <button type="button" data-prompt-action="choose-image" data-index="${shot.index}">${image ? "替换本地图片" : "添加本地图片素材"}</button>
          <input hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" data-shot-upload="${shot.index}" />
          ${image ? `<span class="binding-ok">${image.source === "ai_generated" ? "已绑定生成图片" : "已绑定本地图片"}</span>` : generating ? `<span class="binding-progress">正在生成图片…</span>` : ""}
        </div>
        ${image ? `
          <div class="shot-image-state">
            <strong>本分镜当前使用图片</strong>
            <img style="${ratioStyle}" src="${escapeAttr(image.imageUrl || image.thumbnailUrl || "")}" alt="${escapeAttr(shot.topic)}" />
            <span class="path">${escapeHtml(image.imagePath || "")}</span>
          </div>
        ` : ""}
        ${pending ? `
          <div class="manual-preview">
            <strong>裁剪前预览：${escapeHtml(pending.fileName)}</strong>
            <img style="${ratioStyle}" src="${escapeAttr(pending.dataUrl)}" alt="待上传本地图片" />
            <p class="meta">确认后系统会按 ${escapeHtml(plan.aspectRatio || "16:9")} 居中裁剪，并直接覆盖旧图。</p>
            <div class="manual-preview-actions">
              <button type="button" class="primary" data-prompt-action="confirm-image" data-index="${shot.index}">确认使用</button>
              <button type="button" data-prompt-action="cancel-image" data-index="${shot.index}">取消</button>
            </div>
          </div>
        ` : ""}
      </article>
    `;
  }).join("")}`;
  syncVideoPreview();
}

function renderImages(images, errors = []) {
  // 已绑定图片直接显示在对应提示词卡片中，不再维护重复的“生成结果”模块。
  if (errors.length) {
    setStatus("部分图片处理失败", errors.map((item) => `#${item.index || "-"} ${item.message || "未知错误"}`).join("；"), 100, true);
  }
}

function missingShotImages(plan, images = []) {
  const imageByIndex = new Map((images || []).map((image) => [Number(image.index), image]));
  return (plan?.shots || []).filter((shot) => {
    const image = imageByIndex.get(Number(shot.index));
    return !image?.assetId;
  });
}

function renderHistory(batches) {
  if (els.outputHistoryCount) els.outputHistoryCount.textContent = String(batches.length || 0);
  if (!batches.length) {
    els.outputHistory.className = "history-list empty";
    els.outputHistory.textContent = "暂无历史输出。";
    return;
  }
  els.outputHistory.className = "history-list";
  els.outputHistory.innerHTML = batches.map((batch) => `
    <article class="history-card">
      <div class="history-head">
        <div>
          <h3>${escapeHtml(batch.title || batch.id)}</h3>
          <p class="meta">${escapeHtml(batch.files?.length || 0)} 张 · ${escapeHtml(batch.updatedAt || "")}</p>
        </div>
        <div class="history-actions">
          <button type="button" data-output-action="open" data-id="${escapeAttr(batch.id)}">打开目录</button>
          <button type="button" class="danger" data-output-action="delete" data-id="${escapeAttr(batch.id)}" data-timeline-id="${escapeAttr(batch.timelineProjectId || "")}">永久删除</button>
        </div>
      </div>
      <p class="path">${escapeHtml(batch.folderPath || "")}</p>
      ${batch.draftPath ? `<p class="path">剪映草稿：${escapeHtml(batch.draftPath)}</p>` : ""}
      <div class="history-images">
        ${(batch.files || []).slice(0, 4).map((file) => `
          <img src="${escapeAttr(file.imageUrl)}" alt="${escapeAttr(file.name)}" />
          <p class="path">${escapeHtml(file.path)}</p>
        `).join("")}
      </div>
    </article>
  `).join("");
}

async function handleOutputHistoryAction(event) {
  const button = event.target.closest("[data-output-action]");
  if (!button) return;
  const id = button.dataset.id || "";
  const action = button.dataset.outputAction;
  if (action === "open") {
    await fetchJson("/api/ian-xiaohei/output-open", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    return;
  }
  if (action === "delete") {
    if (!window.confirm(`永久删除历史输出“${id}”？本地草稿、素材包和记录会一起删除，不能恢复。`)) return;
    setBusy(true);
    try {
      await fetchJson("/api/ian-xiaohei/output-delete", {
        method: "POST",
        body: JSON.stringify({ id, timeline_project_id: button.dataset.timelineId || "" }),
      });
      await loadOutputs();
      setStatus("历史输出已删除", `已永久删除 ${id} 及对应本地文件。`, 100);
    } catch (error) {
      setStatus("删除历史输出失败", error.payload?.message || error.message || String(error), 100, true);
    } finally {
      setBusy(false);
    }
  }
}

async function copyAllPrompts() {
  setButtonFeedback(els.copyPrompts, "loading", "正在复制");
  if (!state.plan?.shots?.length) await createPlan();
  const shot = firstPromptCopyShot();
  if (!shot) {
    setButtonFeedback(els.copyPrompts, "error", "没有可复制内容");
    return;
  }
  try {
    await navigator.clipboard.writeText(shotPromptBlock(shot, state.plan));
    setStatus("已复制单张提示词", `已复制 #${shot.index}。每次只粘贴这一张，不会再复制整组。`, 100);
    setButtonFeedback(els.copyPrompts, "success", "已复制");
  } catch (error) {
    setStatus("复制失败", error.message || String(error), 0, true);
    setButtonFeedback(els.copyPrompts, "error", "复制失败");
  }
}

function firstPromptCopyShot() {
  const shots = Array.isArray(state.plan?.shots) ? state.plan.shots : [];
  if (!shots.length) return null;
  const generated = new Set((state.images || [])
    .filter((image) => image?.assetId)
    .map((image) => Number(image.index)));
  return shots.find((shot) => !generated.has(Number(shot.index))) || shots[0];
}

function promptClipboardText() {
  const shots = Array.isArray(state.plan?.shots) ? state.plan.shots : [];
  const shot = firstPromptCopyShot() || shots[0];
  return shot ? shotPromptBlock(shot, state.plan) : String(state.promptsText || "").trim();
}

function syncVideoPreview() {
  if (!els.videoPreviewCanvas) return;
  const shots = state.plan?.shots || [];
  const duration = Number(state.plan?.audioDuration || els.audioPreview.duration || 0);
  const ratio = state.plan?.aspectRatio || els.aspectRatioSelect.value || "16:9";
  const dimensions = ratio === "9:16" ? [540, 960] : ratio === "1:1" ? [720, 720] : [960, 540];
  if (els.videoPreviewCanvas.width !== dimensions[0] || els.videoPreviewCanvas.height !== dimensions[1]) {
    els.videoPreviewCanvas.width = dimensions[0];
    els.videoPreviewCanvas.height = dimensions[1];
  }
  els.videoPreviewSeek.max = String(Math.max(0, duration));
  els.videoPreviewDuration.textContent = formatPreviewClock(duration);
  els.videoPreviewSpec.textContent = shots.length
    ? `${ratio} · ${Number(els.frameRate.value) === 60 ? 60 : 30}fps · ${shots.length} 个分镜 · ${duration.toFixed(1)} 秒`
    : "等待分镜图片和 TTS 时间轴";
  const ready = Boolean(shots.length && state.images.length && !missingShotImages(state.plan, state.images).length);
  els.videoPreviewEmpty.hidden = ready;
  drawVideoPreview();
  updateVideoDownloadState();
}

function drawVideoPreview() {
  const canvas = els.videoPreviewCanvas;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#080b12";
  context.fillRect(0, 0, width, height);
  const shots = state.plan?.shots || [];
  const currentTime = Number(els.audioPreview.currentTime || els.videoPreviewSeek.value || 0);
  const shot = shots.find((item) => currentTime >= Number(item.startTime || 0) && currentTime < Number(item.endTime || 0))
    || (currentTime < Number(shots[0]?.startTime || 0) ? shots[0] : shots[shots.length - 1]);
  if (!shot) return;
  const imageRecord = state.images.find((item) => Number(item.index) === Number(shot.index));
  const image = getPreviewImage(imageRecord);
  if (!image?.complete || !image.naturalWidth) return;

  const localTime = Math.max(0, currentTime - Number(shot.startTime || 0));
  const transitionLength = Math.min(0.42, Math.max(0.14, Number(shot.duration || 0) * 0.22));
  const progress = Math.min(1, localTime / transitionLength);
  const mode = previewTransitionForShot(els.videoTransitionMode.value, Number(shot.index));
  context.save();
  if (mode === "fade") context.globalAlpha = easeOut(progress);
  if (mode === "slideleft" || mode === "slideright") {
    const direction = mode === "slideleft" ? 1 : -1;
    context.translate(direction * width * (1 - easeOut(progress)), 0);
  }
  if (mode === "zoom") {
    const scale = 1.08 - 0.08 * easeOut(progress);
    context.translate(width / 2, height / 2);
    context.scale(scale, scale);
    context.translate(-width / 2, -height / 2);
  }
  drawImageFit(context, image, width, height, els.imageFit.value);
  context.restore();
  if (els.showSubtitles.checked) drawPreviewSubtitle(context, shot, width, height, localTime * 1000);
  drawPreviewBookend(context, currentTime, shots, width, height);
}

function getPreviewImage(imageRecord) {
  if (!imageRecord) return null;
  const key = Number(imageRecord.index);
  if (state.previewImageCache.has(key)) return state.previewImageCache.get(key);
  const image = new Image();
  image.decoding = "async";
  image.onload = drawVideoPreview;
  image.src = imageRecord.imageUrl || imageRecord.thumbnailUrl || "";
  state.previewImageCache.set(key, image);
  return image;
}

function drawImageCover(context, image, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawImageFit(context, image, width, height, mode) {
  if (mode !== "contain") return drawImageCover(context, image, width, height);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawPreviewSubtitle(context, shot, width, height, elapsedMs) {
  const text = shot.subtitleText || shot.sourceText || "";
  const fontSize = Math.max(18, Math.round(Number(els.subtitleSize.value || 48) * height / 1080));
  const maxWidth = width * 0.84;
  const lines = wrapCanvasText(context, String(text || ""), maxWidth, fontSize, Number(els.subtitleLines.value || 2));
  const lineHeight = fontSize * 1.28;
  const blockHeight = lines.length * lineHeight;
  const yStart = height - Math.max(36, height * 0.065) - blockHeight;
  context.save();
  const gradient = context.createLinearGradient(0, height * 0.62, 0, height);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,.78)");
  context.fillStyle = gradient;
  context.fillRect(0, height * 0.58, width, height * 0.42);
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.font = `900 ${fontSize}px "Microsoft YaHei", sans-serif`;
  context.lineJoin = "round";
  const keywords = [...new Set([...(shot.keywords || []), ...(shot.labels || [])].map((item) => String(item || "").trim()).filter((item) => item.length >= 2 && item.length <= 6 && String(text).includes(item)))].slice(0, 2);
  const pattern = keywords.length ? new RegExp(`(${keywords.sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})`, "g") : null;
  lines.forEach((line, index) => {
    const y = yStart + lineHeight * (index + 0.5);
    const runs = pattern ? line.split(pattern).filter(Boolean) : [line];
    const widths = runs.map((run) => context.measureText(run).width);
    let cursor = (width - widths.reduce((sum, value) => sum + value, 0)) / 2;
    let keywordIndex = 0;
    runs.forEach((run, runIndex) => {
      const highlighted = keywords.includes(run);
      const delay = keywordIndex * 100;
      const duration = 520 / Math.max(0.6, Number(els.subtitleSpeed.value || 100) / 100);
      const p = highlighted ? Math.max(0, Math.min(1, (elapsedMs - delay) / duration)) : 1;
      const eased = easeOut(p);
      context.save();
      context.globalAlpha = highlighted ? 0.25 + eased * 0.75 : 1;
      if (highlighted) keywordIndex += 1;
      context.strokeStyle = "rgba(12,15,22,.95)";
      context.lineWidth = els.subtitleOutline.checked ? Math.max(2, fontSize * 0.09) : 0;
      if (els.subtitleShadow.checked) { context.shadowColor = "rgba(0,0,0,.62)"; context.shadowBlur = fontSize * 0.16; }
      if (context.lineWidth) context.strokeText(run, cursor, y);
      context.fillStyle = highlighted ? els.keywordColor.value : els.subtitleColor.value;
      context.fillText(run, cursor, y);
      if (highlighted) {
        context.strokeStyle = els.keywordColor.value;
        context.lineWidth = Math.max(2, fontSize * 0.07);
        context.beginPath();
        context.moveTo(cursor, y + fontSize * 0.62);
        context.lineTo(cursor + widths[runIndex] * eased, y + fontSize * 0.62);
        context.stroke();
      }
      context.restore();
      cursor += widths[runIndex];
    });
  });
  context.restore();
}

function drawPreviewBookend(context, currentTime, shots, width, height) {
  const settings = composeSettings();
  const first = shots[0];
  const last = shots[shots.length - 1];
  const videoEnd = Number(state.plan?.audioDuration || last?.endTime || 0);
  const introGap = Math.max(0, Number(first?.startTime || 0));
  const introEnd = introGap >= 0.18 ? introGap : Math.min(Number(first?.endTime || 0), Math.max(0.45, Math.min(1.1, Number(first?.duration || 0) * 0.3)));
  const trailing = Math.max(0, videoEnd - Number(last?.endTime || 0));
  const outroStart = trailing >= 0.18 ? Number(last?.endTime || 0) : Math.max(0, videoEnd - Math.max(0.45, Math.min(1.1, Number(last?.duration || 0) * 0.3)));
  const item = settings.intro.enabled && currentTime < introEnd
    ? { ...settings.intro, start: 0, end: introEnd }
    : settings.outro.enabled && currentTime >= outroStart
      ? { ...settings.outro, start: outroStart, end: videoEnd }
      : null;
  if (!item?.text || item.end - item.start < 0.18) return;
  const progress = Math.max(0, Math.min(1, (currentTime - item.start) / Math.min(0.28, (item.end - item.start) / 2)));
  context.save();
  context.globalAlpha = easeOut(progress);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${Math.max(28, Math.round(height * 0.065))}px "Microsoft YaHei", sans-serif`;
  context.strokeStyle = "rgba(8,10,16,.92)";
  context.lineWidth = Math.max(4, height * 0.008);
  context.strokeText(item.text, width / 2, height * 0.45, width * 0.82);
  context.fillStyle = els.subtitleColor.value;
  context.fillText(item.text, width / 2, height * 0.45, width * 0.82);
  context.restore();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wrapCanvasText(context, text, maxWidth, fontSize, maxLines) {
  context.font = `900 ${fontSize}px "Microsoft YaHei", sans-serif`;
  const chars = [...text.replace(/\s+/g, " ").trim()];
  const lines = [];
  let line = "";
  for (const char of chars) {
    const candidate = `${line}${char}`;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = char;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function previewTransitionForShot(mode, index) {
  if (mode === "none") return "none";
  if (mode === "fade") return "fade";
  if (mode === "slide") return index % 2 ? "slideleft" : "slideright";
  if (mode === "zoom") return "zoom";
  return ["fade", "slideleft", "zoom", "slideright"][(index - 1) % 4];
}

function easeOut(value) {
  return 1 - (1 - value) ** 3;
}

function toggleVideoPreviewPlayback() {
  if (!state.plan?.shots?.length || missingShotImages(state.plan, state.images).length) {
    setStatus("预览尚未就绪", "请先生成分镜计划并补齐全部图片。", 0, true);
    return;
  }
  if (els.audioPreview.paused) els.audioPreview.play().catch((error) => setStatus("播放失败", error.message || String(error), 0, true));
  else els.audioPreview.pause();
}

function restartVideoPreview() {
  els.audioPreview.currentTime = 0;
  els.videoPreviewSeek.value = "0";
  drawVideoPreview();
  els.audioPreview.play().catch(() => {});
}

function seekVideoPreview() {
  const value = Number(els.videoPreviewSeek.value || 0);
  els.audioPreview.currentTime = value;
  syncVideoPreviewTime();
}

function startVideoPreviewLoop() {
  stopVideoPreviewLoop();
  els.videoPreviewPlay.textContent = "暂停预览";
  const tick = () => {
    syncVideoPreviewTime();
    if (!els.audioPreview.paused && !els.audioPreview.ended) state.previewFrame = requestAnimationFrame(tick);
  };
  state.previewFrame = requestAnimationFrame(tick);
}

function stopVideoPreviewLoop() {
  if (state.previewFrame) cancelAnimationFrame(state.previewFrame);
  state.previewFrame = 0;
  els.videoPreviewPlay.textContent = "播放预览";
  syncVideoPreviewTime();
}

function syncVideoPreviewTime() {
  const current = Number(els.audioPreview.currentTime || 0);
  els.videoPreviewSeek.value = String(current);
  els.videoPreviewCurrent.textContent = formatPreviewClock(current);
  drawVideoPreview();
}

function updateVideoDownloadState() {
  const ready = Boolean(state.renderedVideo?.downloadUrl);
  els.downloadXiaoheiVideo.disabled = !ready;
  if (ready && !els.videoRenderStatus.textContent.includes("已生成")) {
    els.videoRenderStatus.textContent = "MP4 已生成，可以直接下载。";
  }
}

function downloadRenderedVideo() {
  const url = state.renderedVideo?.downloadUrl;
  if (!url) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = state.renderedVideo?.downloadName || "小黑视频.mp4";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  els.videoRenderStatus.textContent = `已提交浏览器下载：${anchor.download}（系统默认下载目录）`;
}

function formatPreviewClock(value) {
  const totalMs = Math.max(0, Math.round(Number(value || 0) * 1000));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function resetVisualWorkflow(message = "") {
  if (state.localImagePickerActive && (state.plan?.shots?.length || state.lastStablePlan?.shots?.length)) {
    state.plan = state.plan?.shots?.length ? state.plan : state.lastStablePlan;
    renderPlan(state.plan);
    setStatus("正在选择本地图片", "已保留当前分镜计划，不会因为文件选择窗口清空记录。", 60, false, "本地图片");
    return;
  }
  state.plan = null;
  state.lastStablePlan = null;
  state.images = [];
  state.previewImageCache.clear();
  state.renderedVideo = null;
  state.pendingUploads.clear();
  state.promptsText = "";
  renderPlan(null);
  renderImages([], []);
  syncVideoPreview();
  if (message) setStatus("需要重新生成分镜", message, 0);
}

function showAudio(url, title = "当前试听音频") {
  els.audioPreview.src = url;
  els.audioPreviewTitle.textContent = title;
  els.audioPreviewPanel.hidden = false;
}

function hideAudio() {
  els.audioPreview.removeAttribute("src");
  els.audioPreview.load();
  els.audioPreviewPanel.hidden = true;
}

function setBusy(busy) {
  for (const element of [
    els.generateImages,
    els.saveMinimaxSettings,
    els.testMinimaxSettings,
    els.deleteMinimaxApi,
    els.generateMusic,
    els.analyzeReferenceAudio,
    els.createReferenceClone,
    els.confirmReferenceClone,
    els.discardReferenceClone,
    els.setDefaultReferenceStyle,
    els.deleteReferenceStyle,
    els.generateAudio,
    els.confirmAudio,
    els.planPrompts,
    els.copyPrompts,
    els.timelineRefresh,
    els.previewVoice,
    els.setDefaultVoice,
    els.deleteVoice,
    els.downloadXiaoheiVideo,
  ].filter(Boolean)) {
    element.disabled = busy;
  }
  if (!busy) {
    renderVoiceDescription();
    renderReferenceStyleChoices();
    updateVideoDownloadState();
  }
}

function composeSettings() {
  return {
    fps: Number(els.frameRate.value) === 60 ? 60 : 30,
    imageFit: els.imageFit.value === "contain" ? "contain" : "cover",
    ttsVolume: Number(els.ttsVolume.value || 100),
    bgmVolume: Number(els.bgmVolume.value || 18),
    showSubtitles: els.showSubtitles.checked,
    subtitleSize: Number(els.subtitleSize.value || 48),
    subtitleColor: els.subtitleColor.value || "#ffffff",
    keywordColor: els.keywordColor.value || "#b7ff5a",
    maxLines: Number(els.subtitleLines.value || 2),
    animationSpeed: Number(els.subtitleSpeed.value || 100) / 100,
    outline: els.subtitleOutline.checked,
    shadow: els.subtitleShadow.checked,
    intro: { enabled: els.introEnabled.checked, text: resolvedBookendText("intro") },
    outro: { enabled: els.outroEnabled.checked, text: resolvedBookendText("outro") },
  };
}

function resolvedBookendText(kind) {
  const intro = kind === "intro";
  const preset = intro ? els.introPreset.value : els.outroPreset.value;
  const custom = (intro ? els.introText.value : els.outroText.value).trim();
  if (preset === "custom") return custom;
  if (intro && preset === "title") return els.titleInput.value.trim() || state.plan?.title || "";
  const values = { core: "今天只讲一个重点", next: "关注我，下期继续", follow: "记得关注", private: "需要完整资料，可以私聊我" };
  return values[preset] || custom;
}

function handleComposeSettingsChange() {
  els.ttsVolumeValue.textContent = `${els.ttsVolume.value}%`;
  els.bgmVolumeValue.textContent = `${els.bgmVolume.value}%`;
  els.subtitleSizeValue.textContent = els.subtitleSize.value;
  els.subtitleSpeedValue.textContent = `${(Number(els.subtitleSpeed.value) / 100).toFixed(2)}×`;
  localStorage.setItem(COMPOSE_SETTINGS_KEY, JSON.stringify(composeSettings()));
  state.renderedVideo = null;
  syncVideoPreview();
}

function restoreComposeSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPOSE_SETTINGS_KEY) || "{}");
    if (saved.fps) els.frameRate.value = String(saved.fps);
    if (saved.imageFit) els.imageFit.value = saved.imageFit;
    if (saved.ttsVolume !== undefined) els.ttsVolume.value = String(saved.ttsVolume);
    if (saved.bgmVolume !== undefined) els.bgmVolume.value = String(saved.bgmVolume);
    if (saved.showSubtitles !== undefined) els.showSubtitles.checked = Boolean(saved.showSubtitles);
    if (saved.subtitleSize) els.subtitleSize.value = String(saved.subtitleSize);
    if (saved.subtitleColor) els.subtitleColor.value = saved.subtitleColor;
    if (saved.keywordColor) els.keywordColor.value = saved.keywordColor;
    if (saved.maxLines) els.subtitleLines.value = String(saved.maxLines);
    if (saved.animationSpeed) els.subtitleSpeed.value = String(Math.round(saved.animationSpeed * 100));
    if (saved.outline !== undefined) els.subtitleOutline.checked = Boolean(saved.outline);
    if (saved.shadow !== undefined) els.subtitleShadow.checked = Boolean(saved.shadow);
    if (saved.intro) { els.introEnabled.checked = Boolean(saved.intro.enabled); els.introText.value = saved.intro.text || ""; }
    if (saved.outro) { els.outroEnabled.checked = Boolean(saved.outro.enabled); els.outroText.value = saved.outro.text || ""; }
  } catch {}
  handleComposeSettingsChange();
}

async function uploadXiaoheiBgm(file) {
  if (!file) return;
  els.bgmName.textContent = "正在上传背景音乐…";
  try {
    const data = await fetchJson("/api/ian-xiaohei/upload-video-bgm", {
      method: "POST",
      body: JSON.stringify({ project_id: state.projectId, file_name: file.name, audio_mime: file.type, audio_data: await readFileDataUrl(file) }),
    });
    state.backgroundAudio = data.audio;
    els.bgmName.textContent = `当前：${data.audio.name}`;
    state.renderedVideo = null;
    updateVideoDownloadState();
  } catch (error) {
    state.backgroundAudio = null;
    els.bgmName.textContent = error.payload?.message || error.message || "背景音乐上传失败";
  } finally {
    els.bgmFile.value = "";
  }
}

function imageProgress(done, total) {
  if (!total) return 35;
  return Math.round(35 + (Math.max(0, Math.min(done, total)) / total) * 48);
}

function setStatus(label, detail, progress = 0, isError = false, step = "") {
  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  els.statusLabel.textContent = label;
  els.statusLabel.className = isError ? "error" : safeProgress >= 100 ? "success" : "";
  els.statusDetail.textContent = detail || "";
  els.progressStep.textContent = step || (safeProgress >= 100 ? "完成" : "处理中");
  els.progressPercent.textContent = `${safeProgress}%`;
  els.progressBar.style.width = `${safeProgress}%`;
}

function setButtonFeedback(button, type, label, duration = 1600) {
  if (!button) return;
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent.trim();
  const timer = state.buttonFeedbackTimers.get(button);
  if (timer) clearTimeout(timer);
  button.classList.remove("is-loading", "is-success", "is-error", "action-feedback");
  button.classList.add("action-feedback", `is-${type}`);
  button.textContent = label || button.dataset.defaultLabel || "";
  button.setAttribute("aria-live", "polite");
  button.setAttribute("aria-busy", type === "loading" ? "true" : "false");
  if (type === "loading") return;
  state.buttonFeedbackTimers.set(button, setTimeout(() => {
    button.classList.remove("is-loading", "is-success", "is-error", "action-feedback");
    button.textContent = button.dataset.defaultLabel || button.textContent;
    button.removeAttribute("aria-busy");
    state.buttonFeedbackTimers.delete(button);
  }, duration));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.error || `请求失败 ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取文件失败。"));
    reader.readAsDataURL(file);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function statusLabel(value) {
  return {
    waiting: "等待中",
    processing: "生成中",
    completed: "已完成",
    failed: "失败",
  }[value] || String(value || "");
}

function normalizeComparableText(value) {
  return String(value || "").toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, "");
}

function isTtsAlignmentConfirmed(job) {
  return String(job?.alignment_status || job?.metadata?.alignment_status || "") === "confirmed";
}

function confirmedTtsText(job) {
  return String(
    job?.final_text
    || job?.metadata?.final_text
    || job?.tts_prepared_text
    || job?.original_text
    || job?.text
    || "",
  ).trim();
}

function previewRatioStyle(ratio) {
  if (ratio === "9:16") return "--preview-ratio: 9 / 16";
  if (ratio === "1:1") return "--preview-ratio: 1 / 1";
  return "--preview-ratio: 16 / 9";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
