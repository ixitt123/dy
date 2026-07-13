const workbenchPages = {
  dashboard: {
    title: "首页",
    description: "了解软件能力、视频生产线和常用入口。",
  },
  collector: {
    title: "采集处理",
    description: "统一处理链接下载、本地视频、字幕、音频、文案库和批量任务。",
  },
  transcript: {
    title: "采集处理",
    description: "统一处理链接下载、本地视频、字幕、音频、文案库和批量任务。",
  },
  analysis: {
    title: "采集处理",
    description: "查看文案库，并分析钩子、情绪、痛点、标签和行动号召。",
  },
  rewrite: {
    title: "文案定制改写",
    description: "选择视频类型，默认生成 1 个版本，需要时可增加输出框。",
  },
  "moments-copy": {
    title: "朋友圈文案定制",
    description: "面向朋友圈图文、人设表达和固定风格的文案定制入口。",
  },
  tts: {
    title: "TTS语音",
    description: "选择项目文案和声音，生成、试听并发送到成片中心。",
  },
  voices: {
    title: "声音资产",
    description: "管理预设音色、克隆音色和默认声音。",
  },
  director: {
    title: "AI导演",
    description: "从文案生成专业分镜、字幕时间轴和导演稿。",
  },
  vfo: {
    title: "视频成片",
    description: "检查文案、语音、导演稿、素材和 BGM 后生成成片草稿。",
  },
  "video-output": {
    title: "视频成片",
    description: "优先生成剪映模板草稿，也可生成 MP4 预览或兼容素材包。",
  },
  "cs1-video": {
    title: "CS1 生成器",
    description: "输入文字，选择 CS1 或 warm-grain 模板，生成本地 HyperFrames 视频。",
  },
  "xiaohei-video": {
    title: "小黑视频风格生成",
    description: "使用小黑配图软件生成 TTS、音乐素材、逐段配图和剪映草稿。",
  },
  "money-printer": {
    title: "MoneyPrinterTurbo",
    description: "免费素材混剪生产线：启动本地 API，按主题或脚本生成 MP4。",
  },
  files: {
    title: "素材管理",
    description: "按类型、用途、风格和项目管理成片素材。",
  },
  assets: {
    title: "素材管理",
    description: "统一管理已下载或生成的视频、音频、字幕和项目素材。",
  },
  settings: {
    title: "系统设置",
    description: "API Key、模型映射和系统配置。",
  },
  "image-studio": {
    title: "图片生成",
    description: "输入 Prompt 生成图片，管理图片资产。",
  },
};

let activeWorkbenchPage = "dashboard";
let activeRailTaskId = 0;
let dashboardAudioJobs = [];
let dashboardVideoProducts = [];
let workbenchOverviewTimer = 0;
let importedDirectorImagePrompts = [];
let activeDirectorImageImport = null;
let videoProjectsState = [];
let activeVideoProject = null;
let projectReadinessState = null;
let projectAssetsState = [];

const COLLECTOR_TAB_KEY = "short-video-collector-tab";
const RAIL_TASK_RUNNING_STATUSES = new Set(["下载中", "提取中", "running", "processing"]);
const RAIL_TASK_FINISHED_STATUSES = new Set(["完成", "失败", "completed", "failed", "success", "error"]);
const RAIL_VIDEO_PRODUCT_RUNNING_STATUSES = new Set(["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"]);

const VIDEO_PROJECT_STEPS = [
  ["created", "采集素材", "collector"],
  ["collected", "文案库", "transcript"],
  ["transcribed", "定制改写", "rewrite"],
  ["rewritten", "TTS 配音", "tts"],
  ["voiced", "生产线分镜", "video-output"],
  ["directed", "素材匹配", "assets"],
  ["assets_ready", "成片草稿", "video-output"],
  ["draft_ready", "打开剪映", "video-output"],
  ["exported", "已导出", "vfo"],
];

function createWorkbenchPage(pageId) {
  const page = document.createElement("section");
  page.className = "workbench-page";
  page.dataset.page = pageId;
  return page;
}

function appendExisting(page, selector) {
  const element = document.querySelector(selector);
  if (element) page.appendChild(element);
  return element;
}

function addLaneHeading(container, title, description) {
  const heading = document.createElement("div");
  heading.className = "studio-lane-heading";
  heading.innerHTML = `<strong>${title}</strong><span>${description}</span>`;
  container.prepend(heading);
}

function activateCollectorTab(tabId = "", options = {}) {
  const allowed = new Set(["link", "local", "copybank", "batch"]);
  const stored = localStorage.getItem(COLLECTOR_TAB_KEY) || "link";
  const target = allowed.has(tabId) ? tabId : stored;
  const normalized = allowed.has(target) ? target : "link";

  document.querySelectorAll("[data-collector-tab]").forEach((button) => {
    const active = button.dataset.collectorTab === normalized;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll("[data-collector-panel]").forEach((panel) => {
    const active = panel.dataset.collectorPanel === normalized;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });

  if (options.showAnalysis && analysisPanel) analysisPanel.hidden = false;
  localStorage.setItem(COLLECTOR_TAB_KEY, normalized);
  return normalized;
}

function setupCollectorTabs() {
  document.querySelectorAll("[data-collector-tab]").forEach((button) => {
    button.addEventListener("click", () => activateCollectorTab(button.dataset.collectorTab || "link"));
  });
  activateCollectorTab();
}

async function projectApi(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
}

function currentVideoProjectId() {
  return activeVideoProject?.id || localStorage.getItem("active-video-project-id") || "";
}

function projectStatusIndex(status) {
  return Math.max(0, VIDEO_PROJECT_STEPS.findIndex(([key]) => key === status));
}

function projectStatusLabel(status) {
  return {
    created: "已创建",
    collected: "已采集",
    transcribed: "文案已提取",
    rewritten: "改写已选择",
    voiced: "配音已完成",
    directed: "导演稿已完成",
    assets_ready: "素材已就绪",
    draft_ready: "成片草稿已就绪",
    exported: "已导出",
  }[status] || "制作中";
}

function renderActiveProjectSelector() {
  const selector = document.querySelector("#activeVideoProjectSelect");
  const assetFilter = document.querySelector("#projectAssetProjectFilter");
  const options = videoProjectsState.map((project) => (
    `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)} · ${escapeHtml(projectStatusLabel(project.status))}</option>`
  ));
  if (selector) {
    selector.innerHTML = options.length ? options.join("") : '<option value="">请先新建项目</option>';
    selector.value = activeVideoProject?.id || "";
  }
  if (assetFilter) {
    const current = assetFilter.value;
    assetFilter.innerHTML = [
      '<option value="all">全部项目</option>',
      ...videoProjectsState.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)}</option>`),
    ].join("");
    assetFilter.value = [...assetFilter.options].some((item) => item.value === current) ? current : "all";
  }
}

function renderProjectSteps(project) {
  const container = document.querySelector("#currentVideoProjectSteps");
  if (!container) return;
  if (!project) {
    container.innerHTML = '<span class="project-step empty-step">创建项目后显示完整制作流程</span>';
    return;
  }
  const currentIndex = projectStatusIndex(project.status);
  container.innerHTML = VIDEO_PROJECT_STEPS.slice(0, 8).map(([status, label, page], index) => `
    <button type="button" class="project-step ${index < currentIndex ? "done" : index === currentIndex ? "active" : ""}" data-nav="${page}">
      <span>${index + 1}</span><strong>${label}</strong>
    </button>
  `).join("");
}

function renderCurrentVideoProject() {
  const title = document.querySelector("#currentVideoProjectTitle");
  const id = document.querySelector("#currentVideoProjectId");
  const progress = document.querySelector("#currentVideoProjectProgress");
  const nextTitle = document.querySelector("#projectNextActionTitle");
  const nextDescription = document.querySelector("#projectNextActionDescription");
  const nextButton = document.querySelector("#projectNextAction");
  if (!activeVideoProject) {
    if (title) title.textContent = "还没有短视频项目";
    if (id) id.textContent = "未选择";
    if (progress) progress.innerHTML = '<div class="empty">新建项目后，下载、文案、配音和成片会自动归档到同一个项目。</div>';
    if (nextTitle) nextTitle.textContent = "先新建项目";
    if (nextDescription) nextDescription.textContent = "给这条短视频命名并选择类型，系统会从采集开始带你完成全流程。";
    if (nextButton) { nextButton.textContent = "新建短视频项目"; nextButton.dataset.projectAction = "create"; delete nextButton.dataset.nav; }
    renderProjectSteps(null);
    return;
  }
  const action = activeVideoProject.nextAction || { label: "继续制作", page: "collector" };
  if (title) title.textContent = activeVideoProject.title;
  if (id) id.textContent = `项目 ${activeVideoProject.id}`;
  if (progress) progress.innerHTML = `
    <div class="project-progress-copy">
      <strong>${escapeHtml(projectStatusLabel(activeVideoProject.status))}</strong>
      <span>${Number(activeVideoProject.progress || 0)}%</span>
    </div>
    <div class="project-progress-track"><i style="width:${Number(activeVideoProject.progress || 0)}%"></i></div>
    <small>${escapeHtml(activeVideoProject.videoType || "短视频")} · ${escapeHtml(["jianying", "jianying_template"].includes(activeVideoProject.outputMode) ? "剪映模板草稿" : activeVideoProject.outputMode === "package" ? "标准素材包" : "MP4 预览")}</small>
  `;
  if (nextTitle) nextTitle.textContent = action.label;
  if (nextDescription) nextDescription.textContent = `当前已完成“${projectStatusLabel(activeVideoProject.status)}”，建议继续完成下一环节。`;
  if (nextButton) { nextButton.textContent = action.label; nextButton.dataset.nav = action.page; delete nextButton.dataset.projectAction; }
  renderProjectSteps(activeVideoProject);
}

function renderRecentVideoProjects() {
  const container = document.querySelector("#recentVideoProjects");
  if (!container) return;
  if (!videoProjectsState.length) {
    container.innerHTML = '<div class="empty">还没有项目，点击“新建短视频项目”开始。</div>';
    return;
  }
  container.innerHTML = videoProjectsState.slice(0, 8).map((project) => `
    <article class="recent-project-card ${project.id === activeVideoProject?.id ? "active" : ""}" data-project-id="${escapeHtml(project.id)}">
      <div class="recent-project-top">
        <span>${escapeHtml(project.videoType || "短视频")}</span>
        <strong>${escapeHtml(projectStatusLabel(project.status))}</strong>
      </div>
      <h3>${escapeHtml(project.title)}</h3>
      <div class="recent-project-progress"><i style="width:${Number(project.progress || 0)}%"></i></div>
      <div class="recent-project-foot">
        <small>${Number(project.progress || 0)}% · ${escapeHtml(project.nextAction?.label || "继续制作")}</small>
        <button class="ghost small select-video-project" type="button">继续制作</button>
      </div>
    </article>
  `).join("");
}

async function selectVideoProject(id, { refresh = true } = {}) {
  const project = videoProjectsState.find((item) => item.id === id)
    || (await projectApi(`/api/projects/get?id=${encodeURIComponent(id)}`)).project;
  activeVideoProject = project || null;
  if (activeVideoProject) localStorage.setItem("active-video-project-id", activeVideoProject.id);
  else localStorage.removeItem("active-video-project-id");
  renderActiveProjectSelector();
  renderCurrentVideoProject();
  renderRecentVideoProjects();
  if (refresh) {
    await Promise.allSettled([refreshProjectReadiness(), refreshProjectAssets()]);
  }
  window.dispatchEvent(new CustomEvent("video-project-changed", { detail: activeVideoProject }));
  return activeVideoProject;
}

async function refreshVideoProjects({ preserveSelection = true } = {}) {
  const data = await projectApi("/api/projects/list?limit=100");
  videoProjectsState = Array.isArray(data.projects) ? data.projects : [];
  const preferred = preserveSelection ? currentVideoProjectId() : "";
  activeVideoProject = videoProjectsState.find((item) => item.id === preferred) || videoProjectsState[0] || null;
  if (activeVideoProject) localStorage.setItem("active-video-project-id", activeVideoProject.id);
  else localStorage.removeItem("active-video-project-id");
  renderActiveProjectSelector();
  renderCurrentVideoProject();
  renderRecentVideoProjects();
  return videoProjectsState;
}

async function updateCurrentVideoProject(changes = {}) {
  if (!currentVideoProjectId()) return null;
  const data = await projectApi("/api/projects/update", {
    method: "POST",
    body: JSON.stringify({ id: currentVideoProjectId(), changes }),
  });
  activeVideoProject = data.project;
  const index = videoProjectsState.findIndex((item) => item.id === activeVideoProject.id);
  if (index >= 0) videoProjectsState[index] = activeVideoProject;
  else videoProjectsState.unshift(activeVideoProject);
  renderActiveProjectSelector();
  renderCurrentVideoProject();
  renderRecentVideoProjects();
  return activeVideoProject;
}

async function linkCurrentProjectAsset(assetType, assetId, name = "", metadata = {}) {
  if (!currentVideoProjectId()) return null;
  const data = await projectApi("/api/projects/link-asset", {
    method: "POST",
    body: JSON.stringify({ projectId: currentVideoProjectId(), assetType, assetId: String(assetId || ""), name, metadata }),
  });
  activeVideoProject = data.project || activeVideoProject;
  const index = videoProjectsState.findIndex((item) => item.id === activeVideoProject?.id);
  if (index >= 0 && activeVideoProject) videoProjectsState[index] = activeVideoProject;
  renderActiveProjectSelector();
  renderCurrentVideoProject();
  renderRecentVideoProjects();
  refreshProjectReadiness().catch(() => {});
  return data;
}

function projectAssetCard(asset) {
  const typeLabels = { image: "图片", video: "视频", bgm: "BGM", sfx: "音效", subtitle: "字幕", cover: "封面", tts: "配音", director: "导演稿" };
  const imagePath = asset.assetType === "image" ? String(asset.metadata?.path || asset.metadata?.file_path || "") : "";
  const thumbnail = imagePath ? `/api/image/thumbnail?width=320&path=${encodeURIComponent(imagePath)}` : "";
  const original = imagePath ? `/api/image/file?path=${encodeURIComponent(imagePath)}` : "";
  return `
    <article class="project-asset-card" data-project-asset-id="${escapeHtml(asset.id)}">
      <div class="project-asset-card-top">
        <span>${escapeHtml(typeLabels[asset.assetType] || asset.assetType || "素材")}</span>
        <strong class="asset-status-${escapeHtml(asset.status)}">${asset.status === "ready" ? "可用" : asset.status === "pending" ? "处理中" : "异常"}</strong>
      </div>
      ${thumbnail ? `<button class="project-asset-thumb" type="button" onclick="window.open('${original}')"><img src="${thumbnail}" alt="图片素材缩略图" loading="lazy" /></button>` : ""}
      <h3>${escapeHtml(asset.name || asset.assetId || "未命名素材")}</h3>
      <div class="asset-tag-list">
        ${[asset.useCase, asset.style, asset.ratio, asset.source === "ai_generated" ? "AI 生成" : asset.source === "downloaded" ? "已下载" : "本地上传"].filter(Boolean).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
      </div>
      <div class="project-asset-card-foot">
        <small>已使用 ${Number(asset.usedCount || 0)} 次</small>
        <button class="ghost small send-project-asset" type="button">发送到成片中心</button>
      </div>
    </article>
  `;
}

async function refreshProjectAssets() {
  const container = document.querySelector("#projectAssetGrid");
  if (!container) return [];
  const params = new URLSearchParams();
  const filters = {
    assetType: document.querySelector("#projectAssetTypeFilter")?.value || "all",
    useCase: document.querySelector("#projectAssetUseCaseFilter")?.value || "all",
    style: document.querySelector("#projectAssetStyleFilter")?.value || "all",
    projectId: document.querySelector("#projectAssetProjectFilter")?.value || "all",
  };
  Object.entries(filters).forEach(([key, value]) => { if (value && value !== "all") params.set(key, value); });
  const data = await projectApi(`/api/projects/assets?${params.toString()}`);
  const assets = Array.isArray(data.assets) ? data.assets : [];
  projectAssetsState = assets;
  container.innerHTML = assets.length ? assets.map(projectAssetCard).join("") : '<div class="empty">没有符合筛选条件的素材。完成文案、配音、导演或导入素材后会自动归档到这里。</div>';
  return assets;
}

function renderProjectReadiness(readiness, qualityCheck) {
  projectReadinessState = readiness || null;
  const container = document.querySelector("#videoProjectReadiness");
  const quality = document.querySelector("#videoProjectQuality");
  const generateButton = document.querySelector("#generateVideoProduct");
  if (container) {
    container.innerHTML = readiness?.checks?.length
      ? readiness.checks.map((item) => `
        <div class="readiness-row ${item.ok ? "ready" : "missing"}">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.detail)}</strong>
          ${item.ok ? "" : `<button class="ghost small" type="button" data-nav="${escapeHtml(item.page)}">${escapeHtml(item.action)}</button>`}
        </div>
      `).join("")
      : '<span>当前项目还没有检查数据。</span>';
  }
  if (quality) {
    quality.innerHTML = qualityCheck ? `
      <div class="quality-score"><strong>${Number(qualityCheck.totalScore || 0)}</strong><span>成片质量 · ${escapeHtml(qualityCheck.estimatedQualityLevel || "待完善")}</span></div>
      <div class="quality-score-grid">
        <span>开头 ${Number(qualityCheck.hookScore || 0)}</span>
        <span>脚本 ${Number(qualityCheck.scriptClarityScore || 0)}</span>
        <span>字幕 ${Number(qualityCheck.subtitleRhythmScore || 0)}</span>
        <span>画面 ${Number(qualityCheck.visualDiversityScore || 0)}</span>
        <span>匹配 ${Number(qualityCheck.assetMatchScore || 0)}</span>
      </div>
      ${qualityCheck.problems?.length ? `<p>${qualityCheck.problems.slice(0, 3).map((item) => escapeHtml(item)).join("；")}</p>` : '<p class="success-text">检查通过，可以生成成片。</p>'}
      ${qualityCheck.suggestions?.length ? `<div class="quality-actions">${qualityCheck.suggestions.slice(0, 3).map((item) => `<button class="ghost small" type="button" data-nav="${escapeHtml(item.page)}">${escapeHtml(item.label)}</button>`).join("")}</div>` : ""}
    ` : "";
  }
  if (generateButton && !window.__modularVideoOutputReady) {
    generateButton.disabled = !readiness?.ready;
    generateButton.title = readiness?.ready ? "生成成片输出" : "请先补齐生成前检查中的关键项";
  }
}

async function refreshProjectReadiness() {
  const id = currentVideoProjectId();
  if (!id) {
    renderProjectReadiness(null, null);
    return null;
  }
  const [readinessData, qualityData] = await Promise.all([
    projectApi(`/api/projects/readiness?id=${encodeURIComponent(id)}`),
    projectApi(`/api/projects/quality?id=${encodeURIComponent(id)}`),
  ]);
  renderProjectReadiness(readinessData.readiness, qualityData.qualityCheck);
  return readinessData.readiness;
}

async function syncCurrentVideoProductSelections() {
  if (!currentVideoProjectId()) {
    const directorSelect = typeof videoProductDirector !== "undefined" ? videoProductDirector : null;
    const title = directorSelect?.selectedOptions?.[0]?.textContent
      ?.replace(/^#\d+\s*/, "")
      .replace(/路.*$/, "")
      .trim() || "剪映草稿项目";
    const created = await createVideoProject({
      title,
      videoType: "短视频",
      outputMode: "jianying_template",
    });
    if (!created?.id) throw new Error("自动创建短视频项目失败。");
    await loadVideoProjects();
    setActiveVideoProject(created.id);
  }
  if (!currentVideoProjectId()) throw new Error("请先在首页新建或选择一个短视频项目。");
  const outputType = typeof videoProductOutputType !== "undefined" ? videoProductOutputType.value : "jianying_template";
  await updateCurrentVideoProject({ outputMode: outputType });

  const audioId = Number(typeof videoProductAudio !== "undefined" ? videoProductAudio.value : 0);
  const audio = typeof videoProductSources !== "undefined" ? videoProductSources.audioJobs?.find((item) => Number(item.id) === audioId) : null;
  if (audio) {
    if (audio.text) await linkCurrentProjectAsset("selected_rewrite", `tts-text-${audio.id}`, "当前配音文案", { text: audio.text, source: "tts" });
    const audioTitle = audio.title || audio.seo_title || audio.publish_title || audio.platform_titles?.douyin || audio.voice_name || `配音 #${audio.id}`;
    await linkCurrentProjectAsset("tts", audio.id, audioTitle, { ...audio, title: audioTitle, source: "local_upload" });
  }

  const directorId = Number(typeof videoProductDirector !== "undefined" ? videoProductDirector.value : 0);
  if (directorId) {
    const fullDirector = await fetch(`/api/director/project?id=${encodeURIComponent(directorId)}`).then((response) => response.json()).catch(() => ({}));
    const director = fullDirector.project || videoProductSources.directors?.find((item) => Number(item.id) === directorId) || {};
    await linkCurrentProjectAsset("director", directorId, director.title || `导演稿 #${directorId}`, {
      ...director,
      sceneCount: director.result?.storyboard?.length || director.scene_count || 0,
      subtitleTimeline: director.result?.subtitle_timeline || director.subtitle_timeline || [],
      source: "ai_generated",
    });
  }

  const imageAssets = typeof videoProductSources !== "undefined" ? videoProductSources.imageAssets || [] : [];
  const selectedIds = typeof videoProductManualBindings !== "undefined" ? new Set(Object.values(videoProductManualBindings).map(String)) : new Set();
  const selectedImages = selectedIds.size ? imageAssets.filter((item) => selectedIds.has(String(item.id))) : imageAssets.slice(0, 20);
  for (const asset of selectedImages) {
    await linkCurrentProjectAsset("image", asset.id, asset.filename || `图片 ${asset.id}`, {
      path: asset.original_path || asset.path || "",
      ratio: asset.aspect_ratio || "9:16",
      style: typeof videoProductRouteAStyle !== "undefined" ? videoProductRouteAStyle.value : "",
      source: asset.source_type === "director" ? "ai_generated" : "local_upload",
      sourceId: asset.source_id || "",
      sceneIndex: Number(asset.scene_index || 0),
      assetOrder: Number(asset.asset_order || 0),
      useCase: activeVideoProject?.videoType || "",
      status: "ready",
    });
  }

  if (typeof videoProductBgmStrategy !== "undefined" && videoProductBgm?.value) {
    const selectedBgmId = videoProductBgm.value;
    const selectedBgm = videoProductSources.bgmAssets?.find((item) => String(item.id) === String(selectedBgmId));
    await linkCurrentProjectAsset("bgm", selectedBgmId, selectedBgm?.title || selectedBgm?.filename || "自动匹配本地 BGM", {
      path: selectedBgm?.path || "",
      source: selectedBgm ? "local_upload" : "ai_generated",
      strategy: videoProductBgmStrategy.value || "auto",
      style: videoProductRouteAStyle?.value || "",
      status: "ready",
    });
  }
  if (["jianying", "jianying_template"].includes(outputType)) {
    const templateSelect = document.querySelector("#videoProductJianyingTemplate");
    const templateId = templateSelect?.value || "education_tips";
    const templateName = templateSelect?.selectedOptions?.[0]?.textContent || "学习技巧模板";
    await linkCurrentProjectAsset("template", templateId, templateName, {
      source: "local_upload",
      ratio: "9:16",
      status: "ready",
    });
  }
  return refreshProjectReadiness();
}

function setupProjectWorkbench() {
  const form = document.querySelector("#videoProjectCreateForm");
  document.querySelector("#newVideoProject")?.addEventListener("click", () => {
    form.hidden = false;
    document.querySelector("#videoProjectTitle")?.focus();
  });
  document.querySelector("#cancelVideoProject")?.addEventListener("click", () => { form.hidden = true; });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = document.querySelector("#videoProjectTitle")?.value.trim() || "新短视频项目";
    const videoType = document.querySelector("#videoProjectType")?.value || "宣传类";
    const outputMode = document.querySelector("#videoProjectOutputMode")?.value || "jianying_template";
    const data = await projectApi("/api/projects/create", { method: "POST", body: JSON.stringify({ title, videoType, outputMode }) });
    form.hidden = true;
    form.reset();
    await refreshVideoProjects({ preserveSelection: false });
    await selectVideoProject(data.project.id);
  });
  document.querySelector("#activeVideoProjectSelect")?.addEventListener("change", (event) => selectVideoProject(event.target.value));
  document.querySelector("#projectNextAction")?.addEventListener("click", (event) => {
    if (event.currentTarget.dataset.projectAction === "create") document.querySelector("#newVideoProject")?.click();
  });
  document.querySelector("#recentVideoProjects")?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-project-id]");
    if (card) selectVideoProject(card.dataset.projectId);
  });
  ["projectAssetTypeFilter", "projectAssetUseCaseFilter", "projectAssetStyleFilter", "projectAssetProjectFilter"].forEach((id) => {
    document.querySelector(`#${id}`)?.addEventListener("change", () => refreshProjectAssets());
  });
  document.querySelector("#refreshProjectAssets")?.addEventListener("click", () => refreshProjectAssets());
  document.querySelector("#projectAssetGrid")?.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-project-asset-id]");
    if (!card || !event.target.closest(".send-project-asset")) return;
    const asset = projectAssetsState.find((item) => item.id === card.dataset.projectAssetId);
    if (asset && asset.projectId !== currentVideoProjectId()) {
      await linkCurrentProjectAsset(asset.assetType, asset.assetId, asset.name, {
        ...asset.metadata,
        useCase: asset.useCase,
        style: asset.style,
        ratio: asset.ratio,
        source: asset.source,
        usedCount: Number(asset.usedCount || 0) + 1,
        status: asset.status,
      });
    }
    navigateWorkbench("vfo");
    document.querySelector("#videoProductCenter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#refreshVideoProjectReadiness")?.addEventListener("click", () => refreshProjectReadiness());

  window.videoProjects = {
    current: () => activeVideoProject,
    select: selectVideoProject,
    refresh: refreshVideoProjects,
    updateCurrent: updateCurrentVideoProject,
    linkCurrent: linkCurrentProjectAsset,
    refreshReadiness: refreshProjectReadiness,
    syncSelections: syncCurrentVideoProductSelections,
    canGenerate: () => Boolean(projectReadinessState?.ready),
  };

  refreshVideoProjects()
    .then(() => Promise.allSettled([refreshProjectReadiness(), refreshProjectAssets()]))
    .catch((error) => {
      const recent = document.querySelector("#recentVideoProjects");
      if (recent) recent.innerHTML = `<div class="empty">项目读取失败：${escapeHtml(error.message)}</div>`;
    });
}

function setupRewriteStudio() {
  const body = document.querySelector("#rewritePanel .rewrite-body");
  const originalGrid = body?.querySelector(".rewrite-grid");
  if (!body || !originalGrid || body.querySelector(".rewrite-studio-grid")) return;

  const columns = [...originalGrid.children];
  const studio = document.createElement("div");
  studio.className = "rewrite-studio-grid";

  const sourceLane = document.createElement("section");
  sourceLane.className = "studio-lane rewrite-source-lane";
  const settingsLane = document.createElement("section");
  settingsLane.className = "studio-lane rewrite-settings-lane";
  const outputLane = document.createElement("section");
  outputLane.className = "studio-lane rewrite-output-lane";

  if (columns[0]) sourceLane.appendChild(columns[0]);
  const simpleControls = document.createElement("div");
  simpleControls.className = "rewrite-simple-controls";
  simpleControls.innerHTML = `
    <label>
      选择视频类型
      <select id="rewriteVideoType">
        <option value="宣传类">宣传类</option>
        <option value="学习技巧类">学习技巧类</option>
        <option value="招生转化类">招生转化类</option>
        <option value="科普类">科普类</option>
      </select>
    </label>
    <div class="rewrite-simple-note">
      <strong>默认生成 1 个版本</strong>
      <span>需要更多风格时可增加输出框，再选择最佳版本发送到配音或视频成片。</span>
    </div>
  `;
  settingsLane.appendChild(simpleControls);
  const advanced = document.createElement("details");
  advanced.className = "rewrite-advanced-settings";
  advanced.innerHTML = "<summary>高级设置</summary>";
  if (columns[1]) advanced.appendChild(columns[1]);
  const countControl = body.querySelector(".rewrite-result-meta");
  if (countControl) advanced.appendChild(countControl);
  settingsLane.appendChild(advanced);
  [
    body.querySelector(".rewrite-result-head"),
    body.querySelector(".rewrite-progress"),
    body.querySelector(".rewrite-versions"),
  ].filter(Boolean).forEach((element) => outputLane.appendChild(element));

  addLaneHeading(sourceLane, "原始文案与分析", "确认输入内容和已有分析");
  addLaneHeading(settingsLane, "生成方式", "默认只需选择视频类型");
  addLaneHeading(outputLane, "改写版本", "默认生成 1 个版本，需要时再增加输出框");

  originalGrid.remove();
  studio.append(sourceLane, settingsLane, outputLane);
  body.appendChild(studio);
  const countInput = document.querySelector("#rewriteVersionCountInput");
  if (countInput && Number(countInput.value || 0) !== 1) {
    countInput.value = "1";
    countInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const videoType = simpleControls.querySelector("#rewriteVideoType");
  videoType?.addEventListener("change", () => {
    const directionMap = {
      宣传类: "朋友圈文案",
      学习技巧类: "短视频口播",
      招生转化类: "招生引流",
      科普类: "短视频口播",
    };
    if (typeof rewriteDirection !== "undefined") rewriteDirection.value = directionMap[videoType.value] || "短视频口播";
    if (activeVideoProject) updateCurrentVideoProject({ videoType: videoType.value }).catch(() => {});
  });
}

function setupTtsStudio() {
  const lab = document.querySelector("#ttsLab");
  const oldWorkbench = lab?.querySelector(".tts-workbench");
  if (!lab || !oldWorkbench || lab.querySelector(".tts-studio-grid")) return;

  const scriptColumn = oldWorkbench.querySelector(".tts-script-column");
  const controlColumn = oldWorkbench.querySelector(".tts-control-column");
  const settings = lab.querySelector(".tts-settings");
  const preview = lab.querySelector(".tts-preview");
  const historyPanel = lab.querySelector(".tts-history-panel");
  const historyHead = lab.querySelector(".tts-history-head");
  const history = lab.querySelector(".tts-history");
  const studio = document.createElement("div");
  studio.className = "tts-studio-grid";

  const inputLane = document.createElement("section");
  inputLane.className = "studio-lane tts-input-lane";
  const settingsLane = document.createElement("section");
  settingsLane.className = "studio-lane tts-settings-lane";
  const resultLane = document.createElement("section");
  resultLane.className = "studio-lane tts-result-lane";

  if (scriptColumn) inputLane.appendChild(scriptColumn);
  if (settings) settingsLane.appendChild(settings);
  if (controlColumn) settingsLane.appendChild(controlColumn);
  if (preview) resultLane.appendChild(preview);
  if (historyHead) resultLane.appendChild(historyHead);
  if (history) resultLane.appendChild(history);
  if (historyPanel && historyPanel.children.length === 0) historyPanel.remove();

  addLaneHeading(inputLane, "项目文案", "手动输入或从当前项目的最佳改写带入");
  addLaneHeading(settingsLane, "选择声音", "我的克隆音色、平台预设和最近使用");
  addLaneHeading(resultLane, "试听与发送", "确认语音后继续进入成片中心");

  oldWorkbench.remove();
  studio.append(inputLane, settingsLane, resultLane);
  lab.querySelector(".tts-head")?.after(studio);

  const projectSource = document.createElement("div");
  projectSource.className = "tts-project-source";
  projectSource.innerHTML = `
    <label>
      选择项目文案
      <select id="ttsProjectScriptSource">
        <option value="selected">当前项目最佳改写</option>
        <option value="transcript">当前项目原始文案</option>
      </select>
    </label>
    <button class="ghost" id="loadProjectScriptToTts" type="button">载入项目文案</button>
  `;
  inputLane.querySelector(".studio-lane-heading")?.after(projectSource);
  document.querySelector("#loadProjectScriptToTts")?.addEventListener("click", () => {
    if (!activeVideoProject) {
      if (typeof ttsStatus !== "undefined") ttsStatus.textContent = "请先在首页选择短视频项目。";
      return;
    }
    const mode = document.querySelector("#ttsProjectScriptSource")?.value || "selected";
    const text = mode === "transcript" ? activeVideoProject.transcriptText : (activeVideoProject.selectedRewriteText || activeVideoProject.transcriptText);
    if (!text) {
      if (typeof ttsStatus !== "undefined") ttsStatus.textContent = "当前项目还没有可用文案。";
      return;
    }
    ttsText.value = text;
    ttsCharacterCount.textContent = `${text.replace(/\s/g, "").length} 字`;
    ttsStatus.textContent = `已载入项目“${activeVideoProject.title}”的文案。`;
  });
}

function setupDirectorStudio() {
  const system = document.querySelector("#directorSystem");
  const oldWorkbench = system?.querySelector(".director-workbench");
  if (!system || !oldWorkbench || system.querySelector(".director-studio-grid")) return;

  const scriptPanel = oldWorkbench.querySelector(".director-script-panel");
  const controlPanel = oldWorkbench.querySelector(".director-control-panel");
  const historyHead = system.querySelector(".director-history-head");
  const projects = system.querySelector(".director-projects");
  const result = system.querySelector(".director-result");
  const studio = document.createElement("div");
  studio.className = "director-studio-grid";

  const sourceLane = document.createElement("section");
  sourceLane.className = "studio-lane director-source-lane";
  const settingsLane = document.createElement("section");
  settingsLane.className = "studio-lane director-settings-lane";
  const resultLane = document.createElement("section");
  resultLane.className = "studio-lane director-output-lane";

  if (scriptPanel) sourceLane.appendChild(scriptPanel);
  if (controlPanel) settingsLane.appendChild(controlPanel);
  if (historyHead) resultLane.appendChild(historyHead);
  if (projects) resultLane.appendChild(projects);
  if (result) resultLane.appendChild(result);

  addLaneHeading(sourceLane, "文案来源", "手动输入或选择已有内容");
  addLaneHeading(settingsLane, "导演设置", "类型、风格、平台、节奏和镜头");
  addLaneHeading(resultLane, "导演稿结果", "镜头、字幕、画面提示词和导出");

  oldWorkbench.remove();
  studio.append(sourceLane, settingsLane, resultLane);
  system.querySelector(".director-head")?.after(studio);
}

function setupVfoFutureStep() {
  // 成片中心已经在 VFO 页面启用，不再追加旧的“下一阶段”占位卡。
}

function createTranscriptVault() {
  const transcriptListPanel = document.querySelector("#transcriptList");
  if (!transcriptListPanel) return null;

  const vault = document.createElement("section");
  vault.className = "result-area transcript-vault";
  vault.id = "transcriptVaultPanel";
  vault.innerHTML = `
    <div class="result-head">
      <div>
        <h2>文案库</h2>
        <p>提取后的文案在这里集中查看，并继续进入分析或改写。</p>
      </div>
      <div class="result-tools">
        <button class="ghost small" type="button" data-nav="collector">返回下载</button>
      </div>
    </div>
  `;
  vault.appendChild(transcriptListPanel);
  return vault;
}

function setupCodexTaskWorkbench(settingsPage) {
  const batchArea = document.querySelector(".batch-area");
  if (!batchArea || !settingsPage) return;

  const rail = document.querySelector(".status-rail");
  const batchHead = batchArea.querySelector(".result-head");
  const batchControls = batchArea.querySelector(".batch-controls");
  const batchActions = batchArea.querySelector(".batch-actions");
  const taskStatsPanel = batchArea.querySelector("#taskStats");
  const taskTools = batchArea.querySelector(".task-table-tools");
  const tasksTablePanel = batchArea.querySelector("#tasksTable");
  const taskPagerPanel = batchArea.querySelector("#taskPager");

  const settingsCard = document.createElement("section");
  settingsCard.className = "settings-card batch-settings-card";
  if (batchHead) {
    const title = batchHead.querySelector("h2");
    if (title) title.textContent = "批量默认设置";
    settingsCard.appendChild(batchHead);
  }
  if (batchControls) settingsCard.appendChild(batchControls);
  settingsPage.appendChild(settingsCard);

  if (rail) {
    const detailSection = document.createElement("section");
    detailSection.className = "rail-section rail-task-detail-section";
    detailSection.innerHTML = `
      <div class="rail-heading"><span>任务内容</span></div>
      <div id="railTaskDetail" class="rail-task-detail">
        <div class="rail-empty">点击任务里的“查看”，文案、文件和消息会显示在这里。</div>
      </div>
    `;

    const commandSection = document.createElement("section");
    commandSection.className = "rail-section rail-command-section";
    commandSection.innerHTML = `
      <div class="rail-heading">
        <span>队列控制</span>
        <i class="live-dot"></i>
      </div>
      <div class="rail-command-body"></div>
    `;
    const commandBody = commandSection.querySelector(".rail-command-body");
    if (batchActions) commandBody.appendChild(batchActions);

    const currentSection = rail.querySelector(".rail-section");
    if (currentSection) {
      currentSection.after(detailSection);
      detailSection.after(commandSection);
    } else {
      rail.prepend(commandSection);
      rail.prepend(detailSection);
    }
  }

  const plumbing = document.createElement("section");
  plumbing.className = "codex-task-plumbing";
  plumbing.hidden = true;
  [
    taskStatsPanel,
    taskTools,
    tasksTablePanel,
    taskPagerPanel,
  ].filter(Boolean).forEach((element) => plumbing.appendChild(element));
  settingsPage.appendChild(plumbing);
  batchArea.remove();
}

function buildWorkbenchInformationArchitecture() {
  const content = document.querySelector("#workbenchContent");
  const dashboard = document.querySelector("#dashboardPage");
  if (!content || !dashboard) return;

  const settingsPage = document.querySelector('[data-page="settings"]');
  const v2Settings = document.getElementById("v2SettingsPanel");
  if (settingsPage && v2Settings) settingsPage.appendChild(v2Settings);

  setupRewriteStudio();
  setupTtsStudio();
  setupDirectorStudio();
  setupProjectWorkbench();
  setupVfoFutureStep();
  setupImageStudio();
  setupV2Settings();
}

function navigateWorkbench(pageId, options = {}) {
  const aliases = { analysis: "collector", transcript: "collector", director: "video-output", files: "assets", "image-studio": "assets", vfo: "video-output" };
  const normalized = aliases[pageId] || pageId;
  const target = workbenchPages[normalized] ? normalized : "dashboard";
  const collectorTab = options.collectorTab || ((pageId === "analysis" || pageId === "transcript") ? "copybank" : "");
  activeWorkbenchPage = target;
  document.body.dataset.activeModule = target;
  document.querySelectorAll(".workbench-page").forEach((page) => {
    page.classList.toggle("active", page.dataset.page === target);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = (aliases[button.dataset.nav] || button.dataset.nav) === target;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  const config = workbenchPages[target];
  const title = document.querySelector("#workbenchPageTitle");
  const description = document.querySelector("#workbenchPageDescription");
  if (title) title.textContent = config.title;
  if (description) description.textContent = config.description;

  if (target === "collector") activateCollectorTab(collectorTab || (options.focusPrimary ? "link" : ""), { showAnalysis: pageId === "analysis" });
  if (target === "rewrite" && rewritePanel) rewritePanel.hidden = false;
  if (target === "video-output") refreshProjectReadiness().catch(() => {});
  if (target === "assets") refreshProjectAssets().catch(() => {});
  localStorage.setItem("short-video-workbench-page", target);
  if (!options.fromHash && window.location.hash !== `#${target}`) {
    window.history.replaceState(null, "", `#${target}`);
  }

  if (!options.preserveScroll) {
    document.querySelector("#workbenchContent")?.scrollTo({ top: 0, behavior: options.instant ? "auto" : "smooth" });
    window.scrollTo({ top: 0, behavior: options.instant ? "auto" : "smooth" });
  }
  if (target === "collector" && options.focusPrimary) {
    setTimeout(() => shareLink?.focus(), 120);
  }
  document.dispatchEvent(new CustomEvent("workbench:route", { detail: { page: target } }));
}

function isToday(value) {
  if (!value) return false;
  const now = new Date();
  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return String(value).startsWith(localDate);
}

function hasRewrite(task) {
  if (task?.rewrite_path) return true;
  try {
    const data = JSON.parse(task?.rewrite_json || "{}");
    return Array.isArray(data.versions) && data.versions.some((version) => String(version?.content || "").trim());
  } catch {
    return false;
  }
}

function workbenchStatusClass(status) {
  if (["完成", "completed", "success"].includes(status)) return "success";
  if (["失败", "failed", "error"].includes(status)) return "failed";
  if (["已暂停", "paused"].includes(status)) return "paused";
  if (["等待", "waiting"].includes(status)) return "waiting";
  return "running";
}

function setMetric(id, value) {
  const element = document.querySelector(`#${id}`);
  if (element) element.textContent = String(value || 0);
}

function renderDashboardTasks(tasks) {
  const container = document.querySelector("#dashboardRecentTasks");
  if (!container) return;
  const recent = tasks.slice(0, 6);
  if (!recent.length) {
    container.innerHTML = '<div class="empty">暂无任务，从抖音采集开始。</div>';
    return;
  }
  container.innerHTML = recent.map((task) => `
    <button class="dashboard-task-row" type="button" data-nav="collector">
      <span class="task-leading">#${Number(task.id || 0)}</span>
      <span class="task-main">
        <strong>${escapeHtml(task.title || task.url || "未命名任务")}</strong>
        <small>${escapeHtml(task.message || task.task_action || "等待处理")}</small>
      </span>
      <span class="status-badge ${workbenchStatusClass(task.status)}">${escapeHtml(task.status || "等待")}</span>
    </button>
  `).join("");
}

function railTaskProgress(task) {
  return Math.max(0, Math.min(100, Number(task?.progress || 0)));
}

function railTaskIsRunning(task) {
  return RAIL_TASK_RUNNING_STATUSES.has(task?.status);
}

function railTaskIsFinished(task) {
  return RAIL_TASK_FINISHED_STATUSES.has(task?.status);
}

function railVideoProductId(project) {
  return Number(project?.project_id || project?.id || 0);
}

function railVideoProductIsRunning(project) {
  return RAIL_VIDEO_PRODUCT_RUNNING_STATUSES.has(project?.status);
}

function railVideoProductCanDelete(project) {
  return railVideoProductId(project) > 0 && !railVideoProductIsRunning(project);
}

function railTaskActionLabel(task) {
  const action = task?.task_action || (task?.only_transcript ? "transcript" : "download");
  return typeof taskActionLabels !== "undefined" ? taskActionLabels[action] || "任务" : "任务";
}

function railTaskTitle(task) {
  return task?.title || task?.url || task?.message || `任务 #${Number(task?.id || 0)}`;
}

function railTaskDetail(task) {
  const parts = [
    railTaskActionLabel(task),
    task?.status || "等待",
    task?.message || task?.error || "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function railStatusSummary(tasks) {
  const counts = tasks.reduce((acc, task) => {
    const key = task.status || "等待";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return [
    ["总数", tasks.length],
    ["等待", counts["等待"] || 0],
    ["运行", (counts["下载中"] || 0) + (counts["提取中"] || 0) + (counts.running || 0) + (counts.processing || 0)],
    ["完成", counts["完成"] || counts.completed || 0],
    ["失败", counts["失败"] || counts.failed || 0],
  ];
}

function railTaskCard(task, variant = "normal") {
  const progress = railTaskProgress(task);
  const running = railTaskIsRunning(task);
  const canPause = ["下载中", "提取中"].includes(task.status);
  const canDelete = !running;
  const title = escapeHtml(railTaskTitle(task));
  const detail = escapeHtml(railTaskDetail(task));
  const status = escapeHtml(task.status || "等待");
  const id = Number(task.id || 0);
  const fileName = escapeHtml(shortPath(task.video_path || task.txt_path || task.analysis_path || ""));
  const selected = activeRailTaskId === id ? "selected" : "";
  const canOpenVideo = Boolean(task.video_path);
  return `
    <article class="rail-task-card ${variant} ${selected}">
      <div class="rail-task-top">
        <span class="rail-task-id">#${id}</span>
        <span class="status-badge ${workbenchStatusClass(task.status)}">${status}</span>
      </div>
      <strong title="${title}">${title}</strong>
      <small title="${detail}">${detail}</small>
      <div class="rail-progress rail-task-progress" aria-hidden="true"><i style="width:${progress}%"></i></div>
      <div class="rail-task-meta">
        <span>${progress}%</span>
        <span title="${fileName}">${fileName || "未生成文件"}</span>
      </div>
      <div class="rail-task-actions">
        <button type="button" class="rail-task-view" data-task-id="${id}">查看</button>
        ${canOpenVideo ? `<button type="button" class="rail-task-open" data-task-id="${id}">打开</button>` : ""}
        ${canPause ? `<button type="button" class="rail-task-pause" data-task-id="${id}">暂停</button>` : ""}
        ${canDelete ? `<button type="button" class="rail-task-delete" data-task-id="${id}">删除</button>` : ""}
      </div>
    </article>
  `;
}

function railVideoProductStatusLabel(status) {
  return {
    pending: "等待",
    binding_assets: "绑定素材",
    building_timeline: "生成成片草稿",
    rendering: "渲染 MP4",
    exporting_draft: "导出草稿",
    completed: "完成",
    failed: "失败",
  }[status] || status || "未知";
}

function friendlyVideoProductError(value) {
  const message = String(value || "").trim();
  if (!message) return "";
  if (/ffmpeg|stream specifier|filtergraph|invalid argument|libavcodec/i.test(message)) {
    return "成片合成失败，请检查音频、素材和输出设置后重试。";
  }
  return message.length > 140 ? `${message.slice(0, 140)}…` : message;
}

function isForceableVideoProductError(message = "") {
  return /相似度|随机音频匹配|质量审查未通过|码率偏低|标题仍是内部导演稿名称|缺少 BGM 素材/.test(String(message || ""));
}

function railVideoProductCard(project, variant = "normal") {
  const id = railVideoProductId(project);
  const progress = Math.max(0, Math.min(100, Number(project.progress || 0)));
  const title = escapeHtml(project.metadata?.title || `成片 #${id}`);
  const status = railVideoProductStatusLabel(project.status);
  const blockers = Array.isArray(project.blockers) ? project.blockers.filter(Boolean) : [];
  const detail = [
    project.current_step || status,
    blockers.length ? `阻塞 ${blockers.length} 项` : "",
    friendlyVideoProductError(project.error),
  ].filter(Boolean).join(" · ");
  const output = project.mp4_path || project.output_dir || project.timeline_path || project.srt_path || "";
  const hasOutput = Boolean(output);
  const canDelete = railVideoProductCanDelete(project);
  const canForce = project.status === "failed" && isForceableVideoProductError(project.error || blockers.join(" "));
  return `
    <article class="rail-task-card rail-video-product-card ${variant}">
      <div class="rail-task-top">
        <span class="rail-task-id">成片 #${id}</span>
        <span class="status-badge ${workbenchStatusClass(project.status)}">${escapeHtml(status)}</span>
      </div>
      <strong title="${title}">${title}</strong>
      <small title="${escapeHtml(detail)}">${escapeHtml(detail || "等待生成")}</small>
      <div class="rail-progress rail-task-progress" aria-hidden="true"><i style="width:${progress}%"></i></div>
      <div class="rail-task-meta">
        <span>${progress}%</span>
        <span title="${escapeHtml(output)}">${escapeHtml(shortPath(output) || project.output_type || "未生成文件")}</span>
      </div>
      ${blockers.length ? `<ul class="rail-video-blockers">${blockers.slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      <div class="rail-task-actions">
        <button type="button" class="rail-video-product-open" data-video-product-id="${id}">查看</button>
        ${canForce ? `<button type="button" class="rail-video-product-force" data-video-product-id="${id}">强制执行</button>` : ""}
        ${hasOutput ? `<button type="button" class="rail-video-product-folder" data-video-product-id="${id}">打开</button>` : ""}
        ${canDelete ? `<button type="button" class="rail-video-product-delete danger-action" data-video-product-id="${id}">删除</button>` : ""}
      </div>
    </article>
  `;
}

function renderRail(tasks, directors, vfoProjects, audioJobs, videoProducts = []) {
  const current = document.querySelector("#railCurrentTask");
  const recent = document.querySelector("#railRecentOutput");
  const errors = document.querySelector("#railErrors");
  const sortedTasks = [...tasks].sort((left, right) => Number(right.id || 0) - Number(left.id || 0));
  const runningTasks = sortedTasks.filter(railTaskIsRunning);
  const waitingTasks = sortedTasks.filter((task) => ["等待", "waiting"].includes(task.status));
  const finishedTasks = sortedTasks.filter(railTaskIsFinished);
  const failedTasks = sortedTasks.filter((task) => ["失败", "failed"].includes(task.status));
  const latestTasks = sortedTasks.filter((task) => !runningTasks.includes(task)).slice(0, 10);
  const runningVideoProducts = videoProducts.filter(railVideoProductIsRunning);
  const failedVideoProducts = videoProducts.filter((project) => project.status === "failed");
  const deletableVideoProducts = videoProducts.filter(railVideoProductCanDelete);
  const latestVideoProducts = videoProducts
    .filter((project) => !runningVideoProducts.includes(project))
    .slice(0, 4);

  if (current) {
    const summary = railStatusSummary(tasks)
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
    const activeList = runningTasks.length
      ? runningTasks.slice(0, 4).map((task) => railTaskCard(task, "active")).join("")
      : waitingTasks.length
        ? waitingTasks.slice(0, 3).map((task) => railTaskCard(task, "waiting")).join("")
        : '<div class="rail-empty success-text">当前没有运行或等待任务</div>';
    const recentList = latestTasks.length
      ? latestTasks.map((task) => railTaskCard(task)).join("")
      : '<div class="rail-empty">暂无任务记录</div>';
    const videoList = runningVideoProducts.length
      ? runningVideoProducts.slice(0, 4).map((project) => railVideoProductCard(project, "active")).join("")
      : latestVideoProducts.length
        ? latestVideoProducts.map((project) => railVideoProductCard(project)).join("")
        : '<div class="rail-empty">暂无成片任务</div>';
    current.innerHTML = `
      <div class="rail-task-console">
        <div class="rail-task-summary">${summary}</div>
        <div class="rail-task-group">
          <div class="rail-subheading"><span>运行 / 等待</span><em>${runningTasks.length + waitingTasks.length}</em></div>
          <div class="rail-task-list">${activeList}</div>
        </div>
        <div class="rail-task-group">
          <div class="rail-subheading">
            <span>成片任务</span>
            <span class="rail-subheading-actions">
              ${deletableVideoProducts.length ? `<button type="button" class="rail-subheading-action rail-video-product-clear danger-action" title="清理已完成/失败的成片记录和输出文件夹">清理</button>` : ""}
              <em>${runningVideoProducts.length || latestVideoProducts.length}</em>
            </span>
          </div>
          <div class="rail-task-list compact">${videoList}</div>
        </div>
        <div class="rail-task-group">
          <div class="rail-subheading">
            <span>最近任务</span>
            <span class="rail-subheading-actions">
              ${finishedTasks.length ? `<button type="button" class="rail-subheading-action rail-task-clear-finished" title="清理已完成和失败的普通任务记录，文件会保留">清理</button>` : ""}
              <em>${latestTasks.length}${tasks.length > latestTasks.length ? " / " + tasks.length : ""}</em>
            </span>
          </div>
          <div class="rail-task-list compact">${recentList}</div>
        </div>
        ${failedTasks.length + failedVideoProducts.length ? `<div class="rail-failure-note">失败 ${failedTasks.length + failedVideoProducts.length} 条，请看下方错误提示。</div>` : ""}
      </div>
    `;
  }

  if (recent) {
    const outputs = [
      ...audioJobs.filter((job) => job.status === "completed").slice(0, 2).map((job) => ({
        type: "音频",
        title: job.voice_name || job.voice_id || `TTS #${job.id}`,
        time: job.completed_at || job.created_at,
        page: "tts",
      })),
      ...directors.filter((item) => item.status === "completed").slice(0, 2).map((item) => ({
        type: "导演稿",
        title: item.title,
        time: item.updated_at,
        page: "director",
      })),
      ...vfoProjects.filter((item) => item.status === "completed").slice(0, 2).map((item) => ({
        type: "渲染计划",
        title: item.title,
        time: item.updated_at,
        page: "vfo",
      })),
      ...videoProducts.filter((item) => item.status === "completed").slice(0, 3).map((item) => ({
        type: item.output_type === "mp4" ? "MP4成片" : "剪映草稿",
        title: item.metadata?.title || `成片 #${item.project_id || item.id}`,
        time: item.completed_at || item.updated_at,
        page: "vfo",
      })),
    ]
      .sort((left, right) => String(right.time || "").localeCompare(String(left.time || "")))
      .slice(0, 5);
    recent.innerHTML = outputs.length
      ? outputs.map((item) => `
        <button type="button" class="rail-list-item" data-nav="${item.page}">
          <span>${item.type}</span>
          <strong>${escapeHtml(item.title || "未命名")}</strong>
        </button>
      `).join("")
      : '<div class="rail-empty">还没有生成记录</div>';
  }

  if (errors) {
    const failed = tasks.filter((task) => ["失败", "failed"].includes(task.status)).slice(0, 3);
    const failedTimelines = failedVideoProducts.slice(0, 3);
    errors.innerHTML = failed.length || failedTimelines.length
      ? [
        ...failed.map((task) => `
        <button type="button" class="rail-list-item error-item rail-task-view" data-task-id="${Number(task.id || 0)}">
          <span>任务 #${Number(task.id || 0)}</span>
          <strong>${escapeHtml(task.error || task.message || "处理失败")}</strong>
        </button>
      `),
        ...failedTimelines.map((project) => `
        <button type="button" class="rail-list-item error-item rail-video-product-open" data-video-product-id="${Number(project.project_id || project.id || 0)}">
          <span>成片 #${Number(project.project_id || project.id || 0)}</span>
          <strong>${escapeHtml(friendlyVideoProductError(project.error) || project.current_step || "成片任务失败")}</strong>
        </button>
      `),
      ].join("")
      : '<div class="rail-empty success-text">当前没有错误</div>';
  }
}

function renderWorkbenchOverview() {
  const tasks = typeof allTasks === "undefined" ? [] : allTasks;
  const directors = typeof directorProjectsState === "undefined" ? [] : directorProjectsState;
  const vfoItems = typeof vfoProjectsState === "undefined" ? [] : vfoProjectsState;
  const videoProducts = dashboardVideoProducts;

  setMetric("metricTodayVideos", tasks.filter((task) => isToday(task.created_at)).length);
  setMetric("metricTranscripts", tasks.filter((task) => task.txt_path).length);
  setMetric("metricRewrites", tasks.filter(hasRewrite).length);
  setMetric("metricAudio", dashboardAudioJobs.filter((job) => job.status === "completed").length);
  setMetric("metricDirectors", directors.filter((project) => project.status === "completed").length);
  setMetric("metricRenderPlans", vfoItems.filter((project) => project.status === "completed").length + videoProducts.filter((project) => project.status === "completed").length);
  renderDashboardTasks(tasks);
  renderRail(tasks, directors, vfoItems, dashboardAudioJobs, videoProducts);
}

async function refreshWorkbenchOverview() {
  try {
    const response = await fetch("/api/tts/jobs?limit=200");
    if (response.ok) {
      const data = await response.json();
      dashboardAudioJobs = Array.isArray(data.jobs) ? data.jobs : [];
    }
  } catch {
    dashboardAudioJobs = [];
  }

  try {
    const response = await fetch("/api/video-product/projects?limit=100");
    if (response.ok) {
      const data = await response.json();
      dashboardVideoProducts = Array.isArray(data.projects) ? data.projects : [];
    }
  } catch {
    dashboardVideoProducts = [];
  }

  // 加载 Provider 状态
  try {
    const pr = await fetch("/api/providers/list");
    if (pr.ok) {
      const data = await pr.json();
      const statusEl = document.querySelector("#workbenchConnectionStatus span:last-child");
      const online = data.providers?.filter(p => p.health?.status === "online").length || 0;
      if (statusEl) statusEl.textContent = online > 0 ? `${online} 模型在线` : "系统正常";
    }
  } catch {}

  // 加载图片统计
  try {
    const ir = await fetch("/api/image/stats");
    if (ir.ok) {
      const data = await ir.json();
      if (data.assets > 0) setMetric("metricImages", data.assets);
    }
  } catch {}

  renderWorkbenchOverview();
}

async function updateWorkbenchConnection() {
  const status = document.querySelector("#workbenchConnectionStatus");
  if (!status) return;
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) throw new Error("offline");
    status.classList.add("online");
    status.classList.remove("offline");
    status.querySelector("span").textContent = "系统正常";
  } catch {
    status.classList.remove("online");
    status.classList.add("offline");
    status.querySelector("span").textContent = "后台未连接";
  }
}

async function openLatestOutputLocation() {
  const candidates = [
    typeof activeVideoProductProject !== "undefined" ? activeVideoProductProject?.output_dir : "",
    dashboardVideoProducts?.[0]?.output_dir || "",
    typeof activeVfoProject !== "undefined" ? activeVfoProject?.render_plan_path : "",
    typeof vfoProjectsState !== "undefined" ? vfoProjectsState?.[0]?.render_plan_path : "",
    typeof activeDirectorProject !== "undefined" ? activeDirectorProject?.storyboard_path : "",
    typeof directorProjectsState !== "undefined" ? directorProjectsState?.[0]?.storyboard_path : "",
    typeof lastRewritePath !== "undefined" ? lastRewritePath : "",
  ].filter(Boolean);
  if (!candidates.length) {
    navigateWorkbench("files");
    return;
  }
  try {
    await fetch("/api/open-path", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filePath: candidates[0] }),
    });
  } catch {
    navigateWorkbench("files");
  }
}

async function openRailVideoProduct(projectId) {
  const id = Number(projectId || 0);
  if (!id) return;
  navigateWorkbench("vfo", { preserveScroll: true });
  if (typeof openVideoProductProject === "function") {
    await openVideoProductProject(id);
  }
  document.querySelector("#videoProductCenter")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openRailVideoProductLocation(projectId) {
  const id = Number(projectId || 0);
  const project = dashboardVideoProducts.find((item) => Number(item.project_id || item.id || 0) === id);
  if (!project?.output_dir) {
    await openRailVideoProduct(id);
    return;
  }
  const response = await fetch("/api/open-path", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath: project.output_dir }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "打开成片输出目录失败");
  }
}

async function forceRailVideoProduct(projectId) {
  const id = Number(projectId || 0);
  if (!id) return;
  const project = dashboardVideoProducts.find((item) => railVideoProductId(item) === id);
  if (!project) throw new Error("没有找到要强制执行的成片任务。");
  const reason = project.error || (project.blockers || []).join("；") || "未知风险";
  if (!isForceableVideoProductError(reason)) {
    throw new Error("这个失败不是软拦截，不能强制执行。请先补齐缺失的音频、导演稿或图片。");
  }
  if (!window.confirm(`当前成片任务有风险：\n\n${reason}\n\n确定后将用原参数重新创建强制执行任务，并在报告里保留风险记录。是否继续？`)) return;
  const metadata = project.metadata && typeof project.metadata === "object" ? project.metadata : {};
  const body = {
    ...metadata,
    projectId: metadata.video_project_id || metadata.projectId || "",
    video_project_id: metadata.video_project_id || metadata.projectId || "",
    source_director_project_id: project.source_director_project_id || metadata.source_director_project_id || metadata.director_project_id || 0,
    audio_asset_id: project.audio_asset_id || metadata.audio_asset_id || metadata.tts_job_id || 0,
    platform: project.platform || metadata.platform || "douyin",
    output_type: project.output_type || metadata.output_type || "jianying_template",
    ratio: project.ratio || metadata.ratio || "9:16",
    resolution: project.resolution || metadata.resolution || "1080x1920",
    force_execution: true,
    force_timeline_blockers: true,
    force_quality_review: true,
  };
  const data = await fetchJson("/api/video-product/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  setRailActionStatus(`已确认风险并重新创建强制执行任务 #${data.project?.project_id || data.project?.id || ""}`);
  await refreshVideoProductSurfaces();
}

function setRailActionStatus(message) {
  if (typeof batchStatus !== "undefined") batchStatus.textContent = message;
  if (typeof resultBox !== "undefined") resultBox.textContent = message;
}

async function refreshVideoProductSurfaces() {
  const refreshJobs = [];
  if (typeof loadVideoProductProjects === "function") {
    refreshJobs.push(loadVideoProductProjects());
  }
  if (window.videoOutputModule?.loadVideoProductProjects) {
    refreshJobs.push(window.videoOutputModule.loadVideoProductProjects());
  }
  await Promise.allSettled(refreshJobs);
  await refreshWorkbenchOverview();
}

async function deleteRailVideoProduct(projectId) {
  const id = Number(projectId || 0);
  if (!id) return;
  const project = dashboardVideoProducts.find((item) => railVideoProductId(item) === id);
  if (project && railVideoProductIsRunning(project)) {
    throw new Error("成片任务正在处理，完成或失败后才能删除。");
  }
  const title = project?.metadata?.title || `成片 #${id}`;
  if (!window.confirm(`确定删除「${title}」的成片记录和输出文件夹吗？\n\nMP4、字幕、封面、报告和素材包都会一起删除，此操作不可撤销。`)) return;
  const data = await fetchJson("/api/video-product/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, deleteFiles: true }),
  });
  setRailActionStatus(`已删除 ${data.deleted || 0} 条成片记录`);
  await refreshVideoProductSurfaces();
}

async function clearRailVideoProducts() {
  const deletable = dashboardVideoProducts.filter(railVideoProductCanDelete);
  if (!deletable.length) {
    setRailActionStatus("当前没有可清理的成片记录");
    return;
  }
  if (!window.confirm(`确定清理 ${deletable.length} 条已结束成片记录和对应输出文件夹吗？\n\n正在运行的任务会保留，此操作不可撤销。`)) return;
  const data = await fetchJson("/api/video-product/clear", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "all", deleteFiles: true }),
  });
  setRailActionStatus(`已清理 ${data.deleted || 0} 条成片记录`);
  await refreshVideoProductSurfaces();
}

async function clearFinishedRailTasks() {
  const tasks = typeof allTasks === "undefined" ? [] : allTasks;
  const finished = tasks.filter(railTaskIsFinished);
  if (!finished.length) {
    setRailActionStatus("当前没有可清理的完成/失败任务");
    return;
  }
  if (!window.confirm(`确定清理 ${finished.length} 条已完成和失败的任务记录吗？\n\n文件不会被删除。`)) return;
  const data = await fetchJson("/api/tasks/clear-finished", { method: "POST" });
  setRailActionStatus(`已清理 ${data.deleted || 0} 条任务记录`);
  renderTaskStats(data.summary, data.running, data.concurrency);
  renderTasks(data.tasks);
  renderWorkbenchOverview();
}

async function openRailTaskLocation(taskId) {
  const id = Number(taskId || 0);
  const task = (typeof allTasks === "undefined" ? [] : allTasks).find((item) => Number(item.id || 0) === id);
  if (!task?.video_path) {
    if (typeof batchStatus !== "undefined") batchStatus.textContent = "这个任务还没有生成视频文件";
    return;
  }

  const response = await fetch("/api/open-path", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath: task.video_path }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "打开视频位置失败");
  }
}

async function viewRailTask(taskId) {
  const id = Number(taskId || 0);
  const task = (typeof allTasks === "undefined" ? [] : allTasks).find((item) => Number(item.id || 0) === id);
  if (!task) return;
  activeRailTaskId = id;
  renderWorkbenchOverview();
  const railDetail = document.querySelector("#railTaskDetail");

  let transcript = null;
  try {
    const rows = await refreshTranscripts();
    transcript = rows.find((row) => Number(row.id || 0) === id) || null;
  } catch {
    transcript = null;
  }

  const detail = [formatTaskResult(task, 0)];
  if (transcript?.text) {
    detail.push("文案内容：", transcript.text.trim());
  } else if (task.txt_path) {
    detail.push("文案内容：", "文案文件已生成，但暂时无法读取预览。可点击“打开文案”查看文件。");
  } else {
    detail.push("文案内容：", "暂未生成文案。");
  }

  if (transcript?.ai?.summary || transcript?.ai?.hook) {
    const ai = transcript.ai;
    const aiLines = [
      ai.summary ? `摘要：${ai.summary}` : "",
      ai.hook ? `钩子：${ai.hook}` : "",
      Array.isArray(ai.painPoints) && ai.painPoints.length ? `痛点：${ai.painPoints.join("；")}` : "",
      Array.isArray(ai.tags) && ai.tags.length ? `标签：${ai.tags.join("、")}` : "",
    ].filter(Boolean);
    if (aiLines.length) detail.push("AI 分析：", aiLines.join("\n"));
  }

  const previewText = transcript?.text?.trim()
    || task.message
    || task.error
    || "暂时没有可预览的文案内容。";
  if (railDetail) {
    const meta = [
      railTaskActionLabel(task),
      task.status || "等待",
      `${railTaskProgress(task)}%`,
    ].filter(Boolean).join(" · ");
    railDetail.innerHTML = `
      <article class="rail-detail-card">
        <div class="rail-task-top">
          <span class="rail-task-id">#${Number(task.id || 0)}</span>
          <span class="status-badge ${workbenchStatusClass(task.status)}">${escapeHtml(task.status || "等待")}</span>
        </div>
        <strong title="${escapeHtml(railTaskTitle(task))}">${escapeHtml(railTaskTitle(task))}</strong>
        <small>${escapeHtml(meta)}</small>
        <pre>${escapeHtml(previewText)}</pre>
      </article>
    `;
  }

  activeResultAction = "";
  resultBox.textContent = detail.join("\n\n");
  setTranscriptActions(transcript?.text || "", task.txt_path || "");
}

function bindWorkbenchInteractions() {
  document.addEventListener("click", (event) => {
    const railView = event.target.closest(".rail-task-view");
    const railOpen = event.target.closest(".rail-task-open");
    const railPause = event.target.closest(".rail-task-pause");
    const railDelete = event.target.closest(".rail-task-delete");
    const videoProductOpen = event.target.closest(".rail-video-product-open");
    const videoProductFolder = event.target.closest(".rail-video-product-folder");
    const videoProductDelete = event.target.closest(".rail-video-product-delete");
    const videoProductForce = event.target.closest(".rail-video-product-force");
    const videoProductClear = event.target.closest(".rail-video-product-clear");
    const railTaskClearFinished = event.target.closest(".rail-task-clear-finished");
    if (videoProductClear) {
      event.preventDefault();
      clearRailVideoProducts().catch((error) => {
        setRailActionStatus(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    if (railTaskClearFinished) {
      event.preventDefault();
      clearFinishedRailTasks().catch((error) => {
        setRailActionStatus(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    if (videoProductDelete) {
      event.preventDefault();
      deleteRailVideoProduct(videoProductDelete.dataset.videoProductId).catch((error) => {
        setRailActionStatus(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    if (videoProductForce) {
      event.preventDefault();
      forceRailVideoProduct(videoProductForce.dataset.videoProductId).catch((error) => {
        setRailActionStatus(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    if (videoProductOpen) {
      event.preventDefault();
      openRailVideoProduct(videoProductOpen.dataset.videoProductId).catch((error) => {
        resultBox.textContent = error instanceof Error ? error.message : String(error);
      });
      return;
    }
    if (videoProductFolder) {
      event.preventDefault();
      openRailVideoProductLocation(videoProductFolder.dataset.videoProductId).catch((error) => {
        resultBox.textContent = error instanceof Error ? error.message : String(error);
      });
      return;
    }
    if (railView) {
      event.preventDefault();
      viewRailTask(railView.dataset.taskId).catch((error) => {
        resultBox.textContent = error instanceof Error ? error.message : String(error);
      });
      return;
    }
    if (railOpen) {
      event.preventDefault();
      openRailTaskLocation(railOpen.dataset.taskId).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        resultBox.textContent = message;
        if (typeof batchStatus !== "undefined") batchStatus.textContent = message;
      });
      return;
    }
    if (railPause) {
      event.preventDefault();
      pauseTask(railPause.dataset.taskId).catch((error) => {
        if (typeof batchStatus !== "undefined") batchStatus.textContent = error instanceof Error ? error.message : String(error);
      });
      return;
    }
    if (railDelete) {
      event.preventDefault();
      deleteTask(railDelete.dataset.taskId).catch((error) => {
        if (typeof batchStatus !== "undefined") batchStatus.textContent = error instanceof Error ? error.message : String(error);
      });
      return;
    }

    const nav = event.target.closest("[data-nav]");
    if (nav) {
      navigateWorkbench(nav.dataset.nav, {
        focusPrimary: nav.dataset.nav === "collector" && activeWorkbenchPage === "dashboard",
      });
    }

    if (event.target.closest(".transcript-analyze")) navigateWorkbench("analysis");
    if (event.target.closest(".transcript-rewrite")) navigateWorkbench("rewrite");
    if (event.target.closest(".rewrite-tts-one, .voice-use")) navigateWorkbench("tts");
    if (event.target.closest(".rewrite-director-one")) navigateWorkbench("video-output");
    if (event.target.closest("#sendDirectorToVfo")) navigateWorkbench("vfo");
    if (event.target.closest("#closeAnalysis, #closeRewrite")) navigateWorkbench("collector", { collectorTab: "copybank" });
  });

  document.querySelector("#headerOpenDownloads")?.addEventListener("click", () => {
    document.querySelector("#openFolder")?.click();
  });
  document.querySelector("#headerOpenOutputs")?.addEventListener("click", () => {
    openLatestOutputLocation();
  });
}

function startWorkbenchObservers() {
  const observed = [
    document.querySelector("#tasksTable"),
    document.querySelector("#directorProjects"),
    document.querySelector("#vfoProjects"),
    document.querySelector("#ttsHistory"),
  ].filter(Boolean);
  const observer = new MutationObserver(() => renderWorkbenchOverview());
  observed.forEach((element) => observer.observe(element, { childList: true, subtree: true }));

  refreshWorkbenchOverview();
  updateWorkbenchConnection();
  workbenchOverviewTimer = window.setInterval(() => {
    refreshWorkbenchOverview();
    updateWorkbenchConnection();
  }, 15000);
}

function initWorkbench() {
  buildWorkbenchInformationArchitecture();
  setupCollectorTabs();
  bindWorkbenchInteractions();
  startWorkbenchObservers();

  // WebSocket 进度监听
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${location.port}/ws/progress`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "video-product") {
        if (typeof loadVideoProductProjects === "function") loadVideoProductProjects().catch(() => {});
        refreshWorkbenchOverview();
        return;
      }
      if (data.taskId) {
        refreshTasks().catch(() => renderWorkbenchOverview());
      }
    };
    ws.onerror = () => {}; // 静默处理
  } catch {}
  window.addEventListener("hashchange", () => {
    const pageId = window.location.hash.replace(/^#/, "");
    navigateWorkbench(pageId || "dashboard", { instant: true, fromHash: true });
  });
  const initialPage = window.location.hash.replace(/^#/, "") || localStorage.getItem("short-video-workbench-page") || "dashboard";
  navigateWorkbench(initialPage, { instant: true, fromHash: true });
}

function setupImageStudio() {
  const panel = document.getElementById("imageStudioPanel");
  if (!panel) return;
  panel.hidden = false;
  const promptInput = document.getElementById("imagePrompt");
  const providerSelect = document.getElementById("imageProviderSelect");
  const configStatus = document.getElementById("imageConfigStatus");
  const importPanel = document.getElementById("imageDirectorImportPanel");
  const importSelect = document.getElementById("imageDirectorPromptSelect");
  let imageProviderConfigs = [];
  const imagePreviewGroups = new Map();
  let activeImagePreview = { groupId: "", index: 0 };

  function imageAssetPath(asset = {}) {
    return asset.original_path || asset.file_path || asset.path || "";
  }

  function closeImageAssetPreview() {
    const modal = document.getElementById("imageAssetPreviewModal");
    if (modal) modal.hidden = true;
  }

  function ensureImagePreviewModal() {
    let modal = document.getElementById("imageAssetPreviewModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "imageAssetPreviewModal";
    modal.className = "image-preview-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="image-preview-backdrop" data-image-preview-close></div>
      <div class="image-preview-dialog" role="dialog" aria-modal="true" aria-label="图片预览">
        <div class="image-preview-head">
          <strong id="imagePreviewTitle">图片预览</strong>
          <button class="btn-sm" type="button" data-image-preview-close>关闭</button>
        </div>
        <div class="image-preview-body">
          <button class="image-preview-nav prev" type="button" data-image-preview-prev>上一张</button>
          <img id="imagePreviewFull" src="" alt="图片预览" />
          <button class="image-preview-nav next" type="button" data-image-preview-next>下一张</button>
        </div>
        <div class="image-preview-foot">
          <span id="imagePreviewCounter"></span>
          <button class="btn-sm" type="button" id="imagePreviewOpenOriginal">打开原图</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-image-preview-close]")) closeImageAssetPreview();
      if (event.target.closest("[data-image-preview-prev]")) showImageAssetPreview(activeImagePreview.groupId, activeImagePreview.index - 1);
      if (event.target.closest("[data-image-preview-next]")) showImageAssetPreview(activeImagePreview.groupId, activeImagePreview.index + 1);
    });
    document.addEventListener("keydown", (event) => {
      if (modal.hidden) return;
      if (event.key === "Escape") closeImageAssetPreview();
      if (event.key === "ArrowLeft") showImageAssetPreview(activeImagePreview.groupId, activeImagePreview.index - 1);
      if (event.key === "ArrowRight") showImageAssetPreview(activeImagePreview.groupId, activeImagePreview.index + 1);
    });
    return modal;
  }

  function showImageAssetPreview(groupId, index) {
    const rows = imagePreviewGroups.get(groupId) || [];
    if (!rows.length || index < 0 || index >= rows.length) return;
    activeImagePreview = { groupId, index };
    const modal = ensureImagePreviewModal();
    const asset = rows[index];
    const filePath = imageAssetPath(asset);
    const url = `/api/image/file?path=${encodeURIComponent(filePath)}`;
    modal.querySelector("#imagePreviewTitle").textContent = asset.folder_name || asset.filename || `图片 ${index + 1}`;
    modal.querySelector("#imagePreviewFull").src = url;
    modal.querySelector("#imagePreviewCounter").textContent = `${index + 1} / ${rows.length}`;
    modal.querySelector("[data-image-preview-prev]").hidden = index === 0;
    modal.querySelector("[data-image-preview-next]").hidden = index === rows.length - 1;
    modal.querySelector("#imagePreviewOpenOriginal").onclick = () => window.open(url);
    modal.hidden = false;
  }

  // 生成数量切换
  panel.querySelectorAll(".btn-count").forEach(btn => {
    btn.addEventListener("click", () => {
      panel.querySelectorAll(".btn-count").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // 结果/资产库标签切换
  panel.querySelectorAll(".tab-link").forEach(tab => {
    tab.addEventListener("click", () => {
      panel.querySelectorAll(".tab-link").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const showAssets = tab.dataset.tab === "assets";
      document.getElementById("imageResultsGrid").style.display = showAssets ? "none" : "grid";
      document.getElementById("imageAssetsGrid").style.display = showAssets ? "grid" : "none";
      if (showAssets) loadImageAssets();
      refreshImageConfigStatus();
    });
  });

  function setStatus(msg, tone = "") {
    const el = document.getElementById("imageGenerateStatus");
    if (el) {
      el.textContent = msg;
      el.dataset.tone = tone;
    }
  }

  function setImageProgress(value = 0, label = "等待生成", visible = true) {
    const progress = Math.max(0, Math.min(100, Number(value || 0)));
    const wrap = document.getElementById("imageProgress");
    const bar = document.getElementById("imageProgressBar");
    const text = document.getElementById("imageProgressLabel");
    const percent = document.getElementById("imageProgressPercent");
    if (wrap) wrap.hidden = !visible;
    if (bar) bar.style.width = `${progress}%`;
    if (text) text.textContent = label;
    if (percent) percent.textContent = `${progress}%`;
  }

  function selectedImportedPrompt() {
    if (!importSelect || !importedDirectorImagePrompts.length) return null;
    const sceneKey = importSelect.value;
    return importedDirectorImagePrompts.find((item) => String(item.scene) === String(sceneKey)) || importedDirectorImagePrompts[0] || null;
  }

  function applyImportedPrompt(item = selectedImportedPrompt()) {
    if (!item) return false;
    promptInput.value = item.prompt || "";
    activeDirectorImageImport = item;
    setStatus(`已载入 ${item.title || `Scene ${item.scene}`} 的图片提示词。`, "info");
    return true;
  }

  function renderImportedPrompts() {
    if (!importPanel || !importSelect) return;
    importPanel.hidden = importedDirectorImagePrompts.length === 0;
    importSelect.innerHTML = importedDirectorImagePrompts.map((item) => `
      <option value="${escapeHtml(item.scene)}">${escapeHtml(item.title || `Scene ${item.scene}`)} · ${escapeHtml((item.subtitle || item.prompt || "").slice(0, 24))}</option>
    `).join("");
    if (activeDirectorImageImport?.scene) importSelect.value = String(activeDirectorImageImport.scene);
  }

  function imageLinkMetadata(result, { prompt = "", aspectRatio = "9:16", imported = null, providerId = "" } = {}) {
    const activeAudio = activeVideoProject?.selectedTtsAudio || {};
    return {
      path: result.imagePath || result.file_path || "",
      ratio: aspectRatio,
      style: imported?.style || imported?.visualStyle || directorVisualStyle?.value || "",
      useCase: activeVideoProject?.videoType || "",
      source: "ai_generated",
      sourceType: imported ? "director" : "manual",
      sourceId: imported ? `${imported.projectId || ""}:${imported.scene || ""}` : "",
      directorProjectId: imported?.projectId || 0,
      sceneIndex: imported?.scene || "",
      audioAssetId: activeAudio.id || activeAudio.assetId || "",
      prompt,
      provider: providerId,
      model: result.model || "",
      status: "ready",
    };
  }

  function isImageNetworkFetchError(error) {
    const message = error instanceof Error ? error.message : String(error || "");
    return error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(message);
  }

  function formatImageFetchError(error, action = "图片 API 请求") {
    const message = error instanceof Error ? error.message : String(error || "未知错误");
    if (isImageNetworkFetchError(error)) {
      return `${action}失败：本地服务连接断开或页面端口已失效。请确认启动脚本仍在运行，并用当前地址刷新页面：${window.location.origin}`;
    }
    return `${action}失败：${message}`;
  }

  async function assertImageApiReachable() {
    const res = await fetch("/api/image/stats", { cache: "no-store" });
    if (!res.ok) throw new Error(`图片 API 预检 HTTP ${res.status}`);
    await res.json().catch(() => null);
  }

  async function waitForImageJob(jobId, { label = "图片生成中" } = {}) {
    let latest = null;
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const res = await fetch(`/api/image/job?id=${encodeURIComponent(jobId)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      latest = data.job;
      const progress = Math.max(0, Math.min(100, Number(latest.progress || 0)));
      setImageProgress(progress, `${label} · ${latest.status || "生成中"}`);
      if (!["等待", "生成中", "processing", "pending"].includes(String(latest.status || ""))) return latest;
    }
  }

  function imageResultsFromJob(job = {}) {
    return (Array.isArray(job.image_paths) ? job.image_paths : []).map((imagePath, index) => ({
      index,
      success: true,
      assetId: "",
      filename: imagePath.split(/[\\/]/).pop() || `image-${index + 1}`,
      imagePath,
    }));
  }

  async function linkGeneratedImagesToCurrentProject(results = [], context = {}) {
    const success = (Array.isArray(results) ? results : []).filter((item) => item?.success && item.assetId);
    if (!success.length || !currentVideoProjectId()) return 0;
    let linked = 0;
    for (const result of success) {
      await linkCurrentProjectAsset(
        "image",
        result.assetId,
        result.filename || `AI 图片 ${result.assetId}`,
        imageLinkMetadata(result, context),
      );
      linked += 1;
    }
    await Promise.allSettled([
      refreshProjectAssets(),
      refreshProjectReadiness(),
      typeof loadVideoProductSources === "function" ? loadVideoProductSources() : Promise.resolve(),
      window.videoOutputModule?.loadVideoProductSources ? window.videoOutputModule.loadVideoProductSources() : Promise.resolve(),
    ]);
    return linked;
  }

  async function refreshImageConfigStatus() {
    if (!configStatus) return;
    try {
      const res = await fetch("/api/settings/providers", { cache: "no-store" });
      const data = await res.json();
      imageProviderConfigs = (data.providers || []).filter((item) => item.group === "图片生成");
      const defaultProvider = imageProviderConfigs.find((item) => item.activeDefault) || imageProviderConfigs[0] || null;
      if (providerSelect) {
        const previous = providerSelect.value;
        providerSelect.innerHTML = imageProviderConfigs.map((provider) => `
          <option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)} · ${escapeHtml(provider.model || "默认模型")}${provider.configured ? "" : "（未配置）"}</option>
        `).join("");
        providerSelect.value = imageProviderConfigs.some((item) => item.id === previous)
          ? previous
          : defaultProvider?.id || "";
      }
      const provider = imageProviderConfigs.find((item) => item.id === providerSelect?.value) || defaultProvider;
      if (!provider) {
        configStatus.dataset.state = "error";
        configStatus.querySelector("span").textContent = "没有找到图片生成服务，请先到系统设置配置。";
        return;
      }
      configStatus.dataset.state = provider.configured ? "ok" : "error";
      configStatus.querySelector("span").textContent = provider.configured
        ? `图片 API 已配置：${provider.label} / ${provider.model || "默认模型"}`
        : `图片 API 未配置：请到系统设置里的“图片生成 / ${provider.label}”保存 API Key。`;
    } catch (error) {
      configStatus.dataset.state = "error";
      configStatus.querySelector("span").textContent = formatImageFetchError(error, "图片 API 状态读取");
    }
  }

  importSelect?.addEventListener("change", () => applyImportedPrompt());
  document.getElementById("useDirectorPrompt")?.addEventListener("click", () => applyImportedPrompt());
  document.getElementById("generateDirectorPromptImage")?.addEventListener("click", () => {
    if (applyImportedPrompt()) document.getElementById("imageGenerateBtn")?.click();
  });
  document.getElementById("exportDirectorPromptChatGptSet")?.addEventListener("click", () => {
    const projectId = activeDirectorImageImport?.projectId || importedDirectorImagePrompts[0]?.projectId || 0;
    if (!projectId) {
      setStatus("请先从 AI 导演导入分镜。", "error");
      return;
    }
    window.open(`/api/director/export?id=${encodeURIComponent(projectId)}&format=chatgpt`, "_blank", "noopener,noreferrer");
    setStatus("已打开 ChatGPT 网页生图提示词导出文件。", "ok");
  });
  document.getElementById("generateDirectorPromptSet")?.addEventListener("click", async () => {
    const projectId = activeDirectorImageImport?.projectId || importedDirectorImagePrompts[0]?.projectId || 0;
    if (!projectId) {
      setStatus("请先从 AI 导演导入分镜。", "error");
      return;
    }
    const providerId = providerSelect?.value || "volcengine_ark";
    const provider = imageProviderConfigs.find((item) => item.id === providerId);
    if (provider && !provider.configured) {
      setStatus(`${provider.label} 未配置 API Key，请先到系统设置保存。`, "error");
      return;
    }
    const btn = document.getElementById("generateDirectorPromptSet");
    const aspectRatio = document.getElementById("imageAspectRatio")?.value || "9:16";
    btn.disabled = true;
    btn.textContent = "整套生成中...";
    setImageProgress(8, "整套分镜图排队中");
    setStatus(`正在生成整套分镜图：${importedDirectorImagePrompts.length || ""} 个镜头，统一风格锁定中...`, "info");
    try {
      await assertImageApiReachable();
      setImageProgress(22, "图片 API 已连接");
      const res = await fetch("/api/image/generate-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          projectId,
          aspectRatio,
          countPerScene: 1,
          async: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      const job = await waitForImageJob(data.jobId, { label: "整套分镜图生成中" });
      setImageProgress(100, "整套分镜图完成");
      await loadImageAssets();
      const results = imageResultsFromJob(job);
      const success = results.length;
      const failed = Math.max(0, Number(job.count_requested || 0) - success);
      setStatus(
        `整套分镜图完成：成功 ${success} 张，失败 ${failed} 张`
          + (job.error ? `；错误：${String(job.error).slice(0, 120)}` : ""),
        success > 0 ? "ok" : "error",
      );
      renderResults(results, `Director #${projectId} 整套分镜图`);
    } catch (error) {
      setImageProgress(100, "整套分镜图失败");
      setStatus(formatImageFetchError(error, "整套分镜图生成"), "error");
      await refreshImageConfigStatus();
    } finally {
      btn.disabled = false;
      btn.textContent = "一键生成整套分镜图";
    }
  });
  document.getElementById("clearDirectorPrompts")?.addEventListener("click", () => {
    importedDirectorImagePrompts = [];
    activeDirectorImageImport = null;
    renderImportedPrompts();
    setStatus("已清空导演镜头导入。", "info");
  });
  document.getElementById("openImageSettings")?.addEventListener("click", () => {
    navigateWorkbench("settings", { preserveScroll: true });
    const providerId = providerSelect?.value || "volcengine_ark";
    document.querySelector(`[data-provider-row="${CSS.escape(providerId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  providerSelect?.addEventListener("change", () => refreshImageConfigStatus());

  window.importDirectorPromptsToImage = ({ projectId, title, ratio, scenes, preferredScene = "" } = {}) => {
    importedDirectorImagePrompts = (Array.isArray(scenes) ? scenes : [])
      .map((scene, index) => ({
        projectId,
        scene: scene.scene || index + 1,
        title: scene.title || `Scene ${scene.scene || index + 1}`,
        prompt: String(scene.prompt || "").trim(),
        motionPrompt: String(scene.motionPrompt || "").trim(),
        subtitle: String(scene.subtitle || "").trim(),
        style: String(scene.style || scene.visualStyle || "").trim(),
      }))
      .filter((scene) => scene.prompt);
    if (!importedDirectorImagePrompts.length) return false;
    activeDirectorImageImport = importedDirectorImagePrompts.find((item) => String(item.scene) === String(preferredScene))
      || importedDirectorImagePrompts[0];
    renderImportedPrompts();
    applyImportedPrompt(activeDirectorImageImport);
    const ratioSelect = document.getElementById("imageAspectRatio");
    if (ratioSelect && ["9:16", "16:9", "1:1"].includes(String(ratio || ""))) ratioSelect.value = String(ratio);
    navigateWorkbench("image-studio", { preserveScroll: true });
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus(`已从“${title || "导演稿"}”导入 ${importedDirectorImagePrompts.length} 个镜头图片提示词。`, "ok");
    return true;
  };

  refreshImageConfigStatus();

  // 生成按钮
  document.getElementById("imageGenerateBtn").addEventListener("click", async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) { setStatus("请先输入图片描述"); return; }

    const count = parseInt(panel.querySelector(".btn-count.active").dataset.count);
    const aspectRatio = document.getElementById("imageAspectRatio").value;
    const btn = document.getElementById("imageGenerateBtn");
    const imported = activeDirectorImageImport?.prompt === prompt ? activeDirectorImageImport : null;
    const providerId = providerSelect?.value || "volcengine_ark";
    const provider = imageProviderConfigs.find((item) => item.id === providerId);

    if (provider && !provider.configured) {
      setStatus(`${provider.label} 未配置 API Key，请先到系统设置保存。`, "error");
      return;
    }
    btn.disabled = true;
    btn.textContent = "生成中...";
    setImageProgress(8, "图片生成排队中");
    setStatus(`正在通过 ${provider?.label || "图片 Provider"} 生成 ${count} 张图片...`);

    try {
      await assertImageApiReachable();
      setImageProgress(25, "图片 API 已连接");
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          prompt,
          count,
          aspectRatio,
          sourceType: imported ? "director" : "manual",
          sourceId: imported ? `${imported.projectId || ""}:${imported.scene || ""}` : "",
          async: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      const job = await waitForImageJob(data.jobId, { label: "图片生成中" });
      const results = imageResultsFromJob(job);
      const success = results.length;
      const failed = Math.max(0, Number(job.count_requested || count) - success);
      setImageProgress(100, success > 0 ? "图片生成完成" : "图片生成失败");
      await loadImageAssets();
      if (success > 0) {
        setStatus(
          `生成完成：成功 ${success} 张`
            + (failed > 0 ? `，失败 ${failed} 张` : "")
            + "，已保存到图片资产库",
          "ok",
        );
        renderResults(results, prompt);
      } else {
        setStatus(`生成失败：${job.error || data.error || "没有成功生成图片"}`, "error");
        renderResults([{ success: false, error: job.error || data.error || "没有成功生成图片", prompt }], prompt);
      }
    } catch (e) {
      setImageProgress(100, "图片生成失败");
      setStatus(formatImageFetchError(e, "图片生成请求"), "error");
      await refreshImageConfigStatus();
    } finally {
      btn.disabled = false;
      btn.textContent = "生成图片";
    }
  });

  function renderResults(results, sourcePrompt = "") {
    const grid = document.getElementById("imageResultsGrid");
    if (!results.length) { grid.innerHTML = '<div class="empty-state">无结果</div>'; return; }
    const hasSuccess = results.some((item) => item.success && item.assetId);
    grid.innerHTML = `${hasSuccess ? '<div class="image-result-toolbar"><button class="primary small" type="button" id="importImagesToVideoProduct">一键导入视频成片</button></div>' : ""}${
      results.map((r, i) => {
      const safePrompt = String(sourcePrompt || r.prompt || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      if (!r.success) return `<div class="img-card error">
        <div class="img-meta"><span>第${i + 1}张生成失败</span><small>${escapeHtml(r.error || "失败")}</small></div>
        <div class="img-actions">
          <button class="btn-sm danger-action" type="button" onclick="this.closest('.img-card').remove()">删除</button>
          <button class="btn-sm" type="button" onclick="document.getElementById('imagePrompt').value='${safePrompt}';document.getElementById('imageGenerateBtn').click()">重新生成</button>
        </div>
      </div>`;
      const originalUrl = `/api/image/file?path=${encodeURIComponent(r.imagePath || "")}`;
      const thumbUrl = r.thumbnailUrl || `/api/image/thumbnail?width=360&path=${encodeURIComponent(r.imagePath || "")}`;
      return `<div class="img-card" data-asset-id="${r.assetId || ""}">
        <button class="img-preview" type="button" onclick="window.open('${originalUrl}')">
          <img src="${thumbUrl}" alt="生成图片缩略图" loading="lazy" />
        </button>
        <div class="img-actions">
          <button class="btn-sm" type="button" onclick="window.open('${originalUrl}')">预览原图</button>
          <button class="btn-sm" type="button" onclick="fetch('/api/image/assets/${r.assetId}/delete',{method:'POST'}).then(()=>this.closest('.img-card').remove())">删除</button>
          <button class="btn-sm" type="button" onclick="document.getElementById('imagePrompt').value='${safePrompt}';document.getElementById('imageGenerateBtn').click()">重新生成</button>
        </div>
      </div>`;
    }).join("")}`;
    document.getElementById("importImagesToVideoProduct")?.addEventListener("click", () => {
      navigateWorkbench("video-output", { preserveScroll: true });
      Promise.allSettled([
        window.videoOutputModule?.loadVideoProductSources?.(),
        typeof loadVideoProductSources === "function" ? loadVideoProductSources() : Promise.resolve(),
      ]).then(() => {
        window.videoOutputModule?.previewVideoProductTimeline?.().catch?.(() => {});
      });
    });
  }

  async function loadImageAssets() {
    const grid = document.getElementById("imageAssetsGrid");
    try {
      const res = await fetch("/api/image/assets");
      const data = await res.json();
      const assets = data.assets || [];
      if (!assets.length) { grid.innerHTML = '<div class="empty-state">暂无保存的图片资产</div>'; return; }
      const groups = new Map();
      imagePreviewGroups.clear();
      for (const asset of assets) {
        const sourceId = String(asset.source_id || "");
        const projectKey = sourceId.includes(":") ? sourceId.split(":")[0] : "";
        const folderName = String(asset.folder_name || "").trim();
        const label = folderName || (projectKey ? `导演项目 #${projectKey}` : `手动/通用素材 · ${(asset.created_at || "").slice(0, 10)}`);
        const groupKey = `${label}::${asset.folder_path || projectKey || "local"}`;
        if (!groups.has(groupKey)) groups.set(groupKey, { label, rows: [] });
        groups.get(groupKey).rows.push(asset);
      }
      grid.innerHTML = [...groups.values()].map(({ label, rows }, groupIndex) => {
        const groupId = `asset-group-${groupIndex}`;
        const sortedRows = rows
          .sort((a, b) => (Number(a.scene_index || 0) - Number(b.scene_index || 0)) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
        imagePreviewGroups.set(groupId, sortedRows);
        return `
        <section class="image-asset-group">
          <div class="image-asset-group-title"><strong>${escapeHtml(label)}</strong><span>${rows.length} 张</span></div>
          <div class="image-asset-group-grid">
            ${sortedRows.map((a, assetIndex) => `
              <div class="img-card">
                <button class="img-preview" type="button" data-image-preview-group="${groupId}" data-image-preview-index="${assetIndex}">
                  <img src="${a.thumbnail_url || `/api/image/thumbnail?width=360&path=${encodeURIComponent(imageAssetPath(a))}`}" alt="图片资产缩略图" loading="lazy" />
                </button>
                <div class="img-meta">
                  <span>#${Number(a.scene_index || 0) || "-"} ${(a.prompt || "").slice(0, 30)}</span>
                  <span class="text-xs text-secondary">${(a.created_at || "").slice(0, 10)} · ${a.width || 1080}x${a.height || 1080}</span>
                </div>
                <div class="img-actions">
                  <button class="btn-sm" type="button" data-image-preview-group="${groupId}" data-image-preview-index="${assetIndex}">预览原图</button>
                  <button class="btn-sm" onclick="document.getElementById('imagePrompt').value='${String(a.prompt || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}';document.getElementById('imageGenerateBtn').click()">重新生成</button>
                  <button class="btn-sm danger-action" onclick="fetch('/api/image/assets/${a.id}/delete',{method:'POST'}).then(()=>this.closest('.img-card').remove())">删除</button>
                </div>
              </div>
            `).join("")}
          </div>
        </section>
      `;
      }).join("");
    } catch (e) {
      grid.innerHTML = `<div class="empty-state">加载失败: ${e.message}</div>`;
    }
  }

  // 页面切换到 imageStudio 时刷新资产
  const origNavigate = window.navigateWorkbench;
  const navInterceptor = (pageId) => {
    if (pageId === "image-studio") {
      loadImageAssets();
    }
  };
  document.addEventListener("click", (e) => {
    const previewTrigger = e.target.closest("[data-image-preview-group]");
    if (previewTrigger) {
      e.preventDefault();
      showImageAssetPreview(previewTrigger.dataset.imagePreviewGroup, Number(previewTrigger.dataset.imagePreviewIndex || 0));
      return;
    }
    const nav = e.target.closest("[data-nav]");
    if (nav && nav.dataset.nav === "image-studio") {
      setTimeout(() => {
        loadImageAssets();
        refreshImageConfigStatus();
      }, 100);
    }
  });
}

function setupV2Settings() {
  const panel = document.getElementById("unifiedSettingsPanel");
  if (!panel) return;

  const providerList = document.getElementById("v2ProviderList");
  const modelMapEl = document.getElementById("v2ModelMap");
  const summaryEl = document.getElementById("v2SettingsSummary");
  const taskGuideEl = document.getElementById("v2TaskGuide");
  const saveMappingBtn = document.getElementById("v2SaveMapping");
  const saveMappingStatus = document.getElementById("saveMappingStatus");
  const refreshBtn = document.getElementById("v2RefreshSettings");
  const html = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
  const state = {
    providers: [],
    mapping: {},
    tasks: {},
  };

  const MODEL_DEFS = [
    { key: "analyze", label: "内容分析", hint: "脚本结构、受众、爆款点" },
    { key: "rewrite", label: "文案定制改写", hint: "多版本文案生成" },
    { key: "director", label: "生产线分镜", hint: "故事弧、分镜、镜头计划" },
    { key: "storyboard", label: "分镜生成", hint: "镜头拆解和画面描述" },
    { key: "image_prompt", label: "图片提示词", hint: "画面提示词和风格描述" },
    { key: "image", label: "图片生成", hint: "生成图片资产" },
    { key: "tts", label: "TTS 语音", hint: "配音和声音复刻" },
  ];

  function groupedProviders() {
    return state.providers.reduce((groups, provider) => {
      const group = provider.group || "其它";
      if (!groups[group]) groups[group] = [];
      groups[group].push(provider);
      return groups;
    }, {});
  }

  function providerStatusText(provider) {
    if (!provider.enabled) return provider.configured ? "已保存 / 预留" : "预留";
    return provider.configured ? "已配置" : "未配置";
  }

  function renderSummary() {
    const configured = state.providers.filter((provider) => provider.configured).length;
    const enabled = state.providers.filter((provider) => provider.enabled).length;
    const textDefault = state.providers.find((provider) => provider.activeDefault && provider.group === "文本模型");
    const ttsDefault = state.providers.find((provider) => provider.activeDefault && provider.group === "TTS 语音");
    summaryEl.innerHTML = `
      <div class="settings-summary-item">
        <strong>${configured}</strong>
        <span>已保存服务</span>
      </div>
      <div class="settings-summary-item">
        <strong>${enabled}</strong>
        <span>当前可用服务</span>
      </div>
      <div class="settings-summary-item wide">
        <strong>${html(textDefault?.label || "未设置")}</strong>
        <span>文本任务默认服务</span>
      </div>
      <div class="settings-summary-item wide">
        <strong>${html(ttsDefault?.label || "未设置")}</strong>
        <span>语音任务默认服务</span>
      </div>
    `;
  }

  function renderTaskGuide() {
    const tasks = Object.entries(state.tasks || {});
    taskGuideEl.innerHTML = tasks.map(([key, task]) => {
      const mapped = state.mapping[key] || {};
      const providerId = mapped.provider || "";
      const provider = state.providers.find((item) => item.id === providerId || (providerId === "qwen" && item.id === "dashscope"));
      return `
        <div class="task-guide-row">
          <div>
            <strong>${html(task.label || key)}</strong>
            <p>${html(task.purpose || "")}</p>
          </div>
          <div>
            <span>${html(provider?.label || providerId || "未设置")}</span>
            <small>${html(task.route || "")}</small>
          </div>
        </div>
      `;
    }).join("");
  }

  function providerInputTemplate(provider) {
    const datalistId = `models-${provider.id}`;
    return `
      <label>
        API Key
        <div class="secret-input-row">
          <input class="provider-input" data-field="apiKey" data-provider="${html(provider.id)}" type="password" autocomplete="off" placeholder="${provider.configured ? `已保存：${html(provider.apiKeyMask || "已脱敏")}，留空不修改` : "粘贴 API Key"}" />
          <button class="ghost small" type="button" data-toggle-secret="${html(provider.id)}">显示</button>
        </div>
      </label>
      ${provider.supportsBaseUrl ? `
        <label>
          Base URL
          <input class="provider-input" data-field="baseUrl" data-provider="${html(provider.id)}" type="text" value="${html(provider.baseUrl || "")}" placeholder="服务地址" />
        </label>
      ` : ""}
      ${provider.supportsWorkspace ? `
        <label>
          Workspace ID
          <input class="provider-input" data-field="workspaceId" data-provider="${html(provider.id)}" type="text" value="${html(provider.workspaceId || "")}" placeholder="可选" />
        </label>
      ` : ""}
      ${provider.supportsModel ? `
        <label>
          默认模型
          <input class="provider-input" data-field="model" data-provider="${html(provider.id)}" type="text" value="${html(provider.model || "")}" placeholder="模型名" list="${datalistId}" />
          <datalist id="${datalistId}">
            ${(provider.models || []).map((model) => `<option value="${html(model)}"></option>`).join("")}
          </datalist>
        </label>
      ` : ""}
      ${provider.supportsFormat ? `
        <label>
          默认格式
          <select class="provider-input" data-field="format" data-provider="${html(provider.id)}">
            ${["mp3", "wav", "opus"].map((format) => `<option value="${format}" ${String(provider.format || "mp3") === format ? "selected" : ""}>${format.toUpperCase()}</option>`).join("")}
          </select>
        </label>
      ` : ""}
    `;
  }

  function renderProviders() {
    const groups = groupedProviders();
    providerList.innerHTML = Object.entries(groups).map(([group, providers]) => `
      <section class="provider-group">
        <div class="provider-group-title">
          <strong>${html(group)}</strong>
          <span>${providers.filter((provider) => provider.configured).length}/${providers.length} 已配置</span>
        </div>
        ${providers.map((provider) => `
          <article class="provider-row" data-provider-row="${html(provider.id)}">
            <div class="provider-main">
              <div class="provider-title-row">
                <h4>${html(provider.label)}</h4>
                <span class="provider-state ${provider.configured ? "configured" : ""}">${html(providerStatusText(provider))}</span>
              </div>
              <p>${html(provider.description || "")}</p>
              <div class="provider-meta">
                <span>功能：${html(provider.feature || "")}</span>
                <span>Key：${provider.configured ? html(provider.apiKeyMask || "已保存") : "未保存"}</span>
                <span>默认模型：${html(provider.model || provider.models?.[0] || "跟随模型中心")}</span>
                <span>备用模型：${html(provider.models?.[1] || "未设置")}</span>
              </div>
            </div>
            <div class="provider-fields">
              ${providerInputTemplate(provider)}
            </div>
            <div class="provider-actions">
              <button class="primary small" type="button" data-save-provider="${html(provider.id)}">保存</button>
              ${provider.group === "文本模型" || provider.group === "TTS 语音" ? `<button class="ghost small" type="button" data-default-provider="${html(provider.id)}">设为默认</button>` : ""}
              ${provider.group === "图片生成" ? `<button class="ghost small" type="button" data-default-provider="${html(provider.id)}">设为默认</button>` : ""}
              <button class="ghost small" type="button" data-test-provider="${html(provider.id)}">检查</button>
              ${provider.group === "图片生成" ? `<button class="ghost small" type="button" data-test-provider-sample="${html(provider.id)}">测试生成图片</button>` : ""}
              ${provider.id === "fish_audio" ? `<button class="ghost small" type="button" data-test-provider-sample="${html(provider.id)}">测试生成语音</button>` : ""}
              ${provider.applyUrl ? `<button class="ghost small" type="button" data-open-url="${html(provider.applyUrl)}">申请入口</button>` : ""}
              ${provider.balanceUrl ? `<button class="ghost small" type="button" data-open-url="${html(provider.balanceUrl)}">余额</button>` : ""}
            </div>
            <p class="provider-row-status" data-status-for="${html(provider.id)}"></p>
          </article>
        `).join("")}
      </section>
    `).join("");
  }

  function optionsForTask(taskKey) {
    if (taskKey === "image") {
      return state.providers
        .filter((provider) => provider.group === "图片生成")
        .flatMap((provider) => (provider.models?.length ? provider.models : [provider.model || ""])
          .filter(Boolean)
          .map((model) => ({ provider: provider.id, model, label: `${provider.label} / ${model}` })));
    }
    if (taskKey === "tts") {
      return state.providers
        .filter((provider) => provider.group === "TTS 语音")
        .flatMap((provider) => (provider.models?.length ? provider.models : [provider.model || ""])
          .filter(Boolean)
          .map((model) => ({
            provider: provider.id,
            model,
            label: `${provider.label} / ${model}${provider.enabled ? "" : "（预留）"}`,
          })));
    }
    const allowedForAnalyze = new Set(["dashscope", "deepseek", "openai", "siliconflow", "volcengine"]);
    return state.providers
      .filter((provider) => provider.group === "文本模型")
      .filter((provider) => taskKey !== "analyze" || allowedForAnalyze.has(provider.id))
      .flatMap((provider) => (provider.models?.length ? provider.models : [provider.model || ""])
        .filter(Boolean)
        .map((model) => ({ provider: provider.id, model, label: `${provider.label} / ${model}` })));
  }

  function renderModelMap() {
    modelMapEl.innerHTML = MODEL_DEFS.map((def) => {
      const current = state.mapping[def.key] || {};
      const options = optionsForTask(def.key);
      return `
        <div class="model-map-row">
          <div>
            <strong>${html(def.label)}</strong>
            <p>${html(def.hint)}</p>
          </div>
          <select class="model-select" data-task="${html(def.key)}">
            ${options.map((option) => `
              <option value="${html(option.provider)}|${html(option.model)}" ${current.provider === option.provider && current.model === option.model ? "selected" : ""}>
                ${html(option.label)}
              </option>
            `).join("")}
          </select>
        </div>
      `;
    }).join("");
  }

  function renderAll() {
    renderSummary();
    renderProviders();
    renderTaskGuide();
    renderModelMap();
  }

  async function loadSettingsHub() {
    try {
      const res = await fetch("/api/settings/providers", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.providers = data.providers || [];
      state.mapping = data.mapping || {};
      state.tasks = data.tasks || {};
      renderAll();
    } catch (e) {
      providerList.innerHTML = `<p class="settings-error">加载失败：${html(e.message)}</p>`;
      if (modelMapEl) modelMapEl.innerHTML = "";
    }
  }

  async function saveProvider(id, setDefault = false) {
    const row = providerList.querySelector(`[data-provider-row="${CSS.escape(id)}"]`);
    if (!row) return;
    const payload = { id, setDefault };
    row.querySelectorAll(".provider-input").forEach((input) => {
      payload[input.dataset.field] = input.value.trim();
    });
    const status = row.querySelector(`[data-status-for="${CSS.escape(id)}"]`);
    if (status) status.textContent = setDefault ? "正在设置默认服务..." : "正在保存...";
    try {
      const res = await fetch("/api/settings/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      state.providers = data.providers || state.providers;
      state.mapping = data.mapping || state.mapping;
      renderAll();
      const nextStatus = providerList.querySelector(`[data-status-for="${CSS.escape(id)}"]`);
      if (nextStatus) nextStatus.textContent = data.status?.message || "已保存。";
      if (typeof loadSettings === "function") loadSettings().catch(() => {});
      if (typeof loadDirectorConfig === "function") loadDirectorConfig().catch(() => {});
      if (typeof loadVfoConfig === "function") loadVfoConfig().catch(() => {});
    } catch (e) {
      if (status) status.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  async function testProvider(id) {
    const row = providerList.querySelector(`[data-provider-row="${CSS.escape(id)}"]`);
    const status = row?.querySelector(`[data-status-for="${CSS.escape(id)}"]`);
    if (status) status.textContent = "正在检查配置...";
    try {
      const res = await fetch("/api/settings/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (status) status.textContent = data.message || (data.ok ? "配置可用。" : "配置不可用。");
    } catch (e) {
      if (status) status.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  async function testProviderSample(id) {
    const row = providerList.querySelector(`[data-provider-row="${CSS.escape(id)}"]`);
    const status = row?.querySelector(`[data-status-for="${CSS.escape(id)}"]`);
    if (status) status.textContent = "正在执行测试生成...";
    try {
      const res = await fetch("/api/settings/test-provider-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      if (status) status.textContent = data.message || "测试生成成功。";
      if (typeof loadVideoProductSources === "function") loadVideoProductSources().catch(() => {});
      if (data.job?.id && typeof waitForSettingsTtsJob === "function") waitForSettingsTtsJob(data.job.id, id);
    } catch (e) {
      if (status) status.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  async function waitForSettingsTtsJob(jobId, providerId) {
    const row = providerList.querySelector(`[data-provider-row="${CSS.escape(providerId)}"]`);
    const status = row?.querySelector(`[data-status-for="${CSS.escape(providerId)}"]`);
    try {
      const res = await fetch(`/api/tts/job?id=${encodeURIComponent(jobId)}`, { cache: "no-store" });
      const data = await res.json();
      const job = data.job || {};
      if (job.status === "completed") {
        if (status) status.textContent = `测试生成语音成功，已保存到 TTS 记录 #${job.id}。`;
        if (typeof refreshTtsJobs === "function") refreshTtsJobs().catch(() => {});
        return;
      }
      if (job.status === "failed") {
        if (status) status.textContent = job.error || "测试语音生成失败。";
        if (typeof refreshTtsJobs === "function") refreshTtsJobs().catch(() => {});
        return;
      }
      setTimeout(() => waitForSettingsTtsJob(jobId, providerId), 1200);
    } catch (e) {
      if (status) status.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  async function saveModelMapping() {
    const mapping = {};
    modelMapEl.querySelectorAll(".model-select").forEach((select) => {
      const [provider, model] = select.value.split("|");
      mapping[select.dataset.task] = { provider, model };
    });
    saveMappingBtn.disabled = true;
    saveMappingStatus.textContent = "正在保存模型分配...";
    try {
      const res = await fetch("/api/settings/model-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      state.mapping = data.mapping || mapping;
      state.providers = data.providers || state.providers;
      renderAll();
      saveMappingStatus.textContent = "模型分配已保存，并已同步到全局默认设置。";
      if (typeof loadSettings === "function") loadSettings().catch(() => {});
      if (typeof loadDirectorConfig === "function") loadDirectorConfig().catch(() => {});
      if (typeof loadVfoConfig === "function") loadVfoConfig().catch(() => {});
    } catch (e) {
      saveMappingStatus.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      saveMappingBtn.disabled = false;
    }
  }

  providerList.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-toggle-secret]");
    if (toggle) {
      const id = toggle.dataset.toggleSecret;
      const input = providerList.querySelector(`input[data-provider="${CSS.escape(id)}"][data-field="apiKey"]`);
      if (input) {
        input.type = input.type === "password" ? "text" : "password";
        toggle.textContent = input.type === "password" ? "显示" : "隐藏";
      }
      return;
    }
    const save = event.target.closest("[data-save-provider]");
    if (save) {
      saveProvider(save.dataset.saveProvider);
      return;
    }
    const setDefault = event.target.closest("[data-default-provider]");
    if (setDefault) {
      saveProvider(setDefault.dataset.defaultProvider, true);
      return;
    }
    const test = event.target.closest("[data-test-provider]");
    if (test) {
      testProvider(test.dataset.testProvider);
      return;
    }
    const testSample = event.target.closest("[data-test-provider-sample]");
    if (testSample) {
      testProviderSample(testSample.dataset.testProviderSample);
      return;
    }
    const openUrl = event.target.closest("[data-open-url]");
    if (openUrl) {
      window.open(openUrl.dataset.openUrl, "_blank", "noopener");
    }
  });

  saveMappingBtn?.addEventListener("click", saveModelMapping);
  refreshBtn?.addEventListener("click", () => loadSettingsHub());
  loadSettingsHub();
}

window.workbenchNavigate = navigateWorkbench;
window.navigateWorkbench = navigateWorkbench;
window.workbenchOpenCollectorTab = activateCollectorTab;
window.appNavigate = window.appNavigate || ((pageId, options = {}) => navigateWorkbench(pageId, options));
initWorkbench();
