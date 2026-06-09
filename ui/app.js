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
const ttsProvider = document.querySelector("#ttsProvider");
const ttsApiKey = document.querySelector("#ttsApiKey");
const ttsWorkspaceField = document.querySelector("#ttsWorkspaceField");
const ttsWorkspaceId = document.querySelector("#ttsWorkspaceId");
const ttsBaseUrlField = document.querySelector("#ttsBaseUrlField");
const ttsBaseUrl = document.querySelector("#ttsBaseUrl");
const ttsModel = document.querySelector("#ttsModel");
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
let ttsProviderConfigs = [];
let ttsPresetVoices = [];
let ttsPollTimer = 0;
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
  const isCustom = provider.id === "custom_tts";
  ttsWorkspaceField.hidden = !isAliyun;
  ttsBaseUrlField.hidden = !isCustom;
  ttsWorkspaceId.value = isAliyun ? provider.workspace_id || "" : "";
  ttsBaseUrl.value = isCustom ? provider.base_url || "" : "";
  ttsModel.value = provider.default_model || "";
  ttsApiKey.value = "";
  ttsApiKey.placeholder = provider.configured
    ? `已保存：${provider.secret_mask || "已脱敏"}，留空则不修改`
    : "仅保存在本机 settings.json";
  ttsSettingsStatus.textContent = provider.configured
    ? `${provider.label} 已配置：${provider.secret_mask || "密钥已脱敏"}`
    : `${provider.label || "当前平台"}尚未配置。`;
}

function renderTtsVoices() {
  const model = ttsModel.value.trim();
  const matching = ttsPresetVoices.filter((voice) => !model || voice.model === model);
  const voices = matching.length ? matching : ttsPresetVoices;
  ttsPresetVoice.innerHTML = voices.length
    ? voices
        .map((voice) => `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.name)} · ${escapeHtml(voice.description || voice.id)}</option>`)
        .join("")
    : '<option value="">当前平台暂无预设音色</option>';
  const configuredDefault = selectedTtsProviderConfig().default_voice || "";
  if (voices.some((voice) => voice.id === configuredDefault)) ttsPresetVoice.value = configuredDefault;
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
  if (ttsPresetVoices.length === 0 && provider.id === "custom_tts") {
    ttsVoiceSource.value = "manual";
    updateTtsVoiceSource();
  }
}

function updateTtsVoiceSource() {
  const manual = ttsVoiceSource.value === "manual";
  ttsPresetVoiceField.hidden = manual;
  ttsManualVoiceField.hidden = !manual;
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
    const data = await fetchJson("/api/tts/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: ttsProvider.value,
        text,
        voice_id: voiceId,
        voice_name: selectedVoice?.name || voiceId,
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

async function loadSettings() {
  const data = await fetchJson("/api/settings");
  if (data.providers) {
    apiProvider.innerHTML = Object.entries(data.providers)
      .map(([id, provider]) => `<option value="${id}">${provider.label}</option>`)
      .join("");
    apiProvider.value = data.activeProvider || "dashscope";
  }
  const current = data.providers?.[apiProvider.value];
  apiStatus.textContent = current?.apiKeyConfigured
    ? `API Key 已保存：${current.apiKeyMask}`
    : "提取文案时需要填写，下载视频不需要。";
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
    rewriteSettingsStatus.textContent = statusParts.length
      ? `已配置：${statusParts.join("；")}`
      : "选择平台，粘贴 API Key，保存即可。";
  }
  if (data.tts) {
    renderTtsProviderOptions(data.tts);
    updateTtsProviderFields();
    await loadTtsVoices();
  }
}

async function saveApiKey() {
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
        provider: apiProvider.value,
        apiKey: apiKeyInput.value.trim(),
      }),
    });

    if (apiKeyInput.value.trim()) {
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

document.querySelector("#saveApiKey").addEventListener("click", () => {
  saveApiKey();
});

document.querySelector("#saveRewriteSettings").addEventListener("click", () => {
  saveRewriteSettings();
});

rewriteSettingsProvider.addEventListener("change", () => {
  updateRewritePresetFields();
});

rewriteAutoModel.addEventListener("change", () => {
  if (rewriteModelInput) {
    rewriteModelInput.readOnly = rewriteAutoModel.checked;
    rewriteModelInput.placeholder = rewriteAutoModel.checked ? "保存后自动获取最新模型" : "手动填写模型名";
  }
});

document.querySelector("#saveTtsSettings").addEventListener("click", () => {
  saveTtsProviderSettings();
});

ttsProvider.addEventListener("change", () => {
  updateTtsProviderFields();
  loadTtsVoices().catch((error) => {
    ttsSettingsStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

ttsModel.addEventListener("change", renderTtsVoices);
ttsVoiceSource.addEventListener("change", updateTtsVoiceSource);
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

[rewriteToneLevel, rewriteConflictLevel, rewriteEmotionLevel, rewriteSalesLevel].forEach((input) => {
  input.addEventListener("input", syncRewriteSliderLabels);
});

apiProvider.addEventListener("change", () => {
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
  const button = event.target.closest(".rewrite-generate-one, .rewrite-save-one, .rewrite-revise-one, .rewrite-copy");
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
