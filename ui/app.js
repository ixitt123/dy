if (typeof window.fetch !== "function") {
  window.fetch = (input, init = {}) => new Promise((resolve, reject) => {
    const requestUrl = typeof input === "string" ? input : String(input?.url || input || "");
    const xhr = new XMLHttpRequest();
    xhr.open(init.method || "GET", requestUrl, true);
    const headers = init.headers || {};
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    } else {
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    }
    xhr.onload = () => {
      const response = {
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        statusText: xhr.statusText,
        url: xhr.responseURL || requestUrl,
        text: () => Promise.resolve(xhr.responseText || ""),
        json: () => Promise.resolve(JSON.parse(xhr.responseText || "{}")),
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(xhr.responseText || "").buffer),
      };
      resolve(response);
    };
    xhr.onerror = () => reject(new TypeError("Failed to fetch"));
    xhr.ontimeout = () => reject(new TypeError("Failed to fetch"));
    xhr.send(init.body ?? null);
  });
}

const shareLink = document.querySelector("#shareLink");
const resultBox = document.querySelector("#resultBox");
const statusText = document.querySelector("#statusText");
const savePath = document.querySelector("#savePath");
const filesList = document.querySelector("#filesList");
const buttons = [...document.querySelectorAll(".actions button")];
const progressPanel = document.querySelector("#progressPanel");
const progressLabel = document.querySelector("#progressLabel");
const progressPercent = document.querySelector("#progressPercent");
const progressBar = document.querySelector("#progressBar");
const apiKeyInput = document.querySelector("#apiKey");
const apiStatus = document.querySelector("#apiStatus");
const apiProvider = document.querySelector("#apiProvider");
const copyTranscriptBtn = document.querySelector("#copyTranscript");
const openTranscriptBtn = document.querySelector("#openTranscript");
const pageSizeSelect = document.querySelector("#pageSize");
const filesPager = document.querySelector("#filesPager");
const prevPageBtn = document.querySelector("#prevPage");
const nextPageBtn = document.querySelector("#nextPage");
const pageInfo = document.querySelector("#pageInfo");
const deleteSelectedBtn = document.querySelector("#deleteSelected");
const downloadDirInput = document.querySelector("#downloadDirInput");
const chooseDownloadDirBtn = document.querySelector("#chooseDownloadDir");
const saveDownloadDirBtn = document.querySelector("#saveDownloadDir");
const batchKind = document.querySelector("#batchKind");
const batchLimit = document.querySelector("#batchLimit");
const batchConcurrency = document.querySelector("#batchConcurrency");
const skipDownloaded = document.querySelector("#skipDownloaded");
const batchStatus = document.querySelector("#batchStatus");
const taskStats = document.querySelector("#taskStats");
const tasksTable = document.querySelector("#tasksTable");
const taskPageSize = document.querySelector("#taskPageSize");
const taskDensity = document.querySelector("#taskDensity");
const taskPager = document.querySelector("#taskPager");
const prevTaskPage = document.querySelector("#prevTaskPage");
const nextTaskPage = document.querySelector("#nextTaskPage");
const taskPageInfo = document.querySelector("#taskPageInfo");
const transcriptList = document.querySelector("#transcriptList");
const analysisPanel = document.querySelector("#analysisPanel");
const analysisTaskId = document.querySelector("#analysisTaskId");
const analysisTranscript = document.querySelector("#analysisTranscript");
const analysisHook = document.querySelector("#analysisHook");
const analysisEmotion = document.querySelector("#analysisEmotion");
const analysisPain = document.querySelector("#analysisPain");
const analysisCta = document.querySelector("#analysisCta");
const analysisTags = document.querySelector("#analysisTags");
const analysisCategory = document.querySelector("#analysisCategory");
const analysisStatus = document.querySelector("#analysisStatus");
const rewritePanel = document.querySelector("#rewritePanel");
const rewriteTaskId = document.querySelector("#rewriteTaskId");
const rewriteOriginal = document.querySelector("#rewriteOriginal");
const rewriteAnalysisView = document.querySelector("#rewriteAnalysisView");
const rewriteProvider = document.querySelector("#rewriteProvider");
const rewriteDirection = document.querySelector("#rewriteDirection");
const rewriteStyle = document.querySelector("#rewriteStyle");
const rewriteReference = document.querySelector("#rewriteReference");
const rewriteReferenceExamples = document.querySelector("#rewriteReferenceExamples");
const rewriteToneLevel = document.querySelector("#rewriteToneLevel");
const rewriteToneValue = document.querySelector("#rewriteToneValue");
const rewriteConflictLevel = document.querySelector("#rewriteConflictLevel");
const rewriteConflictValue = document.querySelector("#rewriteConflictValue");
const rewriteEmotionLevel = document.querySelector("#rewriteEmotionLevel");
const rewriteEmotionValue = document.querySelector("#rewriteEmotionValue");
const rewriteSalesLevel = document.querySelector("#rewriteSalesLevel");
const rewriteSalesValue = document.querySelector("#rewriteSalesValue");
const rewriteHumanizeLevel = document.querySelector("#rewriteHumanizeLevel");
const rewriteVersions = document.querySelector("#rewriteVersions");
const rewriteVersionCountInput = document.querySelector("#rewriteVersionCountInput");
const rewriteStatus = document.querySelector("#rewriteStatus");
const rewriteProgress = document.querySelector("#rewriteProgress");
const rewriteProgressLabel = document.querySelector("#rewriteProgressLabel");
const rewriteProgressPercent = document.querySelector("#rewriteProgressPercent");
const rewriteProgressBar = document.querySelector("#rewriteProgressBar");
const rewriteSettingsProvider = document.querySelector("#rewriteSettingsProvider");
const rewriteUnifiedKey = document.querySelector("#rewriteUnifiedKey");
const rewriteModelInput = document.querySelector("#rewriteModelInput");
const rewriteModelOptions = document.querySelector("#rewriteModelOptions");
const rewriteAutoModel = document.querySelector("#rewriteAutoModel");
const rewriteBaseUrlInput = document.querySelector("#rewriteBaseUrlInput");
const rewriteApplyLink = document.querySelector("#rewriteApplyLink");
const rewriteBalanceLink = document.querySelector("#rewriteBalanceLink");
const rewriteSettingsStatus = document.querySelector("#rewriteSettingsStatus");
const directorSourceMode = document.querySelector("#directorSourceMode");
const directorSourceSelectField = document.querySelector("#directorSourceSelectField");
const directorSourceSelect = document.querySelector("#directorSourceSelect");
const directorTitle = document.querySelector("#directorTitle");
const directorSourceText = document.querySelector("#directorSourceText");
const directorCharacterCount = document.querySelector("#directorCharacterCount");
const directorProvider = document.querySelector("#directorProvider");
const directorTtsDuration = document.querySelector("#directorTtsDuration");
const directorVideoType = document.querySelector("#directorVideoType");
const directorVisualStyle = document.querySelector("#directorVisualStyle");
const directorPlatform = document.querySelector("#directorPlatform");
const directorPace = document.querySelector("#directorPace");
const directorShotCount = document.querySelector("#directorShotCount");
const directorEstimatedDuration = document.querySelector("#directorEstimatedDuration");
const directorReferenceStyle = document.querySelector("#directorReferenceStyle");
const directorSaveReference = document.querySelector("#directorSaveReference");
const directorStatus = document.querySelector("#directorStatus");
const directorProjects = document.querySelector("#directorProjects");
const directorResult = document.querySelector("#directorResult");
const directorResultTitle = document.querySelector("#directorResultTitle");
const directorResultMeta = document.querySelector("#directorResultMeta");
const directorResultTabs = document.querySelector("#directorResultTabs");
const directorResultView = document.querySelector("#directorResultView");
const vfoSourceMode = document.querySelector("#vfoSourceMode");
const vfoDirectorSourceField = document.querySelector("#vfoDirectorSourceField");
const vfoDirectorSource = document.querySelector("#vfoDirectorSource");
const vfoManualTitleField = document.querySelector("#vfoManualTitleField");
const vfoManualTitle = document.querySelector("#vfoManualTitle");
const vfoManualJsonField = document.querySelector("#vfoManualJsonField");
const vfoManualJson = document.querySelector("#vfoManualJson");
const vfoSourceSummary = document.querySelector("#vfoSourceSummary");
const vfoProvider = document.querySelector("#vfoProvider");
const vfoPlatform = document.querySelector("#vfoPlatform");
const vfoStatus = document.querySelector("#vfoStatus");
const vfoProjects = document.querySelector("#vfoProjects");
const vfoResult = document.querySelector("#vfoResult");
const vfoResultTitle = document.querySelector("#vfoResultTitle");
const vfoResultMeta = document.querySelector("#vfoResultMeta");
const vfoResultTabs = document.querySelector("#vfoResultTabs");
const vfoResultView = document.querySelector("#vfoResultView");
const videoProductDirector = document.querySelector("#videoProductDirector");
const videoProductAudio = document.querySelector("#videoProductAudio");
const videoProductImageSource = document.querySelector("#videoProductImageSource");
const videoProductOutputType = document.querySelector("#videoProductOutputType");
const refreshVideoProductSourcesBtn = document.querySelector("#refreshVideoProductSources");
const autoBindTimelineBtn = document.querySelector("#autoBindTimeline");
const generateVideoProductBtn = document.querySelector("#generateVideoProduct");
const videoProductStatus = document.querySelector("#videoProductStatus");
const videoProductBlockers = document.querySelector("#videoProductBlockers");
const videoProductProgressBar = document.querySelector("#videoProductProgressBar");
const videoProductProgressText = document.querySelector("#videoProductProgressText");
const openVideoProductOutputBtn = document.querySelector("#openVideoProductOutput");
const videoProductOutputFiles = document.querySelector("#videoProductOutputFiles");
const videoProductSceneMeta = document.querySelector("#videoProductSceneMeta");
const videoProductScenes = document.querySelector("#videoProductScenes");
const refreshVideoProductProjectsBtn = document.querySelector("#refreshVideoProductProjects");
const videoProductProjects = document.querySelector("#videoProductProjects");
const railCurrentTask = document.querySelector("#railCurrentTask");
const railRecentOutput = document.querySelector("#railRecentOutput");
const railErrors = document.querySelector("#railErrors");
const ttsProvider = document.querySelector("#ttsProvider");
const ttsApiKey = document.querySelector("#ttsApiKey");
const ttsWorkspaceField = document.querySelector("#ttsWorkspaceField");
const ttsWorkspaceId = document.querySelector("#ttsWorkspaceId");
const ttsBaseUrlField = document.querySelector("#ttsBaseUrlField");
const ttsBaseUrl = document.querySelector("#ttsBaseUrl");
const ttsModel = document.querySelector("#ttsModel");
const ttsCurrentProviderLabel = document.querySelector("#ttsCurrentProviderLabel");
const ttsCurrentModelLabel = document.querySelector("#ttsCurrentModelLabel");
const ttsSettingsStatus = document.querySelector("#ttsSettingsStatus");
const ttsText = document.querySelector("#ttsText");
const ttsCharacterCount = document.querySelector("#ttsCharacterCount");
const ttsVoiceSource = document.querySelector("#ttsVoiceSource");
const ttsPresetVoiceField = document.querySelector("#ttsPresetVoiceField");
const ttsPresetVoice = document.querySelector("#ttsPresetVoice");
const ttsManualVoiceField = document.querySelector("#ttsManualVoiceField");
const ttsManualVoice = document.querySelector("#ttsManualVoice");
const ttsSpeed = document.querySelector("#ttsSpeed");
const ttsEmotion = document.querySelector("#ttsEmotion");
const ttsCustomEmotionField = document.querySelector("#ttsCustomEmotionField");
const ttsCustomEmotion = document.querySelector("#ttsCustomEmotion");
const ttsFormat = document.querySelector("#ttsFormat");
const ttsVolume = document.querySelector("#ttsVolume");
const ttsVolumeValue = document.querySelector("#ttsVolumeValue");
const ttsPitch = document.querySelector("#ttsPitch");
const ttsPitchValue = document.querySelector("#ttsPitchValue");
const ttsStylePrompt = document.querySelector("#ttsStylePrompt");
const generateTtsButton = document.querySelector("#generateTts");
const ttsStatus = document.querySelector("#ttsStatus");
const ttsPreview = document.querySelector("#ttsPreview");
const ttsPreviewTitle = document.querySelector("#ttsPreviewTitle");
const ttsPreviewMeta = document.querySelector("#ttsPreviewMeta");
const ttsAudio = document.querySelector("#ttsAudio");
const ttsHistory = document.querySelector("#ttsHistory");
const voiceAssetForm = document.querySelector("#voiceAssetForm");
const voiceAssetEditId = document.querySelector("#voiceAssetEditId");
const voiceAssetFormTitle = document.querySelector("#voiceAssetFormTitle");
const voiceAssetName = document.querySelector("#voiceAssetName");
const voiceAssetProvider = document.querySelector("#voiceAssetProvider");
const voiceAssetVoiceId = document.querySelector("#voiceAssetVoiceId");
const voiceAssetReferenceId = document.querySelector("#voiceAssetReferenceId");
const voiceAssetTargetModel = document.querySelector("#voiceAssetTargetModel");
const voiceAssetDescription = document.querySelector("#voiceAssetDescription");
const voiceAssetTags = document.querySelector("#voiceAssetTags");
const voiceAssetSample = document.querySelector("#voiceAssetSample");
const voiceAssetTranscript = document.querySelector("#voiceAssetTranscript");
const voiceAssetConsent = document.querySelector("#voiceAssetConsent");
const voiceAssetFormStatus = document.querySelector("#voiceAssetFormStatus");
const voiceSummary = document.querySelector("#voiceSummary");
const voiceFilterTabs = document.querySelector("#voiceFilterTabs");
const voiceCenterStatus = document.querySelector("#voiceCenterStatus");
const voiceAssetsGrid = document.querySelector("#voiceAssetsGrid");
const voiceTestsPanel = document.querySelector("#voiceTestsPanel");
const voiceTestsTitle = document.querySelector("#voiceTestsTitle");
const voiceTestsStatus = document.querySelector("#voiceTestsStatus");
const voiceTestsList = document.querySelector("#voiceTestsList");
const pageSessionId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let lastTranscriptText = "";
let lastTranscriptPath = "";
let lastRewritePath = "";
let allFiles = [];
let allTasks = [];
let currentPage = 1;
let currentTaskPage = 1;
let tasksPollTimer = 0;
let rewriteProgressTimer = 0;
let lastFinishedTaskCount = 0;
let activeResultAction = "";
let activeResultTaskIds = new Set();
let rewriteProviderConfigs = {};
let currentRewriteSpecs = [];
let rewriteVersionDrafts = new Map();
let directorConfig = null;
let directorSources = [];
let directorProjectsState = [];
let activeDirectorProject = null;
let activeDirectorTab = "shot-list";
let directorSourceContext = { taskId: 0, rewriteId: 0, sourceKey: "", sourceType: "manual" };
let directorPollTimer = 0;
let vfoConfig = null;
let vfoSources = [];
let vfoProjectsState = [];
let activeVfoProject = null;
let activeVfoTab = "overview";
let vfoPollTimer = 0;
let videoProductSources = { directors: [], audioJobs: [], imageAssets: [], timelines: [], platforms: [] };
let videoProductPreview = null;
let videoProductManualBindings = {};
let videoProductProjectsState = [];
let activeVideoProductProject = null;
let videoProductPollTimer = 0;
let ttsProviderConfigs = [];
let ttsPresetVoices = [];
let ttsPollTimer = 0;
let voiceAssets = [];
let defaultVoiceAsset = null;
let voiceAssetFilter = "preset";
let selectedVoiceAssetId = 0;
let voiceTestPollTimer = 0;
const selectedFiles = new Set();
const taskActionLabels = {
  parse: "解析信息",
  link: "获取下载链接",
  download: "下载视频",
  transcript: "提取文案",
};
const defaultRewriteReference = "痞里带刺、幽默自嘲、生活化观察、少说废话、有冲突、有观点、适合教育招生、让家长有感觉、不要像官方通稿、不要像AI作文。";
const rewriteDirectionOptions = ["招生引流", "家长焦虑", "单招升学", "暑假班转化", "英语提分", "朋友圈文案", "短视频口播"];
const rewriteVersionOptions = [
  { key: "strongHook", name: "强钩子版", direction: "招生引流", wordCount: "150字左右" },
  { key: "parentAnxiety", name: "家长焦虑版", direction: "家长焦虑", wordCount: "150字左右" },
  { key: "shortVideoScript", name: "短视频口播版", direction: "短视频口播", wordCount: "220字左右" },
  { key: "moments", name: "朋友圈版", direction: "朋友圈文案", wordCount: "220字左右" },
  { key: "conversion", name: "成交转化版", direction: "暑假班转化", wordCount: "150字左右" },
];
const maxRewriteVersionCount = 50;

function setBusy(label) {
  statusText.textContent = label;
  statusText.className = "";
  buttons.forEach((button) => {
    button.disabled = true;
  });
}

function setReady(label, ok = true) {
  statusText.textContent = label;
  statusText.className = ok ? "ok" : "error";
  buttons.forEach((button) => {
    button.disabled = false;
  });
}

function showProgress(percent, label) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  progressPanel.hidden = false;
  progressLabel.textContent = label || "正在下载";
  progressPercent.textContent = `${value}%`;
  progressBar.style.width = `${value}%`;
}

function hideProgress() {
  progressPanel.hidden = true;
  progressLabel.textContent = "准备下载";
  progressPercent.textContent = "0%";
  progressBar.style.width = "0%";
}

function setRewriteProgress(percent, label) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  rewriteProgress.hidden = false;
  rewriteProgressLabel.textContent = label || "正在生成";
  rewriteProgressPercent.textContent = `${value}%`;
  rewriteProgressBar.style.width = `${value}%`;
}

function stopRewriteProgress(label = "", percent = 100) {
  if (rewriteProgressTimer) {
    clearInterval(rewriteProgressTimer);
    rewriteProgressTimer = 0;
  }
  if (label) setRewriteProgress(percent, label);
}

function startRewriteProgress(versionCount = currentRewriteSpecs.length || 1) {
  if (rewriteProgressTimer) clearInterval(rewriteProgressTimer);
  const startedAt = Date.now();
  const stages = [
    [0, 8, "正在提交改写任务"],
    [1200, 20, "正在连接大模型"],
    [3200, 45, `正在生成 ${versionCount} 个版本`],
    [7000, 68, "正在润色招生转化表达"],
    [12000, 84, "正在等待模型返回"],
  ];
  setRewriteProgress(5, stages[0][2]);
  rewriteProgressTimer = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const current = [...stages].reverse().find(([time]) => elapsed >= time) || stages[0];
    const drift = Math.min(8, Math.floor(elapsed / 6000));
    setRewriteProgress(Math.min(92, current[1] + drift), current[2]);
  }, 800);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setTranscriptActions(text = "", filePath = "") {
  lastTranscriptText = text;
  lastTranscriptPath = filePath;
  copyTranscriptBtn.hidden = !text;
  openTranscriptBtn.hidden = !filePath;
}

function updateSelectionControls() {
  deleteSelectedBtn.disabled = selectedFiles.size === 0;
  const pageCheckboxes = [...document.querySelectorAll(".file-select-row")];
  const selectAll = document.querySelector("#selectAllFiles");
  if (!selectAll) return;

  const checkedCount = pageCheckboxes.filter((item) => item.checked).length;
  selectAll.checked = pageCheckboxes.length > 0 && checkedCount === pageCheckboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < pageCheckboxes.length;
}

function formatSize(size) {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getFileAction(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".mkv")) return "视频";
  if (lower.endsWith(".txt") || lower.includes("_文案")) return "文案";
  return "文件";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFiles(files) {
  allFiles = Array.isArray(files) ? files : [];
  const pageSize = Number(pageSizeSelect.value || 5);
  const totalPages = Math.max(1, Math.ceil(allFiles.length / pageSize));
  currentPage = Math.max(1, Math.min(currentPage, totalPages));

  if (allFiles.length === 0) {
    selectedFiles.clear();
    filesList.innerHTML = '<div class="empty">暂无下载文件</div>';
    filesPager.hidden = true;
    updateSelectionControls();
    return;
  }

  const start = (currentPage - 1) * pageSize;
  const pageFiles = allFiles.slice(start, start + pageSize);

  filesList.innerHTML = `
    <div class="file-row file-header">
      <div><input class="file-select" id="selectAllFiles" type="checkbox" title="全选本页" /></div>
      <div>序号</div>
      <div>动作</div>
      <div>文件名</div>
      <div>大小 / 时间</div>
      <div></div>
      <div></div>
    </div>
    ${pageFiles
      .map((file, index) => {
      const date = new Date(file.updatedAt).toLocaleString("zh-CN", {
        hour12: false,
      });
      const name = escapeHtml(file.name);
      const checked = selectedFiles.has(file.name) ? "checked" : "";
      return `
        <div class="file-row">
          <div><input class="file-select file-select-row" type="checkbox" data-file-name="${name}" ${checked} /></div>
          <div class="file-index">${start + index + 1}</div>
          <div><span class="file-action">${getFileAction(file.name)}</span></div>
          <div class="file-name" title="${name}">${name}</div>
          <div class="file-meta">${formatSize(file.size)} · ${date}</div>
          <button class="ghost small file-open" type="button" data-file-name="${name}">打开</button>
          <button class="ghost small danger-action file-delete" type="button" data-file-name="${name}">删除</button>
        </div>
      `;
    })
    .join("")}
  `;

  filesPager.hidden = false;
  pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
  updateSelectionControls();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || data.text || "操作失败");
  }
  return data;
}

async function refreshFiles() {
  const data = await fetchJson("/api/files");
  renderFiles(data.files);
}

function fillAnalysisFields(analysis = {}) {
  analysisHook.value = analysis.hook || "";
  analysisEmotion.value = Array.isArray(analysis.emotionPoints) ? analysis.emotionPoints.join("\n") : "";
  analysisPain.value = Array.isArray(analysis.painPoints) ? analysis.painPoints.join("\n") : "";
  analysisCta.value = analysis.callToAction || "";
  analysisTags.value = Array.isArray(analysis.tags) ? analysis.tags.join("、") : "";
  analysisCategory.value = analysis.category || "";
}

function formatAnalysisForRewrite(analysis = {}) {
  const lines = [];
  if (analysis.hook) lines.push(`爆款钩子：${analysis.hook}`);
  if (Array.isArray(analysis.emotionPoints) && analysis.emotionPoints.length) {
    lines.push(`情绪点：${analysis.emotionPoints.join("；")}`);
  }
  if (Array.isArray(analysis.painPoints) && analysis.painPoints.length) {
    lines.push(`痛点：${analysis.painPoints.join("；")}`);
  }
  if (analysis.callToAction) lines.push(`行动号召：${analysis.callToAction}`);
  if (analysis.category) lines.push(`自动分类：${analysis.category}`);
  if (Array.isArray(analysis.tags) && analysis.tags.length) lines.push(`标签：${analysis.tags.join("、")}`);
  if (analysis.summary) lines.push(`摘要：${analysis.summary}`);
  return lines.join("\n") || "未生成 AI 分析。";
}

function selectOptionsMarkup(options, selected) {
  return options
    .map((option) => `<option value="${escapeHtml(option)}"${option === selected ? " selected" : ""}>${escapeHtml(option)}</option>`)
    .join("");
}

function clampRewriteVersionCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(1, Math.min(maxRewriteVersionCount, Number.isFinite(parsed) ? parsed : 5));
}

function rewriteVersionAt(index) {
  const base = rewriteVersionOptions[index] || {
    key: `version-${index + 1}`,
    name: `版本 ${index + 1}`,
    direction: rewriteDirection.value || "招生引流",
    wordCount: "150字左右",
  };
  return rewriteVersionDrafts.get(base.key) || { ...base, content: "" };
}

function countRewriteCharacters(value) {
  return Array.from(String(value || "").replace(/\s+/g, "")).length;
}

function normalizeRewriteVersions(rewrite = {}, allowDefaults = true) {
  const rows = Array.isArray(rewrite.versions) ? rewrite.versions : [];
  const sources = rows.length > 0
    ? rows
    : currentRewriteSpecs.length > 0
      ? currentRewriteSpecs
      : allowDefaults
        ? rewriteVersionOptions
        : [];

  return sources.map((item, index) => {
    const base = rewriteVersionOptions.find((option) => option.key === item.key || option.name === item.name) || {};
    const key = item.key || base.key || `version-${index + 1}`;
    const cached = rewriteVersionDrafts.get(key) || {};
    return {
      key,
      name: item.name || base.name || `版本 ${index + 1}`,
      direction: item.direction || cached.direction || base.direction || rewriteDirection.value || "招生引流",
      wordCount: item.wordCount || cached.wordCount || base.wordCount || "150字左右",
      content: typeof item.content === "string" ? item.content : cached.content || "",
      revisionInstruction: item.revisionInstruction || cached.revisionInstruction || "",
    };
  });
}

function renderRewriteVersions(rewrite = {}, { allowDefaults = true } = {}) {
  const versions = normalizeRewriteVersions(rewrite, allowDefaults);
  currentRewriteSpecs = versions.map(({ content, ...spec }) => spec);
  for (const version of versions) rewriteVersionDrafts.set(version.key, { ...version });
  rewriteVersionCountInput.value = String(Math.max(1, versions.length));

  if (versions.length === 0) {
    rewriteVersions.innerHTML = '<div class="rewrite-empty">请至少保留一个输出框。</div>';
    return;
  }

  rewriteVersions.innerHTML = versions
    .map((version) => `
      <div class="rewrite-version" data-version-key="${escapeHtml(version.key)}">
        <div class="rewrite-version-head">
          <button class="ghost small rewrite-generate-one" type="button" data-version-key="${escapeHtml(version.key)}">生成</button>
          <button class="ghost small rewrite-save-one" type="button" data-version-key="${escapeHtml(version.key)}">保存</button>
          <button class="ghost small rewrite-tts-one" type="button" data-version-key="${escapeHtml(version.key)}">生成语音</button>
          <button class="ghost small rewrite-director-one" type="button" data-version-key="${escapeHtml(version.key)}">导演稿</button>
          <button class="ghost small rewrite-copy" type="button" data-version-key="${escapeHtml(version.key)}">复制</button>
        </div>
        <div class="rewrite-version-options">
          <label>
            改写方向
            <select class="rewrite-version-direction">
              ${selectOptionsMarkup(rewriteDirectionOptions, version.direction)}
            </select>
          </label>
          <label class="word-count-field">
            字数要求
            <input class="rewrite-version-word-count" type="text" value="${escapeHtml(version.wordCount)}" placeholder="如 150字左右" />
          </label>
        </div>
        <textarea class="rewrite-version-text" rows="8" data-version-key="${escapeHtml(version.key)}" placeholder="生成后可继续手动编辑">${escapeHtml(version.content)}</textarea>
        <div class="rewrite-revision-box">
          <label>
            修改建议
            <textarea class="rewrite-version-suggestion" rows="2" placeholder="例如：开头更强烈、增加家长焦虑、语气更口语、结尾加强行动号召">${escapeHtml(version.revisionInstruction || "")}</textarea>
          </label>
          <button class="ghost small rewrite-revise-one" type="button" data-version-key="${escapeHtml(version.key)}">按建议二次改写</button>
        </div>
        <div class="rewrite-version-foot">
          <span class="rewrite-char-count">当前 ${countRewriteCharacters(version.content)} 字</span>
        </div>
      </div>
    `)
    .join("");
}

function collectRewriteVersions() {
  const versions = [...rewriteVersions.querySelectorAll(".rewrite-version")].map((card, index) => {
    const cached = rewriteVersionDrafts.get(card.dataset.versionKey) || currentRewriteSpecs[index] || {};
    const version = {
      key: card.dataset.versionKey,
      name: cached.name || `版本 ${index + 1}`,
      direction: card.querySelector(".rewrite-version-direction")?.value || rewriteDirection.value,
      wordCount: card.querySelector(".rewrite-version-word-count")?.value.trim() || "150字左右",
      content: card.querySelector(".rewrite-version-text")?.value || "",
      revisionInstruction: card.querySelector(".rewrite-version-suggestion")?.value.trim() || "",
    };
    rewriteVersionDrafts.set(version.key, { ...version });
    return version;
  });
  currentRewriteSpecs = versions.map(({ content, ...spec }) => spec);
  return versions;
}

function syncRewriteVersionCount() {
  const existingVersions = collectRewriteVersions();
  const count = clampRewriteVersionCount(rewriteVersionCountInput.value);
  rewriteVersionCountInput.value = String(count);
  const versions = existingVersions.slice(0, count);
  while (versions.length < count) versions.push(rewriteVersionAt(versions.length));
  renderRewriteVersions({ versions }, { allowDefaults: false });
  rewriteStatus.textContent = `已设置 ${versions.length} 个输出框，可分别设置方向和字数。`;
}

function collectReferenceExamplesText() {
  return rewriteReferenceExamples.value
    .split(/\n{2,}|---+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function renderReferenceExamples(examples = []) {
  rewriteReferenceExamples.value = (Array.isArray(examples) ? examples : [])
    .map((item) => typeof item === "string" ? item : item.text || item.content || "")
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function rewriteParams() {
  return {
    toneLevel: Number(rewriteToneLevel.value || 8),
    conflictLevel: Number(rewriteConflictLevel.value || 7),
    emotionLevel: Number(rewriteEmotionLevel.value || 7),
    salesLevel: Number(rewriteSalesLevel.value || 6),
    humanizeLevel: rewriteHumanizeLevel.value || "普通",
  };
}

function syncRewriteSliderLabels() {
  rewriteToneValue.textContent = rewriteToneLevel.value;
  rewriteConflictValue.textContent = rewriteConflictLevel.value;
  rewriteEmotionValue.textContent = rewriteEmotionLevel.value;
  rewriteSalesValue.textContent = rewriteSalesLevel.value;
}

function renderTranscripts(items) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) {
    transcriptList.innerHTML = "";
    return;
  }

  transcriptList.innerHTML = rows
    .map((item) => {
      const ai = item.ai || {};
      const tags = Array.isArray(ai.tags) ? ai.tags.join("、") : "";
      const category = ai.category || "";
      const rewrite = item.rewrite || {};
      const rewriteLabel = Array.isArray(rewrite.versions) && rewrite.versions.some((version) => version.content)
        ? `已改写：${rewrite.direction || item.rewriteDirection || "-"} / ${rewrite.style || item.rewriteStyle || "-"}`
        : "";
      const label = [[category, tags].filter(Boolean).join(" / "), rewriteLabel].filter(Boolean).join(" · ");
      return `
        <div class="transcript-card">
          <div>
            <div class="transcript-title">${escapeHtml(item.title || `任务 ${item.id}`)}</div>
            <div class="transcript-text">${escapeHtml(item.text || "")}</div>
            <div class="transcript-tags">${escapeHtml(label || "未分析")}</div>
          </div>
          <div class="transcript-actions">
            <button class="ghost small transcript-analyze" type="button" data-task-id="${item.id}">AI 分析</button>
            <button class="ghost small transcript-rewrite" type="button" data-task-id="${item.id}">AI 改写</button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function refreshTranscripts() {
  const data = await fetchJson("/api/transcripts");
  renderTranscripts(data.transcripts);
  return data.transcripts;
}

async function openAnalysisEditor(taskId) {
  const transcripts = await refreshTranscripts();
  const item = transcripts.find((row) => String(row.id) === String(taskId));
  if (!item) return;
  analysisTaskId.value = item.id;
  analysisTranscript.value = item.text || "";
  fillAnalysisFields(item.ai || {});
  analysisStatus.textContent = item.ai?.hook ? "已加载历史分析，可重新生成或编辑保存。" : "可点击生成/重新分析。";
  analysisPanel.hidden = false;
  window.workbenchNavigate?.("analysis", { preserveScroll: true });
  analysisPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openRewriteEditor(taskId) {
  const transcripts = await refreshTranscripts();
  const savedExamples = await fetchJson("/api/reference-examples").catch(() => ({ examples: [] }));
  const item = transcripts.find((row) => String(row.id) === String(taskId));
  if (!item) return;

  rewriteTaskId.value = item.id;
  rewriteOriginal.value = item.text || "";
  rewriteAnalysisView.textContent = formatAnalysisForRewrite(item.ai || {});
  const rewrite = item.rewrite || {};
  if (rewrite.provider && [...rewriteProvider.options].some((option) => option.value === rewrite.provider)) {
    rewriteProvider.value = rewrite.provider;
  }
  rewriteDirection.value = rewrite.direction || item.rewriteDirection || rewriteDirection.value || "招生引流";
  rewriteStyle.value = rewrite.style || item.rewriteStyle || rewriteStyle.value || "痞里带刺";
  rewriteReference.value = rewrite.referenceStyle || rewriteReference.value || defaultRewriteReference;
  const params = rewrite.params || item.rewriteParams || {};
  rewriteToneLevel.value = String(params.toneLevel || 8);
  rewriteConflictLevel.value = String(params.conflictLevel || 7);
  rewriteEmotionLevel.value = String(params.emotionLevel || 7);
  rewriteSalesLevel.value = String(params.salesLevel || 6);
  rewriteHumanizeLevel.value = rewrite.humanizeLevel || item.humanizeLevel || params.humanizeLevel || "普通";
  renderReferenceExamples((rewrite.referenceExamples || item.referenceExamples || []).length
    ? (rewrite.referenceExamples || item.referenceExamples)
    : savedExamples.examples || []);
  syncRewriteSliderLabels();
  lastRewritePath = item.rewritePath || "";
  rewriteVersionDrafts = new Map();
  currentRewriteSpecs = [];
  renderRewriteVersions(rewrite);
  rewriteStatus.textContent = rewrite.versions?.length
    ? `已加载 ${rewrite.versions.length} 个历史版本，可编辑后保存或重新生成。`
    : `已准备 ${currentRewriteSpecs.length} 个输出框，可调整数量、方向和字数。`;
  rewritePanel.hidden = false;
  window.workbenchNavigate?.("rewrite", { preserveScroll: true });
  rewritePanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function statusClass(status) {
  return {
    等待: "status-waiting",
    下载中: "status-downloading",
    提取中: "status-transcribing",
    已暂停: "status-paused",
    完成: "status-done",
    失败: "status-failed",
  }[status] || "status-waiting";
}

function shortPath(value) {
  const text = String(value || "");
  if (!text) return "";
  return text.split(/[\\/]/).pop() || text;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function getTaskDownloadUrl(task) {
  const stats = parseJson(task.stats_json);
  const messageUrl = String(task.message || "").match(/https?:\/\/\S+/)?.[0] || "";
  return stats.downloadUrl || stats.url || messageUrl;
}

function formatTaskResult(task, index) {
  const action = task.task_action || (task.only_transcript ? "transcript" : "download");
  const label = taskActionLabels[action] || "任务";
  const progress = Math.max(0, Math.min(100, Number(task.progress || 0)));
  const downloadUrl = getTaskDownloadUrl(task);
  const lines = [
    `${index + 1}. 【${label}】#${task.id} ${task.status}（${progress}%）`,
    `原链接：${task.url || "-"}`,
  ];

  if (task.title) lines.push(`标题：${task.title}`);
  if (task.video_id) lines.push(`视频ID：${task.video_id}`);
  if (downloadUrl) lines.push(`下载链接：${downloadUrl}`);
  if (task.video_path) lines.push(`视频文件：${task.video_path}`);
  if (task.txt_path) lines.push(`文案文件：${task.txt_path}`);
  if (task.analysis_path) lines.push(`AI分析：${task.analysis_path}`);
  if (task.file_size) lines.push(`文件大小：${formatSize(Number(task.file_size))}`);
  if (task.file_hash) lines.push(`完整性校验：${String(task.file_hash).slice(0, 16)}...`);
  if (task.error) lines.push(`错误：${task.error}`);
  if (task.message) lines.push(`消息：${task.message}`);

  return lines.join("\n");
}

function trackImportedTasks(action, imported = {}) {
  activeResultAction = action;
  activeResultTaskIds = new Set(
    [...(imported.tasks || []), ...(imported.duplicates || [])]
      .map((task) => String(task.id || ""))
      .filter(Boolean)
  );
}

function updateResultFromTasks(tasks) {
  if (!activeResultAction) return;

  const rows = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => {
      if (activeResultTaskIds.size > 0) return activeResultTaskIds.has(String(task.id));
      return (task.task_action || "") === activeResultAction;
    })
    .sort((left, right) => Number(left.id || 0) - Number(right.id || 0));

  if (rows.length === 0) {
    resultBox.textContent = "没有创建新任务，可能已去重或已跳过已下载。";
    return;
  }

  const finished = rows.filter((task) => task.status === "完成" || task.status === "失败").length;
  const label = taskActionLabels[activeResultAction] || "任务";
  resultBox.textContent = [
    `${label}结果（${finished}/${rows.length} 已结束）`,
    "",
    rows.map(formatTaskResult).join("\n\n"),
  ].join("\n");
}

function renderTaskStats(summary, running, concurrency) {
  const counts = summary?.counts || {};
  const items = [
    ["总数", summary?.total || 0],
    ["等待", counts["等待"] || 0],
    ["下载中", counts["下载中"] || 0],
    ["提取中", counts["提取中"] || 0],
    ["已暂停", counts["已暂停"] || 0],
    ["完成", counts["完成"] || 0],
    ["失败", counts["失败"] || 0],
  ];
  taskStats.innerHTML = items
    .map(([label, value]) => `
      <div class="task-stat">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `)
    .join("");
  batchStatus.textContent = `运行中 ${running || 0} / 并发 ${concurrency || batchConcurrency.value}`;
}

function renderTasks(tasks) {
  allTasks = Array.isArray(tasks) ? tasks : [];
  const pageSize = Number(taskPageSize.value || 10);
  const totalPages = Math.max(1, Math.ceil(allTasks.length / pageSize));
  currentTaskPage = Math.max(1, Math.min(currentTaskPage, totalPages));
  const start = (currentTaskPage - 1) * pageSize;
  const rows = allTasks.slice(start, start + pageSize);
  tasksTable.className = `tasks-table task-density-${taskDensity.value || "small"}`;

  if (allTasks.length === 0) {
    tasksTable.innerHTML = '<div class="empty">暂无批量任务</div>';
    taskPager.hidden = true;
    return;
  }

  taskPager.hidden = false;
  taskPageInfo.textContent = `第 ${currentTaskPage} / ${totalPages} 页，共 ${allTasks.length} 条`;
  prevTaskPage.disabled = currentTaskPage <= 1;
  nextTaskPage.disabled = currentTaskPage >= totalPages;

  tasksTable.innerHTML = `
    <div class="task-row task-header">
      <div>ID</div>
      <div>状态</div>
      <div>进度</div>
      <div>链接</div>
      <div>视频</div>
      <div>文案 / AI</div>
      <div>标签 / 分类</div>
      <div>消息</div>
      <div>操作</div>
    </div>
    ${rows
      .map((task) => {
        const progress = Math.max(0, Math.min(100, Number(task.progress || 0)));
        const url = escapeHtml(task.url || "");
        const videoPath = escapeHtml(shortPath(task.video_path));
        const txtParts = [shortPath(task.txt_path), shortPath(task.analysis_path)].filter(Boolean).join(" / ");
        const ai = parseJson(task.ai_json);
        const tags = Array.isArray(ai.tags) ? ai.tags.join("、") : "";
        const category = ai.category || "";
        const labelText = [category, tags].filter(Boolean).join(" / ");
        const message = escapeHtml(task.error || task.message || "");
        const canPause = task.status === "下载中" || task.status === "提取中";
        const canDelete = !canPause;
        const actionButton = canPause
          ? `<button class="ghost small task-pause" type="button" data-task-id="${task.id}">暂停</button>`
          : `<button class="ghost small danger-action task-delete" type="button" data-task-id="${task.id}" ${canDelete ? "" : "disabled"}>删除</button>`;
        return `
          <div class="task-row">
            <div class="task-id">#${task.id}</div>
            <div><span class="status-badge ${statusClass(task.status)}">${escapeHtml(task.status)}</span></div>
            <div class="task-progress">
              <span>${progress}%</span>
              <div class="task-progress-track"><div class="task-progress-bar" style="width:${progress}%"></div></div>
            </div>
            <div class="task-url" title="${url}">${url}</div>
            <div class="task-path" title="${escapeHtml(task.video_path || "")}">${videoPath || "-"}</div>
            <div class="task-path" title="${escapeHtml([task.txt_path, task.analysis_path].filter(Boolean).join(" / "))}">${escapeHtml(txtParts) || "-"}</div>
            <div class="task-tags" title="${escapeHtml(labelText)}">${escapeHtml(labelText) || "-"}</div>
            <div class="task-message" title="${message}">${message || "-"}</div>
            <div>${actionButton}</div>
          </div>
        `;
      })
      .join("")}
  `;
}

function shouldPollTasks(data) {
  const counts = data?.summary?.counts || {};
  return (data?.running || 0) > 0 || (counts["等待"] || 0) > 0 || (counts["下载中"] || 0) > 0 || (counts["提取中"] || 0) > 0;
}

function scheduleTasksPoll(active) {
  if (tasksPollTimer) {
    clearTimeout(tasksPollTimer);
    tasksPollTimer = 0;
  }
  if (!active) return;
  tasksPollTimer = setTimeout(() => {
    refreshTasks().catch(() => {});
  }, 1800);
}

async function refreshTasks() {
  const data = await fetchJson("/api/tasks?limit=200");
  renderTaskStats(data.summary, data.running, data.concurrency);
  renderTasks(data.tasks);
  updateResultFromTasks(data.tasks);
  const counts = data.summary?.counts || {};
  const finishedCount = (counts["完成"] || 0) + (counts["失败"] || 0);
  const active = shouldPollTasks(data);
  if (finishedCount !== lastFinishedTaskCount || !active) {
    refreshFiles().catch(() => {});
    refreshTranscripts().catch(() => {});
    lastFinishedTaskCount = finishedCount;
  }
  scheduleTasksPoll(active);
}

async function enqueueTasks(action) {
  const text = shareLink.value.trim();
  if (!text) {
    batchStatus.textContent = "请先在上方粘贴抖音分享链接";
    resultBox.textContent = "请先在上方粘贴抖音分享链接。";
    return;
  }

  const label = taskActionLabels[action] || "任务";
  batchStatus.textContent = `正在导入${label}队列`;
  resultBox.textContent = `正在导入${label}任务，请稍等...`;
  try {
    const data = await fetchJson("/api/tasks/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        action,
        kind: batchKind.value,
        limit: Number(batchLimit.value || 10),
        concurrency: Number(batchConcurrency.value || 3),
        skipDownloaded: skipDownloaded.checked,
      }),
    });
    const imported = data.imported || {};
    trackImportedTasks(action, imported);
    batchStatus.textContent = `已导入 ${imported.inserted || 0} 条，去重 ${imported.duplicate || 0} 条，跳过已下载 ${imported.skippedDownloaded || 0} 条`;
    renderTaskStats(data.summary, data.running, data.concurrency);
    renderTasks(data.tasks);
    updateResultFromTasks(data.tasks);
    scheduleTasksPoll(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    batchStatus.textContent = message;
    resultBox.textContent = message;
  }
}

async function startQueue() {
  const data = await fetchJson("/api/tasks/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ concurrency: Number(batchConcurrency.value || 3) }),
  });
  renderTaskStats(data.summary, data.running, data.concurrency);
  renderTasks(data.tasks);
  scheduleTasksPoll(true);
}

function downloadExport(format) {
  window.location.href = `/api/tasks/export?format=${encodeURIComponent(format)}`;
}

async function setDownloadDir(path) {
  const data = await fetchJson("/api/downloads-dir", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  downloadDirInput.value = data.downloadsDir || path;
  savePath.textContent = `下载位置：${data.downloadsDir}`;
  renderFiles(data.files);
  return data;
}

async function chooseDownloadDir() {
  const data = await fetchJson("/api/downloads-dir/choose", { method: "POST" });
  downloadDirInput.value = data.downloadsDir || "";
  savePath.textContent = `下载位置：${data.downloadsDir}`;
  renderFiles(data.files);
}

async function pauseTask(id) {
  const data = await fetchJson("/api/tasks/pause", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  renderTaskStats(data.summary, data.running, data.concurrency);
  renderTasks(data.tasks);
  scheduleTasksPoll(true);
}

async function deleteTask(id) {
  const data = await fetchJson("/api/tasks/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
  batchStatus.textContent = `已删除 ${data.deleted || 0} 条任务`;
  renderTaskStats(data.summary, data.running, data.concurrency);
  renderTasks(data.tasks);
}

async function deleteFiles(fileNames) {
  const names = [...new Set(fileNames)].filter(Boolean);
  if (names.length === 0) return;

  const ok = window.confirm(`确定删除 ${names.length} 个文件吗？`);
  if (!ok) return;

  try {
    const data = await fetchJson("/api/delete-files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileNames: names }),
    });
    for (const name of names) selectedFiles.delete(name);
    renderFiles(data.files);
    setReady(`已删除 ${data.deleted.length} 个文件`, true);
  } catch (error) {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("删除失败", false);
  }
}

function renderProviderOptions(select, providers, selected = "dashscope", { disableUnconfigured = false } = {}) {
  if (!select) return;
  select.innerHTML = Object.entries(providers)
    .map(([id, provider]) => {
      const disabled = disableUnconfigured && !provider.apiKeyConfigured ? "disabled" : "";
      const label = `${provider.label || id}${disabled ? "（未配置）" : ""}`;
      return `<option value="${id}" ${disabled}>${escapeHtml(label)}</option>`;
    })
    .join("");
  if (providers[selected] && !(disableUnconfigured && !providers[selected].apiKeyConfigured)) {
    select.value = selected;
    return;
  }
  if (disableUnconfigured) {
    const firstConfigured = Object.entries(providers).find(([, provider]) => provider.apiKeyConfigured);
    if (firstConfigured) select.value = firstConfigured[0];
  }
}

function updateRewriteModelOptions(provider = {}) {
  if (!rewriteModelOptions) return;
  const models = Array.isArray(provider.models) ? provider.models : [];
  rewriteModelOptions.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
}

function updateRewritePresetFields() {
  const provider = rewriteProviderConfigs[rewriteSettingsProvider?.value] || {};
  const autoModel = provider.custom ? false : provider.autoModel !== false;
  if (rewriteAutoModel) {
    rewriteAutoModel.checked = autoModel;
    rewriteAutoModel.disabled = Boolean(provider.custom);
  }
  if (rewriteModelInput) {
    rewriteModelInput.value = provider.model || "";
    rewriteModelInput.readOnly = autoModel;
    rewriteModelInput.placeholder = autoModel ? "保存后自动获取最新模型" : "手动填写模型名";
  }
  if (rewriteBaseUrlInput) {
    rewriteBaseUrlInput.value = provider.baseUrl || "";
    rewriteBaseUrlInput.readOnly = !provider.custom;
  }
  updateRewriteModelOptions(provider);
  if (rewriteApplyLink) {
    const applyUrl = provider.applyUrl || "";
    rewriteApplyLink.href = applyUrl || "#";
    rewriteApplyLink.textContent = applyUrl ? `申请 ${provider.label || ""} API Key` : "无申请入口";
    rewriteApplyLink.classList.toggle("disabled-link", !applyUrl);
  }
  if (rewriteBalanceLink) {
    const balanceUrl = provider.balanceUrl || provider.applyUrl || "";
    rewriteBalanceLink.href = balanceUrl || "#";
    rewriteBalanceLink.textContent = balanceUrl ? "余额/控制台" : "无余额入口";
    rewriteBalanceLink.classList.toggle("disabled-link", !balanceUrl);
  }
  if (rewriteUnifiedKey) {
    rewriteUnifiedKey.placeholder = `粘贴 ${provider.label || "所选平台"} API Key`;
  }
}

function selectedTtsProviderConfig() {
  return ttsProviderConfigs.find((provider) => provider.id === ttsProvider.value) || {};
}

function renderTtsProviderOptions(tts = {}) {
  ttsProviderConfigs = Array.isArray(tts.providers) ? tts.providers : [];
  ttsProvider.innerHTML = ttsProviderConfigs
    .map((provider) => {
      const suffix = provider.enabled ? "" : `（${provider.phase || "预留"}）`;
      return `<option value="${escapeHtml(provider.id)}" ${provider.enabled ? "" : "disabled"}>${escapeHtml(provider.label)}${escapeHtml(suffix)}</option>`;
    })
    .join("");
  const requested = tts.default_provider || "aliyun_bailian";
  ttsProvider.value = ttsProviderConfigs.some((provider) => provider.id === requested && provider.enabled)
    ? requested
    : "aliyun_bailian";
  ttsSpeed.value = String(tts.default_speed || 1);
  ttsFormat.value = tts.default_format === "wav" ? "wav" : "mp3";
}

function updateTtsProviderFields() {
  const provider = selectedTtsProviderConfig();
  const isAliyun = provider.id === "aliyun_bailian";
  const supportsBaseUrl = ["custom_tts", "fish_audio"].includes(provider.id);
  if (ttsWorkspaceField) ttsWorkspaceField.hidden = true;
  if (ttsBaseUrlField) ttsBaseUrlField.hidden = true;
  ttsWorkspaceId.value = isAliyun ? provider.workspace_id || "" : "";
  ttsBaseUrl.value = supportsBaseUrl ? provider.base_url || "" : "";
  ttsModel.value = provider.default_model || "";
  ttsApiKey.value = "";
  ttsApiKey.placeholder = "";
  if (ttsBaseUrlField) ttsBaseUrlField.hidden = !supportsBaseUrl;
  if (ttsWorkspaceField) ttsWorkspaceField.hidden = !isAliyun;
  if (provider.id === "fish_audio") {
    ttsVoiceSource.value = "manual";
    ttsFormat.value = provider.default_format || "mp3";
  }
  if (ttsCurrentProviderLabel) ttsCurrentProviderLabel.textContent = provider.label || "未设置";
  if (ttsCurrentModelLabel) {
    const keyState = provider.configured ? `API 已保存：${provider.secret_mask || "已脱敏"}` : "API 未配置";
    ttsCurrentModelLabel.textContent = `${provider.default_model || "未设置模型"} · ${keyState}`;
  }
  ttsSettingsStatus.textContent = provider.configured
    ? `${provider.label} 已在系统设置中配置。`
    : `${provider.label || "当前平台"}尚未配置，请到系统设置保存 API。`;
}

function selectedTtsVoice() {
  const voiceId = ttsVoiceSource.value === "manual" ? ttsManualVoice.value.trim() : ttsPresetVoice.value;
  if (!voiceId) return null;
  if (ttsVoiceSource.value === "cloned") {
    const asset = voiceAssets.find((item) =>
      item.provider === ttsProvider.value && item.voice_id === voiceId && item.voice_type === "clone" && !item.archived
    );
    return asset ? {
      id: asset.voice_id,
      name: asset.voice_name,
      model: asset.metadata?.target_model || asset.metadata?.model || "",
      asset,
    } : null;
  }
  return ttsPresetVoices.find((voice) => voice.id === voiceId) || null;
}

function syncTtsModelToSelectedVoice() {
  const voice = selectedTtsVoice();
  if (voice?.model) {
    ttsModel.value = voice.model;
    if (ttsCurrentModelLabel) {
      const provider = selectedTtsProviderConfig();
      const keyState = provider.configured ? `API 已保存：${provider.secret_mask || "已脱敏"}` : "API 未配置";
      ttsCurrentModelLabel.textContent = `${voice.model} · ${keyState}`;
    }
  }
}

function renderTtsVoices() {
  const cloned = ttsVoiceSource.value === "cloned";
  const sourceVoices = cloned
    ? voiceAssets
        .filter((asset) => asset.voice_type === "clone" && asset.provider === ttsProvider.value && asset.status === "active")
        .map((asset) => ({
          id: asset.voice_id,
          name: asset.voice_name,
          model: asset.metadata?.target_model || "",
          description: `克隆音色 v${asset.version}`,
        }))
    : ttsPresetVoices;
  const voices = sourceVoices;
  ttsPresetVoice.innerHTML = voices.length
    ? voices
        .map((voice) => {
          const model = voice.model ? ` · ${voice.model}` : "";
          return `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.name)} · ${escapeHtml(voice.description || voice.id)}${escapeHtml(model)}</option>`;
        })
        .join("")
    : '<option value="">当前平台暂无预设音色</option>';
  const configuredDefault = selectedTtsProviderConfig().default_voice || "";
  if (voices.some((voice) => voice.id === configuredDefault)) ttsPresetVoice.value = configuredDefault;
  syncTtsModelToSelectedVoice();
}

async function loadTtsVoices() {
  const provider = selectedTtsProviderConfig();
  if (!provider.enabled) {
    ttsPresetVoices = [];
    renderTtsVoices();
    return;
  }
  const data = await fetchJson(`/api/tts/voices?provider=${encodeURIComponent(provider.id)}`);
  ttsPresetVoices = Array.isArray(data.voices) ? data.voices : [];
  renderTtsVoices();
  if (ttsPresetVoices.length === 0 && ["custom_tts", "fish_audio"].includes(provider.id)) {
    ttsVoiceSource.value = "manual";
    updateTtsVoiceSource();
  }
}

function updateTtsVoiceSource() {
  const manual = ttsVoiceSource.value === "manual";
  ttsPresetVoiceField.hidden = manual;
  ttsManualVoiceField.hidden = !manual;
  if (!manual) renderTtsVoices();
}

function updateTtsEmotionField() {
  ttsCustomEmotionField.hidden = ttsEmotion.value !== "custom";
}

function updateTtsRangeLabels() {
  ttsVolumeValue.textContent = ttsVolume.value;
  ttsPitchValue.textContent = Number(ttsPitch.value || 1).toFixed(2);
}

async function saveTtsProviderSettings() {
  const provider = selectedTtsProviderConfig();
  ttsSettingsStatus.textContent = "正在保存平台设置...";
  const body = {
    provider: provider.id,
    api_key: ttsApiKey.value.trim(),
    default_speed: Number(ttsSpeed.value || 1),
    default_format: ttsFormat.value,
  };
  if (provider.id === "aliyun_bailian") {
    body.workspace_id = ttsWorkspaceId.value.trim();
    body.default_model = ttsModel.value.trim() || "cosyvoice-v2";
    body.default_voice = ttsVoiceSource.value === "manual" ? ttsManualVoice.value.trim() : ttsPresetVoice.value;
  }
  if (provider.id === "custom_tts") {
    body.base_url = ttsBaseUrl.value.trim();
    body.model = ttsModel.value.trim();
    body.voice = ttsVoiceSource.value === "manual" ? ttsManualVoice.value.trim() : ttsPresetVoice.value;
  }
  if (provider.id === "fish_audio") {
    body.base_url = ttsBaseUrl.value.trim() || "https://api.fish.audio";
    body.model = ttsModel.value.trim() || "s2-pro";
    body.voice = ttsVoiceSource.value === "manual" ? ttsManualVoice.value.trim() : ttsPresetVoice.value;
    body.reference_id = body.voice;
    body.default_format = ttsFormat.value || "mp3";
  }
  try {
    const data = await fetchJson("/api/tts/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    renderTtsProviderOptions(data.tts || {});
    updateTtsProviderFields();
    await loadTtsVoices();
    const current = selectedTtsProviderConfig();
    ttsSettingsStatus.textContent = current.configured
      ? `平台设置已保存，密钥显示为：${current.secret_mask || "已脱敏"}`
      : "平台基础设置已保存；生成前仍需填写 API Key。";
  } catch (error) {
    ttsSettingsStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

function ttsStatusLabel(status) {
  return {
    waiting: "等待中",
    processing: "生成中",
    completed: "已完成",
    failed: "失败",
  }[status] || status;
}

function renderTtsJobs(jobs = []) {
  if (!jobs.length) {
    ttsHistory.innerHTML = '<div class="tts-empty">还没有生成记录。</div>';
    return;
  }
  const labels = Object.fromEntries(ttsProviderConfigs.map((provider) => [provider.id, provider.label]));
  ttsHistory.innerHTML = jobs
    .map((job) => {
      const audio = job.audio_url
        ? `<audio controls preload="none" src="${escapeHtml(job.audio_url)}"></audio>`
        : `<span title="${escapeHtml(job.error || "")}">${escapeHtml(job.error || "等待生成")}</span>`;
      return `
        <div class="tts-history-row">
          <strong>#${job.id}</strong>
          <span>${escapeHtml(labels[job.provider] || job.provider)}</span>
          <span class="tts-history-text" title="${escapeHtml(job.text)}">${escapeHtml(job.text)}</span>
          <span>${escapeHtml(job.voice_name || job.voice_id || "-")}</span>
          <span class="tts-job-status ${escapeHtml(job.status)}">${escapeHtml(ttsStatusLabel(job.status))}</span>
          ${audio}
        </div>
      `;
    })
    .join("");
}

async function refreshTtsJobs() {
  const data = await fetchJson("/api/tts/jobs?limit=30");
  renderTtsJobs(data.jobs || []);
}

function showTtsPreview(job) {
  ttsPreview.hidden = false;
  ttsPreviewTitle.textContent = `语音 #${job.id}`;
  ttsPreviewMeta.textContent = `${job.voice_name || job.voice_id || "音色"} · ${job.speed}x · ${String(job.format || "").toUpperCase()}`;
  ttsAudio.src = `${job.audio_url}&t=${Date.now()}`;
  ttsAudio.load();
}

async function waitForTtsJob(jobId) {
  if (ttsPollTimer) clearTimeout(ttsPollTimer);
  const data = await fetchJson(`/api/tts/job?id=${encodeURIComponent(jobId)}`);
  const job = data.job;
  if (job.status === "completed") {
    generateTtsButton.disabled = false;
    ttsStatus.textContent = "生成完成，可以试听。";
    showTtsPreview(job);
    await refreshTtsJobs();
    return;
  }
  if (job.status === "failed") {
    generateTtsButton.disabled = false;
    ttsStatus.textContent = job.error || "生成失败。";
    await refreshTtsJobs();
    return;
  }
  ttsStatus.textContent = job.status === "processing" ? "正在生成音频..." : "任务已进入队列...";
  ttsPollTimer = setTimeout(() => {
    waitForTtsJob(jobId).catch((error) => {
      generateTtsButton.disabled = false;
      ttsStatus.textContent = error instanceof Error ? error.message : String(error);
    });
  }, 1000);
}

async function generateTts() {
  const text = ttsText.value.trim();
  const voiceId = ttsVoiceSource.value === "manual" ? ttsManualVoice.value.trim() : ttsPresetVoice.value;
  const voiceAsset = voiceAssets.find((asset) =>
    asset.provider === ttsProvider.value && asset.voice_id === voiceId && !asset.archived
  ) || null;
  if (!text) {
    ttsStatus.textContent = "请先输入配音文案。";
    return;
  }
  if (!voiceId) {
    ttsStatus.textContent = "请选择音色或填写 voice_id。";
    return;
  }
  generateTtsButton.disabled = true;
  ttsStatus.textContent = "正在提交生成任务...";
  try {
    const selectedVoice = ttsPresetVoices.find((voice) => voice.id === voiceId);
    const selectedVoiceForModel = selectedTtsVoice();
    const data = await fetchJson("/api/tts/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: ttsProvider.value,
        text,
        voice_id: voiceId,
        voice_name: selectedVoiceForModel?.name || selectedVoice?.name || voiceId,
        voice_asset_id: voiceAsset?.id || 0,
        model: voiceAsset?.metadata?.target_model || voiceAsset?.metadata?.model || selectedVoiceForModel?.model || ttsModel.value.trim(),
        speed: Number(ttsSpeed.value || 1),
        emotion: ttsEmotion.value === "custom" ? ttsCustomEmotion.value.trim() : ttsEmotion.value,
        style_prompt: ttsStylePrompt.value.trim(),
        volume: Number(ttsVolume.value || 50),
        pitch: Number(ttsPitch.value || 1),
        format: ttsFormat.value,
      }),
    });
    await waitForTtsJob(data.job.id);
  } catch (error) {
    generateTtsButton.disabled = false;
    ttsStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

function voiceStatusLabel(status) {
  return {
    active: "可用",
    clone_failed: "复刻失败",
    pending: "待处理",
  }[status] || status || "可用";
}

function formatVoiceTime(value) {
  if (!value) return "尚未使用";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function filteredVoiceAssets() {
  const rows = [...voiceAssets];
  if (voiceAssetFilter === "preset") return rows.filter((asset) => asset.voice_type === "preset");
  if (voiceAssetFilter === "clone") return rows.filter((asset) => asset.voice_type === "clone");
  if (voiceAssetFilter === "favorite") return rows.filter((asset) => asset.is_favorite);
  if (voiceAssetFilter === "recent") {
    return rows.filter((asset) => asset.use_count > 0).sort((a, b) => String(b.last_used_at).localeCompare(String(a.last_used_at)));
  }
  if (voiceAssetFilter === "default") return rows.filter((asset) => asset.is_default);
  return rows;
}

function renderVoiceSummary() {
  const presetCount = voiceAssets.filter((asset) => asset.voice_type === "preset").length;
  const cloneCount = voiceAssets.filter((asset) => asset.voice_type === "clone").length;
  const favoriteCount = voiceAssets.filter((asset) => asset.is_favorite).length;
  const testedCount = voiceAssets.filter((asset) => asset.rating_count > 0 || asset.preview_url).length;
  voiceSummary.innerHTML = [
    [voiceAssets.length, "全部声音"],
    [presetCount, "预设音色"],
    [cloneCount, "克隆音色"],
    [favoriteCount, "已收藏"],
    [testedCount, "已测试"],
  ].map(([value, label]) => `
    <div class="voice-summary-item">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `).join("");
}

function renderVoiceAssets() {
  renderVoiceSummary();
  const rows = filteredVoiceAssets();
  if (!rows.length) {
    voiceAssetsGrid.innerHTML = '<div class="voice-empty">当前分类还没有声音资产。</div>';
    return;
  }
  voiceAssetsGrid.innerHTML = rows.map((asset) => {
    const provider = ttsProviderConfigs.find((item) => item.id === asset.provider);
    const tags = Array.isArray(asset.tags) ? asset.tags : [];
    const description = asset.description || asset.metadata?.description || "暂无声音描述";
    const rating = asset.rating_count
      ? `${asset.average_stars} 星 / ${asset.average_score} 分`
      : "尚未评分";
    const audio = asset.sample_url
      ? `<audio class="voice-card-audio" controls preload="none" src="${escapeHtml(asset.sample_url)}"></audio>`
      : asset.preview_url
        ? `<audio class="voice-card-audio" controls preload="none" src="${escapeHtml(asset.preview_url)}"></audio>`
        : "";
    return `
      <article class="voice-asset-card ${asset.is_default ? "default" : ""}" data-voice-asset-id="${asset.id}">
        <div class="voice-card-head">
          <div>
            <h3>${escapeHtml(asset.voice_name || asset.voice_id)}</h3>
            <p>${escapeHtml(asset.voice_id)} · v${asset.version}</p>
          </div>
          <div class="voice-card-badges">
            <span>${asset.voice_type === "preset" ? "预设" : "克隆"}</span>
            ${asset.is_default ? "<span>默认</span>" : ""}
            ${asset.is_favorite ? "<span>收藏</span>" : ""}
            <span>${escapeHtml(voiceStatusLabel(asset.status))}</span>
          </div>
        </div>
        <p class="voice-card-description">${escapeHtml(description)}</p>
        <div class="voice-card-tags">
          ${tags.length ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") : "<span>未设置标签</span>"}
        </div>
        ${audio}
        <div class="voice-card-meta">
          <span>${escapeHtml(provider?.label || asset.provider)}</span>
          <span>${escapeHtml(rating)}</span>
        </div>
        <div class="voice-card-meta">
          <span>使用 ${asset.use_count || 0} 次</span>
          <span>${escapeHtml(formatVoiceTime(asset.last_used_at))}</span>
        </div>
        <div class="voice-card-actions">
          <button class="ghost voice-use" type="button">用于配音</button>
          <button class="ghost voice-test" type="button">测试声音</button>
          <button class="ghost voice-favorite" type="button">${asset.is_favorite ? "取消收藏" : "收藏"}</button>
          <button class="ghost voice-default" type="button">${asset.is_default ? "当前默认" : "设为默认"}</button>
          <button class="ghost voice-version" type="button">新版本</button>
          <button class="ghost voice-edit" type="button">编辑</button>
          ${asset.status === "clone_failed" ? '<button class="ghost voice-retry" type="button">重试复刻</button>' : ""}
          ${asset.voice_type === "clone" ? '<button class="ghost danger-action voice-archive" type="button">归档</button>' : ""}
        </div>
      </article>
    `;
  }).join("");
}

async function loadVoiceAssets({ applyDefault = false } = {}) {
  const data = await fetchJson("/api/voice-assets");
  voiceAssets = Array.isArray(data.assets) ? data.assets : [];
  defaultVoiceAsset = data.default_voice || voiceAssets.find((asset) => asset.is_default) || null;
  renderVoiceAssets();
  voiceCenterStatus.textContent = `已加载 ${voiceAssets.length} 个声音资产。`;
  if (applyDefault && defaultVoiceAsset) await applyVoiceAssetToTts(defaultVoiceAsset);
}

function resetVoiceAssetForm() {
  voiceAssetEditId.value = "";
  voiceAssetFormTitle.textContent = "创建克隆声音";
  voiceAssetName.value = "";
  voiceAssetProvider.value = "aliyun_bailian";
  voiceAssetVoiceId.value = "";
  if (voiceAssetReferenceId) voiceAssetReferenceId.value = "";
  voiceAssetTargetModel.value = "qwen3-tts-vc-2026-01-22";
  voiceAssetDescription.value = "";
  voiceAssetTags.value = "";
  voiceAssetSample.value = "";
  voiceAssetTranscript.value = "";
  voiceAssetConsent.checked = false;
  voiceAssetFormStatus.textContent = "参考音频和资产记录只保存在本机。";
  document.querySelector("#saveVoiceAsset").textContent = "保存并创建声音";
}

function openVoiceAssetForm(asset = null) {
  resetVoiceAssetForm();
  if (asset) {
    voiceAssetEditId.value = String(asset.id);
    voiceAssetFormTitle.textContent = `编辑声音：${asset.voice_name}`;
    voiceAssetName.value = asset.voice_name || "";
    voiceAssetProvider.value = asset.provider || "aliyun_bailian";
    voiceAssetVoiceId.value = asset.voice_id || "";
    if (voiceAssetReferenceId) voiceAssetReferenceId.value = asset.metadata?.reference_id || asset.metadata?.fish_audio?.reference_id || "";
    voiceAssetTargetModel.value = asset.metadata?.target_model || "qwen3-tts-vc-2026-01-22";
    voiceAssetDescription.value = asset.description || "";
    voiceAssetTags.value = (asset.tags || []).join("、");
    document.querySelector("#saveVoiceAsset").textContent = "保存修改";
  }
  voiceAssetForm.hidden = false;
  voiceAssetForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("参考音频读取失败。"));
    reader.readAsDataURL(file);
  });
}

async function saveVoiceAssetForm() {
  const editId = Number(voiceAssetEditId.value || 0);
  voiceAssetFormStatus.textContent = editId ? "正在保存修改..." : "正在保存声音资产并执行复刻...";
  try {
    if (editId) {
      const editingAsset = voiceAssets.find((asset) => asset.id === editId);
      await fetchJson("/api/voice-assets/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editId,
          voice_name: voiceAssetName.value.trim(),
          voice_id: voiceAssetVoiceId.value.trim(),
          reference_id: voiceAssetReferenceId?.value.trim() || "",
          description: voiceAssetDescription.value.trim(),
          tags: voiceAssetTags.value,
        }),
      });
      if (editingAsset?.status === "clone_failed" && voiceAssetConsent.checked && !voiceAssetVoiceId.value.trim()) {
        await fetchJson("/api/voice-assets/retry-clone", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: editId,
            consent_confirmed: true,
            target_model: voiceAssetTargetModel.value,
          }),
        });
        voiceAssetFormStatus.textContent = "声音资产已更新并重新完成复刻。";
      } else {
        voiceAssetFormStatus.textContent = "声音资产已更新。";
      }
    } else {
      const file = voiceAssetSample.files?.[0] || null;
      const sampleData = file ? await fileToDataUrl(file) : "";
      const data = await fetchJson("/api/voice-assets/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voice_name: voiceAssetName.value.trim(),
          provider: voiceAssetProvider.value,
          voice_id: voiceAssetVoiceId.value.trim(),
          reference_id: voiceAssetReferenceId?.value.trim() || "",
          target_model: voiceAssetTargetModel.value,
          description: voiceAssetDescription.value.trim(),
          tags: voiceAssetTags.value,
          sample_data: sampleData,
          sample_mime: file?.type || "",
          sample_transcript: voiceAssetTranscript.value.trim(),
          consent_confirmed: voiceAssetConsent.checked,
        }),
      });
      voiceAssetFormStatus.textContent = data.message || "声音资产已创建。";
    }
    await loadVoiceAssets();
    setTimeout(() => {
      voiceAssetForm.hidden = true;
      resetVoiceAssetForm();
    }, 700);
  } catch (error) {
    voiceAssetFormStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function updateVoiceAsset(id, changes) {
  await fetchJson("/api/voice-assets/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, ...changes }),
  });
  await loadVoiceAssets();
  voiceCenterStatus.textContent = "声音资产已更新。";
}

async function applyVoiceAssetToTts(asset) {
  const providerOption = ttsProviderConfigs.find((provider) => provider.id === asset.provider && provider.enabled);
  if (!providerOption) throw new Error("这个声音对应的平台当前不可用。");
  ttsProvider.value = asset.provider;
  updateTtsProviderFields();
  const model = asset.metadata?.target_model || asset.metadata?.model || selectedTtsProviderConfig().default_model || "";
  if (model) ttsModel.value = model;
  await loadTtsVoices();
  const presetExists = ttsPresetVoices.some((voice) => voice.id === asset.voice_id);
  const cloneExists = voiceAssets.some((item) =>
    item.provider === asset.provider && item.voice_id === asset.voice_id && item.voice_type === "clone" && item.status === "active"
  );
  ttsVoiceSource.value = presetExists ? "preset" : asset.voice_type === "clone" && cloneExists ? "cloned" : "manual";
  updateTtsVoiceSource();
  if (presetExists || cloneExists) {
    ttsPresetVoice.value = asset.voice_id;
    syncTtsModelToSelectedVoice();
  } else {
    ttsManualVoice.value = asset.voice_id;
  }
  ttsStatus.textContent = `已选择声音：${asset.voice_name}`;
}

async function openVoiceTests(asset) {
  selectedVoiceAssetId = asset.id;
  voiceTestsTitle.textContent = `声音测试：${asset.voice_name} v${asset.version}`;
  voiceTestsPanel.hidden = false;
  voiceTestsStatus.textContent = "正在读取测试记录...";
  voiceTestsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  await refreshVoiceTests();
}

function renderVoiceTests(tests = []) {
  if (!tests.length) {
    voiceTestsList.innerHTML = '<div class="voice-empty">还没有测试记录，点击“生成 5 段测试样音”。</div>';
    return;
  }
  voiceTestsList.innerHTML = tests.map((test) => {
    const rating = test.rating || {};
    const audio = test.audio_url
      ? `<audio controls preload="none" src="${escapeHtml(test.audio_url)}"></audio>`
      : `<span class="tts-job-status ${escapeHtml(test.status)}">${escapeHtml(ttsStatusLabel(test.status))}${test.error ? `：${escapeHtml(test.error)}` : ""}</span>`;
    return `
      <div class="voice-test-row" data-voice-test-id="${test.id}">
        <div class="voice-test-title">
          <strong>${escapeHtml(test.test_name)}</strong>
          <span>${escapeHtml(test.emotion)} · ${escapeHtml(ttsStatusLabel(test.status))}</span>
        </div>
        <div>
          <p class="voice-test-script">${escapeHtml(test.script)}</p>
          <div class="voice-test-audio">${audio}</div>
        </div>
        <div class="voice-rating-grid">
          <select class="voice-rating-stars" aria-label="星级">
            ${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(rating.stars || 5) === value ? "selected" : ""}>${value} 星</option>`).join("")}
          </select>
          <input class="voice-rating-score" type="number" min="0" max="100" value="${Number(rating.score || 90)}" aria-label="评分" />
          <input class="voice-rating-notes" type="text" value="${escapeHtml(rating.notes || "")}" placeholder="试听评价" aria-label="试听评价" />
          <button class="ghost voice-rating-save" type="button">保存评分</button>
        </div>
      </div>
    `;
  }).join("");
}

async function refreshVoiceTests() {
  if (!selectedVoiceAssetId) return;
  const data = await fetchJson(`/api/voice-assets/tests?voiceAssetId=${encodeURIComponent(selectedVoiceAssetId)}`);
  const tests = data.tests || [];
  renderVoiceTests(tests);
  const pending = tests.some((test) => ["waiting", "processing"].includes(test.status));
  voiceTestsStatus.textContent = pending ? "测试样音正在队列中生成..." : tests.length ? "测试记录已更新。" : "等待测试。";
  if (voiceTestPollTimer) clearTimeout(voiceTestPollTimer);
  if (pending) {
    voiceTestPollTimer = setTimeout(() => {
      refreshVoiceTests().catch((error) => {
        voiceTestsStatus.textContent = error instanceof Error ? error.message : String(error);
      });
    }, 1500);
  } else {
    await loadVoiceAssets();
  }
}

async function runVoiceTests() {
  if (!selectedVoiceAssetId) return;
  voiceTestsStatus.textContent = "正在创建 5 段测试任务...";
  try {
    const data = await fetchJson("/api/voice-assets/tests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: selectedVoiceAssetId }),
    });
    renderVoiceTests(data.tests || []);
    await refreshVoiceTests();
  } catch (error) {
    voiceTestsStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function generateDefaultVoiceFromRewrite(versionKey) {
  const card = rewriteVersions.querySelector(`.rewrite-version[data-version-key="${versionKey}"]`);
  const text = card?.querySelector(".rewrite-version-text")?.value.trim() || "";
  if (!text) {
    rewriteStatus.textContent = "当前输出框没有文案，请先生成文案。";
    return;
  }
  ttsText.value = text;
  ttsCharacterCount.textContent = `${text.replace(/\s/g, "").length} 字`;
  window.workbenchNavigate?.("tts", { preserveScroll: true });
  document.querySelector("#ttsLab").scrollIntoView({ behavior: "smooth", block: "start" });
  if (!defaultVoiceAsset) {
    ttsStatus.textContent = "文案已带入，请选择音色后点击生成语音。";
    rewriteStatus.textContent = "文案已带入 TTS 语音输入框，请选择音色后生成。";
    return;
  }
  try {
    await applyVoiceAssetToTts(defaultVoiceAsset);
    await generateTts();
  } catch (error) {
    rewriteStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

function directorStatusLabel(status) {
  return {
    waiting: "等待",
    processing: "生成中",
    completed: "已完成",
    failed: "失败",
  }[status] || status || "未知";
}

function directorOptions(rows = [], selected = "") {
  return rows.map((item) => `
    <option value="${escapeHtml(item.id)}"${item.id === selected ? " selected" : ""}>${escapeHtml(item.label)}</option>
  `).join("");
}

function conciseDirectorTitle(value) {
  const cleaned = String(value || "")
    .split("·")[0]
    .replace(/#[^\s#]+/g, "")
    .split(/[。！？!?\n]/)[0]
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 36);
}

function updateDirectorCharacterCount() {
  directorCharacterCount.textContent = `${directorSourceText.value.replace(/\s/g, "").length} 字`;
}

function updateDirectorSourceOptions({ preserveText = false } = {}) {
  const mode = directorSourceMode.value;
  directorSourceSelectField.hidden = mode === "manual";
  if (mode === "manual") {
    directorSourceContext = { taskId: 0, rewriteId: 0, sourceKey: "", sourceType: "manual" };
    if (!preserveText) {
      directorTitle.value = "";
      directorSourceText.value = "";
      updateDirectorCharacterCount();
    }
    return;
  }
  const sources = directorSources.filter((item) => item.kind === mode);
  directorSourceSelect.innerHTML = sources.length
    ? sources.map((item) => `<option value="${escapeHtml(item.source_key)}">${escapeHtml(item.title)}</option>`).join("")
    : '<option value="">当前没有可用文案</option>';
  applySelectedDirectorSource();
}

function applySelectedDirectorSource() {
  const source = directorSources.find((item) => item.source_key === directorSourceSelect.value);
  if (!source) return;
  directorTitle.value = conciseDirectorTitle(source.title);
  directorSourceText.value = source.text || "";
  directorSourceContext = {
    taskId: Number(source.task_id || 0),
    rewriteId: Number(source.rewrite_id || 0),
    sourceKey: source.source_key || "",
    sourceType: source.kind || "manual",
  };
  updateDirectorCharacterCount();
}

async function loadDirectorConfig() {
  const data = await fetchJson("/api/director/config");
  directorConfig = data.config;
  const defaults = directorConfig.defaults || {};
  directorVideoType.innerHTML = directorOptions(directorConfig.video_types, defaults.video_type);
  directorVisualStyle.innerHTML = directorOptions(directorConfig.visual_styles, defaults.visual_style);
  directorPlatform.innerHTML = directorOptions(directorConfig.platforms, defaults.platform);
  directorPace.innerHTML = directorOptions(directorConfig.paces, defaults.pace);
  directorShotCount.innerHTML = directorOptions(directorConfig.shot_counts, defaults.shot_count);
  directorEstimatedDuration.value = String(defaults.estimated_duration || 60);
  renderProviderOptions(directorProvider, data.providers || {}, data.default_provider || "dashscope", {
    disableUnconfigured: true,
  });
}

async function loadDirectorSources({ preserveText = true } = {}) {
  const data = await fetchJson("/api/director/sources");
  directorSources = Array.isArray(data.sources) ? data.sources : [];
  updateDirectorSourceOptions({ preserveText });
}

function renderDirectorProjects() {
  if (!directorProjectsState.length) {
    directorProjects.innerHTML = '<div class="director-empty">还没有导演项目。</div>';
    return;
  }
  directorProjects.innerHTML = directorProjectsState.map((project) => `
    <div class="director-project-row" data-director-project-id="${project.id}">
      <strong>#${project.id}</strong>
      <div class="director-project-title">
        <strong>${escapeHtml(project.title)}</strong>
        <span>${escapeHtml(project.video_type)} · ${escapeHtml(project.visual_style)}</span>
      </div>
      <span>${escapeHtml(project.platform)}</span>
      <span>${project.metadata?.scene_count || 0} 镜头</span>
      <span>${project.score || 0} 分</span>
      <span>${escapeHtml(formatVoiceTime(project.updated_at))}</span>
      <div>
        <span class="director-project-status ${escapeHtml(project.status)}">${escapeHtml(directorStatusLabel(project.status))}</span>
        <button class="ghost small director-project-open" type="button">查看</button>
      </div>
    </div>
  `).join("");
}

async function loadDirectorProjects() {
  const data = await fetchJson("/api/director/projects?limit=50");
  directorProjectsState = Array.isArray(data.projects) ? data.projects : [];
  renderDirectorProjects();
}

function directorShotListMarkup(result) {
  const scenes = Array.isArray(result?.storyboard) ? result.storyboard : [];
  return `
    <div class="director-table-wrap">
      <table class="director-table">
        <thead>
          <tr>
            <th>镜头</th><th>时长</th><th>目的</th><th>情绪</th><th>口播</th><th>字幕</th>
            <th>镜头语言</th><th>构图</th><th>BGM</th><th>转场</th>
          </tr>
        </thead>
        <tbody>
          ${scenes.map((scene) => `
            <tr>
              <td>${scene.scene}</td>
              <td>${scene.duration}s</td>
              <td>${escapeHtml(scene.purpose)}</td>
              <td>${escapeHtml(scene.emotion)}</td>
              <td>${escapeHtml(scene.voice_text)}</td>
              <td>${escapeHtml(scene.subtitle)}</td>
              <td>${escapeHtml(scene.camera)}</td>
              <td>${escapeHtml(scene.composition)}</td>
              <td>${escapeHtml(scene.bgm)}</td>
              <td>${escapeHtml(scene.transition)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function directorSubtitleMarkup(result) {
  const timeline = Array.isArray(result?.subtitle_timeline) ? result.subtitle_timeline : [];
  return `
    <div class="director-table-wrap">
      <table class="director-table">
        <thead><tr><th>开始</th><th>结束</th><th>字幕</th><th>高亮词</th></tr></thead>
        <tbody>
          ${timeline.map((item) => `
            <tr>
              <td>${Number(item.start || 0).toFixed(2)}s</td>
              <td>${Number(item.end || 0).toFixed(2)}s</td>
              <td>${escapeHtml(item.text)}</td>
              <td>${escapeHtml((item.highlight || []).join("、"))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function directorPromptMarkup(result) {
  const scenes = Array.isArray(result?.storyboard) ? result.storyboard : [];
  return scenes.map((scene) => `
    <div class="director-prompt-row" data-director-scene="${escapeHtml(scene.scene)}">
      <strong>Scene ${scene.scene}</strong>
      <div>
        <strong>Visual Prompt</strong>
        <p>${escapeHtml(scene.image_prompt)}</p>
        <button class="ghost small director-send-scene-image" type="button" data-director-scene="${escapeHtml(scene.scene)}">送到图片生成</button>
      </div>
      <div>
        <strong>Motion Prompt</strong>
        <p>${escapeHtml(scene.motion_prompt)}</p>
      </div>
    </div>
  `).join("");
}

function directorBgmMarkup(result) {
  const plan = result?.bgm_plan || {};
  return `
    <div class="director-table-wrap">
      <table class="director-table">
        <thead><tr><th>Mood</th><th>Tempo</th><th>Volume</th><th>Entry</th><th>Exit</th></tr></thead>
        <tbody><tr>
          <td>${escapeHtml(plan.mood)}</td>
          <td>${escapeHtml(plan.tempo)}</td>
          <td>${escapeHtml(plan.volume)}</td>
          <td>${escapeHtml(plan.entry)}</td>
          <td>${escapeHtml(plan.exit)}</td>
        </tr></tbody>
      </table>
    </div>
  `;
}

function directorReviewMarkup(result) {
  const review = result?.aesthetic_review || {};
  const list = (items) => (items || []).length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>无</li>";
  return `
    <div class="director-review-score"><strong>${Number(review.score || 0)}</strong><span>/ 100</span></div>
    <div class="director-review-columns">
      <div><h3>发现的问题</h3><ul>${list(review.problems)}</ul></div>
      <div><h3>修复与建议</h3><ul>${list(review.fixes)}</ul></div>
    </div>
  `;
}

function renderDirectorResultView() {
  const result = activeDirectorProject?.result;
  if (!result) {
    directorResultView.innerHTML = '<div class="director-empty">导演稿尚未生成完成。</div>';
    return;
  }
  const markup = {
    "shot-list": () => directorShotListMarkup(result),
    "storyboard-json": () => `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`,
    subtitle: () => directorSubtitleMarkup(result),
    visual: () => directorPromptMarkup(result),
    bgm: () => directorBgmMarkup(result),
    review: () => directorReviewMarkup(result),
  }[activeDirectorTab];
  directorResultView.innerHTML = markup ? markup() : directorShotListMarkup(result);
  [...directorResultTabs.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.directorTab === activeDirectorTab);
  });
}

function renderDirectorProject(project) {
  activeDirectorProject = project;
  const meta = project.metadata || {};
  if (project.status !== "completed" || !project.result) {
    directorResult.hidden = true;
    directorStatus.textContent = project.status === "failed"
      ? `生成失败：${meta.error || "未知错误"}`
      : `项目 #${project.id} ${directorStatusLabel(project.status)}。`;
    return;
  }
  directorResult.hidden = false;
  directorResultTitle.textContent = project.result.video_meta?.title || project.title;
  directorResultMeta.textContent = [
    `${meta.scene_count || project.scenes?.length || 0} 个镜头`,
    `${project.result.video_meta?.estimated_duration || project.estimated_duration} 秒`,
    project.result.video_meta?.ratio || meta.ratio,
    `${project.score} 分`,
    meta.model || meta.provider,
  ].filter(Boolean).join(" · ");
  directorStatus.textContent = `导演稿 #${project.id} 已完成并保存。`;
  renderDirectorResultView();
  directorResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openDirectorProject(id) {
  const data = await fetchJson(`/api/director/project?id=${encodeURIComponent(id)}`);
  renderDirectorProject(data.project);
  return data.project;
}

async function pollDirectorProject(id) {
  if (directorPollTimer) clearTimeout(directorPollTimer);
  const project = await openDirectorProject(id);
  await loadDirectorProjects();
  if (["waiting", "processing"].includes(project.status)) {
    directorPollTimer = setTimeout(() => {
      pollDirectorProject(id).catch((error) => {
        directorStatus.textContent = error instanceof Error ? error.message : String(error);
      });
    }, 1500);
  }
}

async function generateDirectorProject() {
  const sourceText = directorSourceText.value.trim();
  if (!sourceText) {
    directorStatus.textContent = "请先选择或输入导演文案。";
    return;
  }
  const button = document.querySelector("#generateDirector");
  button.disabled = true;
  directorStatus.textContent = "正在创建导演任务...";
  try {
    const data = await fetchJson("/api/director/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task_id: directorSourceContext.taskId,
        rewrite_id: directorSourceContext.rewriteId,
        source_key: directorSourceContext.sourceKey,
        source_type: directorSourceContext.sourceType,
        title: directorTitle.value.trim(),
        source_text: sourceText,
        provider: directorProvider.value,
        tts_duration: directorTtsDuration.value,
        estimated_duration: directorEstimatedDuration.value,
        video_type: directorVideoType.value,
        visual_style: directorVisualStyle.value,
        platform: directorPlatform.value,
        pace: directorPace.value,
        shot_count: directorShotCount.value,
        reference_style: directorReferenceStyle.value.trim(),
        save_reference_style: directorSaveReference.checked,
      }),
    });
    directorStatus.textContent = `导演任务 #${data.project.id} 已进入队列。`;
    await loadDirectorProjects();
    await pollDirectorProject(data.project.id);
  } catch (error) {
    directorStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    button.disabled = false;
  }
}

function sendRewriteToDirector(versionKey) {
  const card = rewriteVersions.querySelector(`.rewrite-version[data-version-key="${versionKey}"]`);
  const text = card?.querySelector(".rewrite-version-text")?.value.trim() || "";
  if (!text) {
    rewriteStatus.textContent = "当前输出框没有文案，请先生成文案。";
    return;
  }
  const version = collectRewriteVersions().find((item) => item.key === versionKey);
  directorSourceMode.value = "manual";
  updateDirectorSourceOptions({ preserveText: true });
  directorSourceText.value = text;
  directorTitle.value = `${version?.name || "AI 改写"}导演稿`;
  directorSourceContext = {
    taskId: Number(rewriteTaskId.value || 0),
    rewriteId: 0,
    sourceKey: `task-${rewriteTaskId.value || 0}-rewrite-${versionKey}`,
    sourceType: "rewrite",
  };
  updateDirectorCharacterCount();
  directorStatus.textContent = "已从 AI 改写载入文案，请设置导演参数。";
  window.workbenchNavigate?.("director", { preserveScroll: true });
  document.querySelector("#directorSystem").scrollIntoView({ behavior: "smooth", block: "start" });
}

function directorExport(format) {
  if (!activeDirectorProject?.id || activeDirectorProject.status !== "completed") {
    directorStatus.textContent = "请先生成或打开一份已完成的导演稿。";
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = `/api/director/export?id=${activeDirectorProject.id}&format=${encodeURIComponent(format)}`;
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function copyDirectorResult() {
  if (!activeDirectorProject?.result) return;
  const text = activeDirectorTab === "storyboard-json"
    ? JSON.stringify(activeDirectorProject.result, null, 2)
    : directorResultView.innerText;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  directorStatus.textContent = "当前结果已复制。";
}

async function openDirectorFile() {
  if (!activeDirectorProject?.storyboard_path) {
    directorStatus.textContent = "没有可打开的导演稿文件。";
    return;
  }
  await fetchJson("/api/open-path", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath: activeDirectorProject.storyboard_path }),
  });
  directorStatus.textContent = "已打开导演稿文件位置。";
}

function vfoStatusLabel(status) {
  return {
    waiting: "等待",
    processing: "规划中",
    completed: "已完成",
    failed: "失败",
  }[status] || status || "未知";
}

function selectedVfoSource() {
  return vfoSources.find((source) => Number(source.id) === Number(vfoDirectorSource.value || 0));
}

function renderVfoSourceSummary() {
  if (vfoSourceMode.value === "manual") {
    try {
      const value = JSON.parse(vfoManualJson.value || "{}");
      const scenes = Array.isArray(value.storyboard) ? value.storyboard : Array.isArray(value.scenes) ? value.scenes : [];
      const title = vfoManualTitle.value.trim() || value.video_meta?.title || "手动 Storyboard";
      vfoSourceSummary.innerHTML = scenes.length
        ? `<strong>${escapeHtml(title)}</strong><span>${scenes.length} 个镜头 · ${escapeHtml(value.video_meta?.platform || vfoPlatform.value || "待选择平台")}</span>`
        : "<strong>等待有效 Storyboard JSON</strong><span>必须包含 storyboard 或 scenes 数组。</span>";
    } catch {
      vfoSourceSummary.innerHTML = "<strong>Storyboard JSON 尚未解析</strong><span>请检查 JSON 格式。</span>";
    }
    return;
  }
  const source = selectedVfoSource();
  vfoSourceSummary.innerHTML = source
    ? `<strong>${escapeHtml(source.title)}</strong><span>${Number(source.scene_count || 0)} 个镜头 · ${escapeHtml(source.platform || "")} · 导演评分 ${Number(source.score || 0)}</span>`
    : "<strong>暂无可用 Director 项目</strong><span>请先生成一份已完成的专业导演稿。</span>";
}

function updateVfoSourceMode() {
  const manual = vfoSourceMode.value === "manual";
  vfoDirectorSourceField.hidden = manual;
  vfoManualTitleField.hidden = !manual;
  vfoManualJsonField.hidden = !manual;
  renderVfoSourceSummary();
}

async function loadVfoConfig() {
  const data = await fetchJson("/api/vfo/config");
  vfoConfig = data.config;
  vfoPlatform.innerHTML = directorOptions(vfoConfig.platforms, vfoConfig.defaults?.platform || "douyin");
  renderProviderOptions(vfoProvider, data.providers || {}, data.default_provider || "dashscope", {
    disableUnconfigured: true,
  });
}

async function loadVfoSources({ preferredId = 0 } = {}) {
  const data = await fetchJson("/api/vfo/sources");
  vfoSources = Array.isArray(data.sources) ? data.sources : [];
  vfoDirectorSource.innerHTML = vfoSources.length
    ? vfoSources.map((source) => `<option value="${source.id}">#${source.id} ${escapeHtml(source.title)} · ${Number(source.scene_count || 0)} 镜头</option>`).join("")
    : '<option value="">当前没有已完成的 Director 项目</option>';
  if (preferredId && vfoSources.some((source) => Number(source.id) === Number(preferredId))) {
    vfoDirectorSource.value = String(preferredId);
  }
  const selected = selectedVfoSource();
  const mappedPlatform = vfoConfig?.director_platform_aliases?.[selected?.platform] || selected?.platform;
  if (mappedPlatform && vfoConfig?.platforms?.some((platform) => platform.id === mappedPlatform)) {
    vfoPlatform.value = mappedPlatform;
  }
  renderVfoSourceSummary();
}

function renderVfoProjects() {
  if (!vfoProjectsState.length) {
    vfoProjects.innerHTML = '<div class="vfo-empty">还没有 VFO 调度项目。</div>';
    return;
  }
  vfoProjects.innerHTML = vfoProjectsState.map((project) => `
    <div class="vfo-project-row" data-vfo-project-id="${project.id}">
      <strong>#${project.id}</strong>
      <div class="vfo-project-title">
        <strong>${escapeHtml(project.title)}</strong>
        <span>Director #${project.director_project_id || "-"} · APS #${project.asset_project_id || "-"}</span>
      </div>
      <span>${escapeHtml(project.platform)}</span>
      <span>${project.metadata?.scene_count || 0} 镜头</span>
      <span>${project.score || 0} 分</span>
      <span>${escapeHtml(formatVoiceTime(project.updated_at))}</span>
      <div>
        <span class="vfo-project-status ${escapeHtml(project.status)}">${escapeHtml(vfoStatusLabel(project.status))}</span>
        <button class="ghost small vfo-project-open" type="button">查看</button>
      </div>
    </div>
  `).join("");
}

async function loadVfoProjects() {
  const data = await fetchJson("/api/vfo/projects?limit=50");
  vfoProjectsState = Array.isArray(data.projects) ? data.projects : [];
  renderVfoProjects();
}

function vfoList(items) {
  return (items || []).length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>无</li>";
}

function vfoOverviewMarkup(project) {
  const plan = project.result?.render_plan || {};
  const review = plan.qa_review || {};
  const readiness = plan.render_readiness || {};
  const assets = plan.asset_review || {};
  return `
    <div class="vfo-metrics">
      <div class="vfo-metric"><span>镜头数量</span><strong>${plan.scenes?.length || 0}</strong></div>
      <div class="vfo-metric"><span>素材规划</span><strong>${Number(assets.score || 0)}</strong></div>
      <div class="vfo-metric"><span>渲染条件</span><strong>${Number(readiness.score || 0)}</strong></div>
      <div class="vfo-metric"><span>最终 QA</span><strong>${Number(review.score || 0)}</strong></div>
      <div class="vfo-metric"><span>进入 Provider</span><strong class="${review.ready ? "vfo-ready" : "vfo-blocked"}">${review.ready ? "可以" : "暂缓"}</strong></div>
    </div>
    <div class="vfo-table-wrap">
      <table class="vfo-table">
        <thead><tr><th>镜头</th><th>素材</th><th>为什么</th><th>如何准备</th><th>如何渲染</th><th>QA</th></tr></thead>
        <tbody>
          ${(plan.scenes || []).map((scene) => `
            <tr>
              <td>${scene.scene}</td>
              <td><strong>${escapeHtml(scene.asset_type)}</strong><small>${escapeHtml(scene.asset_subtype || "")}</small></td>
              <td>${escapeHtml(scene.reason)}</td>
              <td>${escapeHtml(scene.generation_strategy?.method)}</td>
              <td>${escapeHtml(scene.render_strategy?.ratio)} · ${escapeHtml(scene.render_strategy?.motion)}</td>
              <td class="${scene.qa?.ready ? "vfo-ready" : "vfo-blocked"}">${Number(scene.qa?.score || 0)} · ${scene.qa?.ready ? "就绪" : "阻塞"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function vfoAssetMarkup(project) {
  const assets = project.asset_project?.result?.asset_package || [];
  return `
    <div class="vfo-table-wrap">
      <table class="vfo-table">
        <thead><tr><th>镜头</th><th>素材类型</th><th>选择原因</th><th>准备方式</th><th>提示词 / 搜索要求</th><th>平台适配</th><th>Ready</th></tr></thead>
        <tbody>
          ${assets.map((asset) => `
            <tr>
              <td>${asset.scene}</td>
              <td><strong>${escapeHtml(asset.asset_type)}</strong><small>${escapeHtml(asset.asset_subtype || "")}</small></td>
              <td>${escapeHtml(asset.reason)}</td>
              <td>${escapeHtml(asset.generation_method)}</td>
              <td>${escapeHtml(asset.image_prompt || asset.negative_prompt || "无需图片提示词")}</td>
              <td>抖音 ${Number(asset.platform_fit?.douyin || 0)} · 视频号 ${Number(asset.platform_fit?.video_account || 0)}<br>小红书 ${Number(asset.platform_fit?.xiaohongshu || 0)} · B站 ${Number(asset.platform_fit?.bilibili || 0)}</td>
              <td class="${asset.render_ready ? "vfo-ready" : "vfo-blocked"}">${Number(asset.readiness_score || 0)} · ${asset.render_ready ? "是" : "否"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function vfoRenderMarkup(project) {
  const scenes = project.result?.render_plan?.scenes || [];
  return `
    <div class="vfo-table-wrap">
      <table class="vfo-table">
        <thead><tr><th>镜头</th><th>画布</th><th>时长</th><th>构图 / 裁切</th><th>运动</th><th>字幕</th><th>转场</th><th>备选</th></tr></thead>
        <tbody>
          ${scenes.map((scene) => {
            const render = scene.render_strategy || {};
            return `
              <tr>
                <td>${scene.scene}</td>
                <td>${escapeHtml(render.ratio)}<br><small>${escapeHtml(render.resolution)}</small></td>
                <td>${Number(render.duration || 0)}s</td>
                <td>${escapeHtml(render.composition)}<br><small>${escapeHtml(render.crop)}</small></td>
                <td>${escapeHtml(render.motion)}</td>
                <td>${escapeHtml(render.subtitle?.position)} · ${escapeHtml(render.subtitle?.size)}<br><small>${escapeHtml((render.subtitle?.highlight_words || []).join("、"))}</small></td>
                <td>${escapeHtml(render.transition)} · ${Number(render.transition_duration || 0)}s</td>
                <td>${escapeHtml(render.fallback)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function vfoQaMarkup(project) {
  const review = project.result?.render_plan?.qa_review || {};
  return `
    <div class="vfo-qa-grid">
      <div class="vfo-qa-score">
        <strong>${Number(review.score || 0)}</strong>
        <span>/ 100 · ${review.ready ? "可以进入 Provider" : "暂不进入 Provider"}</span>
      </div>
      <div class="vfo-qa-lists">
        <div><h3>阻塞项</h3><ul>${vfoList(review.blockers)}</ul></div>
        <div><h3>发现问题</h3><ul>${vfoList(review.problems)}</ul></div>
        <div><h3>修复建议</h3><ul>${vfoList(review.fixes)}</ul></div>
      </div>
    </div>
  `;
}

function renderVfoResultView() {
  if (!activeVfoProject?.result) {
    vfoResultView.innerHTML = '<div class="vfo-empty">Render Plan 尚未生成完成。</div>';
    return;
  }
  const markup = {
    overview: () => vfoOverviewMarkup(activeVfoProject),
    assets: () => vfoAssetMarkup(activeVfoProject),
    render: () => vfoRenderMarkup(activeVfoProject),
    qa: () => vfoQaMarkup(activeVfoProject),
    json: () => `<pre>${escapeHtml(JSON.stringify(activeVfoProject.result, null, 2))}</pre>`,
  }[activeVfoTab];
  vfoResultView.innerHTML = markup ? markup() : vfoOverviewMarkup(activeVfoProject);
  [...vfoResultTabs.querySelectorAll("button")].forEach((button) => {
    button.classList.toggle("active", button.dataset.vfoTab === activeVfoTab);
  });
}

function renderVfoProject(project) {
  activeVfoProject = project;
  if (project.status !== "completed" || !project.result) {
    vfoResult.hidden = true;
    vfoStatus.textContent = project.status === "failed"
      ? `生成失败：${project.metadata?.error || "未知错误"}`
      : `VFO 项目 #${project.id} ${vfoStatusLabel(project.status)}。`;
    return;
  }
  const plan = project.result.render_plan || {};
  vfoResult.hidden = false;
  vfoResultTitle.textContent = plan.project?.title || project.title;
  vfoResultMeta.textContent = [
    `${plan.scenes?.length || 0} 个镜头`,
    plan.project?.platform_label || project.platform,
    plan.project?.ratio || project.metadata?.ratio,
    `${project.score || 0} 分`,
    project.metadata?.ready ? "可以进入 Provider" : "需要修正",
    project.metadata?.model || project.metadata?.provider,
  ].filter(Boolean).join(" · ");
  vfoStatus.textContent = `VFO 项目 #${project.id} 已完成并保存 Render Plan。`;
  renderVfoResultView();
  vfoResult.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openVfoProject(id) {
  const data = await fetchJson(`/api/vfo/project?id=${encodeURIComponent(id)}`);
  renderVfoProject(data.project);
  return data.project;
}

async function pollVfoProject(id) {
  if (vfoPollTimer) clearTimeout(vfoPollTimer);
  const project = await openVfoProject(id);
  await loadVfoProjects();
  if (["waiting", "processing"].includes(project.status)) {
    vfoPollTimer = setTimeout(() => {
      pollVfoProject(id).catch((error) => {
        vfoStatus.textContent = error instanceof Error ? error.message : String(error);
      });
    }, 1500);
  }
}

async function generateVfoProject() {
  const manual = vfoSourceMode.value === "manual";
  if (!manual && !Number(vfoDirectorSource.value || 0)) {
    vfoStatus.textContent = "请先选择已完成的 Director 项目。";
    return;
  }
  if (manual) {
    try {
      const parsed = JSON.parse(vfoManualJson.value || "");
      const scenes = Array.isArray(parsed.storyboard) ? parsed.storyboard : Array.isArray(parsed.scenes) ? parsed.scenes : [];
      if (!scenes.length) throw new Error("缺少镜头数组");
    } catch {
      vfoStatus.textContent = "请粘贴有效的 Storyboard JSON。";
      return;
    }
  }
  const button = document.querySelector("#generateVfo");
  button.disabled = true;
  vfoStatus.textContent = "正在创建 APS 与 VFO 调度任务...";
  try {
    const data = await fetchJson("/api/vfo/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        director_project_id: manual ? 0 : Number(vfoDirectorSource.value || 0),
        storyboard_json: manual ? vfoManualJson.value : "",
        title: manual ? vfoManualTitle.value.trim() : "",
        provider: vfoProvider.value,
        platform: vfoPlatform.value,
      }),
    });
    vfoStatus.textContent = `VFO 项目 #${data.project.id} 已进入队列。`;
    await loadVfoProjects();
    await pollVfoProject(data.project.id);
  } catch (error) {
    vfoStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    button.disabled = false;
  }
}

function sendDirectorProjectToVfo() {
  if (!activeDirectorProject?.id || activeDirectorProject.status !== "completed") {
    directorStatus.textContent = "请先生成或打开一份已完成的导演稿。";
    return;
  }
  vfoSourceMode.value = "director";
  updateVfoSourceMode();
  loadVfoSources({ preferredId: activeDirectorProject.id })
    .then(() => {
      vfoStatus.textContent = `已载入 Director 项目 #${activeDirectorProject.id}，可以生成 Render Plan。`;
      window.workbenchNavigate?.("vfo", { preserveScroll: true });
      document.querySelector("#vfoSystem").scrollIntoView({ behavior: "smooth", block: "start" });
    })
    .catch((error) => {
      directorStatus.textContent = error instanceof Error ? error.message : String(error);
    });
}

function directorScenesForImage(project = activeDirectorProject) {
  const scenes = Array.isArray(project?.result?.storyboard) ? project.result.storyboard : [];
  return scenes
    .map((scene, index) => ({
      scene: scene.scene || index + 1,
      title: `Scene ${scene.scene || index + 1}`,
      prompt: String(scene.image_prompt || "").trim(),
      motionPrompt: String(scene.motion_prompt || "").trim(),
      subtitle: String(scene.subtitle || scene.voice_text || "").trim(),
    }))
    .filter((scene) => scene.prompt);
}

function sendDirectorProjectToImage(preferredScene = "") {
  if (!activeDirectorProject?.id || activeDirectorProject.status !== "completed") {
    directorStatus.textContent = "请先生成或打开一份已完成的导演稿。";
    return;
  }
  const scenes = directorScenesForImage(activeDirectorProject);
  if (!scenes.length) {
    directorStatus.textContent = "这份导演稿里没有可用的图片提示词。";
    return;
  }
  const imported = window.importDirectorPromptsToImage?.({
    projectId: activeDirectorProject.id,
    title: activeDirectorProject.result?.video_meta?.title || activeDirectorProject.title || `Director #${activeDirectorProject.id}`,
    ratio: activeDirectorProject.result?.video_meta?.ratio || activeDirectorProject.metadata?.ratio || "9:16",
    scenes,
    preferredScene,
  });
  if (!imported) {
    directorStatus.textContent = "图片生成模块还没有准备好，请稍后再试。";
    return;
  }
  directorStatus.textContent = `已把 ${scenes.length} 个镜头图片提示词导入图片生成。`;
}

function vfoExport(type) {
  if (!activeVfoProject?.id || activeVfoProject.status !== "completed") {
    vfoStatus.textContent = "请先生成或打开一份已完成的 Render Plan。";
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = `/api/vfo/export?id=${activeVfoProject.id}&type=${encodeURIComponent(type)}`;
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function copyVfoResult() {
  if (!activeVfoProject?.result) return;
  const text = activeVfoTab === "json"
    ? JSON.stringify(activeVfoProject.result, null, 2)
    : vfoResultView.innerText;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  vfoStatus.textContent = "当前 VFO 结果已复制。";
}

async function openVfoFile() {
  if (!activeVfoProject?.render_plan_path) {
    vfoStatus.textContent = "没有可打开的 Render Plan 文件。";
    return;
  }
  await fetchJson("/api/open-path", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath: activeVfoProject.render_plan_path }),
  });
  vfoStatus.textContent = "已打开 Render Plan 文件位置。";
}

function videoProductStatusLabel(status) {
  return {
    pending: "等待",
    binding_assets: "绑定素材",
    building_timeline: "生成时间线",
    rendering: "渲染 MP4",
    exporting_draft: "导出草稿",
    completed: "完成",
    failed: "失败",
  }[status] || status || "未知";
}

function videoProductOutputLabel(outputType) {
  return {
    jianying: "路线 C：剪映半成品素材包",
    mp4: "路线 B：AI 图文成片 MP4",
    template_mp4: "路线 A：模板快剪 MP4",
    mix_mp4: "路线 D：下载素材混剪 MP4",
    package: "标准素材包",
  }[outputType] || outputType || "视频成片";
}

function videoProductCompletedSteps(project = {}) {
  const order = [
    ["pending", "进入 SQLite 队列"],
    ["binding_assets", "绑定导演稿、音频和素材"],
    ["building_timeline", "生成 Timeline Project"],
    [project.output_type === "jianying" || project.output_type === "package" ? "exporting_draft" : "rendering", project.output_type === "jianying" ? "导出剪映半成品" : project.output_type === "package" ? "导出素材包" : "渲染 MP4"],
    ["completed", "写入输出文件"],
  ];
  const statusIndex = order.findIndex(([status]) => status === project.status);
  if (project.status === "completed") return order.map(([, label]) => label);
  if (statusIndex <= 0) return [];
  return order.slice(0, statusIndex).map(([, label]) => label);
}

function videoProductFileLinks(project = {}) {
  const id = project.project_id || project.id || 0;
  return [
    ["timeline", "timeline.json", project.timeline_path],
    ["srt", "subtitles.srt", project.srt_path],
    ["manifest", "project_manifest.json", project.manifest_path],
    ["draft", "draft_content.json", project.draft_path],
    ["mp4", "MP4", project.mp4_path],
  ]
    .filter(([, , value]) => value)
    .map(([type, label]) => `<a href="/api/video-product/export?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`);
}

function renderVideoProductRail(project = activeVideoProductProject) {
  if (!railCurrentTask) return;
  if (!project) {
    railCurrentTask.innerHTML = `
      <strong>暂无视频成片任务</strong>
      <small>生成路线 A/B/C/D 后，会显示当前步骤、阻塞项和输出文件。</small>
    `;
    return;
  }
  const blockers = Array.isArray(project.blockers) ? project.blockers.filter(Boolean) : [];
  const completed = videoProductCompletedSteps(project);
  const fileLinks = videoProductFileLinks(project);
  const progress = Math.max(0, Math.min(100, Number(project.progress || 0)));
  railCurrentTask.innerHTML = `
    <div class="rail-video-product-card">
      <strong>#${project.project_id || project.id} ${escapeHtml(videoProductOutputLabel(project.output_type))}</strong>
      <small>当前步骤：${escapeHtml(project.current_step || videoProductStatusLabel(project.status))}</small>
      <div class="rail-progress"><i style="width:${progress}%"></i></div>
      <div class="rail-task-summary">
        <div><span>进度</span><strong>${progress}%</strong></div>
        <div><span>状态</span><strong>${escapeHtml(videoProductStatusLabel(project.status))}</strong></div>
        <div><span>时长</span><strong>${Number(project.duration || 0).toFixed(1)}s</strong></div>
      </div>
      <div class="rail-task-group">
        <span class="rail-subheading">已完成步骤</span>
        ${completed.length ? `<ul class="rail-video-blockers">${completed.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<small>等待开始处理。</small>"}
      </div>
      <div class="rail-task-group">
        <span class="rail-subheading">阻塞项</span>
        ${blockers.length ? `<ul class="rail-video-blockers">${blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<small>当前没有阻塞项。</small>"}
      </div>
      ${project.error ? `<div class="rail-failure-note">错误原因：${escapeHtml(project.error)}</div>` : ""}
      <div class="rail-task-group">
        <span class="rail-subheading">输出文件</span>
        <div class="video-product-output-files">${fileLinks.length ? fileLinks.join("") : "<span>完成后显示文件。</span>"}</div>
      </div>
      <div class="rail-task-actions">
        <button type="button" data-video-product-action="view" data-id="${project.project_id || project.id}">查看</button>
        <button type="button" data-video-product-action="open" data-id="${project.project_id || project.id}" ${project.output_dir ? "" : "disabled"}>打开目录</button>
      </div>
    </div>
  `;
}

function renderVideoProductRailLists(projects = videoProductProjectsState) {
  if (railRecentOutput) {
    const completed = (Array.isArray(projects) ? projects : []).filter((project) => project.status === "completed").slice(0, 5);
    railRecentOutput.innerHTML = completed.length
      ? completed.map((project) => `
        <button class="rail-list-item" type="button" data-video-product-action="view" data-id="${project.project_id || project.id}">
          <span>#${project.project_id || project.id} ${escapeHtml(videoProductOutputLabel(project.output_type))}</span>
          <strong>${escapeHtml(shortPath(project.mp4_path || project.output_dir || project.timeline_path || ""))}</strong>
        </button>
      `).join("")
      : '<div class="rail-empty">还没有生成记录</div>';
  }
  if (railErrors) {
    const failed = (Array.isArray(projects) ? projects : []).filter((project) => project.status === "failed").slice(0, 4);
    railErrors.innerHTML = failed.length
      ? failed.map((project) => `
        <button class="rail-list-item" type="button" data-video-product-action="view" data-id="${project.project_id || project.id}">
          <span>#${project.project_id || project.id} ${escapeHtml(videoProductOutputLabel(project.output_type))}</span>
          <strong>${escapeHtml(project.error || "未知错误")}</strong>
        </button>
      `).join("")
      : '<div class="rail-empty success-text">当前没有错误</div>';
  }
}

function videoProductPayload() {
  return {
    source_director_project_id: Number(videoProductDirector.value || 0),
    audio_asset_id: Number(videoProductAudio.value || 0),
    image_source: videoProductImageSource.value || "director",
    output_type: videoProductOutputType.value || "jianying",
    manual_bindings: videoProductManualBindings,
  };
}

function setVideoProductProgress(project) {
  const progress = Math.max(0, Math.min(100, Number(project?.progress || 0)));
  if (videoProductProgressBar) videoProductProgressBar.style.width = `${progress}%`;
  if (videoProductProgressText) videoProductProgressText.textContent = `${progress}%`;
}

function renderVideoProductBlockers(blockers = []) {
  const items = (Array.isArray(blockers) ? blockers : []).filter(Boolean);
  videoProductBlockers.innerHTML = items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : '<span class="vfo-ready">当前没有阻塞项，可以生成输出。</span>';
}

function renderVideoProductSourceOptions({ preferredDirectorId = 0, preferredAudioId = 0 } = {}) {
  const directors = videoProductSources.directors || [];
  const audios = videoProductSources.audioJobs || [];
  videoProductDirector.innerHTML = directors.length
    ? directors.map((project) => `<option value="${project.id}">#${project.id} ${escapeHtml(project.title || "未命名导演稿")} · ${Number(project.scene_count || 0)} 镜头</option>`).join("")
    : '<option value="">暂无已完成导演项目</option>';
  videoProductAudio.innerHTML = audios.length
    ? audios.map((job) => `<option value="${job.id}">#${job.id} ${escapeHtml(job.voice_name || job.voice_id || job.provider)} · ${escapeHtml((job.text || "").slice(0, 28))}</option>`).join("")
    : '<option value="">暂无已完成 TTS 音频</option>';
  if (preferredDirectorId && directors.some((item) => Number(item.id) === Number(preferredDirectorId))) {
    videoProductDirector.value = String(preferredDirectorId);
  }
  if (preferredAudioId && audios.some((item) => Number(item.id) === Number(preferredAudioId))) {
    videoProductAudio.value = String(preferredAudioId);
  }
}

async function loadVideoProductSources(options = {}) {
  const data = await fetchJson("/api/video-product/sources");
  videoProductSources = {
    directors: data.directors || [],
    audioJobs: data.audioJobs || [],
    imageAssets: data.imageAssets || [],
    downloadedVideos: data.downloadedVideos || [],
    timelines: data.timelines || [],
    platforms: data.platforms || [],
    outputTypes: data.outputTypes || [],
  };
  renderVideoProductSourceOptions(options);
  renderVideoProductProjects(videoProductSources.timelines || []);
  if (!videoProductPreview && videoProductSources.directors.length && videoProductSources.audioJobs.length) {
    await previewVideoProductTimeline().catch(() => {});
  }
}

function imageSelectMarkup(scene) {
  const assets = videoProductSources.imageAssets || [];
  const current = videoProductManualBindings[scene.scene_index] || scene.image_asset_id || "";
  return `
    <select class="video-product-image-select" data-scene-index="${scene.scene_index}">
      <option value="">未绑定</option>
      ${assets.map((asset) => `
        <option value="${escapeHtml(asset.id)}" ${String(current) === String(asset.id) ? "selected" : ""}>
          ${escapeHtml(asset.filename || asset.id)} · ${escapeHtml((asset.prompt || "").slice(0, 18))}
        </option>
      `).join("")}
    </select>
  `;
}

function renderVideoProductScenes(preview = videoProductPreview) {
  const scenes = preview?.scenes || [];
  if (!scenes.length) {
    videoProductScenes.innerHTML = '<div class="vfo-empty">选择导演项目和音频后，点击自动匹配镜头素材。</div>';
    videoProductSceneMeta.textContent = "尚未生成预览";
    return;
  }
  videoProductSceneMeta.textContent = `${scenes.length} 个镜头 · ${Number(preview.duration || 0).toFixed(1)} 秒`;
  videoProductScenes.innerHTML = scenes.map((scene) => {
    const imageSrc = scene.image_path ? `/api/image/file?path=${encodeURIComponent(scene.image_path)}` : "";
    return `
      <article class="video-product-scene ${scene.status === "blocked" ? "blocked" : ""}">
        <div class="video-product-scene-media">
          ${imageSrc ? `<img src="${imageSrc}" alt="Scene ${scene.scene_index}" loading="lazy" />` : "<span>缺图</span>"}
        </div>
        <div class="video-product-scene-main">
          <div class="video-product-scene-top">
            <strong>#${scene.scene_index} ${escapeHtml(scene.title_text || "")}</strong>
            <span>${Number(scene.duration || 0).toFixed(1)}s · ${escapeHtml(scene.transition_type || "straight_cut")}</span>
          </div>
          <p>${escapeHtml(scene.narration_text || scene.subtitle_text || "")}</p>
          <small>${escapeHtml(scene.visual_prompt || "无图片提示词")}</small>
          ${imageSelectMarkup(scene)}
        </div>
      </article>
    `;
  }).join("");
}

async function previewVideoProductTimeline() {
  if (!Number(videoProductDirector.value || 0)) {
    videoProductStatus.textContent = "请先选择导演项目。";
    return null;
  }
  videoProductStatus.textContent = "正在自动匹配镜头素材...";
  const data = await fetchJson("/api/video-product/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(videoProductPayload()),
  });
  videoProductPreview = data;
  renderVideoProductBlockers(data.blockers || []);
  renderVideoProductScenes(data);
  videoProductStatus.textContent = (data.blockers || []).length
    ? `已生成 Timeline 预览，但有 ${data.blockers.length} 个阻塞项。`
    : "Timeline 预览已生成，可以输出。";
  return data;
}

function renderVideoProductProjects(projects = videoProductProjectsState) {
  videoProductProjectsState = Array.isArray(projects) ? projects : [];
  if (!videoProductProjectsState.length) {
    videoProductProjects.innerHTML = '<div class="vfo-empty">还没有视频成片项目。</div>';
    renderVideoProductRailLists([]);
    return;
  }
  videoProductProjects.innerHTML = videoProductProjectsState.map((project) => `
    <div class="video-product-project-row" data-video-product-id="${project.project_id || project.id}">
      <strong>#${project.project_id || project.id}</strong>
      <div class="vfo-project-title">
        <strong>${escapeHtml(project.metadata?.title || `Timeline #${project.project_id || project.id}`)}</strong>
        <span>Director #${project.source_director_project_id || "-"} · Audio #${project.audio_asset_id || "-"} · ${escapeHtml(videoProductOutputLabel(project.output_type))}</span>
      </div>
      <span>${escapeHtml(project.ratio)} · ${escapeHtml(project.resolution)}</span>
      <span>${Number(project.duration || 0).toFixed(1)}s</span>
      <span>${Number(project.progress || 0)}%</span>
      <div>
        <span class="vfo-project-status ${escapeHtml(project.status)}">${escapeHtml(videoProductStatusLabel(project.status))}</span>
        <button class="ghost small video-product-open" type="button">查看</button>
      </div>
    </div>
  `).join("");
  renderVideoProductRailLists(videoProductProjectsState);
}

function renderVideoProductOutputs(project) {
  if (!videoProductOutputFiles) return;
  const id = project?.project_id || project?.id || 0;
  const files = [
    ["timeline", "timeline.json", project?.timeline_path],
    ["srt", "subtitles.srt", project?.srt_path],
    ["manifest", "manifest", project?.manifest_path],
    ["draft", "draft", project?.draft_path],
    ["mp4", "MP4", project?.mp4_path],
  ].filter(([, , value]) => value);
  videoProductOutputFiles.innerHTML = files.length
    ? files.map(([type, label]) => `<a href="/api/video-product/export?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`).join("")
    : '<span>输出文件生成后会显示在这里。</span>';
}

async function loadVideoProductProjects() {
  const data = await fetchJson("/api/video-product/projects?limit=50");
  renderVideoProductProjects(data.projects || []);
}

function renderVideoProductProject(project) {
  activeVideoProductProject = project;
  setVideoProductProgress(project);
  renderVideoProductBlockers(project.blockers || []);
  if (Array.isArray(project.scenes) && project.scenes.length) {
    videoProductPreview = {
      scenes: project.scenes,
      duration: project.duration,
      blockers: project.blockers || [],
    };
    renderVideoProductScenes(videoProductPreview);
  }
  videoProductStatus.textContent = project.status === "failed"
    ? `视频成片失败：${project.error || "未知错误"}`
    : `${videoProductStatusLabel(project.status)}：${project.current_step || "等待更新"}`;
  renderVideoProductOutputs(project);
  openVideoProductOutputBtn.disabled = !project.output_dir;
  renderVideoProductRail(project);
}

async function openVideoProductProject(id) {
  const data = await fetchJson(`/api/video-product/project?id=${encodeURIComponent(id)}`);
  renderVideoProductProject(data.project);
  return data.project;
}

async function pollVideoProductProject(id) {
  if (videoProductPollTimer) clearTimeout(videoProductPollTimer);
  const project = await openVideoProductProject(id);
  await loadVideoProductProjects();
  if (["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"].includes(project.status)) {
    videoProductPollTimer = setTimeout(() => {
      pollVideoProductProject(id).catch((error) => {
        videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
      });
    }, 1500);
  }
}

async function generateVideoProduct() {
  if (!Number(videoProductDirector.value || 0)) {
    videoProductStatus.textContent = "请先选择导演项目。";
    return;
  }
  if (!Number(videoProductAudio.value || 0)) {
    videoProductStatus.textContent = "请先选择已生成的 TTS 音频。";
    return;
  }
  generateVideoProductBtn.disabled = true;
  videoProductStatus.textContent = "正在创建 Timeline Project...";
  try {
    const data = await fetchJson("/api/video-product/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(videoProductPayload()),
    });
    videoProductStatus.textContent = `Timeline Project #${data.project.project_id} 已进入队列。`;
    await pollVideoProductProject(data.project.project_id);
  } catch (error) {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    generateVideoProductBtn.disabled = false;
  }
}

function sendDirectorProjectToVideoProduct() {
  if (!activeDirectorProject?.id || activeDirectorProject.status !== "completed") {
    directorStatus.textContent = "请先生成或打开一份已完成的导演稿。";
    return;
  }
  window.workbenchNavigate?.("vfo", { preserveScroll: true });
  loadVideoProductSources({ preferredDirectorId: activeDirectorProject.id })
    .then(() => {
      videoProductStatus.textContent = `已载入 Director 项目 #${activeDirectorProject.id}，请选择音频并自动匹配图片。`;
      document.querySelector("#videoProductCenter")?.scrollIntoView({ behavior: "smooth", block: "start" });
    })
    .catch((error) => {
      directorStatus.textContent = error instanceof Error ? error.message : String(error);
    });
}

async function openVideoProductOutput() {
  if (!activeVideoProductProject?.output_dir) {
    videoProductStatus.textContent = "当前项目还没有输出目录。";
    return;
  }
  await fetchJson("/api/open-path", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath: activeVideoProductProject.output_dir }),
  });
  videoProductStatus.textContent = "已打开视频成片输出目录。";
}

async function loadSettings() {
  const data = await fetchJson("/api/settings");
  if (data.providers && apiProvider) {
    apiProvider.innerHTML = Object.entries(data.providers)
      .map(([id, provider]) => `<option value="${id}">${provider.label}</option>`)
      .join("");
    apiProvider.value = data.activeProvider || "dashscope";
  }
  const current = apiProvider ? data.providers?.[apiProvider.value] : null;
  if (apiStatus) {
    apiStatus.textContent = current?.apiKeyConfigured
      ? `API Key 已保存：${current.apiKeyMask}`
      : "提取文案时需要填写，下载视频不需要。";
  }
  if (data.batch) {
    batchConcurrency.value = String(data.batch.concurrency || 3);
    batchLimit.value = String(data.batch.limit || 10);
    skipDownloaded.checked = data.batch.skipDownloaded !== false;
  }
  if (data.downloadsDir) {
    downloadDirInput.value = data.downloadsDir;
    savePath.textContent = `下载位置：${data.downloadsDir}`;
  }
  if (data.rewrite) {
    const rewrite = data.rewrite;
    const providers = rewrite.providers || {};
    rewriteProviderConfigs = providers;
    const selectedProvider = rewrite.defaults?.defaultProvider || "dashscope";
    renderProviderOptions(rewriteProvider, providers, selectedProvider, { disableUnconfigured: true });
    renderProviderOptions(rewriteSettingsProvider, providers, selectedProvider);
    rewriteDirection.value = rewrite.defaults?.defaultDirection || "招生引流";
    rewriteStyle.value = rewrite.defaults?.defaultStyle || "痞里带刺";
    rewriteReference.value = rewrite.defaults?.referenceStyle || rewrite.options?.defaultReference || defaultRewriteReference;
    updateRewritePresetFields();
    const statusParts = Object.values(providers)
      .filter((provider) => provider.apiKeyConfigured)
      .map((provider) => `${provider.label}：${provider.apiKeyMask}`);
    if (rewriteSettingsStatus) {
      rewriteSettingsStatus.textContent = statusParts.length
        ? `已配置：${statusParts.join("；")}`
        : "选择平台，粘贴 API Key，保存即可。";
    }
  }
  if (data.tts) {
    renderTtsProviderOptions(data.tts);
    updateTtsProviderFields();
    await loadTtsVoices();
  }
}

async function saveApiKey() {
  if (!apiKeyInput || !apiProvider || !apiStatus) return;
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    apiStatus.textContent = "请先输入 API Key";
    return;
  }

  try {
    const data = await fetchJson("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: apiProvider.value, apiKey }),
    });
    apiStatus.textContent = `API Key 已保存：${data.apiKeyMask}`;
    apiKeyInput.value = "";
  } catch (error) {
    apiStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function saveRewriteSettings() {
  if (!rewriteSettingsProvider || !rewriteUnifiedKey || !rewriteSettingsStatus) return;
  rewriteSettingsStatus.textContent = "正在保存改写设置...";
  try {
    const data = await fetchJson("/api/rewrite-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: rewriteSettingsProvider.value,
        apiKey: rewriteUnifiedKey.value.trim(),
        baseUrl: rewriteBaseUrlInput.value.trim(),
        model: rewriteModelInput.value.trim(),
        autoModel: rewriteAutoModel.checked,
        defaultProvider: rewriteSettingsProvider.value,
        referenceStyle: rewriteReference.value,
      }),
    });
    rewriteUnifiedKey.value = "";
    const providers = data.rewrite?.providers || {};
    rewriteProviderConfigs = providers;
    renderProviderOptions(rewriteProvider, providers, rewriteSettingsProvider.value, { disableUnconfigured: true });
    renderProviderOptions(rewriteSettingsProvider, providers, rewriteSettingsProvider.value);
    updateRewritePresetFields();
    const statusParts = Object.values(providers)
      .filter((provider) => provider.apiKeyConfigured)
      .map((provider) => `${provider.label}：${provider.apiKeyMask}`);
    rewriteSettingsStatus.textContent = `改写设置已保存。${statusParts.length ? `已配置：${statusParts.join("；")}` : ""}`;
    loadSettings().catch(() => {});
  } catch (error) {
    rewriteSettingsStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function generateRewrite() {
  const id = rewriteTaskId.value;
  if (!id) return;
  if (document.activeElement === rewriteVersionCountInput) syncRewriteVersionCount();
  const versionSpecs = collectRewriteVersions();
  if (versionSpecs.length === 0) {
    rewriteStatus.textContent = "请至少保留一个输出框。";
    return;
  }
  rewriteStatus.textContent = `正在生成 ${versionSpecs.length} 个改写版本...`;
  startRewriteProgress(versionSpecs.length);
  try {
    const data = await fetchJson("/api/tasks/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        provider: rewriteProvider.value,
        direction: rewriteDirection.value,
        style: rewriteStyle.value,
        referenceStyle: rewriteReference.value,
        params: rewriteParams(),
        humanizeLevel: rewriteHumanizeLevel.value,
        referenceExamples: collectReferenceExamplesText(),
        versionSpecs,
        text: rewriteOriginal.value,
      }),
    });
    renderRewriteVersions(data.rewrite || {});
    renderTranscripts(data.transcripts);
    stopRewriteProgress("正在保存结果", 96);
    await refreshTasks();
    await refreshFiles();
    stopRewriteProgress("改写完成", 100);
    lastRewritePath = data.task?.rewrite_path || lastRewritePath;
    rewriteStatus.textContent = `改写已生成并写入 SQLite：${data.task?.rewrite_path || ""}`;
  } catch (error) {
    stopRewriteProgress("生成失败", 100);
    rewriteStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function generateSingleRewrite(versionKey) {
  const id = rewriteTaskId.value;
  if (!id) return;
  const versions = collectRewriteVersions();
  const target = versions.find((version) => version.key === versionKey);
  if (!target) return;
  rewriteStatus.textContent = "正在生成当前输出框...";
  startRewriteProgress(1);
  try {
    const data = await fetchJson("/api/tasks/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        provider: rewriteProvider.value,
        direction: rewriteDirection.value,
        style: rewriteStyle.value,
        referenceStyle: rewriteReference.value,
        params: rewriteParams(),
        humanizeLevel: rewriteHumanizeLevel.value,
        referenceExamples: collectReferenceExamplesText(),
        versionSpecs: [target],
        text: rewriteOriginal.value,
        previewOnly: true,
      }),
    });
    const generated = data.rewrite?.versions?.[0];
    if (!generated) throw new Error("当前输出框没有生成内容");
    const mergedVersions = versions.map((version) => version.key === versionKey
      ? { ...version, ...generated }
      : version);
    renderRewriteVersions({ versions: mergedVersions }, { allowDefaults: false });
    stopRewriteProgress("当前输出框生成完成", 100);
    rewriteStatus.textContent = "当前输出框已生成，可单独保存或继续编辑。";
  } catch (error) {
    stopRewriteProgress("生成失败", 100);
    rewriteStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function reviseSingleRewrite(versionKey) {
  const id = rewriteTaskId.value;
  if (!id) return;
  const versions = collectRewriteVersions();
  const target = versions.find((version) => version.key === versionKey);
  if (!target) return;
  if (!target.revisionInstruction) {
    rewriteStatus.textContent = "请先填写当前输出框的修改建议。";
    return;
  }
  if (!target.content.trim()) {
    rewriteStatus.textContent = "当前输出框没有文案，请先生成一次。";
    return;
  }
  rewriteStatus.textContent = "正在按修改建议二次改写...";
  startRewriteProgress(1);
  try {
    const data = await fetchJson("/api/tasks/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        provider: rewriteProvider.value,
        direction: target.direction,
        style: rewriteStyle.value,
        referenceStyle: rewriteReference.value,
        params: rewriteParams(),
        humanizeLevel: rewriteHumanizeLevel.value,
        referenceExamples: collectReferenceExamplesText(),
        versionSpecs: [target],
        text: target.content,
        revisionInstruction: target.revisionInstruction,
        previewOnly: true,
      }),
    });
    const generated = data.rewrite?.versions?.[0];
    if (!generated) throw new Error("二次改写没有返回内容");
    const mergedVersions = versions.map((version) => version.key === versionKey
      ? { ...version, ...generated, revisionInstruction: target.revisionInstruction }
      : version);
    renderRewriteVersions({ versions: mergedVersions }, { allowDefaults: false });
    stopRewriteProgress("二次改写完成", 100);
    rewriteStatus.textContent = "已按修改建议完成二次改写。";
  } catch (error) {
    stopRewriteProgress("二次改写失败", 100);
    rewriteStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function saveSingleRewrite(versionKey) {
  const id = rewriteTaskId.value;
  if (!id) return;
  const target = collectRewriteVersions().find((version) => version.key === versionKey);
  if (!target) return;
  rewriteStatus.textContent = "正在保存当前输出框...";
  try {
    const data = await fetchJson("/api/tasks/rewrite/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        provider: rewriteProvider.value,
        direction: rewriteDirection.value,
        style: rewriteStyle.value,
        referenceStyle: rewriteReference.value,
        params: rewriteParams(),
        humanizeLevel: rewriteHumanizeLevel.value,
        referenceExamples: collectReferenceExamplesText(),
        versions: [target],
        format: "md",
        mergeExisting: true,
      }),
    });
    renderTranscripts(data.transcripts);
    await refreshTasks();
    await refreshFiles();
    lastRewritePath = data.filePath || data.task?.rewrite_path || lastRewritePath;
    rewriteStatus.textContent = "当前输出框已保存。";
  } catch (error) {
    rewriteStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function saveRewrite(format = "txt") {
  const id = rewriteTaskId.value;
  if (!id) return;
  if (document.activeElement === rewriteVersionCountInput) syncRewriteVersionCount();
  rewriteStatus.textContent = format === "md" ? "正在另存为 MD..." : format === "txt" ? "正在保存改写..." : "正在保存...";
  try {
    const data = await fetchJson("/api/tasks/rewrite/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        provider: rewriteProvider.value,
        direction: rewriteDirection.value,
        style: rewriteStyle.value,
        referenceStyle: rewriteReference.value,
        params: rewriteParams(),
        humanizeLevel: rewriteHumanizeLevel.value,
        referenceExamples: collectReferenceExamplesText(),
        versions: collectRewriteVersions(),
        format,
      }),
    });
    renderTranscripts(data.transcripts);
    await refreshTasks();
    await refreshFiles();
    lastRewritePath = data.filePath || data.task?.rewrite_path || lastRewritePath;
    rewriteStatus.textContent = `已保存：${data.filePath || data.task?.rewrite_path || ""}`;
  } catch (error) {
    rewriteStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function loadReferenceExamples() {
  try {
    const data = await fetchJson("/api/reference-examples");
    renderReferenceExamples(data.examples || []);
    rewriteStatus.textContent = `已加载 ${data.examples?.length || 0} 条参考案例。`;
  } catch (error) {
    rewriteStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function saveReferenceExamples() {
  try {
    const data = await fetchJson("/api/reference-examples", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ examples: collectReferenceExamplesText() }),
    });
    renderReferenceExamples(data.examples || []);
    rewriteStatus.textContent = `参考案例已保存：${data.examples?.length || 0} 条。`;
  } catch (error) {
    rewriteStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function openRewriteFileLocation() {
  if (!lastRewritePath) {
    rewriteStatus.textContent = "还没有可打开的改写文件，请先生成或保存。";
    return;
  }
  try {
    await fetchJson("/api/open-path", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath: lastRewritePath }),
    });
  } catch (error) {
    rewriteStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function runAction(action, label) {
  const text = shareLink.value.trim();
  if (!text) {
    resultBox.textContent = "请先粘贴抖音分享链接。";
    setReady("缺少链接", false);
    return;
  }

  hideProgress();
  setTranscriptActions();
  setBusy(label);
  resultBox.textContent = "正在处理，请稍等...";

  try {
    const data = await fetchJson("/api/tool", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, shareLink: text }),
    });
    resultBox.textContent = data.text || "完成";
    renderFiles(data.files);
    setReady("完成", true);
  } catch (error) {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("失败", false);
  }
}

async function runTranscript() {
  const text = shareLink.value.trim();
  if (!text) {
    resultBox.textContent = "请先粘贴抖音分享链接。";
    setReady("缺少链接", false);
    return;
  }

  setBusy("正在提取文案");
  setTranscriptActions();
  showProgress(0, "准备提取文案");
  resultBox.textContent = "文案提取已经开始，请看上方进度条。";

  try {
    const startData = await fetchJson("/api/transcript/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shareLink: text,
        provider: apiProvider?.value || "dashscope",
        apiKey: apiKeyInput?.value.trim() || "",
      }),
    });

    if (apiKeyInput?.value.trim()) {
      apiKeyInput.value = "";
      loadSettings().catch(() => {});
    }

    let finished = false;
    while (!finished) {
      await delay(1200);
      const data = await fetchJson(`/api/transcript/status?id=${encodeURIComponent(startData.job.id)}`);
      const job = data.job;
      showProgress(job.percent || 0, job.message || "正在提取文案");

      if (job.status === "done") {
        showProgress(100, "文案提取完成");
        resultBox.textContent = job.text || "文案提取完成";
        setTranscriptActions(job.text || "", job.transcriptPath || "");
        renderFiles(job.files);
        setReady("完成", true);
        finished = true;
      }

      if (job.status === "error") {
        resultBox.textContent = job.text || job.message || "文案提取失败";
        setReady("失败", false);
        finished = true;
      }
    }
  } catch (error) {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("失败", false);
  }
}

async function runDownload() {
  const text = shareLink.value.trim();
  if (!text) {
    resultBox.textContent = "请先粘贴抖音分享链接。";
    setReady("缺少链接", false);
    return;
  }

  setBusy("正在下载");
  setTranscriptActions();
  showProgress(0, "准备下载");
  resultBox.textContent = "下载已经开始，请看上方进度条。";

  try {
    const startData = await fetchJson("/api/download/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shareLink: text }),
    });

    let finished = false;
    while (!finished) {
      await delay(700);
      const data = await fetchJson(`/api/download/status?id=${encodeURIComponent(startData.job.id)}`);
      const job = data.job;
      showProgress(job.percent || 0, job.message || "正在下载");

      if (job.status === "done") {
        showProgress(100, "下载完成");
        resultBox.textContent = job.text || "下载完成";
        renderFiles(job.files);
        setReady("完成", true);
        finished = true;
      }

      if (job.status === "error") {
        resultBox.textContent = job.text || job.message || "下载失败";
        setReady("失败", false);
        finished = true;
      }
    }
  } catch (error) {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("失败", false);
  }
}

document.querySelector("#parseBtn").addEventListener("click", () => {
  enqueueTasks("parse");
});

document.querySelector("#linkBtn").addEventListener("click", () => {
  enqueueTasks("link");
});

document.querySelector("#downloadBtn").addEventListener("click", () => {
  enqueueTasks("download");
});

document.querySelector("#transcriptBtn").addEventListener("click", () => {
  enqueueTasks("transcript");
});

document.querySelector("#saveApiKey")?.addEventListener("click", () => {
  saveApiKey();
});

document.querySelector("#saveRewriteSettings")?.addEventListener("click", () => {
  saveRewriteSettings();
});

rewriteSettingsProvider?.addEventListener("change", () => {
  updateRewritePresetFields();
});

rewriteAutoModel?.addEventListener("change", () => {
  if (rewriteModelInput) {
    rewriteModelInput.readOnly = rewriteAutoModel.checked;
    rewriteModelInput.placeholder = rewriteAutoModel.checked ? "保存后自动获取最新模型" : "手动填写模型名";
  }
});

document.querySelector("#saveTtsSettings")?.addEventListener("click", () => {
  saveTtsProviderSettings();
});

document.querySelector("#openTtsSettingsHub")?.addEventListener("click", () => {
  window.workbenchNavigate?.("settings", { preserveScroll: true });
  document.querySelector("#unifiedSettingsPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

ttsProvider.addEventListener("change", () => {
  updateTtsProviderFields();
  loadTtsVoices().catch((error) => {
    ttsSettingsStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

ttsModel.addEventListener("change", syncTtsModelToSelectedVoice);
ttsVoiceSource.addEventListener("change", updateTtsVoiceSource);
ttsPresetVoice.addEventListener("change", syncTtsModelToSelectedVoice);
ttsEmotion.addEventListener("change", updateTtsEmotionField);
ttsVolume.addEventListener("input", updateTtsRangeLabels);
ttsPitch.addEventListener("input", updateTtsRangeLabels);
ttsText.addEventListener("input", () => {
  ttsCharacterCount.textContent = `${ttsText.value.replace(/\s/g, "").length} 字`;
});

generateTtsButton.addEventListener("click", () => {
  generateTts();
});

document.querySelector("#refreshTtsJobs").addEventListener("click", () => {
  refreshTtsJobs().catch((error) => {
    ttsStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

document.querySelector("#newVoiceAsset").addEventListener("click", () => {
  openVoiceAssetForm();
});

document.querySelector("#openVoiceCloneFromTts")?.addEventListener("click", () => {
  window.workbenchNavigate?.("voices", { preserveScroll: true });
  openVoiceAssetForm();
});

document.querySelector("#cancelVoiceAsset").addEventListener("click", () => {
  voiceAssetForm.hidden = true;
  resetVoiceAssetForm();
});

voiceAssetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveVoiceAssetForm();
});

voiceFilterTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-voice-filter]");
  if (!button) return;
  voiceAssetFilter = button.dataset.voiceFilter;
  voiceFilterTabs.querySelectorAll("[data-voice-filter]").forEach((item) => {
    item.classList.toggle("active", item === button);
  });
  renderVoiceAssets();
});

voiceAssetsGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  const card = event.target.closest(".voice-asset-card");
  if (!button || !card) return;
  const id = Number(card.dataset.voiceAssetId || 0);
  const asset = voiceAssets.find((item) => item.id === id);
  if (!asset) return;
  try {
    if (button.classList.contains("voice-use")) {
      await applyVoiceAssetToTts(asset);
      document.querySelector("#ttsLab").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (button.classList.contains("voice-test")) {
      await openVoiceTests(asset);
      return;
    }
    if (button.classList.contains("voice-favorite")) {
      await updateVoiceAsset(id, { is_favorite: !asset.is_favorite });
      voiceCenterStatus.textContent = asset.is_favorite ? "已取消收藏。" : "已加入收藏。";
      return;
    }
    if (button.classList.contains("voice-default")) {
      const data = await fetchJson("/api/voice-assets/default", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      defaultVoiceAsset = data.asset;
      await loadVoiceAssets({ applyDefault: true });
      voiceCenterStatus.textContent = `已将“${asset.voice_name}”设为默认音色。`;
      return;
    }
    if (button.classList.contains("voice-version")) {
      await fetchJson("/api/voice-assets/version", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      voiceAssetFilter = asset.voice_type;
      await loadVoiceAssets();
      renderVoiceAssets();
      voiceCenterStatus.textContent = `已创建“${asset.voice_name}”的新版本。`;
      return;
    }
    if (button.classList.contains("voice-edit")) {
      openVoiceAssetForm(asset);
      return;
    }
    if (button.classList.contains("voice-retry")) {
      if (!voiceAssetConsent.checked) {
        openVoiceAssetForm(asset);
        voiceAssetFormStatus.textContent = "请勾选声音授权确认，再点击重试复刻。";
        return;
      }
      await fetchJson("/api/voice-assets/retry-clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, consent_confirmed: true, target_model: asset.metadata?.target_model }),
      });
      await loadVoiceAssets();
      voiceCenterStatus.textContent = "声音复刻已重新完成。";
      return;
    }
    if (button.classList.contains("voice-archive")) {
      await fetchJson("/api/voice-assets/archive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadVoiceAssets();
      voiceCenterStatus.textContent = `已归档“${asset.voice_name}”。`;
    }
  } catch (error) {
    voiceCenterStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});

document.querySelector("#runVoiceTests").addEventListener("click", () => {
  runVoiceTests();
});

document.querySelector("#closeVoiceTests").addEventListener("click", () => {
  voiceTestsPanel.hidden = true;
  selectedVoiceAssetId = 0;
  if (voiceTestPollTimer) clearTimeout(voiceTestPollTimer);
});

voiceTestsList.addEventListener("click", async (event) => {
  const button = event.target.closest(".voice-rating-save");
  const row = event.target.closest(".voice-test-row");
  if (!button || !row || !selectedVoiceAssetId) return;
  voiceTestsStatus.textContent = "正在保存评分...";
  try {
    await fetchJson("/api/voice-assets/rating", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        voice_asset_id: selectedVoiceAssetId,
        voice_test_id: Number(row.dataset.voiceTestId || 0),
        stars: Number(row.querySelector(".voice-rating-stars")?.value || 5),
        score: Number(row.querySelector(".voice-rating-score")?.value || 90),
        notes: row.querySelector(".voice-rating-notes")?.value.trim() || "",
      }),
    });
    voiceTestsStatus.textContent = "评分已保存。";
    await refreshVoiceTests();
  } catch (error) {
    voiceTestsStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});

[rewriteToneLevel, rewriteConflictLevel, rewriteEmotionLevel, rewriteSalesLevel].forEach((input) => {
  input.addEventListener("input", syncRewriteSliderLabels);
});

apiProvider?.addEventListener("change", () => {
  loadSettings().catch(() => {});
});

copyTranscriptBtn.addEventListener("click", async () => {
  if (!lastTranscriptText) return;
  try {
    await navigator.clipboard.writeText(lastTranscriptText);
    setReady("已复制", true);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = lastTranscriptText;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    setReady("已复制", true);
  }
});

openTranscriptBtn.addEventListener("click", async () => {
  if (!lastTranscriptPath) return;
  try {
    await fetchJson("/api/open-transcript", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath: lastTranscriptPath }),
    });
  } catch (error) {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("打开失败", false);
  }
});

document.querySelector("#refreshFiles").addEventListener("click", () => {
  refreshFiles().catch((error) => {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("刷新失败", false);
  });
});

saveDownloadDirBtn.addEventListener("click", () => {
  setDownloadDir(downloadDirInput.value.trim()).catch((error) => {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("保存位置失败", false);
  });
});

chooseDownloadDirBtn.addEventListener("click", () => {
  chooseDownloadDir().catch((error) => {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("选择位置失败", false);
  });
});

document.querySelector("#startQueue").addEventListener("click", () => {
  startQueue().catch((error) => {
    batchStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

document.querySelector("#refreshTasks").addEventListener("click", () => {
  refreshTasks().catch((error) => {
    batchStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

document.querySelector("#clearFinished").addEventListener("click", async () => {
  const ok = window.confirm("确定清理已完成和失败的任务记录吗？文件不会被删除。");
  if (!ok) return;
  try {
    const data = await fetchJson("/api/tasks/clear-finished", { method: "POST" });
    batchStatus.textContent = `已清理 ${data.deleted || 0} 条任务记录`;
    renderTaskStats(data.summary, data.running, data.concurrency);
    renderTasks(data.tasks);
  } catch (error) {
    batchStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});

document.querySelector("#clearTaskList").addEventListener("click", async () => {
  const ok = window.confirm("确定清空任务列表吗？正在下载/提取中的任务会保留，请先暂停后再删除。文件不会被删除。");
  if (!ok) return;
  try {
    const data = await fetchJson("/api/tasks/clear-all", { method: "POST" });
    batchStatus.textContent = `已清空 ${data.deleted || 0} 条任务记录`;
    renderTaskStats(data.summary, data.running, data.concurrency);
    renderTasks(data.tasks);
  } catch (error) {
    batchStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});

document.querySelector("#exportCsv").addEventListener("click", () => {
  downloadExport("csv");
});

document.querySelector("#exportXlsx").addEventListener("click", () => {
  downloadExport("xlsx");
});

taskPageSize.addEventListener("change", () => {
  currentTaskPage = 1;
  renderTasks(allTasks);
});

taskDensity.addEventListener("change", () => {
  renderTasks(allTasks);
});

prevTaskPage.addEventListener("click", () => {
  currentTaskPage -= 1;
  renderTasks(allTasks);
});

nextTaskPage.addEventListener("click", () => {
  currentTaskPage += 1;
  renderTasks(allTasks);
});

pageSizeSelect.addEventListener("change", () => {
  currentPage = 1;
  renderFiles(allFiles);
});

prevPageBtn.addEventListener("click", () => {
  currentPage -= 1;
  renderFiles(allFiles);
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
  renderFiles(allFiles);
});

filesList.addEventListener("click", async (event) => {
  const button = event.target.closest(".file-open");
  const deleteButton = event.target.closest(".file-delete");

  if (deleteButton) {
    deleteFiles([deleteButton.dataset.fileName]);
    return;
  }

  if (!button) return;

  try {
    await fetchJson("/api/open-file", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: button.dataset.fileName }),
    });
  } catch (error) {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("打开失败", false);
  }
});

tasksTable.addEventListener("click", (event) => {
  const pauseButton = event.target.closest(".task-pause");
  const deleteButton = event.target.closest(".task-delete");
  if (pauseButton) {
    pauseTask(pauseButton.dataset.taskId).catch((error) => {
      batchStatus.textContent = error instanceof Error ? error.message : String(error);
    });
    return;
  }
  if (deleteButton) {
    deleteTask(deleteButton.dataset.taskId).catch((error) => {
      batchStatus.textContent = error instanceof Error ? error.message : String(error);
    });
  }
});

transcriptList.addEventListener("click", (event) => {
  const analyzeButton = event.target.closest(".transcript-analyze");
  const rewriteButton = event.target.closest(".transcript-rewrite");
  if (analyzeButton) {
    openAnalysisEditor(analyzeButton.dataset.taskId).catch((error) => {
      resultBox.textContent = error instanceof Error ? error.message : String(error);
      setReady("打开分析失败", false);
    });
    return;
  }
  if (!rewriteButton) return;
  openRewriteEditor(rewriteButton.dataset.taskId).catch((error) => {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("打开改写失败", false);
  });
});

rewriteVersions.addEventListener("click", async (event) => {
  const button = event.target.closest(".rewrite-generate-one, .rewrite-save-one, .rewrite-revise-one, .rewrite-tts-one, .rewrite-director-one, .rewrite-copy");
  if (!button) return;
  if (button.classList.contains("rewrite-generate-one")) {
    button.disabled = true;
    try {
      await generateSingleRewrite(button.dataset.versionKey);
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (button.classList.contains("rewrite-revise-one")) {
    button.disabled = true;
    try {
      await reviseSingleRewrite(button.dataset.versionKey);
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (button.classList.contains("rewrite-save-one")) {
    button.disabled = true;
    try {
      await saveSingleRewrite(button.dataset.versionKey);
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (button.classList.contains("rewrite-tts-one")) {
    await generateDefaultVoiceFromRewrite(button.dataset.versionKey);
    return;
  }
  if (button.classList.contains("rewrite-director-one")) {
    sendRewriteToDirector(button.dataset.versionKey);
    return;
  }
  const textarea = rewriteVersions.querySelector(`.rewrite-version-text[data-version-key="${button.dataset.versionKey}"]`);
  if (!textarea) return;
  try {
    await navigator.clipboard.writeText(textarea.value);
    rewriteStatus.textContent = "已复制当前版本。";
  } catch {
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    rewriteStatus.textContent = "已复制当前版本。";
  }
});

rewriteVersionCountInput.addEventListener("change", () => {
  syncRewriteVersionCount();
});

rewriteVersionCountInput.addEventListener("input", () => {
  if (rewriteVersionCountInput.value === "") return;
  syncRewriteVersionCount();
});

rewriteVersions.addEventListener("input", (event) => {
  const textarea = event.target.closest(".rewrite-version-text");
  if (textarea) {
    const count = textarea.closest(".rewrite-version")?.querySelector(".rewrite-char-count");
    if (count) count.textContent = `当前 ${countRewriteCharacters(textarea.value)} 字`;
    return;
  }
  if (event.target.closest(".rewrite-version-word-count, .rewrite-version-suggestion")) collectRewriteVersions();
});

rewriteVersions.addEventListener("change", (event) => {
  if (!event.target.closest(".rewrite-version-direction, .rewrite-version-word-count")) return;
  collectRewriteVersions();
});

document.querySelector("#runRewrite").addEventListener("click", () => {
  generateRewrite();
});

document.querySelector("#saveRewrite").addEventListener("click", () => {
  saveRewrite("md");
});

document.querySelector("#saveRewriteTxt").addEventListener("click", () => {
  saveRewrite("txt");
});

document.querySelector("#saveRewriteMd").addEventListener("click", () => {
  saveRewrite("md");
});

document.querySelector("#loadReferenceExamples").addEventListener("click", () => {
  loadReferenceExamples();
});

document.querySelector("#saveReferenceExamples").addEventListener("click", () => {
  saveReferenceExamples();
});

document.querySelector("#openRewriteFile").addEventListener("click", () => {
  openRewriteFileLocation();
});

document.querySelector("#closeRewrite").addEventListener("click", () => {
  rewritePanel.hidden = true;
});

directorSourceMode.addEventListener("change", () => {
  updateDirectorSourceOptions();
});

directorSourceSelect.addEventListener("change", () => {
  applySelectedDirectorSource();
});

directorSourceText.addEventListener("input", () => {
  updateDirectorCharacterCount();
  if (directorSourceMode.value === "manual") {
    directorSourceContext = { taskId: 0, rewriteId: 0, sourceKey: "", sourceType: "manual" };
  }
});

document.querySelector("#refreshDirectorSources").addEventListener("click", () => {
  loadDirectorSources({ preserveText: true })
    .then(() => {
      directorStatus.textContent = `已刷新 ${directorSources.length} 条可用文案。`;
    })
    .catch((error) => {
      directorStatus.textContent = error instanceof Error ? error.message : String(error);
    });
});

document.querySelector("#generateDirector").addEventListener("click", () => {
  generateDirectorProject();
});

document.querySelector("#refreshDirectorProjects").addEventListener("click", () => {
  loadDirectorProjects().catch((error) => {
    directorStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

directorProjects.addEventListener("click", (event) => {
  const button = event.target.closest(".director-project-open");
  const row = event.target.closest(".director-project-row");
  if (!button || !row) return;
  openDirectorProject(Number(row.dataset.directorProjectId || 0)).catch((error) => {
    directorStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

directorResultTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-director-tab]");
  if (!button) return;
  activeDirectorTab = button.dataset.directorTab;
  renderDirectorResultView();
});

directorResultView.addEventListener("click", (event) => {
  const button = event.target.closest(".director-send-scene-image");
  if (!button) return;
  sendDirectorProjectToImage(button.dataset.directorScene || "");
});

document.querySelector("#copyDirectorResult").addEventListener("click", () => {
  copyDirectorResult();
});

document.querySelector("#exportDirectorJson").addEventListener("click", () => {
  directorExport("json");
});

document.querySelector("#exportDirectorMd").addEventListener("click", () => {
  directorExport("md");
});

document.querySelector("#exportDirectorPrompts").addEventListener("click", () => {
  directorExport("prompts");
});

document.querySelector("#sendDirectorToVfo").addEventListener("click", () => {
  sendDirectorProjectToVfo();
});

document.querySelector("#sendDirectorToVideoProduct")?.addEventListener("click", () => {
  sendDirectorProjectToVideoProduct();
});

document.querySelector("#sendDirectorToImage").addEventListener("click", () => {
  sendDirectorProjectToImage();
});

document.querySelector("#openDirectorFile").addEventListener("click", () => {
  openDirectorFile().catch((error) => {
    directorStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

vfoSourceMode.addEventListener("change", () => {
  updateVfoSourceMode();
});

vfoDirectorSource.addEventListener("change", () => {
  const selected = selectedVfoSource();
  const mappedPlatform = vfoConfig?.director_platform_aliases?.[selected?.platform] || selected?.platform;
  if (mappedPlatform && vfoConfig?.platforms?.some((platform) => platform.id === mappedPlatform)) {
    vfoPlatform.value = mappedPlatform;
  }
  renderVfoSourceSummary();
});

vfoManualJson.addEventListener("input", () => {
  renderVfoSourceSummary();
});

vfoManualTitle.addEventListener("input", () => {
  renderVfoSourceSummary();
});

document.querySelector("#refreshVfoSources").addEventListener("click", () => {
  loadVfoSources()
    .then(() => {
      vfoStatus.textContent = `已刷新 ${vfoSources.length} 份可用 Storyboard。`;
    })
    .catch((error) => {
      vfoStatus.textContent = error instanceof Error ? error.message : String(error);
    });
});

document.querySelector("#generateVfo").addEventListener("click", () => {
  generateVfoProject();
});

document.querySelector("#refreshVfoProjects").addEventListener("click", () => {
  loadVfoProjects().catch((error) => {
    vfoStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

vfoProjects.addEventListener("click", (event) => {
  const button = event.target.closest(".vfo-project-open");
  const row = event.target.closest(".vfo-project-row");
  if (!button || !row) return;
  openVfoProject(Number(row.dataset.vfoProjectId || 0)).catch((error) => {
    vfoStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

vfoResultTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-vfo-tab]");
  if (!button) return;
  activeVfoTab = button.dataset.vfoTab;
  renderVfoResultView();
});

document.querySelector("#copyVfoResult").addEventListener("click", () => {
  copyVfoResult();
});

document.querySelector("#exportRenderPlan").addEventListener("click", () => {
  vfoExport("render-plan");
});

document.querySelector("#exportAssetPlan").addEventListener("click", () => {
  vfoExport("asset-plan");
});

document.querySelector("#exportAssetPackage").addEventListener("click", () => {
  vfoExport("asset-package");
});

document.querySelector("#openVfoFile").addEventListener("click", () => {
  openVfoFile().catch((error) => {
    vfoStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

refreshVideoProductSourcesBtn?.addEventListener("click", () => {
  loadVideoProductSources()
    .then(() => {
      videoProductStatus.textContent = "视频成片素材已刷新。";
    })
    .catch((error) => {
      videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
    });
});

autoBindTimelineBtn?.addEventListener("click", () => {
  previewVideoProductTimeline().catch((error) => {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

generateVideoProductBtn?.addEventListener("click", () => {
  generateVideoProduct();
});

openVideoProductOutputBtn?.addEventListener("click", () => {
  openVideoProductOutput().catch((error) => {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

refreshVideoProductProjectsBtn?.addEventListener("click", () => {
  loadVideoProductProjects().catch((error) => {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

videoProductDirector?.addEventListener("change", () => {
  videoProductManualBindings = {};
  previewVideoProductTimeline().catch(() => {});
});

videoProductAudio?.addEventListener("change", () => {
  previewVideoProductTimeline().catch(() => {});
});

videoProductImageSource?.addEventListener("change", () => {
  previewVideoProductTimeline().catch(() => {});
});

videoProductOutputType?.addEventListener("change", () => {
  const label = videoProductOutputType.options[videoProductOutputType.selectedIndex]?.textContent || "输出方式";
  videoProductStatus.textContent = `已选择：${label}`;
  document.querySelectorAll(".video-route-card[data-video-output]").forEach((item) => {
    item.classList.toggle("primary", item.dataset.videoOutput === videoProductOutputType.value);
  });
  previewVideoProductTimeline().catch(() => {});
});

document.querySelectorAll(".video-route-card[data-video-output]").forEach((card) => {
  card.addEventListener("click", () => {
    const outputType = card.dataset.videoOutput || "";
    if (!outputType || !videoProductOutputType) return;
    videoProductOutputType.value = outputType;
    document.querySelectorAll(".video-route-card").forEach((item) => item.classList.toggle("primary", item === card));
    videoProductStatus.textContent = `已选择：${videoProductOutputLabel(outputType)}`;
    previewVideoProductTimeline().catch(() => {});
    document.querySelector("#videoProductCenter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelector(".status-rail")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-video-product-action]");
  if (!button) return;
  const id = button.dataset.id || "";
  const action = button.dataset.videoProductAction || "";
  if (action === "view" && id) {
    openVideoProductProject(id).catch((error) => {
      videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
    });
    document.querySelector("#videoProductCenter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (action === "open" && id) {
    openVideoProductProject(id)
      .then(() => openVideoProductOutput())
      .catch((error) => {
        videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
      });
  }
});

videoProductScenes?.addEventListener("change", (event) => {
  const select = event.target.closest(".video-product-image-select");
  if (!select) return;
  const sceneIndex = select.dataset.sceneIndex || "";
  if (select.value) videoProductManualBindings[sceneIndex] = select.value;
  else delete videoProductManualBindings[sceneIndex];
  previewVideoProductTimeline().catch((error) => {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

videoProductProjects?.addEventListener("click", (event) => {
  const button = event.target.closest(".video-product-open");
  const row = event.target.closest(".video-product-project-row");
  if (!button || !row) return;
  openVideoProductProject(row.dataset.videoProductId || "").catch((error) => {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

document.querySelector("#runAnalysis").addEventListener("click", async () => {
  const id = analysisTaskId.value;
  if (!id) return;
  analysisStatus.textContent = "正在生成 AI 分析...";
  try {
    const data = await fetchJson("/api/tasks/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, text: analysisTranscript.value }),
    });
    fillAnalysisFields(data.analysis || {});
    renderTranscripts(data.transcripts);
    await refreshTasks();
    analysisStatus.textContent = "AI 分析已生成。";
  } catch (error) {
    analysisStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});

document.querySelector("#saveAnalysis").addEventListener("click", async () => {
  const id = analysisTaskId.value;
  if (!id) return;
  analysisStatus.textContent = "正在保存分析...";
  try {
    const data = await fetchJson("/api/tasks/analysis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        hook: analysisHook.value,
        emotionPoints: analysisEmotion.value,
        painPoints: analysisPain.value,
        callToAction: analysisCta.value,
        tags: analysisTags.value,
        category: analysisCategory.value,
        summary: analysisTranscript.value.slice(0, 240),
      }),
    });
    renderTranscripts(data.transcripts);
    await refreshTasks();
    analysisStatus.textContent = "分析已保存。";
  } catch (error) {
    analysisStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});

document.querySelector("#closeAnalysis").addEventListener("click", () => {
  analysisPanel.hidden = true;
});

filesList.addEventListener("change", (event) => {
  const selectAll = event.target.closest("#selectAllFiles");
  const rowSelect = event.target.closest(".file-select-row");

  if (selectAll) {
    for (const checkbox of document.querySelectorAll(".file-select-row")) {
      checkbox.checked = selectAll.checked;
      if (checkbox.checked) {
        selectedFiles.add(checkbox.dataset.fileName);
      } else {
        selectedFiles.delete(checkbox.dataset.fileName);
      }
    }
    updateSelectionControls();
    return;
  }

  if (rowSelect) {
    if (rowSelect.checked) {
      selectedFiles.add(rowSelect.dataset.fileName);
    } else {
      selectedFiles.delete(rowSelect.dataset.fileName);
    }
    updateSelectionControls();
  }
});

deleteSelectedBtn.addEventListener("click", () => {
  deleteFiles([...selectedFiles]);
});

document.querySelector("#openFolder").addEventListener("click", async () => {
  try {
    await fetchJson("/api/open-folder", { method: "POST" });
  } catch (error) {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("打开失败", false);
  }
});

async function postSession(url, keepalive = false) {
  const body = JSON.stringify({ sessionId: pageSessionId });
  if (keepalive && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    return;
  }
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive,
  }).catch(() => {});
}

function startPageSession() {
  postSession("/api/page-open").catch(() => {});
  setInterval(() => {
    postSession("/api/heartbeat").catch(() => {});
  }, 3000);
  window.addEventListener("pagehide", () => {
    postSession("/api/page-close", true);
  });
}

async function init() {
  try {
    startPageSession();
    const status = await fetchJson("/api/status");
    savePath.textContent = `下载位置：${status.downloadsDir}`;
    downloadDirInput.value = status.downloadsDir || "";
    await loadSettings();
    await loadDirectorConfig();
    await loadDirectorSources({ preserveText: true });
    await loadDirectorProjects();
    await loadVfoConfig();
    await loadVfoSources();
    updateVfoSourceMode();
    await loadVfoProjects();
    await loadVideoProductSources();
    await loadVideoProductProjects();
    await loadVoiceAssets({ applyDefault: true });
    updateTtsVoiceSource();
    updateTtsEmotionField();
    updateTtsRangeLabels();
    await refreshTtsJobs();
    await refreshFiles();
    await refreshTasks();
    await refreshTranscripts();
  } catch (error) {
    savePath.textContent = "后台没有连接";
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("未连接", false);
  }
}

init();
