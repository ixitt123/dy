import { getJson, postJson } from "./api.js";

const STATUS_STEPS = [
  ["created", "采集素材", "collector"],
  ["collected", "提取文案", "transcript"],
  ["transcribed", "AI 改写", "rewrite"],
  ["rewritten", "TTS 配音", "tts"],
  ["voiced", "选择生产线", "tts"],
  ["directed", "素材匹配", "assets"],
  ["assets_ready", "生产线处理", "xiaohei-video"],
  ["draft_ready", "查看输出", "assets"],
  ["exported", "已导出", "assets"],
];

const state = {
  projects: [],
  activeProject: null,
  readiness: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status) {
  return {
    created: "已创建",
    collected: "已采集",
    transcribed: "文案已提取",
    rewritten: "改写已选择",
    voiced: "配音已完成",
    directed: "生产线已规划",
    assets_ready: "素材已就绪",
    draft_ready: "成片草稿已就绪",
    exported: "已导出",
  }[status] || "制作中";
}

function activeProjectId() {
  return state.activeProject?.id || localStorage.getItem("active-video-project-id") || "";
}

function replaceProject(project) {
  if (!project) return;
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) state.projects[index] = project;
  else state.projects.unshift(project);
}

function renderSelectors() {
  const selector = document.querySelector("#activeVideoProjectSelect");
  const assetFilter = document.querySelector("#projectAssetProjectFilter");
  const options = state.projects.map((project) => (
    `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)} · ${escapeHtml(statusLabel(project.status))}</option>`
  ));
  if (selector) {
    selector.innerHTML = options.length ? options.join("") : '<option value="">请先新建项目</option>';
    selector.value = state.activeProject?.id || "";
  }
  if (assetFilter) {
    const current = assetFilter.value;
    assetFilter.innerHTML = ['<option value="all">全部项目</option>', ...state.projects.map((project) => (
      `<option value="${escapeHtml(project.id)}">${escapeHtml(project.title)}</option>`
    ))].join("");
    assetFilter.value = [...assetFilter.options].some((option) => option.value === current) ? current : "all";
  }
}

export function renderProjectProgress(project = state.activeProject) {
  const container = document.querySelector("#currentVideoProjectProgress");
  const steps = document.querySelector("#currentVideoProjectSteps");
  if (!container || !steps) return;
  if (!project) {
    container.innerHTML = '<div class="empty">新建项目后，采集、文案、配音和成片会归入同一个项目。</div>';
    steps.innerHTML = '<span class="project-step empty-step">创建项目后显示完整制作流程</span>';
    return;
  }
  const currentIndex = Math.max(0, STATUS_STEPS.findIndex(([status]) => status === project.status));
  container.innerHTML = `
    <div class="project-progress-copy"><strong>${escapeHtml(statusLabel(project.status))}</strong><span>${Number(project.progress || 0)}%</span></div>
    <div class="project-progress-track"><i style="width:${Number(project.progress || 0)}%"></i></div>
    <small>${escapeHtml(project.videoType || "短视频")} · ${escapeHtml(["jianying", "jianying_template"].includes(project.outputMode) ? "剪映模板草稿" : project.outputMode === "package" ? "标准素材包" : "MP4 预览")}</small>`;
  steps.innerHTML = STATUS_STEPS.slice(0, 8).map(([, label, page], index) => `
    <button type="button" class="project-step ${index < currentIndex ? "done" : index === currentIndex ? "active" : ""}" data-nav="${page}">
      <span>${index + 1}</span><strong>${label}</strong>
    </button>`).join("");
}

export function renderNextAction(project = state.activeProject) {
  const title = document.querySelector("#projectNextActionTitle");
  const description = document.querySelector("#projectNextActionDescription");
  const button = document.querySelector("#projectNextAction");
  if (!button) return;
  if (!project) {
    if (title) title.textContent = "先新建项目";
    if (description) description.textContent = "给这条短视频命名并选择类型，系统会从采集开始带你完成全流程。";
    button.textContent = "新建短视频项目";
    button.dataset.projectAction = "create";
    delete button.dataset.nav;
    return;
  }
  const action = project.nextAction || { label: "继续制作", page: "collector" };
  if (title) title.textContent = action.label;
  if (description) description.textContent = `当前已完成“${statusLabel(project.status)}”，建议继续完成下一环节。`;
  button.textContent = action.label;
  button.dataset.nav = action.page;
  delete button.dataset.projectAction;
}

export function renderCurrentProject(project = state.activeProject) {
  const title = document.querySelector("#currentVideoProjectTitle");
  const id = document.querySelector("#currentVideoProjectId");
  if (title) title.textContent = project?.title || "还没有短视频项目";
  if (id) id.textContent = project ? `项目 ${project.id}` : "未选择";
  renderProjectProgress(project);
  renderNextAction(project);
  renderSelectors();
}

export function renderRecentProjects(projects = state.projects) {
  const container = document.querySelector("#recentVideoProjects");
  if (!container) return;
  container.innerHTML = projects.length ? projects.slice(0, 8).map((project) => `
    <article class="recent-project-card ${project.id === state.activeProject?.id ? "active" : ""}" data-project-id="${escapeHtml(project.id)}">
      <div class="recent-project-top"><span>${escapeHtml(project.videoType || "短视频")}</span><strong>${escapeHtml(statusLabel(project.status))}</strong></div>
      <h3>${escapeHtml(project.title)}</h3>
      <div class="recent-project-progress"><i style="width:${Number(project.progress || 0)}%"></i></div>
      <div class="recent-project-foot"><small>${Number(project.progress || 0)}% · ${escapeHtml(project.nextAction?.label || "继续制作")}</small><div class="history-actions"><button class="ghost small select-video-project" type="button">继续制作</button><button class="ghost small danger-action delete-video-project" type="button">删除</button></div></div>
    </article>`).join("") : '<div class="empty">还没有项目，点击“新建短视频项目”开始。</div>';
}

export async function loadProjects({ preserveSelection = true } = {}) {
  const data = await getJson("/api/projects?limit=100");
  state.projects = Array.isArray(data.projects) ? data.projects : [];
  const preferred = preserveSelection ? activeProjectId() : "";
  state.activeProject = state.projects.find((project) => project.id === preferred) || state.projects[0] || null;
  if (state.activeProject) localStorage.setItem("active-video-project-id", state.activeProject.id);
  else localStorage.removeItem("active-video-project-id");
  renderCurrentProject();
  renderRecentProjects();
  window.dispatchEvent(new CustomEvent("video-project-changed", { detail: state.activeProject }));
  return state.projects;
}

export async function createProject(input = {}) {
  const payload = Object.keys(input).length ? input : {
    title: document.querySelector("#videoProjectTitle")?.value.trim() || "新短视频项目",
    videoType: document.querySelector("#videoProjectType")?.value || "宣传类",
    outputMode: document.querySelector("#videoProjectOutputMode")?.value || "jianying_template",
  };
  const data = await postJson("/api/projects", payload);
  replaceProject(data.project);
  await setActiveProject(data.project.id, { fetch: false });
  return data.project;
}

export async function setActiveProject(projectId, options = {}) {
  if (!projectId) {
    state.activeProject = null;
  } else {
    state.activeProject = state.projects.find((project) => project.id === projectId) || null;
    if (!state.activeProject || options.fetch !== false) {
      const data = await getJson(`/api/projects/${encodeURIComponent(projectId)}`);
      state.activeProject = data.project;
      replaceProject(data.project);
    }
  }
  if (state.activeProject) localStorage.setItem("active-video-project-id", state.activeProject.id);
  else localStorage.removeItem("active-video-project-id");
  renderCurrentProject();
  renderRecentProjects();
  window.dispatchEvent(new CustomEvent("video-project-changed", { detail: state.activeProject }));
  return state.activeProject;
}

export async function deleteProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return false;
  const confirmed = window.confirm(`确定删除项目“${project.title}”吗？\n\n只删除项目记录和关联关系，不会删除共享的原始视频、音频和图片文件。`);
  if (!confirmed) return false;
  await postJson("/api/projects/delete", { id: projectId });
  if (state.activeProject?.id === projectId) localStorage.removeItem("active-video-project-id");
  await loadProjects({ preserveSelection: false });
  return true;
}

async function clearProjects() {
  if (!state.projects.length) return;
  const confirmed = window.confirm(`确定清空全部 ${state.projects.length} 条短视频项目记录吗？\n\n只清空项目记录和关联关系，不删除共享素材与已生成文件。此操作不可撤销。`);
  if (!confirmed) return;
  await postJson("/api/projects/clear", {});
  localStorage.removeItem("active-video-project-id");
  await loadProjects({ preserveSelection: false });
}

async function updateCurrent(changes = {}) {
  const id = activeProjectId();
  if (!id) return null;
  const data = await postJson(`/api/projects/${encodeURIComponent(id)}/update`, { changes });
  state.activeProject = data.project;
  replaceProject(data.project);
  renderCurrentProject();
  renderRecentProjects();
  return data.project;
}

async function linkCurrent(assetType, assetId, name = "", metadata = {}) {
  const id = activeProjectId();
  if (!id) return null;
  const data = await postJson("/api/projects/link-asset", { projectId: id, assetType, assetId: String(assetId || ""), name, metadata });
  state.activeProject = data.project || state.activeProject;
  replaceProject(state.activeProject);
  renderCurrentProject();
  renderRecentProjects();
  window.dispatchEvent(new CustomEvent("video-project-updated", { detail: state.activeProject }));
  return data;
}

async function loadProjectAssets() {
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
  const data = await getJson(`/api/projects/assets?${params}`);
  const assets = data.assets || [];
  container.innerHTML = assets.length ? assets.map((asset) => `
    <article class="project-asset-card" data-project-asset-id="${escapeHtml(asset.id)}">
      <div class="project-asset-card-top"><span>${escapeHtml(asset.assetType)}</span><strong class="asset-status-${escapeHtml(asset.status)}">${asset.status === "ready" ? "可用" : asset.status === "pending" ? "处理中" : "异常"}</strong></div>
      <h3>${escapeHtml(asset.name || asset.assetId || "未命名素材")}</h3>
      <div class="asset-tag-list">${[asset.useCase, asset.style, asset.ratio].filter(Boolean).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="project-asset-card-foot"><small>已使用 ${Number(asset.usedCount || 0)} 次</small><button class="ghost small send-project-asset" type="button">加入素材库</button></div>
    </article>`).join("") : '<div class="empty">没有符合筛选条件的素材。</div>';
  return assets;
}

function bindProjectEvents() {
  const form = document.querySelector("#videoProjectCreateForm");
  document.querySelector("#newVideoProject")?.addEventListener("click", () => {
    form.hidden = false;
    document.querySelector("#videoProjectTitle")?.focus();
  });
  document.querySelector("#cancelVideoProject")?.addEventListener("click", () => { form.hidden = true; });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await createProject();
      form.hidden = true;
      form.reset();
    } catch (error) {
      const recent = document.querySelector("#recentVideoProjects");
      if (recent) recent.innerHTML = `<div class="empty">项目创建失败：${escapeHtml(error.message)}</div>`;
    }
  });
  document.querySelector("#activeVideoProjectSelect")?.addEventListener("change", (event) => setActiveProject(event.target.value));
  document.querySelector("#recentVideoProjects")?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-project-id]");
    if (!card) return;
    if (event.target.closest(".delete-video-project")) {
      deleteProject(card.dataset.projectId).catch((error) => window.alert(error.message));
      return;
    }
    setActiveProject(card.dataset.projectId);
  });
  document.querySelector("#clearVideoProjects")?.addEventListener("click", () => clearProjects().catch((error) => window.alert(error.message)));
  document.querySelector("#projectNextAction")?.addEventListener("click", (event) => {
    if (event.currentTarget.dataset.projectAction === "create") document.querySelector("#newVideoProject")?.click();
    else if (event.currentTarget.dataset.nav) window.appNavigate?.(event.currentTarget.dataset.nav);
  });
  ["projectAssetTypeFilter", "projectAssetUseCaseFilter", "projectAssetStyleFilter", "projectAssetProjectFilter"].forEach((id) => {
    document.querySelector(`#${id}`)?.addEventListener("change", loadProjectAssets);
  });
  document.querySelector("#refreshProjectAssets")?.addEventListener("click", loadProjectAssets);
}

export async function initProjectModule() {
  const page = document.querySelector('[data-page="dashboard"]');
  if (page) page.dataset.module = "project";
  bindProjectEvents();
  window.videoProjects = {
    current: () => state.activeProject,
    loadProjects,
    refresh: loadProjects,
    create: createProject,
    setActiveProject,
    deleteProject,
    select: setActiveProject,
    updateCurrent,
    linkCurrent,
    setReadiness: (readiness) => { state.readiness = readiness; },
    canGenerate: () => Boolean(state.readiness?.ready),
  };
  await loadProjects();
  loadProjectAssets().catch(() => {});
}
