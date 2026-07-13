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
const openResultLocationBtn = document.querySelector("#openResultLocation");
const sendResultRewriteBtn = document.querySelector("#sendResultRewrite");
const pageSizeSelect = document.querySelector("#pageSize");
const filesPager = document.querySelector("#filesPager");
const prevPageBtn = document.querySelector("#prevPage");
const nextPageBtn = document.querySelector("#nextPage");
const pageInfo = document.querySelector("#pageInfo");
const deleteSelectedBtn = document.querySelector("#deleteSelected");
const downloadDirInput = document.querySelector("#downloadDirInput");
const chooseDownloadDirBtn = document.querySelector("#chooseDownloadDir");
const saveDownloadDirBtn = document.querySelector("#saveDownloadDir");
const localVideoPath = document.querySelector("#localVideoPath");
const chooseLocalVideoBtn = document.querySelector("#chooseLocalVideo");
const extractLocalVideoTranscriptBtn = document.querySelector("#extractLocalVideoTranscript");
const extractLocalVideoSubtitleBtn = document.querySelector("#extractLocalVideoSubtitle");
const extractLocalVideoAudioBtn = document.querySelector("#extractLocalVideoAudio");
const localAudioFormat = document.querySelector("#localAudioFormat");
const downloadExtractTranscript = document.querySelector("#downloadExtractTranscript");
const downloadExtractAudio = document.querySelector("#downloadExtractAudio");
const downloadCreateSubtitle = document.querySelector("#downloadCreateSubtitle");
const downloadAudioFormat = document.querySelector("#downloadAudioFormat");
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
const rewriteRunAnalysis = document.querySelector("#rewriteRunAnalysis");
const rewriteAnalysisStatus = document.querySelector("#rewriteAnalysisStatus");
const rewriteProvider = document.querySelector("#rewriteProvider");
const rewriteDirection = document.querySelector("#rewriteDirection");
const rewriteStyle = document.querySelector("#rewriteStyle");
const rewriteTargetPlatform = document.querySelector("#rewriteTargetPlatform");
const rewriteWordRange = document.querySelector("#rewriteWordRange");
const rewriteTonePreset = document.querySelector("#rewriteTonePreset");
const rewritePersona = document.querySelector("#rewritePersona");
const rewritePurpose = document.querySelector("#rewritePurpose");
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
const videoProductJianyingTemplate = document.querySelector("#videoProductJianyingTemplate");
const videoProductLocalImagePath = document.querySelector("#videoProductLocalImagePath");
const videoProductLocalBgmPath = document.querySelector("#videoProductLocalBgmPath");
const videoProductRouteAOptions = document.querySelector("#videoProductRouteAOptions");
const videoProductRouteAStyle = document.querySelector("#videoProductRouteAStyle");
const videoProductRouteACustomStyle = document.querySelector("#videoProductRouteACustomStyle");
const videoProductBgmStrategy = document.querySelector("#videoProductBgmStrategy");
const videoProductBgm = document.querySelector("#videoProductBgm");
const chooseVideoProductImageBtn = document.querySelector("#chooseVideoProductImage");
const addVideoProductImageAssetBtn = document.querySelector("#addVideoProductImageAsset");
const chooseVideoProductBgmBtn = document.querySelector("#chooseVideoProductBgm");
const addVideoProductBgmAssetBtn = document.querySelector("#addVideoProductBgmAsset");
const videoProductAssetStatus = document.querySelector("#videoProductAssetStatus");
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
const momentsCopyInput = document.querySelector("#momentsCopyInput");
const momentsCopyStatus = document.querySelector("#momentsCopyStatus");
const momentsPersonaSelect = document.querySelector("#momentsPersonaSelect");
const addMomentsPersonaBtn = document.querySelector("#addMomentsPersona");
const momentsPersonaEditor = document.querySelector("#momentsPersonaEditor");
const momentsPersonaName = document.querySelector("#momentsPersonaName");
const momentsPersonaText = document.querySelector("#momentsPersonaText");
const momentsPersonaStatus = document.querySelector("#momentsPersonaStatus");
const momentsLocalMaterials = document.querySelector("#momentsLocalMaterials");
const momentsVisualStyle = document.querySelector("#momentsVisualStyle");
const momentsImageCount = document.querySelector("#momentsImageCount");
const momentsTone = document.querySelector("#momentsTone");
const momentsIntent = document.querySelector("#momentsIntent");
const momentsReferenceStyle = document.querySelector("#momentsReferenceStyle");
const generateMomentsPostBtn = document.querySelector("#generateMomentsPost");
const momentsProgress = document.querySelector("#momentsProgress");
const momentsProgressLabel = document.querySelector("#momentsProgressLabel");
const momentsProgressPercent = document.querySelector("#momentsProgressPercent");
const momentsProgressBar = document.querySelector("#momentsProgressBar");
const copyMomentsPromptsBtn = document.querySelector("#copyMomentsPrompts");
const generateMomentsImagesBtn = document.querySelector("#generateMomentsImages");
const publishMomentsWechatBtn = document.querySelector("#publishMomentsWechat");
const momentsPostOutput = document.querySelector("#momentsPostOutput");
const momentsResultMeta = document.querySelector("#momentsResultMeta");
const momentsImagePromptList = document.querySelector("#momentsImagePromptList");
const momentsGeneratedImages = document.querySelector("#momentsGeneratedImages");
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
let momentsProgressTimer = 0;
let lastFinishedTaskCount = 0;
let activeResultAction = "";
let activeResultTaskIds = new Set();
let activeResultFilePath = "";
let activeResultRewriteTaskId = "";
let autoOpenedResultTaskIds = new Set();
let autoRewriteResultTaskIds = new Set();
let rewriteProviderConfigs = {};
let currentRewriteSpecs = [];
const MOMENTS_PERSONAS_KEY = "video-factory:moments-personas-v1";
const MOMENTS_ACTIVE_PERSONA_KEY = "video-factory:moments-active-persona-v1";
const MOMENTS_DRAFT_KEY = "video-factory:moments-draft-v1";
const defaultMomentsPersona = {
  id: "academic-planner",
  name: "学业规划老师",
  description: "从事多年教培行业的规划老师，服务小学到高中学生家庭，也做高考志愿填报和出国留学规划。表达要真实可信，强调正常学习、长期陪伴、能力提升和效果可见，不夸张承诺，不制造焦虑。",
};
let momentsPersonas = [];
let currentMomentsResult = null;
let rewriteVersionDrafts = new Map();
let directorConfig = null;
let directorSources = [];
let directorProjectsState = [];
let activeDirectorProject = null;
let activeDirectorRailProject = null;
let activeDirectorRailSignature = "";
const autoImportedDirectorImageProjectIds = new Set();
let activeDirectorTab = "shot-list";
let directorSourceContext = { taskId: 0, rewriteId: 0, sourceKey: "", sourceType: "manual" };
let directorPollTimer = 0;
let vfoConfig = null;
let vfoSources = [];
let vfoProjectsState = [];
let activeVfoProject = null;
let activeVfoTab = "overview";
let vfoPollTimer = 0;
let videoProductSources = { directors: [], audioJobs: [], imageAssets: [], bgmAssets: [], timelines: [], platforms: [], routeAStyles: [], bgmStrategies: [], jianyingTemplates: [] };
let videoProductPreview = null;
let videoProductManualBindings = {};
let videoProductProjectsState = [];
let activeVideoProductProject = null;
let videoProductPollTimer = 0;
let ttsProviderConfigs = [];
let ttsPresetVoices = [];
let ttsPollTimer = 0;
let activeTtsRailJob = null;
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
  transcript: "提取并校正文案",
  subtitle: "提取字幕",
  audio: "提取音频",
};
const defaultRewriteReference = "忠于原文主题、事实、人物和事件；只优化表达、结构、节奏、钩子和口播感；不要凭空换行业、换对象、换场景，不要强行改成教育招生或家长话题；不要像AI作文。";
const rewriteDirectionOptions = ["保留原意优化", "短视频口播", "短视频开场钩子", "完整口播脚本", "知识解释", "痛点共鸣", "评论区引导", "朋友圈文案", "视频成片口播稿", "成交转化", "招生引流"];
const rewriteStyleOptions = ["保留原意强化表达", "小黑漫画解释类", "爆款口播重构", "知识拆解型", "痛点共鸣型", "转化引导型", "朋友圈叙事型", "成片旁白型"];
const rewriteHumanizeOptions = ["关闭", "普通", "强", "极强"];
const rewriteVersionOptions = [
  { key: "hookVersion", name: "成品 1：忠实强化版", direction: "保留原意优化", wordCount: "120-180字" },
  { key: "resonanceVersion", name: "成品 2：共鸣解释版", direction: "知识解释", wordCount: "120-180字" },
  { key: "conversionVersion", name: "成品 3：转化行动版", direction: "成交转化", wordCount: "120-180字" },
];
const defaultRewriteVersionCount = 3;
const maxRewriteVersionCount = 50;
const rewritePresetStorageKey = "video-factory:rewrite-preset-v2";
const rewritePlanPresets = {
  "保留原意强化表达": {
    direction: "保留原意优化",
    tone: "清楚直接，不跑题",
    persona: "普通朋友视角",
    structure: "原文顺序不大改；压缩废话，强化第一句、转折句和结尾记忆点。",
    mustShow: "成品要明显比原文更清楚、更短句、更有节奏，但主题和事实不变。",
    avoid: "不要新增行业背景、不要加陌生人物、不要硬塞销售话术。",
  },
  "小黑漫画解释类": {
    direction: "知识解释",
    tone: "朋友聊天，有现场感",
    persona: "小黑漫画旁白",
    structure: "用“现象/画面 -> 本质解释 -> 反差比喻 -> 一句话结论”的结构，把抽象内容解释成能画出来的场景。",
    mustShow: "要有画面感、类比、反差和解释动作，但只解释原文的核心意思。",
    avoid: "不要脱离原文创造新剧情；不要把图像风格当成正文主题。",
  },
  "爆款口播重构": {
    direction: "短视频口播",
    tone: "犀利反差，但不虚构",
    persona: "短视频内容策划",
    structure: "3秒强钩子 -> 原文核心事件 -> 反常识判断 -> 具体展开 -> 评论/关注引导。",
    mustShow: "开头和段落顺序要有明显短视频感，句子短、停顿强、信息密度高。",
    avoid: "不要编造数据和案例；不要为了爆款改掉原文事实。",
  },
  "知识拆解型": {
    direction: "知识解释",
    tone: "专业可信，有判断",
    persona: "专业讲解者",
    structure: "先给结论 -> 拆 2-3 个原因/步骤 -> 举原文里的具体点 -> 给行动建议。",
    mustShow: "逻辑层级要比原文清楚，适合做知识类视频字幕或口播。",
    avoid: "不要写成营销广告；不要出现原文没有的权威背书。",
  },
  "痛点共鸣型": {
    direction: "痛点共鸣",
    tone: "情绪共鸣，克制表达",
    persona: "普通朋友视角",
    structure: "先说用户熟悉的真实感受 -> 点出矛盾 -> 回到原文事件/观点 -> 给一句共鸣结论。",
    mustShow: "要让人觉得“说的是我”，但不能煽情过头。",
    avoid: "不要卖惨；不要把原文改成另一种情绪故事。",
  },
  "转化引导型": {
    direction: "成交转化",
    tone: "强行动号召，低夸张",
    persona: "创业者/老板视角",
    structure: "价值判断 -> 原文核心证据 -> 为什么现在要行动 -> 低压 CTA。",
    mustShow: "结尾要有明确行动，但必须围绕原文主题转化。",
    avoid: "不要虚构优惠、名额、承诺、成功案例。",
  },
  "朋友圈叙事型": {
    direction: "朋友圈文案",
    tone: "朋友聊天，有现场感",
    persona: "普通朋友视角",
    structure: "生活化开场 -> 原文事件/观察 -> 自己的感受 -> 轻 CTA 或开放式提问。",
    mustShow: "像真人发朋友圈，不像广告和新闻稿。",
    avoid: "不要口号化；不要过度专业术语。",
  },
  "成片旁白型": {
    direction: "视频成片口播稿",
    tone: "专业可信，有判断",
    persona: "专业讲解者",
    structure: "镜头开场旁白 -> 逐段解释画面 -> 情绪递进 -> 收束金句。",
    mustShow: "适合直接配音，句子要可断句，画面可跟随。",
    avoid: "不要出现无法配画面的空泛概念。",
  },
};

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
  if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".m4a")) return "音频";
  if (lower.endsWith(".srt") || lower.endsWith(".vtt") || lower.endsWith(".ass")) return "字幕";
  if (lower.includes("ai分析")) return "AI分析";
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
    throw new Error(data.message || data.error || data.text || "操作失败");
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

function rewriteProviderOptionsMarkup(selected = rewriteProvider?.value || "dashscope") {
  const entries = Object.entries(rewriteProviderConfigs || {});
  if (!entries.length) {
    return `<option value="${escapeHtml(selected || "dashscope")}">${escapeHtml(selected || "dashscope")}</option>`;
  }
  return entries.map(([id, provider]) => {
    const disabled = provider.apiKeyConfigured ? "" : " disabled";
    const suffix = provider.apiKeyConfigured ? "" : "（未配置）";
    return `<option value="${escapeHtml(id)}"${id === selected ? " selected" : ""}${disabled}>${escapeHtml(provider.label || id)}${suffix}</option>`;
  }).join("");
}

function defaultRewriteVersionSettings() {
  return {
    provider: rewriteProvider?.value || "deepseek",
    style: rewriteStyle?.value || "保留原意强化表达",
    referenceStyle: buildRewriteReferenceStyle(),
    params: rewriteParams(),
    humanizeLevel: rewriteHumanizeLevel?.value || "极强",
  };
}

function clampRewriteVersionCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Math.max(1, Math.min(maxRewriteVersionCount, Number.isFinite(parsed) ? parsed : 1));
}

function rewriteVersionAt(index) {
  const base = rewriteVersionOptions[index] || {
    key: `version-${index + 1}`,
    name: `版本 ${index + 1}`,
    direction: rewriteDirection.value || "保留原意优化",
    wordCount: rewriteWordRange?.value || "120-180字",
  };
  return rewriteVersionDrafts.get(base.key) || { ...base, ...defaultRewriteVersionSettings(), content: "" };
}

function rewritePresetContext() {
  return {
    style: rewriteStyle?.value || "保留原意强化表达",
    platform: rewriteTargetPlatform?.value || "抖音短视频",
    wordRange: rewriteWordRange?.value || "120-180字",
    tone: rewriteTonePreset?.value || "清楚直接，不跑题",
    persona: rewritePersona?.value || "普通朋友视角",
    purpose: rewriteDirection?.value || rewritePurpose?.value || "保留原意优化",
  };
}

function setSelectIfOption(select, value) {
  if (!select || value === undefined || value === null) return false;
  const text = String(value);
  if (![...select.options].some((option) => option.value === text || option.textContent === text)) return false;
  select.value = text;
  return true;
}

function applyRewritePlanPreset(style = rewriteStyle?.value, { save = true, overwrite = true } = {}) {
  const preset = rewritePlanPresets[String(style || "")] || null;
  if (!preset || !overwrite) return preset;
  setSelectIfOption(rewriteTonePreset, preset.tone);
  setSelectIfOption(rewritePersona, preset.persona);
  setSelectIfOption(rewriteDirection, preset.direction);
  if (save) saveRewritePresetSettings();
  return preset;
}

function saveRewritePresetSettings() {
  const data = {
    provider: rewriteProvider?.value || "",
    style: rewriteStyle?.value || "",
    targetPlatform: rewriteTargetPlatform?.value || "",
    wordRange: rewriteWordRange?.value || "",
    tonePreset: rewriteTonePreset?.value || "",
    persona: rewritePersona?.value || "",
    direction: rewriteDirection?.value || "",
    toneLevel: rewriteToneLevel?.value || "",
    conflictLevel: rewriteConflictLevel?.value || "",
    emotionLevel: rewriteEmotionLevel?.value || "",
    salesLevel: rewriteSalesLevel?.value || "",
    humanizeLevel: rewriteHumanizeLevel?.value || "",
    referenceStyle: rewriteReference?.value || "",
  };
  try {
    localStorage.setItem(rewritePresetStorageKey, JSON.stringify(data));
  } catch {}
}

function loadRewritePresetSettings() {
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(rewritePresetStorageKey) || "{}");
  } catch {
    data = {};
  }
  if (!Object.keys(data).length) {
    applyRewritePlanPreset(rewriteStyle?.value || "保留原意强化表达", { save: false });
    syncRewriteSliderLabels();
    return;
  }
  setSelectIfOption(rewriteProvider, data.provider);
  setSelectIfOption(rewriteStyle, data.style);
  const selectedPlan = rewritePlanPresets[rewriteStyle?.value] ? rewriteStyle.value : "保留原意强化表达";
  setSelectIfOption(rewriteStyle, selectedPlan);
  setSelectIfOption(rewriteTargetPlatform, data.targetPlatform);
  setSelectIfOption(rewriteWordRange, data.wordRange);
  setSelectIfOption(rewriteTonePreset, data.tonePreset);
  setSelectIfOption(rewritePersona, data.persona);
  setSelectIfOption(rewriteDirection, data.direction);
  if (!data.tonePreset || !data.persona || !data.direction) applyRewritePlanPreset(rewriteStyle?.value, { save: false });
  setSelectIfOption(rewriteHumanizeLevel, data.humanizeLevel);
  if (data.toneLevel && rewriteToneLevel) rewriteToneLevel.value = data.toneLevel;
  if (data.conflictLevel && rewriteConflictLevel) rewriteConflictLevel.value = data.conflictLevel;
  if (data.emotionLevel && rewriteEmotionLevel) rewriteEmotionLevel.value = data.emotionLevel;
  if (data.salesLevel && rewriteSalesLevel) rewriteSalesLevel.value = data.salesLevel;
  const savedReference = String(data.referenceStyle || "");
  if (savedReference && rewriteReference) rewriteReference.value = sanitizeRewriteReference(savedReference);
  syncRewriteSliderLabels();
}

function sanitizeRewriteReference(value) {
  const text = String(value || "").trim();
  if (!text || /教育招生|家长|学校|老师/.test(text)) return defaultRewriteReference;
  return text;
}

function buildRewriteReferenceStyle() {
  const preset = rewritePresetContext();
  const plan = rewritePlanPresets[preset.style] || rewritePlanPresets["保留原意强化表达"];
  const custom = rewriteReference?.value?.trim() || defaultRewriteReference;
  return [
    custom,
    "",
    "当前专业改写方案：",
    `- 方案：${preset.style}`,
    `- 结构目标：${plan.structure}`,
    `- 必须看得出的差异：${plan.mustShow}`,
    `- 禁止事项：${plan.avoid}`,
    `- 绑定参数：平台=${preset.platform}；字数=${preset.wordRange}；语气=${preset.tone}；人设=${preset.persona}；用途=${preset.purpose}。`,
    "",
    "生成基础参考 dbskill 方法，但只输出可直接发布的中文文案：",
    "1. 内容诊断：先把原文的核心事情、受众、矛盾和传播价值搞清楚，再改写。",
    "2. 钩子设计：开头要有话题、悬念或反差，不要第一句就把答案讲完。",
    "3. 共鸣机制：优先解除用户不敢说的沉默、点出真实动机和立场框架。",
    "4. 口播流畅：短句、强节奏、少书面语，每一段只讲一个意思。",
    "5. 去AI味检查：避免过度完整、空泛排比和万能鸡汤，保留人话里的锋利和停顿。",
    "最终自检：同一原文切换不同方案时，结构和口吻必须明显不同；但主题、事实和核心意思必须仍能逐句对回原文。",
  ].join("\n");
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
        ? rewriteVersionOptions.slice(0, defaultRewriteVersionCount)
        : [];

  return sources.map((item, index) => {
    const base = rewriteVersionOptions.find((option) => option.key === item.key || option.name === item.name) || {};
    const key = item.key || base.key || `version-${index + 1}`;
    const cached = rewriteVersionDrafts.get(key) || {};
    const defaults = defaultRewriteVersionSettings();
    return {
      key,
      name: item.name || base.name || `版本 ${index + 1}`,
      direction: item.direction || cached.direction || base.direction || rewriteDirection.value || "短视频口播",
      wordCount: item.wordCount || cached.wordCount || base.wordCount || "160字左右",
      content: typeof item.content === "string" ? item.content : cached.content || "",
      revisionInstruction: item.revisionInstruction || cached.revisionInstruction || "",
      provider: item.provider || cached.provider || defaults.provider,
      style: item.style || cached.style || defaults.style,
      referenceStyle: item.referenceStyle || cached.referenceStyle || defaults.referenceStyle,
      params: item.params || cached.params || defaults.params,
      humanizeLevel: item.humanizeLevel || cached.humanizeLevel || defaults.humanizeLevel,
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
          <div>
            <strong>${escapeHtml(version.name)}</strong>
            <small>${escapeHtml(version.direction || rewriteDirection.value || "")} · ${escapeHtml(version.wordCount || rewriteWordRange?.value || "120-180字")}</small>
          </div>
          <div class="rewrite-version-tools">
            <button class="ghost small rewrite-generate-one" type="button" data-version-key="${escapeHtml(version.key)}">生成</button>
            <button class="ghost small rewrite-save-one" type="button" data-version-key="${escapeHtml(version.key)}">保存</button>
            <button class="ghost small rewrite-copy" type="button" data-version-key="${escapeHtml(version.key)}">复制</button>
          </div>
        </div>
        <div class="rewrite-version-hidden-fields" hidden>
        <div class="rewrite-version-options">
          <label>
            模型
            <select class="rewrite-version-provider">
              ${rewriteProviderOptionsMarkup(version.provider)}
            </select>
          </label>
          <label>
            改写方向
            <select class="rewrite-version-direction">
              ${selectOptionsMarkup(rewriteDirectionOptions, version.direction)}
            </select>
          </label>
          <label>
            语气风格
            <select class="rewrite-version-style">
              ${selectOptionsMarkup(rewriteStyleOptions, version.style || rewriteStyle.value)}
            </select>
          </label>
          <label class="word-count-field">
            字数要求
            <input class="rewrite-version-word-count" type="text" value="${escapeHtml(version.wordCount)}" placeholder="如 160字左右" />
          </label>
        </div>
        <div class="rewrite-version-param-grid">
          <label>
            口语化 <span class="rewrite-version-tone-value">${Number(version.params?.toneLevel || 8)}</span>
            <input class="rewrite-version-tone-level" type="range" min="1" max="10" value="${Number(version.params?.toneLevel || 8)}" />
          </label>
          <label>
            冲突度 <span class="rewrite-version-conflict-value">${Number(version.params?.conflictLevel || 7)}</span>
            <input class="rewrite-version-conflict-level" type="range" min="1" max="10" value="${Number(version.params?.conflictLevel || 7)}" />
          </label>
          <label>
            情感强度 <span class="rewrite-version-emotion-value">${Number(version.params?.emotionLevel || 7)}</span>
            <input class="rewrite-version-emotion-level" type="range" min="1" max="10" value="${Number(version.params?.emotionLevel || 7)}" />
          </label>
          <label>
            销售感 <span class="rewrite-version-sales-value">${Number(version.params?.salesLevel || 6)}</span>
            <input class="rewrite-version-sales-level" type="range" min="1" max="10" value="${Number(version.params?.salesLevel || 6)}" />
          </label>
          <label>
            去AI强度
            <select class="rewrite-version-humanize-level">
              ${selectOptionsMarkup(rewriteHumanizeOptions, version.humanizeLevel || "极强")}
            </select>
          </label>
        </div>
        <label class="rewrite-version-reference-field">
          参考风格输入
          <textarea class="rewrite-version-reference" rows="3" placeholder="给这个输出框单独指定参考风格">${escapeHtml(version.referenceStyle || buildRewriteReferenceStyle())}</textarea>
        </label>
        </div>
        <textarea class="rewrite-version-text" rows="10" data-version-key="${escapeHtml(version.key)}" placeholder="点击“生成文案定制成品”后这里会出现可直接发送的成品，也可以继续手动编辑。">${escapeHtml(version.content)}</textarea>
        <div class="rewrite-handoff-panel rewrite-version-handoff">
          <strong>发送这个成品到</strong>
          <div class="rewrite-handoff-actions">
            ${rewriteHandoffChoicesMarkup()}
          </div>
          <button class="primary small rewrite-send-selected" type="button" data-source="rewrite" data-version-key="${escapeHtml(version.key)}">发送所选</button>
        </div>
        <div class="rewrite-revision-box">
          <label>
            修改建议
            <textarea class="rewrite-version-suggestion" rows="2" placeholder="例如：开头更强烈、解释更清楚、语气更口语、结尾加强行动号召">${escapeHtml(version.revisionInstruction || "")}</textarea>
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

function rewriteHandoffChoicesMarkup() {
  return [
    ["moments-copy", "朋友圈文案定制"],
    ["tts", "TTS语音"],
    ["video-output", "视频成片"],
    ["cs1-video", "CS1生成器"],
    ["xiaohei-video", "小黑视频风格生成"],
    ["money-printer", "MoneyPrinter"],
  ].map(([target, label]) => `<label><input class="rewrite-handoff-choice" type="checkbox" data-target="${target}" />${label}</label>`).join("");
}

function collectRewriteVersions() {
  const versions = [...rewriteVersions.querySelectorAll(".rewrite-version")].map((card, index) => {
    const cached = rewriteVersionDrafts.get(card.dataset.versionKey) || currentRewriteSpecs[index] || {};
    const version = {
      key: card.dataset.versionKey,
      name: cached.name || `版本 ${index + 1}`,
      provider: rewriteProvider.value,
      direction: rewriteDirection.value,
      style: rewriteStyle.value,
      wordCount: rewriteWordRange?.value || card.querySelector(".rewrite-version-word-count")?.value.trim() || "120-180字",
      params: rewriteParams(),
      humanizeLevel: rewriteHumanizeLevel.value || "极强",
      referenceStyle: buildRewriteReferenceStyle(),
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
  const preset = rewritePresetContext();
  const plan = rewritePlanPresets[preset.style] || rewritePlanPresets["保留原意强化表达"];
  return {
    toneLevel: Number(rewriteToneLevel.value || 8),
    conflictLevel: Number(rewriteConflictLevel.value || 7),
    emotionLevel: Number(rewriteEmotionLevel.value || 7),
    salesLevel: Number(rewriteSalesLevel.value || 6),
    humanizeLevel: rewriteHumanizeLevel.value || "极强",
    targetPlatform: preset.platform,
    wordRange: preset.wordRange,
    tonePreset: preset.tone,
    persona: preset.persona,
    purpose: preset.purpose,
    rewriteStylePreset: preset.style,
    structureGoal: plan.structure,
    visibleDifference: plan.mustShow,
    forbiddenInventions: plan.avoid,
  };
}

function rewritePayloadForVersion(id, version, extra = {}) {
  const preset = rewritePresetContext();
  const referenceStyle = version.referenceStyle || buildRewriteReferenceStyle();
  return {
    id,
    provider: version.provider || rewriteProvider.value,
    direction: version.direction || preset.purpose,
    style: version.style || preset.style,
    referenceStyle,
    params: version.params || rewriteParams(),
    humanizeLevel: version.humanizeLevel || rewriteHumanizeLevel.value || "极强",
    referenceExamples: collectReferenceExamplesText(),
    versionSpecs: [{
      ...version,
      direction: version.direction || preset.purpose,
      style: version.style || preset.style,
      wordCount: version.wordCount || preset.wordRange,
      referenceStyle,
    }],
    text: rewriteOriginal.value,
    ...extra,
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
            <button class="ghost small transcript-rewrite" type="button" data-task-id="${item.id}">定制改写</button>
            <button class="ghost small transcript-tts" type="button" data-task-id="${item.id}">导入 TTS</button>
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

  await window.videoProjects?.linkCurrent?.("transcript", item.id, item.title || `文案 ${item.id}`, {
    text: item.text || "",
    taskId: Number(item.id || 0),
    source: "downloaded",
  });

  rewriteTaskId.value = item.id;
  rewriteOriginal.value = item.text || "";
  rewriteAnalysisView.textContent = "点击分析后展示结果。";
  if (rewriteAnalysisStatus) {
    rewriteAnalysisStatus.textContent = item.ai?.hook ? "已有历史分析；点击分析可重新生成并展示。" : "不点击分析就不会调用模型。";
  }
  const rewrite = item.rewrite || {};
  if (rewrite.provider && [...rewriteProvider.options].some((option) => option.value === rewrite.provider)) {
    rewriteProvider.value = rewrite.provider;
  }
  rewriteDirection.value = rewriteDirectionOptions.includes(rewrite.direction || item.rewriteDirection)
    ? (rewrite.direction || item.rewriteDirection)
    : "短视频口播";
  rewriteStyle.value = rewriteStyleOptions.includes(rewrite.style || item.rewriteStyle)
    ? (rewrite.style || item.rewriteStyle)
    : "小黑漫画解释类";
  rewriteReference.value = sanitizeRewriteReference(rewrite.referenceStyle || rewriteReference.value || defaultRewriteReference);
  const params = rewrite.params || item.rewriteParams || {};
  rewriteToneLevel.value = String(params.toneLevel || 8);
  rewriteConflictLevel.value = String(params.conflictLevel || 7);
  rewriteEmotionLevel.value = String(params.emotionLevel || 7);
  rewriteSalesLevel.value = String(params.salesLevel || 6);
  rewriteHumanizeLevel.value = rewrite.humanizeLevel || item.humanizeLevel || params.humanizeLevel || "普通";
  renderReferenceExamples((rewrite.referenceExamples || item.referenceExamples || []).length
    ? (rewrite.referenceExamples || item.referenceExamples)
    : savedExamples.examples || []);
  loadRewritePresetSettings();
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

async function runRewriteInlineAnalysis() {
  const id = rewriteTaskId.value;
  if (!id) {
    rewriteStatus.textContent = "请先从采集处理选择一条文案。";
    return;
  }
  const text = rewriteOriginal.value.trim();
  if (!text) {
    rewriteStatus.textContent = "原始文案为空，无法分析。";
    return;
  }
  if (rewriteAnalysisStatus) rewriteAnalysisStatus.textContent = "正在检查模型配置...";
  rewriteAnalysisView.textContent = "正在分析文案结构、钩子、痛点、情绪和行动号召...";
  try {
    await ensureTranscriptProvidersConfigured();
    const data = await fetchJson("/api/tasks/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, text }),
    });
    rewriteAnalysisView.textContent = formatAnalysisForRewrite(data.analysis || {});
    if (rewriteAnalysisStatus) rewriteAnalysisStatus.textContent = "AI 分析已生成。";
    renderTranscripts(data.transcripts);
    await refreshTasks();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rewriteAnalysisView.textContent = message;
    if (rewriteAnalysisStatus) rewriteAnalysisStatus.textContent = "分析失败，请检查模型配置。";
  }
}

async function ensureRewriteTaskReady() {
  const existingId = rewriteTaskId.value;
  if (existingId) return existingId;
  const text = rewriteOriginal.value.trim();
  if (!text) {
    rewriteStatus.textContent = "原始文案为空，无法生成文案定制成品。";
    return "";
  }
  rewriteStatus.textContent = "正在创建本地文案任务...";
  const data = await fetchJson("/api/workflow/from-transcript", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transcriptText: text,
      title: "手动文案定制",
      sourceUrl: "",
    }),
  });
  const id = data.task?.id || data.project?.workflowState?.lastTaskId || 0;
  if (!id) throw new Error("本地文案任务创建失败，无法生成。");
  rewriteTaskId.value = String(id);
  await refreshTranscripts().catch(() => []);
  return rewriteTaskId.value;
}

function handoffTargetLabel(target) {
  return {
    "moments-copy": "朋友圈文案定制",
    tts: "TTS语音",
    "video-output": "视频成片",
    "cs1-video": "CS1生成器",
    "xiaohei-video": "小黑视频风格生成",
    "money-printer": "MoneyPrinter",
  }[target] || target || "目标模块";
}

function setTextareaValue(element, text) {
  if (!element) return false;
  element.value = text;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

async function sendRewriteTextToTarget(target, text, meta = {}) {
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    rewriteStatus.textContent = "没有可发送的文案，请先填写或生成。";
    return;
  }
  const label = handoffTargetLabel(target);
  const payload = {
    target,
    text: cleanText,
    source: meta.source || "rewrite",
    versionKey: meta.versionKey || "",
    taskId: Number(rewriteTaskId.value || 0),
    title: meta.title || label,
    sentAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(`video-factory-handoff:${target}`, JSON.stringify(payload));
    localStorage.setItem("video-factory-last-handoff", JSON.stringify(payload));
  } catch {}

  if (target === "moments-copy") {
    setTextareaValue(momentsCopyInput, cleanText);
    if (momentsCopyStatus) momentsCopyStatus.textContent = `已接收来自文案定制改写的文案，${countRewriteCharacters(cleanText)} 字。`;
    saveMomentsDraft();
  } else if (target === "tts") {
    setTextareaValue(ttsText, cleanText);
    if (ttsCharacterCount) ttsCharacterCount.textContent = `${countRewriteCharacters(cleanText)} 字`;
    if (ttsStatus) ttsStatus.textContent = "已接收文案，可直接生成语音。";
  } else if (target === "video-output") {
    await window.videoProjects?.linkCurrent?.("selected_rewrite", `rewrite-handoff-${Date.now()}`, meta.title || "文案定制成品", {
      text: cleanText,
      taskId: Number(rewriteTaskId.value || 0),
      versionKey: meta.versionKey || "",
      source: meta.source || "rewrite_handoff",
    });
    await window.videoProjects?.refresh?.({ preserveSelection: true });
    if (videoProductStatus) videoProductStatus.textContent = "已接收文案，可继续补导演稿、TTS 和素材后成片。";
  } else if (target === "cs1-video") {
    setTextareaValue(document.querySelector("#cs1VideoText"), cleanText);
    const titleInput = document.querySelector("#cs1VideoTitle");
    if (titleInput && !titleInput.value.trim()) titleInput.value = "文案定制成品";
    const status = document.querySelector("#cs1VideoStatus");
    const message = document.querySelector("#cs1VideoMessage");
    if (status) status.textContent = "已接收文案";
    if (message) message.textContent = "文案已填入输入区，可直接生成 CS1 视频。";
  } else if (target === "xiaohei-video") {
    const handoff = {
      projectId: window.videoProjects?.current?.()?.id || "",
      projectTitle: window.videoProjects?.current?.()?.title || "",
      title: "文案定制成品",
      text: cleanText,
      source: meta.source || "rewrite",
      sentAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem("video-factory-xiaohei-handoff", JSON.stringify(handoff));
    } catch {}
    document.querySelector("#xiaoheiProductionFrame")?.contentWindow?.postMessage({ type: "video-factory:xiaohei-handoff", handoff }, window.location.origin);
    const status = document.querySelector("#xiaoheiHandoffStatus");
    if (status) status.textContent = `已接收文案：${countRewriteCharacters(cleanText)} 字`;
  } else if (target === "money-printer") {
    setTextareaValue(document.querySelector("#moneyPrinterScript"), cleanText);
    const subject = document.querySelector("#moneyPrinterSubject");
    if (subject && !subject.value.trim()) subject.value = "文案定制成品视频";
    const status = document.querySelector("#moneyPrinterStatus");
    const detail = document.querySelector("#moneyPrinterDetail");
    if (status) status.textContent = "已接收文案";
    if (detail) detail.textContent = "脚本已填入 MoneyPrinter，可补主题和素材参数后生成。";
  }
  rewriteStatus.textContent = `已发送到${label}。`;
}

function rewriteHandoffTextFromButton(button) {
  const target = button.dataset.target || "";
  const source = button.dataset.source || "rewrite";
  const versionKey = button.dataset.versionKey || "";
  let text = "";
  let title = "文案定制成品";
  if (source === "original") {
    text = rewriteOriginal.value;
    title = "原始文案";
  } else {
    const textarea = rewriteVersions.querySelector(`.rewrite-version-text[data-version-key="${versionKey}"]`);
    text = textarea?.value || "";
    const version = collectRewriteVersions().find((item) => item.key === versionKey);
    title = version?.name || title;
  }
  return { target, source, versionKey, text, title };
}

async function handleRewriteHandoff(button) {
  const { target, source, versionKey, text, title } = rewriteHandoffTextFromButton(button);
  await sendRewriteTextToTarget(target, text, { source, versionKey, title });
}

async function handleRewriteSelectedHandoff(button) {
  const panel = button.closest(".rewrite-handoff-panel");
  const targets = [...(panel?.querySelectorAll(".rewrite-handoff-choice:checked") || [])]
    .map((item) => item.dataset.target)
    .filter(Boolean);
  if (!targets.length) {
    rewriteStatus.textContent = "请先勾选要发送到的模块。";
    return;
  }
  const source = button.dataset.source || "rewrite";
  const versionKey = button.dataset.versionKey || "";
  let text = "";
  let title = "文案定制成品";
  if (source === "original") {
    text = rewriteOriginal.value;
    title = "原始文案";
  } else {
    const textarea = rewriteVersions.querySelector(`.rewrite-version-text[data-version-key="${versionKey}"]`);
    text = textarea?.value || "";
    const version = collectRewriteVersions().find((item) => item.key === versionKey);
    title = version?.name || title;
  }
  if (!String(text || "").trim()) {
    rewriteStatus.textContent = "没有可发送的文案，请先填写或生成。";
    return;
  }
  for (const target of targets) {
    await sendRewriteTextToTarget(target, text, { source, versionKey, title });
  }
  rewriteStatus.textContent = `已发送到：${targets.map(handoffTargetLabel).join("、")}。`;
}

async function continueWorkflowFromTranscript(job = {}, { sourceUrl = "", title = "" } = {}) {
  const text = String(job.text || "").trim();
  if (!text) return null;
  const currentProject = window.videoProjects?.current?.();
  const data = await fetchJson("/api/workflow/from-transcript", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId: currentProject?.id || "",
      taskId: Number(job.taskId || 0),
      transcriptText: text,
      title: title || job.title || "",
      sourceUrl,
    }),
  });
  await window.videoProjects?.refresh?.({ preserveSelection: false });
  if (data.project?.id) await window.videoProjects?.select?.(data.project.id);
  await refreshTranscripts();
  if (data.task?.id) {
    await openRewriteEditor(data.task.id);
    resultBox.textContent = `文案提取成功，已自动生成标题和项目名：${data.titles?.projectTitle || data.project?.title || ""}`;
  }
  return data;
}

async function selectRewriteForCurrentProject(version = {}, taskId = rewriteTaskId?.value || "") {
  const text = String(version.content || "").trim();
  if (!text || !window.videoProjects?.current?.()) return null;
  const versionKey = version.key || "first";
  return window.videoProjects.linkCurrent("selected_rewrite", `task-${taskId}-${versionKey}`, version.name || "默认改写版本", {
    text,
    taskId: Number(taskId || 0),
    versionKey,
    direction: version.direction,
    style: version.style,
    source: "ai_generated",
  });
}

async function sendTranscriptToTts(taskId) {
  const transcripts = await refreshTranscripts();
  const item = transcripts.find((row) => String(row.id) === String(taskId));
  if (!item) return;
  await window.videoProjects?.linkCurrent?.("transcript", item.id, item.title || `文案 ${item.id}`, {
    text: item.text || "",
    taskId: Number(item.id || 0),
    source: "downloaded",
  });
  await window.videoProjects?.linkCurrent?.("selected_rewrite", `transcript-${item.id}`, item.title || `文案 ${item.id}`, {
    text: item.text || "",
    taskId: Number(item.id || 0),
    source: "downloaded",
  });
  ttsText.value = item.text || "";
  ttsCharacterCount.textContent = `${(item.text || "").replace(/\s/g, "").length} 字`;
  window.workbenchNavigate?.("tts", { preserveScroll: true });
  document.querySelector("#ttsLab")?.scrollIntoView({ behavior: "smooth", block: "start" });
  ttsStatus.textContent = `已从文案库导入：${item.title || `任务 ${item.id}`}。请选择音色后生成语音。`;
}

async function sendTranscriptToDirector(taskId) {
  const transcripts = await refreshTranscripts();
  const item = transcripts.find((row) => String(row.id) === String(taskId));
  if (!item) return;
  await window.videoProjects?.linkCurrent?.("transcript", item.id, item.title || `文案 ${item.id}`, {
    text: item.text || "",
    taskId: Number(item.id || 0),
    source: "downloaded",
  });
  await window.videoProjects?.linkCurrent?.("selected_rewrite", `transcript-${item.id}`, item.title || `文案 ${item.id}`, {
    text: item.text || "",
    taskId: Number(item.id || 0),
    source: "downloaded",
  });
  directorSourceMode.value = "manual";
  updateDirectorSourceOptions({ preserveText: true });
  directorTitle.value = conciseDirectorTitle(item.title || `任务 ${item.id}`);
  directorSourceText.value = item.text || "";
  directorSourceContext = {
    taskId: Number(item.id || 0),
    rewriteId: 0,
    sourceKey: `transcript:${item.id}`,
    sourceType: "transcript",
  };
  updateDirectorCharacterCount();
  window.workbenchNavigate?.("director", { preserveScroll: true });
  document.querySelector("#directorSystem")?.scrollIntoView({ behavior: "smooth", block: "start" });
  directorStatus.textContent = `已从文案库导入：${item.title || `任务 ${item.id}`}。`;
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

async function ensureProviderConfigured(providerId, { title = "API 配置", reason = "", model = "", baseUrl = "" } = {}) {
  const id = String(providerId || "").trim();
  if (!id) return false;
  while (true) {
    const localCheck = await fetchJson("/api/settings/require-provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, setDefault: true, ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) }),
    }).catch((error) => ({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    if (localCheck.ok) {
      await loadSettings().catch(() => {});
      return true;
    }

    const settings = await fetchJson("/api/settings");
    const rewriteProvider = settings.rewrite?.providers?.[id];
    const ttsProviderConfig = Array.isArray(settings.tts?.providers)
      ? settings.tts.providers.find((provider) => provider.id === id)
      : null;
    const label = rewriteProvider?.label || ttsProviderConfig?.label || id;
    const apiKey = window.prompt([
      `${title}需要配置：${label}`,
      reason,
      `本地项目没有检测到可用配置，或当前配置不可用：${localCheck.message || "检测失败"}`,
      "请输入 API Key，点击确定后会先检测，检测通过才保存并继续。",
    ].filter(Boolean).join("\n\n"));
    if (!apiKey || !apiKey.trim()) {
      window.alert("当前步骤必须配置可用 API，流程已暂停。");
      continue;
    }

    const body = {
      id,
      apiKey: apiKey.trim(),
      setDefault: true,
    };
    if (model) body.model = model;
    if (baseUrl) body.baseUrl = baseUrl;

    const result = await fetchJson("/api/settings/require-provider", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch((error) => ({ ok: false, message: error instanceof Error ? error.message : String(error) }));

    if (result.ok) {
      window.alert(`${label} 检测通过，已保存。`);
      await loadSettings().catch(() => {});
      return true;
    }
    window.alert(`检测失败：${result.message || "请检查 API Key、模型或额度后重新填写。"}`);
  }
}

function setMomentsStatus(message, type = "") {
  if (!momentsCopyStatus) return;
  momentsCopyStatus.textContent = message;
  momentsCopyStatus.dataset.status = type;
}

function setMomentsProgress(percent, label) {
  if (!momentsProgress || !momentsProgressLabel || !momentsProgressPercent || !momentsProgressBar) return;
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  momentsProgress.hidden = false;
  momentsProgressLabel.textContent = label || "正在生成";
  momentsProgressPercent.textContent = `${value}%`;
  momentsProgressBar.style.width = `${value}%`;
}

function stopMomentsProgress(label = "", percent = 100) {
  if (momentsProgressTimer) {
    clearInterval(momentsProgressTimer);
    momentsProgressTimer = 0;
  }
  if (label) setMomentsProgress(percent, label);
}

function startMomentsProgress() {
  if (momentsProgressTimer) clearInterval(momentsProgressTimer);
  const startedAt = Date.now();
  const stages = [
    [0, 6, "正在提交生成任务"],
    [900, 18, "正在生成朋友圈文案"],
    [2800, 38, "正在加入引用素材和金句"],
    [5200, 58, "正在做反差和落差质检"],
    [8200, 76, "正在生成图片提示词"],
    [12000, 88, "正在整理结果"],
  ];
  setMomentsProgress(3, stages[0][2]);
  momentsProgressTimer = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const current = [...stages].reverse().find(([time]) => elapsed >= time) || stages[0];
    const drift = Math.min(4, Math.floor(elapsed / 7000));
    setMomentsProgress(Math.min(92, current[1] + drift), current[2]);
  }, 700);
}

function setMomentsPersonaStatus(message) {
  if (momentsPersonaStatus) momentsPersonaStatus.textContent = message;
}

function momentsCharacterCount(value) {
  return Array.from(String(value || "").replace(/\s+/g, "")).length;
}

function currentMomentsPersona() {
  const id = momentsPersonaSelect?.value || "";
  return momentsPersonas.find((item) => item.id === id) || momentsPersonas[0] || defaultMomentsPersona;
}

function applyMomentsPersona(persona) {
  if (!persona) return;
  if (momentsPersonaSelect) momentsPersonaSelect.value = persona.id;
  if (momentsPersonaName) momentsPersonaName.value = persona.name || "";
  if (momentsPersonaText) momentsPersonaText.value = persona.description || "";
  try {
    localStorage.setItem(MOMENTS_ACTIVE_PERSONA_KEY, persona.id);
  } catch {}
}

function renderMomentsPersonas(personas = []) {
  momentsPersonas = (Array.isArray(personas) && personas.length ? personas : [defaultMomentsPersona])
    .map((item) => ({
      id: item.id || defaultMomentsPersona.id,
      name: item.name || "未命名人设",
      description: item.description || "",
      updatedAt: item.updatedAt || "",
    }));
  if (!momentsPersonaSelect) return;
  const activeId = localStorage.getItem(MOMENTS_ACTIVE_PERSONA_KEY) || momentsPersonaSelect.value || defaultMomentsPersona.id;
  momentsPersonaSelect.innerHTML = momentsPersonas
    .map((persona) => `<option value="${escapeHtml(persona.id)}">${escapeHtml(persona.name)}</option>`)
    .join("");
  const selected = momentsPersonas.find((item) => item.id === activeId) || momentsPersonas[0];
  applyMomentsPersona(selected);
}

async function loadMomentsPersonas() {
  try {
    const data = await fetchJson("/api/moments/personas");
    renderMomentsPersonas(data.personas || []);
    setMomentsPersonaStatus(`人设库已同步：${data.syncPath || "项目文件"}`);
  } catch (error) {
    renderMomentsPersonas([defaultMomentsPersona]);
    setMomentsPersonaStatus(error instanceof Error ? error.message : "人设库加载失败，已使用默认人设。");
  }
}

async function saveMomentsPersona() {
  if (!momentsPersonaName || !momentsPersonaText) return;
  const name = momentsPersonaName.value.trim();
  const description = momentsPersonaText.value.trim();
  if (!name || !description) {
    setMomentsPersonaStatus("请先填写人设名称和说明。");
    return;
  }
  setMomentsPersonaStatus("正在保存并同步人设库...");
  try {
    const selected = currentMomentsPersona();
    const data = await fetchJson("/api/moments/personas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: selected?.name === name ? selected.id : "",
        name,
        description,
      }),
    });
    renderMomentsPersonas(data.personas || []);
    applyMomentsPersona(data.persona);
    setMomentsPersonaStatus(`已保存并同步：${data.syncPath || "personas/moments-personas.json"}`);
  } catch (error) {
    setMomentsPersonaStatus(error instanceof Error ? error.message : String(error));
  }
}

async function deleteMomentsPersona() {
  const persona = currentMomentsPersona();
  if (!persona) return;
  setMomentsPersonaStatus("正在删除人设...");
  try {
    const data = await fetchJson("/api/moments/personas/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: persona.id }),
    });
    renderMomentsPersonas(data.personas || []);
    setMomentsPersonaStatus(`已删除并同步：${data.syncPath || "personas/moments-personas.json"}`);
  } catch (error) {
    setMomentsPersonaStatus(error instanceof Error ? error.message : String(error));
  }
}

function collectMomentsPayload() {
  const persona = currentMomentsPersona();
  return {
    text: momentsCopyInput?.value.trim() || "",
    persona: momentsPersonaText?.value.trim() || persona?.description || "",
    personaName: momentsPersonaName?.value.trim() || persona?.name || "",
    localMaterials: momentsLocalMaterials?.value.trim() || "",
    visualStyle: momentsVisualStyle?.value || "auto",
    imageCount: momentsImageCount?.value === "auto" ? 0 : Number(momentsImageCount?.value || 0),
    tone: momentsTone?.value || "强反差急转弯",
    intent: momentsIntent?.value || "冲突反转",
    referenceStyle: momentsReferenceStyle?.value || "自动引用",
  };
}

function saveMomentsDraft() {
  try {
    localStorage.setItem(MOMENTS_DRAFT_KEY, JSON.stringify({
      text: momentsCopyInput?.value || "",
      localMaterials: momentsLocalMaterials?.value || "",
      visualStyle: momentsVisualStyle?.value || "auto",
      imageCount: momentsImageCount?.value || "auto",
      tone: momentsTone?.value || "强反差急转弯",
      intent: momentsIntent?.value || "冲突反转",
      referenceStyle: momentsReferenceStyle?.value || "自动引用",
      result: currentMomentsResult,
      post: momentsPostOutput?.value || "",
    }));
  } catch {}
}

function loadMomentsDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(MOMENTS_DRAFT_KEY) || "{}");
    if (draft.text && momentsCopyInput && !momentsCopyInput.value.trim()) momentsCopyInput.value = draft.text;
    if (draft.localMaterials && momentsLocalMaterials) momentsLocalMaterials.value = draft.localMaterials;
    if (draft.visualStyle && momentsVisualStyle) momentsVisualStyle.value = draft.visualStyle;
    if (draft.imageCount && momentsImageCount) momentsImageCount.value = draft.imageCount;
    if (draft.tone && momentsTone) momentsTone.value = draft.tone;
    if (draft.intent && momentsIntent) momentsIntent.value = draft.intent;
    if (draft.referenceStyle && momentsReferenceStyle) momentsReferenceStyle.value = draft.referenceStyle;
    if (draft.result) {
      currentMomentsResult = draft.result;
      if (momentsPostOutput) momentsPostOutput.value = draft.post || draft.result.post || "";
      renderMomentsResult(currentMomentsResult);
    }
  } catch {}
}

function momentsPromptText(item) {
  const negative = item.negative_prompt ? `\n\n负面提示词：${item.negative_prompt}` : "";
  const materialHint = String(item.local_material_hint || "").trim();
  const hasRealMaterial = materialHint
    && !/^无本地素材/i.test(materialHint)
    && !/无本地素材/.test(materialHint)
    && !/暂无本地素材/.test(materialHint);
  const material = hasRealMaterial ? `\n\n本地素材参考：${materialHint}` : "";
  return `${item.prompt || ""}${material}${negative}`.trim();
}

function renderMomentsImages(images = []) {
  if (!momentsGeneratedImages) return;
  if (!images.length) {
    momentsGeneratedImages.innerHTML = "";
    return;
  }
  momentsGeneratedImages.innerHTML = images.map((image) => {
    const imageUrl = image.imageUrl || image.thumbnailUrl || (image.imagePath ? `/api/image/file?path=${encodeURIComponent(image.imagePath)}` : "");
    return `
      <article class="moments-image-card">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(image.title || "朋友圈配图")}" />` : ""}
        <strong>${escapeHtml(image.title || `配图 ${image.index || ""}`)}</strong>
        <small>${escapeHtml(image.imagePath || image.error || "")}</small>
      </article>
    `;
  }).join("");
}

async function uploadMomentsMaterial(file, { promptIndex = null } = {}) {
  if (!file) return null;
  const imageData = await fileToDataUrl(file);
  const data = await fetchJson("/api/moments/materials/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      file_name: file.name,
      image_mime: file.type,
      image_data: imageData,
      prompt_index: promptIndex,
    }),
  });
  return data.material;
}

function appendMaterialText(target, material) {
  if (!target || !material) return;
  const line = `本地素材：${material.name}（${material.filePath}）`;
  const current = target.value.trim();
  target.value = current ? `${current}\n${line}` : line;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function appendMaterialToPrompt(card, material) {
  const promptText = card?.querySelector(".moments-prompt-text");
  if (!promptText || !material) return;
  const line = `本地素材参考：${material.name}（${material.filePath}）`;
  if (!promptText.value.includes(material.filePath)) {
    promptText.value = `${promptText.value.trim()}\n\n${line}`.trim();
    promptText.dispatchEvent(new Event("input", { bubbles: true }));
    promptText.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

async function uploadPromptMomentsMaterial(index, file) {
  const status = document.querySelector(`[data-moments-prompt-status="${index}"]`);
  const card = document.querySelector(`[data-moments-prompt="${index}"]`);
  if (!file || !card) return;
  if (status) status.textContent = "正在上传本条素材...";
  try {
    const material = await uploadMomentsMaterial(file, { promptIndex: index });
    appendMaterialToPrompt(card, material);
    const preview = document.querySelector(`[data-moments-material-preview="${index}"]`);
    if (preview) {
      preview.innerHTML = `
        <span class="moments-material-chip" title="${escapeHtml(material.filePath || "")}">
          ${material.imageUrl ? `<img src="${escapeHtml(material.imageUrl)}" alt="${escapeHtml(material.name || "素材")}" />` : ""}
          <span>${escapeHtml(material.name || "素材")}</span>
        </span>
      `;
    }
    saveMomentsDraft();
    if (status) status.textContent = "本条素材已上传并写入提示词。";
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : String(error);
  }
}

function renderMomentsResult(result) {
  if (!result) return;
  if (momentsPostOutput && !momentsPostOutput.value.trim()) momentsPostOutput.value = result.post || "";
  const images = Array.isArray(result.images) ? result.images : [];
  if (momentsResultMeta) {
    const reference = result.reference_used ? ` · 引用：${result.reference_used}` : "";
    momentsResultMeta.textContent = `${result.theme || "朋友圈图文"} · ${images.length} 张配图 · ${momentsCharacterCount(momentsPostOutput?.value || result.post)} 字${reference}`;
  }
  if (!momentsImagePromptList) return;
  if (!images.length) {
    momentsImagePromptList.className = "moments-prompt-list empty";
    momentsImagePromptList.textContent = "还没有生成配图提示词。";
    return;
  }
  momentsImagePromptList.className = "moments-prompt-list";
  momentsImagePromptList.innerHTML = images.map((item, index) => `
    <article class="moments-prompt-card" data-moments-prompt="${index}">
      <div class="moments-prompt-head">
        <div>
          <span class="section-eyebrow">${escapeHtml(item.style === "realistic" ? "Realistic" : item.style === "xiaohei" ? "Xiaohei" : "Auto")}</span>
          <h3>#${index + 1} ${escapeHtml(item.title || "配图")}</h3>
          <p>${escapeHtml([item.image_role, item.composition_type, item.visual_hook || item.purpose].filter(Boolean).join(" · "))}</p>
        </div>
        <div class="moments-actions compact">
          <button class="primary small" type="button" data-moments-action="generate-image" data-index="${index}">生成图片</button>
        </div>
      </div>
      <textarea class="moments-prompt-text" rows="7">${escapeHtml(momentsPromptText(item))}</textarea>
      <div class="moments-prompt-material-actions">
        <button class="ghost small" type="button" data-moments-action="choose-material" data-index="${index}">上传本条素材</button>
        <input hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" data-moments-material-file="${index}" />
        <div class="moments-material-list compact" data-moments-material-preview="${index}"></div>
      </div>
      <div class="moments-prompt-status" data-moments-prompt-status="${index}"></div>
    </article>
  `).join("");
  renderMomentsImages(result.generatedImages || []);
}

async function generateMomentsPost() {
  const payload = collectMomentsPayload();
  if (!payload.text) {
    setMomentsStatus("请先填写朋友圈文案输入区。", "warning");
    stopMomentsProgress();
    return;
  }
  if (!payload.persona) {
    setMomentsStatus("请先选择或填写人设。", "warning");
    stopMomentsProgress();
    return;
  }
  setMomentsStatus("正在生成朋友圈文案和配图提示词...");
  startMomentsProgress();
  if (generateMomentsPostBtn) generateMomentsPostBtn.disabled = true;
  try {
    const data = await fetchJson("/api/moments/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    currentMomentsResult = data.result;
    if (momentsPostOutput) momentsPostOutput.value = currentMomentsResult.post || "";
    renderMomentsResult(currentMomentsResult);
    saveMomentsDraft();
    stopMomentsProgress("朋友圈文案和图片提示词生成完成", 100);
    setMomentsStatus(`已生成：${currentMomentsResult.image_count || currentMomentsResult.images?.length || 0} 张配图提示词，可继续修改。`, "success");
  } catch (error) {
    stopMomentsProgress("生成失败", 100);
    setMomentsStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    if (generateMomentsPostBtn) generateMomentsPostBtn.disabled = false;
  }
}

function collectRenderedMomentsPrompts() {
  return [...document.querySelectorAll(".moments-prompt-card")].map((card, index) => {
    const text = card.querySelector(".moments-prompt-text")?.value.trim() || "";
    return { index, text };
  }).filter((item) => item.text);
}

async function copyAllMomentsPrompts() {
  const prompts = collectRenderedMomentsPrompts();
  if (!prompts.length) {
    setMomentsStatus("还没有可复制的图片提示词。", "warning");
    return;
  }
  await navigator.clipboard.writeText(prompts.map((item) => `#${item.index + 1}\n${item.text}`).join("\n\n---\n\n"));
  setMomentsStatus(`已复制 ${prompts.length} 条图片提示词。`, "success");
}

async function generateMomentsImage(index) {
  const prompts = collectRenderedMomentsPrompts();
  const target = prompts.find((item) => item.index === Number(index));
  if (!target?.text) {
    setMomentsStatus("当前配图没有提示词。", "warning");
    return;
  }
  const status = document.querySelector(`[data-moments-prompt-status="${index}"]`);
  if (status) status.textContent = "正在调用图片 API...";
  try {
    const data = await fetchJson("/api/image/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: target.text,
        aspectRatio: "16:9",
        count: 1,
        sourceType: "moments-copy",
        sourceId: `moments-${Date.now()}-${Number(index) + 1}`,
      }),
    });
    const first = (data.results || []).find((item) => item.success);
    if (!first) throw new Error((data.results || []).find((item) => item.error)?.error || "图片生成失败。");
    currentMomentsResult = currentMomentsResult || { images: [] };
    const generated = {
      index: Number(index) + 1,
      title: currentMomentsResult.images?.[index]?.title || `配图 ${Number(index) + 1}`,
      imagePath: first.imagePath,
      thumbnailUrl: first.thumbnailUrl,
      imageUrl: first.imagePath ? `/api/image/file?path=${encodeURIComponent(first.imagePath)}` : first.thumbnailUrl,
    };
    currentMomentsResult.generatedImages = [
      ...(currentMomentsResult.generatedImages || []).filter((item) => Number(item.index) !== Number(index) + 1),
      generated,
    ].sort((a, b) => Number(a.index) - Number(b.index));
    renderMomentsImages(currentMomentsResult.generatedImages);
    saveMomentsDraft();
    if (status) status.textContent = `已生成：${first.imagePath || first.filename || ""}`;
    setMomentsStatus("图片已生成并保存到图片资产库。", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (status) status.textContent = message;
    setMomentsStatus(message, "error");
  }
}

async function generateAllMomentsImages() {
  const prompts = collectRenderedMomentsPrompts();
  if (!prompts.length) {
    setMomentsStatus("还没有可生成图片的提示词。", "warning");
    return;
  }
  if (generateMomentsImagesBtn) generateMomentsImagesBtn.disabled = true;
  for (const item of prompts) {
    await generateMomentsImage(item.index);
  }
  if (generateMomentsImagesBtn) generateMomentsImagesBtn.disabled = false;
}

function addMomentsPublishPath(paths, value) {
  const text = String(value || "").trim();
  if (!text) return;
  paths.add(text);
}

function extractMomentsImagePathsFromText(text = "") {
  const value = String(text || "");
  const paths = [];
  for (const match of value.matchAll(/本地素材(?:参考)?：.*?（([A-Za-z]:\\[^\r\n]+?)）/g)) {
    paths.push(match[1]);
  }
  for (const match of value.matchAll(/[A-Za-z]:\\[^\r\n]+?\.(?:png|jpe?g|webp)(?=$|[\s\r\n）])/gi)) {
    paths.push(match[0]);
  }
  return paths;
}

function collectMomentsPublishImages() {
  const paths = new Set();
  for (const image of currentMomentsResult?.generatedImages || []) {
    addMomentsPublishPath(paths, image.imagePath || image.filePath || image.path);
  }
  for (const chip of document.querySelectorAll(".moments-material-chip[title]")) {
    addMomentsPublishPath(paths, chip.getAttribute("title"));
  }
  for (const textarea of document.querySelectorAll(".moments-prompt-text")) {
    for (const filePath of extractMomentsImagePathsFromText(textarea.value || "")) {
      addMomentsPublishPath(paths, filePath);
    }
  }
  return [...paths];
}

async function publishMomentsToWechat() {
  const text = (momentsPostOutput?.value || momentsCopyInput?.value || "").trim();
  if (!text) {
    setMomentsStatus("请先生成或填写朋友圈文案成品。", "warning");
    return;
  }
  const imagePaths = collectMomentsPublishImages();
  setMomentsStatus(`正在调用微信客户端发布朋友圈：${imagePaths.length} 张图片...`);
  if (publishMomentsWechatBtn) publishMomentsWechatBtn.disabled = true;
  try {
    const data = await fetchJson("/api/moments/publish-wechat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        imagePaths,
      }),
    });
    setMomentsStatus(data.message || `已提交微信朋友圈发布：${imagePaths.length} 张图片。`, "success");
  } catch (error) {
    setMomentsStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    if (publishMomentsWechatBtn) publishMomentsWechatBtn.disabled = false;
  }
}

async function ensureTranscriptProvidersConfigured() {
  const textProviderId = rewriteProvider?.value || "dashscope";
  await ensureProviderConfigured(textProviderId, {
    title: "文案校正",
    reason: "提取文案后需要调用文本模型自动校正错字、断句和标点。",
  });
  await ensureProviderConfigured("dashscope", {
    title: "文案识别",
    reason: "如果平台没有字幕，需要使用 DashScope ASR 从音频识别文案。",
  });
  return true;
}

async function ensureRewriteProviderConfigured() {
  return ensureProviderConfigured(rewriteProvider?.value || "dashscope", {
    title: "文案定制改写",
    reason: "生成改写内容需要当前选择的文本模型可用。",
  });
}

async function ensureTtsProviderConfigured() {
  return ensureProviderConfigured(ttsProvider?.value || "aliyun_bailian", {
    title: "TTS 语音生成",
    reason: "生成语音需要当前选择的 TTS 服务可用。",
    model: ttsModel?.value?.trim() || "",
  });
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
  if (task.audio_path) lines.push(`音频文件：${task.audio_path}`);
  if (task.subtitle_path) lines.push(`字幕文件：${task.subtitle_path}`);
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
  activeResultFilePath = "";
  activeResultRewriteTaskId = "";
  autoOpenedResultTaskIds = new Set();
  autoRewriteResultTaskIds = new Set();
  if (openResultLocationBtn) openResultLocationBtn.hidden = true;
  if (sendResultRewriteBtn) sendResultRewriteBtn.hidden = true;
}

function primaryTaskFilePath(task = {}) {
  return task.audio_path || task.video_path || task.subtitle_path || task.txt_path || task.analysis_path || "";
}

async function openManagedPath(filePath) {
  if (!filePath) return;
  await fetchJson("/api/open-path", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath }),
  });
}

function updateResultActionButtons(rows = []) {
  const latestWithFile = [...rows].reverse().find((task) => primaryTaskFilePath(task));
  activeResultFilePath = latestWithFile ? primaryTaskFilePath(latestWithFile) : "";
  if (openResultLocationBtn) openResultLocationBtn.hidden = !activeResultFilePath;

  const latestWithText = [...rows].reverse().find((task) => task.txt_path);
  activeResultRewriteTaskId = latestWithText ? String(latestWithText.id || "") : "";
  if (sendResultRewriteBtn) sendResultRewriteBtn.hidden = !activeResultRewriteTaskId;
}

function handleFinishedResultWorkflow(rows = []) {
  for (const task of rows) {
    const id = String(task.id || "");
    if (!id || task.status !== "完成") continue;

    if (task.txt_path && !autoRewriteResultTaskIds.has(id)) {
      autoRewriteResultTaskIds.add(id);
      openRewriteEditor(id).catch((error) => {
        resultBox.textContent = error instanceof Error ? error.message : String(error);
        setReady("打开改写失败", false);
      });
      return;
    }

    const filePath = task.audio_path || task.video_path;
    const shouldPromptOpen = filePath && ["download", "audio"].includes(task.task_action || activeResultAction);
    if (shouldPromptOpen && !autoOpenedResultTaskIds.has(id)) {
      autoOpenedResultTaskIds.add(id);
      setTimeout(() => {
        if (window.confirm("视频/音频已完成，是否打开本地文件所在位置？")) {
          openManagedPath(filePath).catch((error) => {
            resultBox.textContent = error instanceof Error ? error.message : String(error);
          });
        }
      }, 120);
      return;
    }
  }
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
  updateResultActionButtons(rows);
  resultBox.textContent = [
    `${label}结果（${finished}/${rows.length} 已结束）`,
    "",
    rows.map(formatTaskResult).join("\n\n"),
  ].join("\n");
  handleFinishedResultWorkflow(rows);
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
      <div>音频 / 字幕</div>
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
        const mediaParts = [shortPath(task.audio_path), shortPath(task.subtitle_path)].filter(Boolean).join(" / ");
        const txtParts = [shortPath(task.txt_path), shortPath(task.analysis_path)].filter(Boolean).join(" / ");
        const ai = parseJson(task.ai_json);
        const tags = Array.isArray(ai.tags) ? ai.tags.join("、") : "";
        const category = ai.category || "";
        const labelText = [category, tags].filter(Boolean).join(" / ");
        const message = escapeHtml(task.error || task.message || "");
        const canPause = task.status === "下载中" || task.status === "提取中";
        const canDelete = !canPause;
        const primaryPath = primaryTaskFilePath(task);
        const openButton = primaryPath
          ? `<button class="ghost small task-open-location" type="button" data-task-id="${task.id}">打开位置</button>`
          : "";
        const rewriteButton = task.txt_path
          ? `<button class="ghost small task-send-rewrite" type="button" data-task-id="${task.id}">去改写</button>`
          : "";
        const manageButton = canPause
          ? `<button class="ghost small task-pause" type="button" data-task-id="${task.id}">暂停</button>`
          : `<button class="ghost small danger-action task-delete" type="button" data-task-id="${task.id}" ${canDelete ? "" : "disabled"}>删除</button>`;
        const actionButton = [openButton, rewriteButton, manageButton].filter(Boolean).join("");
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
            <div class="task-path" title="${escapeHtml([task.audio_path, task.subtitle_path].filter(Boolean).join(" / "))}">${escapeHtml(mediaParts) || "-"}</div>
            <div class="task-path" title="${escapeHtml([task.txt_path, task.analysis_path].filter(Boolean).join(" / "))}">${escapeHtml(txtParts) || "-"}</div>
            <div class="task-tags" title="${escapeHtml(labelText)}">${escapeHtml(labelText) || "-"}</div>
            <div class="task-message" title="${message}">${message || "-"}</div>
            <div class="task-actions-cell">${actionButton}</div>
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
    batchStatus.textContent = "请先在上方粘贴平台视频链接";
    resultBox.textContent = "请先在上方粘贴 yt-dlp 可识别的平台视频链接。";
    return;
  }

  const label = taskActionLabels[action] || "任务";
  batchStatus.textContent = `正在导入${label}队列`;
  resultBox.textContent = `正在导入${label}任务，请稍等...`;
  try {
    const needsTranscript = action === "transcript"
      || action === "subtitle"
      || (action === "download" && (downloadExtractTranscript?.checked || downloadCreateSubtitle?.checked));
    if (needsTranscript) {
      batchStatus.textContent = "正在检查文案识别和校正 API...";
      await ensureTranscriptProvidersConfigured();
    }
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
        extractTranscript: Boolean(downloadExtractTranscript?.checked),
        extractAudio: Boolean(downloadExtractAudio?.checked),
        extractSubtitle: Boolean(downloadCreateSubtitle?.checked),
        audioFormat: downloadAudioFormat?.value || "mp3",
      }),
    });
    const imported = data.imported || {};
    const projectTasks = [...(imported.tasks || []), ...(imported.duplicates || [])];
    await Promise.allSettled(projectTasks.map((task) => window.videoProjects?.linkCurrent?.(
      "source_video",
      task.id,
      task.title || task.url || `采集任务 ${task.id}`,
      { taskId: Number(task.id || 0), url: task.url || "", action, source: "downloaded", status: task.status || "pending" },
    )));
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

async function chooseLocalVideo() {
  const data = await fetchJson("/api/local-video/choose", { method: "POST" });
  localVideoPath.value = data.filePath || "";
  if (data.filePath) {
    resultBox.textContent = `已选择本地视频：${data.filePath}`;
    setReady("已选择本地视频", true);
  } else {
    resultBox.textContent = "未选择本地视频。";
    setReady("已取消选择", false);
  }
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

function ttsProgressValue(job = {}) {
  if (job.status === "completed") return 100;
  if (job.status === "processing") return 62;
  if (job.status === "failed") return Math.max(10, Number(job.progress || 0) || 62);
  if (job.status === "waiting" || job.status === "pending") return 24;
  return Number(job.progress || 0) || 8;
}

function renderTtsRail(job = activeTtsRailJob) {
  if (!railCurrentTask || !job) return;
  activeTtsRailJob = job;
  const progress = Math.max(0, Math.min(100, ttsProgressValue(job)));
  const textPreview = String(job.text || ttsText?.value || "").trim().slice(0, 72);
  const outputLink = job.audio_url
    ? `<a href="${escapeHtml(job.audio_url)}" target="_blank" rel="noreferrer">语音文件</a>`
    : "<span>完成后显示音频文件。</span>";
  railCurrentTask.innerHTML = `
    <div class="rail-video-product-card rail-tts-card">
      <strong>#${job.id || "-"} TTS 语音生成</strong>
      <small>当前步骤：${escapeHtml(job.status === "completed" ? "语音已生成，可以试听" : job.status === "failed" ? "语音生成失败" : job.status === "processing" ? "正在生成音频" : "任务已进入队列")}</small>
      <div class="rail-progress"><i style="width:${progress}%"></i></div>
      <div class="rail-task-summary">
        <div><span>进度</span><strong>${progress}%</strong></div>
        <div><span>状态</span><strong>${escapeHtml(ttsStatusLabel(job.status))}</strong></div>
        <div><span>格式</span><strong>${escapeHtml(String(job.format || ttsFormat?.value || "mp3").toUpperCase())}</strong></div>
      </div>
      <div class="rail-task-group">
        <span class="rail-subheading">配音文案</span>
        <small>${escapeHtml(textPreview || "等待提交文案。")}</small>
      </div>
      ${job.error ? `<div class="rail-failure-note">错误原因：${escapeHtml(job.error)}</div>` : ""}
      <div class="rail-task-group">
        <span class="rail-subheading">输出文件</span>
        <div class="video-product-output-files">${outputLink}</div>
      </div>
      <div class="rail-task-actions">
        <button type="button" data-nav="tts">查看语音</button>
      </div>
    </div>
  `;
}

function renderTtsRailLists(jobs = []) {
  if (!Array.isArray(jobs) || !jobs.length) return;
  if (railRecentOutput) {
    const completed = jobs.filter((job) => job.status === "completed").slice(0, 5);
    if (completed.length) {
      railRecentOutput.innerHTML = completed.map((job) => `
        <button class="rail-list-item" type="button" data-nav="tts">
          <span>#${job.id} TTS 语音 · ${escapeHtml(job.voice_name || job.voice_id || job.provider || "")}</span>
          <strong>${escapeHtml(String(job.text || "").slice(0, 48) || "语音已生成")}</strong>
        </button>
      `).join("");
    }
  }
  if (railErrors) {
    const failed = jobs.filter((job) => job.status === "failed").slice(0, 4);
    if (failed.length) {
      railErrors.innerHTML = failed.map((job) => `
        <button class="rail-list-item" type="button" data-nav="tts">
          <span>#${job.id} TTS 语音失败</span>
          <strong>${escapeHtml(job.error || "未知错误")}</strong>
        </button>
      `).join("");
    }
  }
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
        <div class="tts-history-row" data-tts-job-id="${job.id}">
          <strong>#${job.id}</strong>
          <span>${escapeHtml(labels[job.provider] || job.provider)}</span>
          <span class="tts-history-text" title="${escapeHtml(job.text)}">${escapeHtml(job.text)}</span>
          <span>${escapeHtml(job.voice_name || job.voice_id || "-")}</span>
          <span class="tts-job-status ${escapeHtml(job.status)}">${escapeHtml(ttsStatusLabel(job.status))}</span>
          ${audio}
          <button class="ghost small danger-action tts-job-delete" type="button" ${["waiting", "processing"].includes(job.status) ? "disabled" : ""}>删除</button>
        </div>
      `;
    })
    .join("");
}

async function refreshTtsJobs() {
  const data = await fetchJson("/api/tts/jobs?limit=30");
  renderTtsJobs(data.jobs || []);
  renderTtsRailLists(data.jobs || []);
  if (activeTtsRailJob?.id) {
    const latest = (data.jobs || []).find((job) => String(job.id) === String(activeTtsRailJob.id));
    if (latest) renderTtsRail(latest);
  }
}

async function deleteTtsJob(id) {
  const confirmed = window.confirm(`确定删除语音记录 #${id} 和对应音频文件吗？此操作不可撤销。`);
  if (!confirmed) return;
  const data = await fetchJson("/api/tts/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, deleteFile: true }),
  });
  ttsStatus.textContent = `已删除 ${data.deleted || 0} 条语音记录。`;
  await refreshTtsJobs();
}

async function clearTtsJobs(scope = "all") {
  const label = scope === "failed" ? "全部失败语音记录" : "全部已结束语音记录和对应音频文件";
  if (!window.confirm(`确定清理${label}吗？正在生成的任务会保留，此操作不可撤销。`)) return;
  const data = await fetchJson("/api/tts/clear", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope, deleteFiles: true }),
  });
  ttsStatus.textContent = `已清理 ${data.deleted || 0} 条语音记录。`;
  await refreshTtsJobs();
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
  renderTtsRail(job);
  if (job.status === "completed") {
    generateTtsButton.disabled = false;
    ttsStatus.textContent = "生成完成，可以试听。";
    showTtsPreview(job);
    await window.videoProjects?.linkCurrent?.("tts", job.id, job.voice_name || `配音 #${job.id}`, {
      ...job,
      text: job.text || ttsText.value.trim(),
      source: "ai_generated",
      status: "ready",
    });
    await refreshTtsJobs();
    return;
  }
  if (job.status === "failed") {
    generateTtsButton.disabled = false;
    ttsStatus.textContent = job.error || "生成失败。";
    renderTtsRail(job);
    await refreshTtsJobs();
    return;
  }
  ttsStatus.textContent = job.status === "processing" ? "正在生成音频..." : "任务已进入队列...";
  ttsPollTimer = setTimeout(() => {
    waitForTtsJob(jobId).catch((error) => {
      generateTtsButton.disabled = false;
      ttsStatus.textContent = error instanceof Error ? error.message : String(error);
      renderTtsRail({
        ...(activeTtsRailJob || {}),
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
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
  ttsStatus.textContent = "正在检查 TTS API 配置...";
  await ensureTtsProviderConfigured();
  syncDirectorSourceFromText(text, {
    title: directorTitle?.value.trim() || "配音文案导演稿",
    sourceKey: `tts:${Date.now()}`,
    sourceType: "tts",
  });
  generateTtsButton.disabled = true;
  ttsStatus.textContent = "正在提交生成任务...";
  renderTtsRail({
    id: "",
    status: "waiting",
    text,
    voice_id: voiceId,
    voice_name: ttsPresetVoices.find((voice) => voice.id === voiceId)?.name || voiceId,
    format: ttsFormat.value,
    progress: 8,
  });
  try {
    const selectedVoice = ttsPresetVoices.find((voice) => voice.id === voiceId);
    const selectedVoiceForModel = selectedTtsVoice();
    const data = await fetchJson("/api/tts/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: ttsProvider.value,
        project_id: window.videoProjects?.current?.()?.id || "",
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
    renderTtsRail(data.job);
    await waitForTtsJob(data.job.id);
  } catch (error) {
    generateTtsButton.disabled = false;
    ttsStatus.textContent = error instanceof Error ? error.message : String(error);
    renderTtsRail({
      ...(activeTtsRailJob || {}),
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      text,
      voice_id: voiceId,
      format: ttsFormat.value,
    });
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
    reader.onerror = () => reject(new Error("文件读取失败。"));
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
  syncDirectorSourceFromText(text, {
    title: "AI 改写导演稿",
    sourceKey: `task-${rewriteTaskId.value || 0}-rewrite-${versionKey}`,
    sourceType: "rewrite",
    taskId: Number(rewriteTaskId.value || 0),
  });
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

function directorProgressValue(project = {}) {
  if (project.status === "completed") return 100;
  if (project.status === "processing") return 58;
  if (project.status === "failed") return Math.max(10, Number(project.progress || 0) || 58);
  if (project.status === "waiting" || project.status === "pending") return 18;
  return Number(project.progress || 0) || 8;
}

function directorCurrentStep(project = {}) {
  if (project.status === "completed") return "导演稿已完成并保存";
  if (project.status === "failed") return "导演稿生成失败";
  if (project.status === "processing") return "正在生成专业导演稿";
  if (project.status === "waiting" || project.status === "pending") return "任务已进入队列";
  return directorStatusLabel(project.status);
}

function syncDirectorSourceFromText(text, { title = "配音文案导演稿", sourceKey = "tts:text", sourceType = "tts", taskId = 0, rewriteId = 0 } = {}) {
  const sourceText = String(text || "").trim();
  if (!sourceText || !directorSourceText) return false;
  directorSourceMode.value = "manual";
  updateDirectorSourceOptions({ preserveText: true });
  directorSourceText.value = sourceText;
  if (directorTitle && !directorTitle.value.trim()) directorTitle.value = title;
  directorSourceContext = {
    taskId: Number(taskId || 0),
    rewriteId: Number(rewriteId || 0),
    sourceKey,
    sourceType,
  };
  updateDirectorCharacterCount();
  return true;
}

function directorOutputLinks(project = {}) {
  if (!project.id || project.status !== "completed") {
    return '<span>完成后显示导演稿文件。</span>';
  }
  return [
    ["json", "JSON"],
    ["md", "Markdown"],
    ["prompts", "图片提示词"],
    ["chatgpt", "ChatGPT生图词"],
  ].map(([format, label]) => (
    `<a href="/api/director/export?id=${encodeURIComponent(project.id)}&format=${encodeURIComponent(format)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
  )).join("");
}

function renderDirectorRail(project = activeDirectorRailProject) {
  if (!railCurrentTask || !project) return;
  activeDirectorRailProject = project;
  const meta = project.metadata || {};
  const progress = Math.max(0, Math.min(100, directorProgressValue(project)));
  const title = project.title || directorTitle?.value || "AI 导演稿";
  const scenes = meta.scene_count || project.result?.storyboard?.length || project.scenes?.length || meta.shot_count || directorShotCount?.value || "-";
  const textPreview = String(project.source_text || directorSourceText?.value || "").trim().slice(0, 72);
  const error = meta.error || project.error || "";
  const signature = [project.id || "", project.status || "", progress, scenes, title, textPreview, error].join("|");
  if (signature === activeDirectorRailSignature) return;
  activeDirectorRailSignature = signature;
  railCurrentTask.innerHTML = `
    <div class="rail-video-product-card rail-director-card">
      <strong>#${project.id || "-"} ${escapeHtml(title)}</strong>
      <small>当前步骤：${escapeHtml(directorCurrentStep(project))}</small>
      <div class="rail-progress"><i style="width:${progress}%"></i></div>
      <div class="rail-task-summary">
        <div><span>进度</span><strong>${progress}%</strong></div>
        <div><span>状态</span><strong>${escapeHtml(directorStatusLabel(project.status))}</strong></div>
        <div><span>镜头</span><strong>${escapeHtml(String(scenes))}</strong></div>
      </div>
      <div class="rail-task-group">
        <span class="rail-subheading">分镜文案</span>
        <small>${escapeHtml(textPreview || "等待提交文案。")}</small>
      </div>
      ${error ? `<div class="rail-failure-note">错误原因：${escapeHtml(error)}</div>` : ""}
      <div class="rail-task-group">
        <span class="rail-subheading">输出文件</span>
        <div class="video-product-output-files">${directorOutputLinks(project)}</div>
      </div>
      <div class="rail-task-actions">
        <button type="button" data-nav="video-output">查看成片</button>
      </div>
    </div>
  `;
}

function renderDirectorRailLists(projects = directorProjectsState) {
  const rows = Array.isArray(projects) ? projects : [];
  const running = rows.find((project) => ["waiting", "pending", "processing"].includes(project.status));
  if (running && (!activeDirectorRailProject || activeDirectorRailProject.status === "completed" || activeDirectorRailProject.status === "failed")) {
    renderDirectorRail(running);
  }
  if (railRecentOutput) {
    const completed = rows.filter((project) => project.status === "completed").slice(0, 5);
    if (completed.length) {
      railRecentOutput.innerHTML = completed.map((project) => `
        <button class="rail-list-item" type="button" data-nav="video-output">
          <span>#${project.id} 分镜规划 · ${escapeHtml(project.platform || "")}</span>
          <strong>${escapeHtml(project.title || "分镜已完成")}</strong>
        </button>
      `).join("");
    }
  }
  if (railErrors) {
    const failed = rows.filter((project) => project.status === "failed").slice(0, 4);
    if (failed.length) {
      railErrors.innerHTML = failed.map((project) => `
        <button class="rail-list-item error-item" type="button" data-nav="video-output">
          <span>#${project.id} 分镜规划失败</span>
          <strong>${escapeHtml(project.metadata?.error || project.error || "未知错误")}</strong>
        </button>
      `).join("");
    }
  }
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
    renderDirectorRailLists(directorProjectsState);
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
        <button class="ghost small danger-action director-project-delete" type="button" ${["waiting", "processing"].includes(project.status) ? "disabled" : ""}>删除</button>
      </div>
    </div>
  `).join("");
  renderDirectorRailLists(directorProjectsState);
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
  renderDirectorRail(project);
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
  window.videoProjects?.linkCurrent?.("director", project.id, project.title || `导演稿 #${project.id}`, {
    ...project,
    sceneCount: project.result?.storyboard?.length || meta.scene_count || 0,
    subtitleTimeline: project.result?.subtitle_timeline || [],
    source: "ai_generated",
    status: "ready",
  }).catch(() => {});
  renderDirectorResultView();
  if (!autoImportedDirectorImageProjectIds.has(Number(project.id))) {
    autoImportedDirectorImageProjectIds.add(Number(project.id));
    sendDirectorProjectToImage();
  } else {
    directorResult.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
        renderDirectorRail({
          ...(activeDirectorRailProject || { id, status: "failed" }),
          id,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 1500);
  }
}

async function deleteDirectorProject(id) {
  if (!window.confirm(`确定删除导演稿 #${id}、分镜记录和导出文件吗？此操作不可撤销。`)) return;
  const data = await fetchJson("/api/director/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, deleteFiles: true }),
  });
  directorStatus.textContent = `已删除 ${data.deleted || 0} 条导演稿记录。`;
  await loadDirectorProjects();
}

async function clearDirectorProjects() {
  if (!window.confirm("确定清空全部已结束导演稿记录和导出文件吗？正在生成的导演稿会保留，此操作不可撤销。")) return;
  const data = await fetchJson("/api/director/clear", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "all", deleteFiles: true }),
  });
  directorStatus.textContent = `已清理 ${data.deleted || 0} 条导演稿记录。`;
  await loadDirectorProjects();
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
  renderDirectorRail({
    id: "",
    status: "waiting",
    title: directorTitle.value.trim() || "AI 导演稿",
    source_text: sourceText,
    metadata: { shot_count: directorShotCount.value },
    progress: 8,
  });
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
    renderDirectorRail(data.project);
    await loadDirectorProjects();
    await pollDirectorProject(data.project.id);
  } catch (error) {
    directorStatus.textContent = error instanceof Error ? error.message : String(error);
    renderDirectorRail({
      ...(activeDirectorRailProject || {}),
      status: "failed",
      title: directorTitle.value.trim() || "AI 导演稿",
      source_text: sourceText,
      metadata: {
        ...(activeDirectorRailProject?.metadata || {}),
        error: error instanceof Error ? error.message : String(error),
      },
      error: error instanceof Error ? error.message : String(error),
    });
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
  syncDirectorSourceFromText(text, {
    title: `${version?.name || "AI 改写"}导演稿`,
    sourceKey: `task-${rewriteTaskId.value || 0}-rewrite-${versionKey}`,
    sourceType: "rewrite",
    taskId: Number(rewriteTaskId.value || 0),
  });
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

function imagePromptWithoutReadableText(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text
    .replace(/([，。,.;；]?\s*)?(白板|黑板|屏幕|海报|背景|墙面|标题|字幕|标签|卡片)[^。；;\n]*(写着|显示|出现|展示|包含|文字|text|words|quote)[^。；;\n]*/gi, " 用抽象图形、人物动作、左右分区和视觉隐喻表达信息，不出现可读文字")
    .replace(/[“"']([^“”"']{1,80})[”"']/g, "抽象信息符号")
    .replace(/[A-Za-z][A-Za-z\s'’:-]{2,}/g, (match) => (
      /\b(scene|shot|cinematic|realistic|commercial|portrait|close|medium|wide|lighting|camera|style|blogger|knowledge|clean|premium|vertical|video)\b/i.test(match)
        ? match
        : "抽象信息符号"
    ))
    .replace(/拼写\s*(vs|VS|对比|和)\s*开口/g, "左右对比的抽象图形")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text || "用人物动作、空间构图、抽象图形表达本镜头信息，不出现任何可读文字。";
}

function buildDirectorImagePrompt(project, scene, index = 0, total = 1) {
  const meta = project?.result?.video_meta || {};
  const title = meta.title || project?.title || "短视频分镜";
  const ratio = meta.ratio || project?.metadata?.ratio || "9:16";
  const style = meta.style || project?.visual_style || "高级商业短视频";
  const sceneIndex = scene.scene || index + 1;
  const basePrompt = imagePromptWithoutReadableText(scene.image_prompt || scene.purpose || scene.subtitle || scene.voice_text || "");
  return [
    `统一项目：${title}`,
    `统一风格锁定：${style}，商业短视频质感，真实摄影感，电影级布光，干净高级，不廉价，不像PPT。`,
    `统一画幅：${ratio}，全部分镜保持同一色调、同一镜头语言、同一人物/场景风格。`,
    "统一人物：同一位中国知识博主/老师形象，30岁左右，深色简洁上衣，专业但有亲和力，不要每张换脸、换职业感。",
    "统一色彩：深色高级背景，克制金色或电光蓝点缀，高对比但不过曝，有空间层次。",
    "统一构图：主体明确，前景/中景/背景有纵深，底部保留字幕安全区，适合竖屏发布。",
    `分镜编号：${sceneIndex}/${total}`,
    `本镜头任务：${scene.purpose || "推动叙事"}`,
    `情绪：${scene.emotion || "专业、有冲击力"}`,
    `镜头语言：${scene.camera || "中近景，轻微推近"}；构图：${scene.composition || "主体居中偏上"}`,
    `画面主体：${basePrompt}`,
    `字幕语义只作为情绪参考，不要把这些字画进图片：${String(scene.subtitle || scene.voice_text || "").slice(0, 60)}`,
    "禁止：任何可读文字、乱码文字、白板文字、屏幕文字、水印、奇怪logo、低清、脏乱背景、随机人物变脸、颜色漂移、普通插画感、廉价海报感。",
  ].filter(Boolean).join("\n");
}

function directorScenesForImage(project = activeDirectorProject) {
  const scenes = Array.isArray(project?.result?.storyboard) ? project.result.storyboard : [];
  return scenes
    .map((scene, index) => ({
      scene: scene.scene || index + 1,
      title: `Scene ${scene.scene || index + 1}`,
      prompt: buildDirectorImagePrompt(project, scene, index, scenes.length),
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
    jianying_template: "剪映模板草稿【推荐】",
    jianying: "路线 C：历史剪映素材包",
    mp4: "MP4 预览",
    template_mp4: "路线 A：模板快剪 MP4",
    mix_mp4: "路线 D：下载素材混剪 MP4",
    package: "标准素材包 / 兼容导出",
  }[outputType] || outputType || "视频成片";
}

function videoProductCompletedSteps(project = {}) {
  const order = [
    ["pending", "进入 SQLite 队列"],
    ["binding_assets", "绑定导演稿、音频和素材"],
    ["building_timeline", "生成成片草稿"],
    [["jianying_template", "jianying", "package"].includes(project.output_type) ? "exporting_draft" : "rendering", project.output_type === "jianying_template" ? "生成剪映模板草稿" : project.output_type === "jianying" ? "导出历史剪映素材包" : project.output_type === "package" ? "导出素材包" : "渲染 MP4"],
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
    ["ass", "subtitles.ass", project.output_dir],
    ["manifest", "project_manifest.json", project.manifest_path],
    ["draft", "draft_content.json", project.draft_path],
    ["mp4", "MP4", project.mp4_path],
    ["final", "final.mp4", project.mp4_path],
    ["cover", "cover.png", project.mp4_path],
    ["report", "render_report.json", project.output_dir],
    ["hyperframes", "HyperFrames", project.output_dir],
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
  const selectedBgmId = videoProductBgm?.value || "";
  return {
    source_director_project_id: Number(videoProductDirector.value || 0),
    audio_asset_id: Number(videoProductAudio.value || 0),
    image_source: videoProductImageSource.value || "director",
    output_type: videoProductOutputType.value || "jianying_template",
    jianying_template: videoProductJianyingTemplate?.value || "education_tips",
    route_a_style_id: videoProductRouteAStyle?.value || "black_gold_knowledge",
    route_a_custom_style: videoProductRouteACustomStyle?.value.trim() || "",
    bgm_strategy: selectedBgmId ? (videoProductBgmStrategy?.value || "manual") : (videoProductBgmStrategy?.value || "auto"),
    bgm_asset_id: selectedBgmId,
    render_engine: "auto",
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

function videoProductCompactText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, "")
    .trim();
}

function videoProductTextSimilarity(leftText, rightText) {
  const left = videoProductCompactText(leftText);
  const right = videoProductCompactText(rightText);
  if (!left || !right) return 0;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 18 && longer.includes(shorter)) return 100;
  const grams = (value) => {
    const result = new Set();
    if (value.length < 2) {
      if (value) result.add(value);
      return result;
    }
    for (let index = 0; index < value.length - 1; index += 1) {
      result.add(value.slice(index, index + 2));
    }
    return result;
  };
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  let overlap = 0;
  leftGrams.forEach((gram) => {
    if (rightGrams.has(gram)) overlap += 1;
  });
  return Math.round((overlap / Math.max(leftGrams.size, rightGrams.size, 1)) * 100);
}

function videoProductTemplateKeywordScore(list, text) {
  const target = videoProductCompactText(text);
  if (!target) return 0;
  return (Array.isArray(list) ? list : []).reduce((score, item) => {
    const value = videoProductCompactText(item);
    return value && (target.includes(value) || value.includes(target)) ? score + 2 : score;
  }, 0);
}

function renderVideoProductTemplateOptions(selectedDirector = null) {
  if (!videoProductJianyingTemplate) return;
  const templates = videoProductSources.jianyingTemplates || [];
  if (!templates.length) return;
  const context = `${selectedDirector?.title || ""} ${selectedDirector?.visual_style || ""}`;
  const sorted = templates
    .map((template) => ({
      ...template,
      score: Number(template.hasMaster) * 5
        + videoProductTemplateKeywordScore(template.recommendedVideoTypes, context)
        + videoProductTemplateKeywordScore(template.recommendedStyles, selectedDirector?.visual_style || "")
        + videoProductTemplateKeywordScore(template.tags, context),
    }))
    .sort((a, b) => b.score - a.score || Number(b.hasMaster) - Number(a.hasMaster) || String(a.name).localeCompare(String(b.name), "zh-Hans-CN"));
  const recommended = sorted[0];
  const current = videoProductJianyingTemplate.value;
  videoProductJianyingTemplate.innerHTML = sorted.map((template) => {
    const prefix = recommended?.id === template.id ? "【推荐】" : "";
    const suffix = template.hasMaster ? "" : " · 缺母版";
    return `<option value="${escapeHtml(template.id)}">${escapeHtml(`${prefix}${template.name || template.id} · ${template.category || "模板"}${suffix}`)}</option>`;
  }).join("");
  videoProductJianyingTemplate.value = sorted.some((template) => String(template.id) === String(current))
    ? current
    : recommended?.id || sorted[0]?.id || "";
  const note = document.querySelector("#videoProductTemplateRecommendation");
  if (note && recommended) note.textContent = `推荐：${recommended.name || recommended.id}；${recommended.hasMaster ? "母版已就绪" : "还缺剪映母版文件"}。`;
}

function videoProductAudioScoreForDirector(director, audio) {
  if (!director || !audio) return 0;
  const sameTask = Number(director.task_id || 0) > 0 && Number(director.task_id || 0) === Number(audio.task_id || 0);
  const sameRewrite = Number(director.rewrite_id || 0) > 0 && Number(director.rewrite_id || 0) === Number(audio.rewrite_id || 0);
  const textScore = Math.max(
    videoProductTextSimilarity(audio.text, director.source_text),
    videoProductTextSimilarity(audio.text, director.title),
  );
  return Math.max(textScore, sameTask ? 100 : 0, sameRewrite ? 96 : 0);
}

function isRouteAVideoProduct() {
  return (videoProductOutputType?.value || "") === "template_mp4";
}

function renderRouteAOptionControls() {
  const styles = videoProductSources.routeAStyles?.length
    ? videoProductSources.routeAStyles
    : [{ id: "black_gold_knowledge", label: "黑金知识口播" }];
  const strategies = videoProductSources.bgmStrategies?.length
    ? videoProductSources.bgmStrategies
    : [
      { id: "none", label: "不使用 BGM" },
      { id: "auto", label: "自动匹配" },
      { id: "manual", label: "手动本地 BGM" },
      { id: "generated_default", label: "基础氛围生成" },
    ];
  const bgmAssets = videoProductSources.bgmAssets || [];
  const currentStyle = videoProductRouteAStyle?.value || "black_gold_knowledge";
  const currentStrategy = videoProductBgmStrategy?.value || "auto";
  const currentBgm = videoProductBgm?.value || "";
  if (videoProductRouteAStyle) {
    videoProductRouteAStyle.innerHTML = styles
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
      .join("");
    videoProductRouteAStyle.value = styles.some((item) => item.id === currentStyle) ? currentStyle : styles[0]?.id || "";
  }
  if (videoProductBgmStrategy) {
    videoProductBgmStrategy.innerHTML = strategies
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
      .join("");
    videoProductBgmStrategy.value = strategies.some((item) => item.id === currentStrategy) ? currentStrategy : "auto";
  }
  if (videoProductBgm) {
    const options = [
      '<option value="">不使用 BGM；选择音乐后才会加入</option>',
      ...bgmAssets.map((asset) => {
        const title = asset.title || asset.filename || asset.path || asset.id;
        return `<option value="${escapeHtml(asset.id)}">${escapeHtml(title)}</option>`;
      }),
    ];
    videoProductBgm.innerHTML = options.join("");
    videoProductBgm.value = bgmAssets.some((asset) => String(asset.id) === String(currentBgm)) ? currentBgm : "";
  }
}

function updateRouteAOptionsVisibility() {
  if (!videoProductRouteAOptions) return;
  videoProductRouteAOptions.hidden = !isRouteAVideoProduct();
}

function renderVideoProductSourceOptions({ preferredDirectorId = 0, preferredAudioId = 0 } = {}) {
  const directors = videoProductSources.directors || [];
  const audios = videoProductSources.audioJobs || [];
  const routeA = isRouteAVideoProduct();
  const directorOptions = directors
    .map((project) => `<option value="${project.id}">#${project.id} ${escapeHtml(project.title || "未命名导演稿")} · ${Number(project.scene_count || 0)} 镜头</option>`);
  videoProductDirector.innerHTML = directorOptions.length
    ? directorOptions.join("")
    : '<option value="">暂无已完成导演项目</option>';
  if (preferredDirectorId && directors.some((item) => Number(item.id) === Number(preferredDirectorId))) {
    videoProductDirector.value = String(preferredDirectorId);
  }
  const selectedDirector = directors.find((item) => Number(item.id) === Number(videoProductDirector.value || preferredDirectorId || 0))
    || (routeA ? null : directors[0] || null);
  renderVideoProductTemplateOptions(selectedDirector);
  const scoredAudios = audios
    .map((job) => ({ ...job, match_score: videoProductAudioScoreForDirector(selectedDirector, job) }))
    .sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0) || Number(b.id || 0) - Number(a.id || 0));
  videoProductAudio.innerHTML = audios.length
    ? scoredAudios.map((job) => `<option value="${job.id}">匹配${Number(job.match_score || 0)}% · #${job.id} ${escapeHtml(job.voice_name || job.voice_id || job.provider)} · ${escapeHtml((job.text || "").slice(0, 24))}</option>`).join("")
    : '<option value="">暂无已完成 TTS 音频</option>';
  if (preferredAudioId && audios.some((item) => Number(item.id) === Number(preferredAudioId))) {
    videoProductAudio.value = String(preferredAudioId);
  } else if (scoredAudios.length) {
    videoProductAudio.value = String(scoredAudios[0].id);
  }
  renderRouteAOptionControls();
  updateRouteAOptionsVisibility();
}

function updateVideoProductAssetStatus() {
  if (!videoProductAssetStatus) return;
  const imageCount = videoProductSources.imageAssets?.length || 0;
  const bgmCount = videoProductSources.bgmAssets?.length || 0;
  videoProductAssetStatus.textContent = `当前图片库 ${imageCount} 张，BGM 库 ${bgmCount} 首；本地素材加入后可直接用于最终 1080 竖屏成片。`;
}

async function loadVideoProductSources(options = {}) {
  const data = await fetchJson("/api/video-product/sources");
  videoProductSources = {
    directors: data.directors || [],
    audioJobs: data.audioJobs || [],
    imageAssets: data.imageAssets || [],
    bgmAssets: data.bgmAssets || [],
    downloadedVideos: data.downloadedVideos || [],
    timelines: data.timelines || [],
    platforms: data.platforms || [],
    outputTypes: data.outputTypes || [],
    routeAStyles: data.routeAStyles || [],
    bgmStrategies: data.bgmStrategies || [],
    bgmProviderSuggestions: data.bgmProviderSuggestions || [],
    jianyingTemplates: data.jianyingTemplates || [],
  };
  renderVideoProductSourceOptions(options);
  updateVideoProductAssetStatus();
  renderVideoProductProjects(videoProductSources.timelines || []);
  if (!videoProductPreview && videoProductSources.audioJobs.length && (isRouteAVideoProduct() || videoProductSources.directors.length)) {
    await previewVideoProductTimeline().catch(() => {});
  }
}

async function chooseVideoProductLocalImage() {
  if (videoProductAssetStatus) videoProductAssetStatus.textContent = "正在打开图片选择窗口...";
  const data = await fetchJson("/api/local-media/choose-image", { method: "POST" });
  if (data.filePath) {
    videoProductLocalImagePath.value = data.filePath;
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = "已选择本地图片，点击“加入图片库”后可用于成片。";
  } else {
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = "没有选择图片。";
  }
}

async function addVideoProductLocalImage() {
  const filePath = videoProductLocalImagePath?.value.trim() || "";
  if (!filePath) {
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = "请先选择本地图片。";
    return;
  }
  if (videoProductAssetStatus) videoProductAssetStatus.textContent = "正在把本地图片加入图片资产库...";
  await fetchJson("/api/image/add-local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filePath,
      aspectRatio: "9:16",
      prompt: `本地成片素材：${filePath.split(/[\\/]/).pop() || "image"}`,
      sourceType: "manual_import",
      directorProjectId: Number(videoProductDirector?.value || 0),
    }),
  });
  if (videoProductImageSource) videoProductImageSource.value = "all";
  await loadVideoProductSources({ preferredDirectorId: Number(videoProductDirector.value || 0), preferredAudioId: Number(videoProductAudio.value || 0) });
  if (videoProductAssetStatus) videoProductAssetStatus.textContent = "本地图片已加入图片资产库，可以在镜头列表里绑定。";
  await previewVideoProductTimeline().catch(() => {});
}

async function chooseVideoProductLocalBgm() {
  if (videoProductAssetStatus) videoProductAssetStatus.textContent = "正在打开音乐选择窗口...";
  const data = await fetchJson("/api/local-media/choose-audio", { method: "POST" });
  if (data.filePath) {
    videoProductLocalBgmPath.value = data.filePath;
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = "已选择背景音乐，点击“加入BGM库”后路线 A/B 可自动混音。";
  } else {
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = "没有选择音乐。";
  }
}

async function addVideoProductLocalBgm() {
  const filePath = videoProductLocalBgmPath?.value.trim() || "";
  if (!filePath) {
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = "请先选择背景音乐。";
    return;
  }
  if (videoProductAssetStatus) videoProductAssetStatus.textContent = "正在把背景音乐加入 BGM 库...";
  const data = await fetchJson("/api/video-product/add-bgm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath }),
  });
  await loadVideoProductSources({ preferredDirectorId: Number(videoProductDirector.value || 0), preferredAudioId: Number(videoProductAudio.value || 0) });
  if (data.asset?.id && videoProductBgm) {
    videoProductBgmStrategy.value = "manual";
    videoProductBgm.value = String(data.asset.id);
  }
  if (videoProductAssetStatus) videoProductAssetStatus.textContent = "背景音乐已加入 BGM 库，最终 MP4 会优先语音、自动压低 BGM。";
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
  if (!Number(videoProductAudio.value || 0)) {
    videoProductStatus.textContent = "请先选择已完成的 TTS 音频。";
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
    ? `已生成成片预览，但有 ${data.blockers.length} 个阻塞项。`
    : "成片预览已生成，可以输出。";
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
        <strong>${escapeHtml(project.metadata?.title || `成片 #${project.project_id || project.id}`)}</strong>
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
    ["ass", "subtitles.ass", project?.output_dir],
    ["manifest", "manifest", project?.manifest_path],
    ["draft", "draft", project?.draft_path],
    ["mp4", "MP4", project?.mp4_path],
    ["final", "final.mp4", project?.mp4_path],
    ["cover", "cover.png", project?.mp4_path],
    ["report", "render_report.json", project?.output_dir],
    ["hyperframes", "HyperFrames", project?.output_dir],
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

async function pollVideoProductProject(id, { schedule = true } = {}) {
  if (videoProductPollTimer) clearTimeout(videoProductPollTimer);
  const project = await openVideoProductProject(id);
  await loadVideoProductProjects();
  if (project.status === "completed") {
    if (project.output_type === "jianying" || project.draft_path) {
      await window.videoProjects?.linkCurrent?.("jianying", project.project_id || project.id, "剪映成片草稿", {
        path: project.draft_path || project.output_dir || "",
        outputDir: project.output_dir || "",
        source: "ai_generated",
        status: "ready",
      });
    }
    await window.videoProjects?.linkCurrent?.("output", project.project_id || project.id, videoProductOutputLabel(project.output_type), {
      path: project.mp4_path || project.draft_path || project.output_dir || "",
      outputDir: project.output_dir || "",
      outputType: project.output_type,
      source: "ai_generated",
      status: "ready",
    });
  }
  if (schedule && ["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"].includes(project.status)) {
    videoProductPollTimer = setTimeout(() => {
      pollVideoProductProject(id).catch((error) => {
        videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
      });
    }, 1500);
  }
  return project;
}

async function waitForLegacyVideoProductCompletion(id, { timeoutMs = 180000, intervalMs = 1500 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const project = await pollVideoProductProject(id, { schedule: false });
    if (!["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"].includes(project.status)) {
      if (project.status === "completed") return project;
      throw new Error(project.error || project.blockers?.join("；") || "剪映草稿生成失败。");
    }
    videoProductStatus.textContent = `${project.current_step || "正在生成剪映草稿"} · ${Number(project.progress || 0)}%`;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("剪映草稿生成超时，请到成片任务列表查看失败原因。");
}

async function generateVideoProduct() {
  const readiness = await window.videoProjects?.syncSelections?.().catch((error) => {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
    return null;
  });
  if (!window.videoProjects?.current?.()) {
    videoProductStatus.textContent = "请先在首页新建或选择一个短视频项目。";
    document.querySelector("#videoProjectReadiness")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return null;
  }
  if (!Number(videoProductDirector.value || 0)) {
    videoProductStatus.textContent = "请先选择导演项目。";
    return;
  }
  if (!Number(videoProductAudio.value || 0)) {
    videoProductStatus.textContent = "请先选择已生成的 TTS 音频。";
    return;
  }
  generateVideoProductBtn.disabled = true;
  videoProductStatus.textContent = "正在检查当前项目的文案、语音、导演稿、素材和 BGM...";
  try {
    if (!readiness?.ready) {
      const missing = readiness?.blockers?.map((item) => `${item.label}${item.detail}`).join("、") || "关键内容未完成";
      videoProductStatus.textContent = `暂不能生成：${missing}。请使用右侧按钮补齐。`;
      return;
    }
    videoProductStatus.textContent = "检查通过，正在创建成片草稿任务...";
    const data = await fetchJson("/api/video-product/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...videoProductPayload(), video_project_id: window.videoProjects.current().id }),
    });
    videoProductStatus.textContent = `成片任务 #${data.project.project_id} 已进入队列。`;
    return await waitForLegacyVideoProductCompletion(data.project.project_id);
  } catch (error) {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    generateVideoProductBtn.disabled = !window.videoProjects?.canGenerate?.();
  }
}

async function generateJianyingDraftAndOpenLegacy() {
  if (videoProductOutputType) {
    videoProductOutputType.value = "jianying_template";
    videoProductOutputType.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const project = await generateVideoProduct();
  if (!project) return null;
  if (!project.draft_path) throw new Error("成片任务完成了，但没有返回剪映草稿路径；请检查模板母版和 capcut-result.json。");
  videoProductStatus.textContent = `剪映草稿已生成：${project.draft_path}，正在打开剪映专业版...`;
  await openJianyingApp();
  videoProductStatus.textContent = `剪映草稿已导入并请求打开剪映：${project.draft_path}`;
  return project;
}

function sendDirectorProjectToVideoProduct() {
  if (!activeDirectorProject?.id || activeDirectorProject.status !== "completed") {
    directorStatus.textContent = "请先生成或打开一份已完成的导演稿。";
    return;
  }
  window.workbenchNavigate?.("vfo", { preserveScroll: true });
  (window.videoOutputModule?.loadVideoProductSources
    ? window.videoOutputModule.loadVideoProductSources()
    : loadVideoProductSources({ preferredDirectorId: activeDirectorProject.id }))
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
    const selectedProvider = rewrite.defaults?.defaultProvider || "deepseek";
    renderProviderOptions(rewriteProvider, providers, selectedProvider, { disableUnconfigured: true });
    renderProviderOptions(rewriteSettingsProvider, providers, selectedProvider);
    rewriteDirection.value = rewriteDirectionOptions.includes(rewrite.defaults?.defaultDirection)
      ? rewrite.defaults.defaultDirection
      : "短视频口播";
    rewriteStyle.value = rewriteStyleOptions.includes(rewrite.defaults?.defaultStyle)
      ? rewrite.defaults.defaultStyle
      : "小黑漫画解释类";
    rewriteHumanizeLevel.value = rewrite.defaults?.humanizeLevel || "极强";
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
  saveRewritePresetSettings();
  const id = await ensureRewriteTaskReady();
  if (!id) return;
  if (document.activeElement === rewriteVersionCountInput) syncRewriteVersionCount();
  if (!rewriteVersions.querySelector(".rewrite-version")) {
    renderRewriteVersions({}, { allowDefaults: true });
  }
  const versionSpecs = collectRewriteVersions();
  if (versionSpecs.length === 0) {
    rewriteStatus.textContent = "请至少保留一个输出框。";
    return;
  }
  rewriteStatus.textContent = `正在生成 ${versionSpecs.length} 个改写版本...`;
  startRewriteProgress(versionSpecs.length);
  try {
    await ensureRewriteProviderConfigured();
    const generatedVersions = [];
    let latestTranscripts = [];
    let latestTask = null;
    for (let index = 0; index < versionSpecs.length; index += 1) {
      const spec = versionSpecs[index];
      setRewriteProgress(Math.min(92, Math.round(index / versionSpecs.length * 82) + 8), `正在生成输出框 ${index + 1}/${versionSpecs.length}`);
      const data = await fetchJson("/api/tasks/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rewritePayloadForVersion(id, spec, { previewOnly: true })),
      });
      const generated = data.rewrite?.versions?.[0];
      if (!generated) throw new Error(`输出框 ${index + 1} 没有生成内容`);
      generatedVersions.push({ ...spec, ...generated, content: generated.content || spec.content || "" });
      latestTranscripts = data.transcripts || latestTranscripts;
      latestTask = data.task || latestTask;
    }
    const first = generatedVersions[0] || versionSpecs[0] || {};
    const saved = await fetchJson("/api/tasks/rewrite/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        provider: first.provider || rewriteProvider.value,
        direction: first.direction || rewriteDirection.value,
        style: first.style || rewriteStyle.value,
        referenceStyle: first.referenceStyle || rewriteReference.value,
        params: first.params || rewriteParams(),
        humanizeLevel: first.humanizeLevel || rewriteHumanizeLevel.value,
        referenceExamples: collectReferenceExamplesText(),
        versions: generatedVersions,
        format: "md",
      }),
    });
    renderRewriteVersions({ versions: generatedVersions }, { allowDefaults: false });
    renderTranscripts(saved.transcripts || latestTranscripts);
    stopRewriteProgress("正在保存结果", 96);
    await refreshTasks();
    await refreshFiles();
    await selectRewriteForCurrentProject(first, id);
    stopRewriteProgress("改写完成", 100);
    lastRewritePath = saved.task?.rewrite_path || latestTask?.rewrite_path || lastRewritePath;
    rewriteStatus.textContent = `改写已生成并写入 SQLite：${saved.task?.rewrite_path || latestTask?.rewrite_path || ""}`;
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
    await ensureRewriteProviderConfigured();
    const data = await fetchJson("/api/tasks/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rewritePayloadForVersion(id, target, { previewOnly: true })),
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
    await ensureRewriteProviderConfigured();
    const data = await fetchJson("/api/tasks/rewrite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rewritePayloadForVersion(id, target, {
        text: target.content,
        revisionInstruction: target.revisionInstruction,
        previewOnly: true,
      })),
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
        provider: target.provider || rewriteProvider.value,
        direction: target.direction || rewriteDirection.value,
        style: target.style || rewriteStyle.value,
        referenceStyle: target.referenceStyle || rewriteReference.value,
        params: target.params || rewriteParams(),
        humanizeLevel: target.humanizeLevel || rewriteHumanizeLevel.value,
        referenceExamples: collectReferenceExamplesText(),
        versions: [target],
        format: "md",
        mergeExisting: true,
      }),
    });
    renderTranscripts(data.transcripts);
    await refreshTasks();
    await refreshFiles();
    await selectRewriteForCurrentProject(target, id);
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
    const versions = collectRewriteVersions();
    const first = versions[0] || {};
    const data = await fetchJson("/api/tasks/rewrite/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        provider: first.provider || rewriteProvider.value,
        direction: first.direction || rewriteDirection.value,
        style: first.style || rewriteStyle.value,
        referenceStyle: first.referenceStyle || rewriteReference.value,
        params: first.params || rewriteParams(),
        humanizeLevel: first.humanizeLevel || rewriteHumanizeLevel.value,
        referenceExamples: collectReferenceExamplesText(),
        versions,
        format,
      }),
    });
    renderTranscripts(data.transcripts);
    await refreshTasks();
    await refreshFiles();
    await selectRewriteForCurrentProject(first, id);
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
    await ensureTranscriptProvidersConfigured();
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
        await continueWorkflowFromTranscript(job, { sourceUrl: text, title: job.title || "" });
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

async function runLocalVideoTranscript() {
  const filePath = localVideoPath.value.trim();
  if (!filePath) {
    resultBox.textContent = "请先选择本地视频文件。";
    setReady("缺少本地视频", false);
    return;
  }

  setBusy("正在提取本地视频文案");
  setTranscriptActions();
  showProgress(0, "准备提取本地视频文案");
  resultBox.textContent = "本地视频文案提取已经开始，请看上方进度条。";

  try {
    await ensureTranscriptProvidersConfigured();
    const startData = await fetchJson("/api/local-video/transcript", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filePath,
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
      showProgress(job.percent || 0, job.message || "正在提取本地视频文案");

      if (job.status === "done") {
        showProgress(100, "本地视频文案提取完成");
        resultBox.textContent = job.text || "本地视频文案提取完成";
        setTranscriptActions(job.text || "", job.transcriptPath || "");
        renderFiles(job.files || allFiles);
        await refreshTasks();
        await refreshTranscripts();
        await continueWorkflowFromTranscript(job, { sourceUrl: filePath, title: job.title || "" });
        setReady("完成", true);
        finished = true;
      }

      if (job.status === "error") {
        resultBox.textContent = job.text || job.message || "本地视频文案提取失败";
        await refreshTasks().catch(() => {});
        setReady("失败", false);
        finished = true;
      }
    }
  } catch (error) {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("失败", false);
  }
}

async function runLocalVideoAudio() {
  const filePath = localVideoPath.value.trim();
  if (!filePath) {
    resultBox.textContent = "请先选择本地视频文件。";
    setReady("缺少本地视频", false);
    return;
  }

  setBusy("正在提取本地视频音频");
  setTranscriptActions();
  showProgress(0, "准备提取本地视频音频");
  resultBox.textContent = "本地视频音频提取已经开始，请看上方进度条。";

  try {
    const startData = await fetchJson("/api/local-video/audio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filePath,
        audioFormat: localAudioFormat?.value || "mp3",
      }),
    });

    let finished = false;
    while (!finished) {
      await delay(1000);
      const data = await fetchJson(`/api/download/status?id=${encodeURIComponent(startData.job.id)}`);
      const job = data.job;
      showProgress(job.percent || 0, job.message || "正在提取本地视频音频");

      if (job.status === "done") {
        showProgress(100, "本地视频音频提取完成");
        resultBox.textContent = job.audioPath || job.text || "本地视频音频提取完成";
        renderFiles(job.files || allFiles);
        await refreshTasks();
        setReady("完成", true);
        finished = true;
      }

      if (job.status === "error") {
        resultBox.textContent = job.text || job.message || "本地视频音频提取失败";
        await refreshTasks().catch(() => {});
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

document.querySelector("#subtitleExtractBtn")?.addEventListener("click", () => {
  enqueueTasks("subtitle");
});

document.querySelector("#audioExtractBtn")?.addEventListener("click", () => {
  enqueueTasks("audio");
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

document.querySelector("#sendTtsToVideoProduct")?.addEventListener("click", async () => {
  if (!activeTtsRailJob?.id || activeTtsRailJob.status !== "completed") {
    ttsStatus.textContent = "请先生成并完成一条语音。";
    return;
  }
  await window.videoProjects?.linkCurrent?.("tts", activeTtsRailJob.id, activeTtsRailJob.voice_name || `配音 #${activeTtsRailJob.id}`, {
    ...activeTtsRailJob,
    text: activeTtsRailJob.text || ttsText.value.trim(),
    source: "ai_generated",
    status: "ready",
  });
  window.workbenchNavigate?.("vfo", { preserveScroll: true });
  if (window.videoOutputModule?.loadVideoProductSources) await window.videoOutputModule.loadVideoProductSources();
  else await loadVideoProductSources({ preferredAudioId: activeTtsRailJob.id });
  document.querySelector("#videoProductCenter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  ttsStatus.textContent = "已把当前语音发送到成片中心。";
});

document.querySelector("#refreshTtsJobs").addEventListener("click", () => {
  refreshTtsJobs().catch((error) => {
    ttsStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

document.querySelector("#clearFailedTtsJobs")?.addEventListener("click", () => {
  clearTtsJobs("failed").catch((error) => { ttsStatus.textContent = error instanceof Error ? error.message : String(error); });
});

document.querySelector("#clearTtsJobs")?.addEventListener("click", () => {
  clearTtsJobs("all").catch((error) => { ttsStatus.textContent = error instanceof Error ? error.message : String(error); });
});

ttsHistory?.addEventListener("click", (event) => {
  const button = event.target.closest(".tts-job-delete");
  const row = event.target.closest("[data-tts-job-id]");
  if (!button || !row) return;
  deleteTtsJob(Number(row.dataset.ttsJobId || 0)).catch((error) => { ttsStatus.textContent = error instanceof Error ? error.message : String(error); });
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

chooseLocalVideoBtn?.addEventListener("click", () => {
  chooseLocalVideo().catch((error) => {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("选择本地视频失败", false);
  });
});

extractLocalVideoTranscriptBtn?.addEventListener("click", () => {
  runLocalVideoTranscript();
});

extractLocalVideoSubtitleBtn?.addEventListener("click", () => {
  runLocalVideoTranscript();
});

extractLocalVideoAudioBtn?.addEventListener("click", () => {
  runLocalVideoAudio();
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
  const openButton = event.target.closest(".task-open-location");
  const rewriteButton = event.target.closest(".task-send-rewrite");
  if (openButton) {
    const task = allTasks.find((item) => String(item.id) === String(openButton.dataset.taskId));
    openManagedPath(primaryTaskFilePath(task || {})).catch((error) => {
      batchStatus.textContent = error instanceof Error ? error.message : String(error);
    });
    return;
  }
  if (rewriteButton) {
    openRewriteEditor(rewriteButton.dataset.taskId).catch((error) => {
      batchStatus.textContent = error instanceof Error ? error.message : String(error);
    });
    return;
  }
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

openResultLocationBtn?.addEventListener("click", () => {
  openManagedPath(activeResultFilePath).catch((error) => {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
  });
});

sendResultRewriteBtn?.addEventListener("click", () => {
  openRewriteEditor(activeResultRewriteTaskId).catch((error) => {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("打开改写失败", false);
  });
});

transcriptList.addEventListener("click", (event) => {
  const analyzeButton = event.target.closest(".transcript-analyze");
  const rewriteButton = event.target.closest(".transcript-rewrite");
  const ttsButton = event.target.closest(".transcript-tts");
  const directorButton = event.target.closest(".transcript-director");
  if (analyzeButton) {
    openAnalysisEditor(analyzeButton.dataset.taskId).catch((error) => {
      resultBox.textContent = error instanceof Error ? error.message : String(error);
      setReady("打开分析失败", false);
    });
    return;
  }
  if (ttsButton) {
    sendTranscriptToTts(ttsButton.dataset.taskId).catch((error) => {
      resultBox.textContent = error instanceof Error ? error.message : String(error);
      setReady("导入 TTS 失败", false);
    });
    return;
  }
  if (directorButton) {
    sendTranscriptToDirector(directorButton.dataset.taskId).catch((error) => {
      resultBox.textContent = error instanceof Error ? error.message : String(error);
      setReady("导入 AI 导演失败", false);
    });
    return;
  }
  if (!rewriteButton) return;
  openRewriteEditor(rewriteButton.dataset.taskId).catch((error) => {
    resultBox.textContent = error instanceof Error ? error.message : String(error);
    setReady("打开改写失败", false);
  });
});

rewritePanel?.addEventListener("click", (event) => {
  const button = event.target.closest(".rewrite-send-selected");
  if (!button) return;
  button.disabled = true;
  handleRewriteSelectedHandoff(button).finally(() => {
    button.disabled = false;
  });
});

rewriteVersions.addEventListener("click", async (event) => {
  const button = event.target.closest(".rewrite-select-best, .rewrite-generate-one, .rewrite-save-one, .rewrite-revise-one, .rewrite-tts-one, .rewrite-director-one, .rewrite-copy");
  if (!button) return;
  if (button.classList.contains("rewrite-select-best")) {
    const card = button.closest(".rewrite-version");
    const text = card?.querySelector(".rewrite-version-text")?.value.trim() || "";
    if (!text) {
      rewriteStatus.textContent = "这个版本还没有文案，请先生成。";
      return;
    }
    rewriteVersions.querySelectorAll(".rewrite-version").forEach((item) => item.classList.toggle("selected-best", item === card));
    rewriteVersions.querySelectorAll(".rewrite-select-best").forEach((item) => { item.textContent = item === button ? "已选为最佳" : "选择最佳版本"; });
    const version = collectRewriteVersions().find((item) => item.key === button.dataset.versionKey) || {};
    await window.videoProjects?.linkCurrent?.("selected_rewrite", `task-${rewriteTaskId.value}-${button.dataset.versionKey}`, version.name || "最佳改写版本", {
      text,
      taskId: Number(rewriteTaskId.value || 0),
      versionKey: button.dataset.versionKey,
      direction: version.direction,
      style: version.style,
      source: "ai_generated",
    });
    rewriteStatus.textContent = "已选为当前项目的最佳文案，可以发送到 TTS 或 AI 导演。";
    return;
  }
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

[
  rewriteProvider,
  rewriteTargetPlatform,
  rewriteWordRange,
  rewriteTonePreset,
  rewritePersona,
  rewriteDirection,
  rewriteHumanizeLevel,
].forEach((element) => {
  element?.addEventListener("change", () => {
    saveRewritePresetSettings();
  });
});

rewriteStyle?.addEventListener("change", () => {
  applyRewritePlanPreset(rewriteStyle.value);
});

[rewriteToneLevel, rewriteConflictLevel, rewriteEmotionLevel, rewriteSalesLevel, rewriteReference].forEach((element) => {
  element?.addEventListener("input", () => {
    saveRewritePresetSettings();
  });
});

loadRewritePresetSettings();

rewriteVersions.addEventListener("input", (event) => {
  const textarea = event.target.closest(".rewrite-version-text");
  if (textarea) {
    const count = textarea.closest(".rewrite-version")?.querySelector(".rewrite-char-count");
    if (count) count.textContent = `当前 ${countRewriteCharacters(textarea.value)} 字`;
    return;
  }
  const range = event.target.closest(".rewrite-version-tone-level, .rewrite-version-conflict-level, .rewrite-version-emotion-level, .rewrite-version-sales-level");
  if (range) {
    const card = range.closest(".rewrite-version");
    const valueTarget = range.classList.contains("rewrite-version-tone-level")
      ? ".rewrite-version-tone-value"
      : range.classList.contains("rewrite-version-conflict-level")
        ? ".rewrite-version-conflict-value"
        : range.classList.contains("rewrite-version-emotion-level")
          ? ".rewrite-version-emotion-value"
          : ".rewrite-version-sales-value";
    const label = card?.querySelector(valueTarget);
    if (label) label.textContent = range.value;
    collectRewriteVersions();
    return;
  }
  if (event.target.closest(".rewrite-version-word-count, .rewrite-version-suggestion, .rewrite-version-reference")) collectRewriteVersions();
});

rewriteVersions.addEventListener("change", (event) => {
  if (!event.target.closest(".rewrite-version-provider, .rewrite-version-direction, .rewrite-version-style, .rewrite-version-word-count, .rewrite-version-humanize-level")) return;
  collectRewriteVersions();
});

document.querySelector("#runRewrite").addEventListener("click", () => {
  generateRewrite();
});

rewriteRunAnalysis?.addEventListener("click", () => {
  runRewriteInlineAnalysis();
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

momentsPersonaSelect?.addEventListener("change", () => {
  applyMomentsPersona(currentMomentsPersona());
  setMomentsPersonaStatus("已切换人设。");
});

addMomentsPersonaBtn?.addEventListener("click", () => {
  if (momentsPersonaName) momentsPersonaName.value = "";
  if (momentsPersonaText) momentsPersonaText.value = "";
  if (momentsPersonaEditor) momentsPersonaEditor.open = true;
  setMomentsPersonaStatus("正在添加新人设，填写后点击“保存人设”。");
  momentsPersonaName?.focus();
});

document.querySelector("#saveMomentsPersona")?.addEventListener("click", () => {
  saveMomentsPersona();
});

document.querySelector("#deleteMomentsPersona")?.addEventListener("click", () => {
  deleteMomentsPersona();
});

generateMomentsPostBtn?.addEventListener("click", () => {
  generateMomentsPost();
});

copyMomentsPromptsBtn?.addEventListener("click", () => {
  copyAllMomentsPrompts().catch((error) => {
    setMomentsStatus(error instanceof Error ? error.message : String(error), "error");
  });
});

generateMomentsImagesBtn?.addEventListener("click", () => {
  generateAllMomentsImages();
});

publishMomentsWechatBtn?.addEventListener("click", () => {
  publishMomentsToWechat();
});

momentsImagePromptList?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-moments-action]");
  if (!button) return;
  const index = Number(button.dataset.index || 0);
  const action = button.dataset.momentsAction || "";
  if (action === "choose-material") {
    button.closest(".moments-prompt-card")?.querySelector(`[data-moments-material-file="${index}"]`)?.click();
  }
  if (action === "generate-image") {
    generateMomentsImage(index);
  }
});

momentsImagePromptList?.addEventListener("change", (event) => {
  const input = event.target.closest("[data-moments-material-file]");
  if (!input) return;
  const index = Number(input.dataset.momentsMaterialFile || 0);
  const file = input.files?.[0] || null;
  uploadPromptMomentsMaterial(index, file).finally(() => {
    input.value = "";
  });
});

[
  momentsCopyInput,
  momentsLocalMaterials,
  momentsVisualStyle,
  momentsImageCount,
  momentsTone,
  momentsIntent,
  momentsReferenceStyle,
  momentsPostOutput,
].forEach((element) => {
  element?.addEventListener("input", saveMomentsDraft);
  element?.addEventListener("change", saveMomentsDraft);
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

document.querySelector("#clearDirectorProjects")?.addEventListener("click", () => {
  clearDirectorProjects().catch((error) => { directorStatus.textContent = error instanceof Error ? error.message : String(error); });
});

directorProjects.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".director-project-delete");
  const button = event.target.closest(".director-project-open");
  const row = event.target.closest(".director-project-row");
  if (!row) return;
  if (deleteButton) {
    deleteDirectorProject(Number(row.dataset.directorProjectId || 0)).catch((error) => {
      directorStatus.textContent = error instanceof Error ? error.message : String(error);
    });
    return;
  }
  if (!button) return;
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

document.querySelector("#exportDirectorChatGptPrompts")?.addEventListener("click", () => {
  directorExport("chatgpt");
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
  if (window.__modularVideoOutputReady) return;
  loadVideoProductSources()
    .then(() => {
      videoProductStatus.textContent = "视频成片素材已刷新。";
    })
    .catch((error) => {
      videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
    });
});

chooseVideoProductImageBtn?.addEventListener("click", () => {
  chooseVideoProductLocalImage().catch((error) => {
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

addVideoProductImageAssetBtn?.addEventListener("click", () => {
  addVideoProductLocalImage().catch((error) => {
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

chooseVideoProductBgmBtn?.addEventListener("click", () => {
  chooseVideoProductLocalBgm().catch((error) => {
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

addVideoProductBgmAssetBtn?.addEventListener("click", () => {
  addVideoProductLocalBgm().catch((error) => {
    if (videoProductAssetStatus) videoProductAssetStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

autoBindTimelineBtn?.addEventListener("click", () => {
  if (window.__modularVideoOutputReady) return;
  previewVideoProductTimeline().catch((error) => {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

generateVideoProductBtn?.addEventListener("click", () => {
  if (window.__modularVideoOutputReady) return;
  generateJianyingDraftAndOpenLegacy();
});

document.addEventListener("keydown", (event) => {
  if (window.__modularVideoOutputReady) return;
  if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "j")) return;
  if (document.querySelector("#videoOutputPage")?.classList.contains("active") === false) return;
  event.preventDefault();
  generateJianyingDraftAndOpenLegacy().catch((error) => {
    if (videoProductStatus) videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

openVideoProductOutputBtn?.addEventListener("click", () => {
  if (window.__modularVideoOutputReady) return;
  openVideoProductOutput().catch((error) => {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

refreshVideoProductProjectsBtn?.addEventListener("click", () => {
  if (window.__modularVideoOutputReady) return;
  loadVideoProductProjects().catch((error) => {
    videoProductStatus.textContent = error instanceof Error ? error.message : String(error);
  });
});

videoProductDirector?.addEventListener("change", () => {
  if (window.__modularVideoOutputReady) return;
  videoProductManualBindings = {};
  renderVideoProductSourceOptions({ preferredDirectorId: Number(videoProductDirector.value || 0) });
  previewVideoProductTimeline().catch(() => {});
});

videoProductAudio?.addEventListener("change", () => {
  if (window.__modularVideoOutputReady) return;
  previewVideoProductTimeline().catch(() => {});
});

videoProductImageSource?.addEventListener("change", () => {
  if (window.__modularVideoOutputReady) return;
  previewVideoProductTimeline().catch(() => {});
});

videoProductOutputType?.addEventListener("change", () => {
  if (window.__modularVideoOutputReady) return;
  const label = videoProductOutputType.options[videoProductOutputType.selectedIndex]?.textContent || "输出方式";
  videoProductStatus.textContent = `已选择：${label}`;
  document.querySelectorAll(".video-route-card[data-video-output]").forEach((item) => {
    item.classList.toggle("primary", item.dataset.videoOutput === videoProductOutputType.value);
  });
  renderVideoProductSourceOptions({
    preferredDirectorId: isRouteAVideoProduct() ? 0 : Number(videoProductDirector.value || 0),
    preferredAudioId: Number(videoProductAudio.value || 0),
  });
  previewVideoProductTimeline().catch(() => {});
});

videoProductRouteAStyle?.addEventListener("change", () => {
  if (window.__modularVideoOutputReady) return;
  previewVideoProductTimeline().catch(() => {});
});

videoProductRouteACustomStyle?.addEventListener("change", () => {
  if (window.__modularVideoOutputReady) return;
  previewVideoProductTimeline().catch(() => {});
});

videoProductBgmStrategy?.addEventListener("change", () => {
  if (window.__modularVideoOutputReady) return;
  if (videoProductBgmStrategy.value !== "manual" && videoProductBgm) videoProductBgm.value = "";
  previewVideoProductTimeline().catch(() => {});
});

videoProductBgm?.addEventListener("change", () => {
  if (window.__modularVideoOutputReady) return;
  if (videoProductBgm.value && videoProductBgmStrategy) videoProductBgmStrategy.value = "manual";
  previewVideoProductTimeline().catch(() => {});
});

document.querySelectorAll(".video-route-card[data-video-output]").forEach((card) => {
  card.addEventListener("click", () => {
    if (window.__modularVideoOutputReady) return;
    const outputType = card.dataset.videoOutput || "";
    if (!outputType || !videoProductOutputType) return;
    videoProductOutputType.value = outputType;
    document.querySelectorAll(".video-route-card").forEach((item) => item.classList.toggle("primary", item === card));
    videoProductStatus.textContent = `已选择：${videoProductOutputLabel(outputType)}`;
    renderVideoProductSourceOptions({
      preferredDirectorId: isRouteAVideoProduct() ? 0 : Number(videoProductDirector.value || 0),
      preferredAudioId: Number(videoProductAudio.value || 0),
    });
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
  if (window.__modularVideoOutputReady) return;
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
  if (window.__modularVideoOutputReady) return;
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
    await loadMomentsPersonas();
    loadMomentsDraft();
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
