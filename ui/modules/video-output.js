import { getJson, postJson } from "./api.js";

const STATUS_LABELS = {
  jianyingApp: "剪映专业版",
  capcutCli: "capcut-cli",
  ffmpeg: "FFmpeg",
  draftDirectory: "剪映草稿目录",
  templateMaster: "模板母版",
  outputDirectory: "输出目录",
};

const RUNNING_STATUSES = new Set(["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"]);
const state = {
  sources: null,
  projects: [],
  activeTimeline: null,
  preview: null,
  manualBindings: {},
  pollTimer: 0,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusText(status) {
  return {
    pending: "等待处理",
    binding_assets: "绑定素材",
    building_timeline: "构建成片草稿",
    rendering: "渲染预览",
    exporting_draft: "导出草稿",
    completed: "已完成",
    failed: "失败",
  }[status] || status || "未知";
}

function outputLabel(type) {
  return {
    jianying_template: "剪映模板草稿【推荐】",
    mp4: "MP4 预览",
    package: "标准素材包 / 兼容导出",
    jianying: "历史剪映素材包",
    template_mp4: "路线 A：模板快剪 MP4",
    mix_mp4: "路线 D：下载素材混剪 MP4",
  }[type] || type || "视频输出";
}

function currentVideoProject() {
  return window.videoProjects?.current?.() || null;
}

function projectSourcePreferences(project = currentVideoProject()) {
  return {
    directorId: String(project?.directorScript?.id || project?.directorScript?.assetId || ""),
    audioId: String(project?.selectedTtsAudio?.id || project?.selectedTtsAudio?.assetId || ""),
    bgmId: String(project?.bgm?.id || project?.bgm?.assetId || ""),
  };
}

function canAttemptGeneration() {
  return Boolean(
    currentVideoProject()?.id
    && document.querySelector("#videoProductDirector")?.value
    && document.querySelector("#videoProductAudio")?.value
  );
}

function updateGenerateAvailability() {
  const button = document.querySelector("#generateVideoProduct");
  if (!button) return;
  button.disabled = !canAttemptGeneration();
  button.title = button.disabled
    ? "请先选择当前项目、导演稿和已完成语音"
    : "先同步当前选择并检查素材，再创建成片任务";
}

function renderToolStatus(container, status) {
  const checks = status?.checks || {};
  container.innerHTML = Object.entries(STATUS_LABELS).map(([key, label]) => {
    const item = checks[key] || {};
    const ok = Boolean(item.ok);
    return `<div class="video-tool-check ${ok ? "ready" : "missing"}"><span>${label}</span><strong>${item.label || (ok ? "可用" : "不可用")}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</div>`;
  }).join("");
  const openJianyingButton = document.querySelector("#openJianyingApp");
  if (openJianyingButton) {
    openJianyingButton.disabled = !checks.jianyingApp?.ok;
    openJianyingButton.title = checks.jianyingApp?.ok ? "启动本机剪映专业版" : "未检测到剪映专业版";
  }
  const note = document.querySelector("#videoOutputCompatibilityNote");
  if (note) note.textContent = status?.mode === "capcut_cli"
    ? "capcut-cli 和模板母版已就绪，当前使用剪映模板命令模式。"
    : checks.jianyingApp?.ok
      ? "剪映客户端已安装；capcut-cli、命令或母版未就绪时，系统会输出兼容素材包，可直接打开剪映继续制作。"
      : "capcut-cli 未安装、命令不完整或母版缺失，当前使用素材包兼容模式，不会中断任务。";
}

async function refreshToolStatus() {
  const container = document.querySelector("#videoOutputToolStatus");
  if (!container) return;
  container.setAttribute("aria-busy", "true");
  try {
    renderToolStatus(container, await getJson("/api/video-product/tools"));
  } catch (error) {
    container.innerHTML = `<p class="settings-status error">工具检测失败：${escapeHtml(error.message)}</p>`;
  } finally {
    container.removeAttribute("aria-busy");
  }
}

function setOptions(select, rows, label, preferred) {
  if (!select) return;
  const current = String(preferred || select.value || "");
  select.innerHTML = rows.length
    ? rows.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(label(row))}</option>`).join("")
    : '<option value="">暂无可用数据</option>';
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

export async function loadVideoProductSources() {
  const data = await getJson("/api/video-product/sources");
  state.sources = data;
  const preferred = projectSourcePreferences();
  const directorSelect = document.querySelector("#videoProductDirector");
  const audioSelect = document.querySelector("#videoProductAudio");
  if (!preferred.directorId && directorSelect) directorSelect.value = "";
  if (!preferred.audioId && audioSelect) audioSelect.value = "";
  setOptions(directorSelect, [{ id: "", title: "请选择当前项目的导演稿", scene_count: 0 }, ...(data.directors || [])], (row) => row.id ? `#${row.id} ${row.title || "导演稿"} · ${row.scene_count || 0} 镜头` : row.title, preferred.directorId);
  setOptions(audioSelect, [{ id: "", label: "请选择当前项目的已完成语音" }, ...(data.audioJobs || [])], (row) => row.label || `#${row.id} ${row.voice_name || "配音"}`, preferred.audioId);
  setOptions(document.querySelector("#videoProductBgm"), [{ id: "", filename: "自动匹配本地 BGM；没有则基础生成" }, ...(data.bgmAssets || [])], (row) => row.filename || row.title || "自动匹配", preferred.bgmId);
  setOptions(document.querySelector("#videoProductRouteAStyle"), data.routeAStyles || [], (row) => row.label || row.id);
  setOptions(document.querySelector("#videoProductBgmStrategy"), data.bgmStrategies || [], (row) => row.label || row.id);
  state.manualBindings = {};
  state.preview = null;
  updateGenerateAvailability();
  return data;
}

function renderProjectRows() {
  const container = document.querySelector("#videoProductProjects");
  if (!container) return;
  container.innerHTML = state.projects.length ? state.projects.map((project) => `
    <div class="video-product-project-row" data-timeline-project-id="${Number(project.project_id || project.id)}">
      <strong>#${Number(project.project_id || project.id)}</strong>
      <div class="vfo-project-title"><strong>${escapeHtml(project.metadata?.title || `成片 #${project.project_id || project.id}`)}</strong><span>${escapeHtml(outputLabel(project.output_type))}</span></div>
      <span>${escapeHtml(project.ratio || "9:16")} · ${escapeHtml(project.resolution || "1080x1920")}</span>
      <span>${Number(project.progress || 0)}%</span>
      <div><span class="vfo-project-status ${escapeHtml(project.status)}">${escapeHtml(statusText(project.status))}</span><button class="ghost small" type="button" data-timeline-action="view">查看</button><button class="ghost small danger-action" type="button" data-timeline-action="delete" ${RUNNING_STATUSES.has(project.status) ? "disabled" : ""}>删除</button></div>
    </div>`).join("") : '<div class="vfo-empty">当前短视频项目还没有成片输出记录。</div>';
}

export async function loadVideoProductProjects() {
  const data = await getJson("/api/video-product/projects?limit=50");
  const activeId = currentVideoProject()?.id;
  state.projects = (data.projects || []).filter((project) => !activeId || !project.metadata?.video_project_id || project.metadata.video_project_id === activeId);
  renderProjectRows();
  return state.projects;
}

async function deleteVideoProductProject(id) {
  const project = state.projects.find((item) => String(item.project_id || item.id) === String(id));
  if (!project) return;
  if (!window.confirm(`确定删除成片记录 #${id} 和整个输出文件夹吗？\n\nMP4、字幕、封面、报告和素材包都会一起删除，此操作不可撤销。`)) return;
  const data = await postJson("/api/video-product/delete", { id, deleteFiles: true });
  if (String(state.activeTimeline?.project_id || state.activeTimeline?.id) === String(id)) {
    state.activeTimeline = null;
    renderOutputFiles(null);
    renderScenes([]);
  }
  const status = document.querySelector("#videoProductStatus");
  if (status) status.textContent = `已删除 ${data.deleted || 0} 条成片记录。`;
  await Promise.allSettled([loadVideoProductProjects(), refreshReadiness(), refreshQualityCheck()]);
}

async function clearVideoProductProjects() {
  const deletable = state.projects.filter((item) => !RUNNING_STATUSES.has(item.status));
  if (!deletable.length) return;
  if (!window.confirm(`确定清空 ${deletable.length} 条已结束成片记录和对应输出文件夹吗？\n\n正在运行的任务会保留，此操作不可撤销。`)) return;
  const data = await postJson("/api/video-product/clear", { scope: "all", deleteFiles: true });
  state.activeTimeline = null;
  renderOutputFiles(null);
  renderScenes([]);
  const status = document.querySelector("#videoProductStatus");
  if (status) status.textContent = `已清理 ${data.deleted || 0} 条成片记录。`;
  await Promise.allSettled([loadVideoProductProjects(), refreshReadiness(), refreshQualityCheck()]);
}

export function renderReadiness(readiness) {
  const container = document.querySelector("#videoProjectReadiness");
  if (!container) return;
  container.innerHTML = readiness?.checks?.length ? readiness.checks.map((item) => `
    <div class="readiness-row ${item.ok ? "ready" : "missing"}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.detail)}</strong>${item.ok ? "" : `<button class="ghost small" type="button" data-nav="${escapeHtml(item.page)}">${escapeHtml(item.action)}</button>`}</div>`).join("") : '<span>选择短视频项目后显示检查结果。</span>';
}

export function renderQualityCheck(quality) {
  const container = document.querySelector("#videoProjectQuality");
  if (!container) return;
  container.innerHTML = quality ? `
    <div class="quality-score"><strong>${Number(quality.totalScore || 0)}</strong><span>成片质量 · ${escapeHtml(quality.estimatedQualityLevel || "待完善")}</span></div>
    <div class="quality-score-grid"><span>开头 ${Number(quality.hookScore || 0)}</span><span>脚本 ${Number(quality.scriptClarityScore || 0)}</span><span>字幕 ${Number(quality.subtitleRhythmScore || 0)}</span><span>画面 ${Number(quality.visualDiversityScore || 0)}</span><span>匹配 ${Number(quality.assetMatchScore || 0)}</span></div>
    ${quality.problems?.length ? `<p>${quality.problems.slice(0, 4).map(escapeHtml).join("；")}</p>` : '<p class="success-text">质量检查通过，可以生成成片。</p>'}` : "";
}

export function renderBlockers(blockers = []) {
  const container = document.querySelector("#videoProductBlockers");
  if (!container) return;
  container.innerHTML = blockers.length
    ? `<ul>${blockers.map((item) => `<li><strong>${escapeHtml(item.label || "阻塞项")}</strong>：${escapeHtml(item.detail || item)}</li>`).join("")}</ul>`
    : '<span class="vfo-ready">当前没有阻塞项，可以生成输出。</span>';
}

export async function refreshReadiness() {
  const project = currentVideoProject();
  if (!project) {
    renderReadiness(null);
    renderBlockers([{ label: "短视频项目", detail: "请先在首页新建或选择项目" }]);
    return null;
  }
  const data = await getJson(`/api/projects/readiness?id=${encodeURIComponent(project.id)}`);
  renderReadiness(data.readiness);
  renderBlockers(data.readiness.blockers || []);
  window.videoProjects?.setReadiness?.(data.readiness);
  updateGenerateAvailability();
  return data.readiness;
}

export async function refreshQualityCheck() {
  const project = currentVideoProject();
  if (!project) {
    renderQualityCheck(null);
    return null;
  }
  const data = await getJson(`/api/projects/quality?id=${encodeURIComponent(project.id)}`);
  renderQualityCheck(data.qualityCheck);
  return data.qualityCheck;
}

function renderScenes(scenes = []) {
  const container = document.querySelector("#videoProductScenes");
  const meta = document.querySelector("#videoProductSceneMeta");
  if (!container) return;
  if (meta) meta.textContent = scenes.length ? `${scenes.length} 个镜头` : "尚未生成预览";
  const imageAssets = state.sources?.imageAssets || [];
  container.innerHTML = scenes.length ? scenes.map((scene) => {
    const selectedId = String(state.manualBindings[scene.scene_index] || scene.image_asset_id || "");
    return `
    <article class="video-product-scene ${scene.status === "blocked" ? "blocked" : ""}">
      <div class="video-product-scene-main"><div class="video-product-scene-top"><strong>#${Number(scene.scene_index || 0)} ${escapeHtml(scene.title_text || "")}</strong><span>${Number(scene.duration || 0).toFixed(1)}s</span></div><p>${escapeHtml(scene.narration_text || scene.subtitle_text || "")}</p><small>${escapeHtml(scene.visual_prompt || scene.image_path || "等待素材")}</small><select class="video-product-image-select" data-scene-index="${Number(scene.scene_index || 0)}" aria-label="镜头 ${Number(scene.scene_index || 0)} 图片素材"><option value="">未绑定</option>${imageAssets.map((asset) => `<option value="${escapeHtml(asset.id)}" ${String(asset.id) === selectedId ? "selected" : ""}>${escapeHtml(asset.filename || asset.id)} · ${escapeHtml(String(asset.prompt || "").slice(0, 24))}</option>`).join("")}</select></div>
    </article>`;
  }).join("") : '<div class="vfo-empty">生成预览或成片任务后显示镜头素材。</div>';
}

export function renderOutputFiles(project = state.activeTimeline) {
  const container = document.querySelector("#videoProductOutputFiles");
  if (!container) return;
  const id = Number(project?.project_id || project?.id || 0);
  const files = [
    ["timeline", "timeline.json", project?.timeline_path], ["srt", "subtitles.srt", project?.srt_path],
    ["manifest", "project_manifest.json", project?.manifest_path], ["draft", "剪映草稿 / 执行计划", project?.draft_path],
    ["mp4", "MP4 预览", project?.mp4_path], ["report", "render_report.json", project?.output_dir],
  ].filter(([, , value]) => value);
  container.innerHTML = files.length ? files.map(([type, label]) => `<a href="/api/video-product/export?id=${id}&type=${type}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`).join("") : '<span>输出文件生成后会显示在这里。</span>';
}

function renderTimelineProject(project) {
  state.activeTimeline = project;
  const progress = Math.max(0, Math.min(100, Number(project?.progress || 0)));
  const bar = document.querySelector("#videoProductProgressBar");
  const text = document.querySelector("#videoProductProgressText");
  const status = document.querySelector("#videoProductStatus");
  if (bar) bar.style.width = `${progress}%`;
  if (text) text.textContent = `${progress}%`;
  if (status) status.textContent = project?.status === "failed" ? `生成失败：${project.error || "未知错误"}` : `${statusText(project?.status)}：${project?.current_step || "等待更新"}`;
  renderBlockers(project?.blockers || []);
  renderScenes(project?.scenes || []);
  renderOutputFiles(project);
  const openButton = document.querySelector("#openVideoProductOutput");
  if (openButton) openButton.disabled = !project?.output_dir;
}

async function loadTimelineProject(id) {
  const data = await getJson(`/api/video-product/project?id=${encodeURIComponent(id)}`);
  renderTimelineProject(data.project);
  return data.project;
}

export async function previewVideoProductTimeline() {
  const status = document.querySelector("#videoProductStatus");
  if (!document.querySelector("#videoProductDirector")?.value || !document.querySelector("#videoProductAudio")?.value) {
    if (status) status.textContent = "请先选择导演稿和已完成的 TTS 音频。";
    updateGenerateAvailability();
    return null;
  }
  if (status) status.textContent = "正在按当前导演稿和音频匹配镜头素材...";
  const data = await postJson("/api/video-product/preview", payload());
  state.preview = data;
  for (const scene of data.scenes || []) {
    if (scene.image_asset_id) state.manualBindings[scene.scene_index] = String(scene.image_asset_id);
  }
  renderScenes(data.scenes || []);
  if (status) status.textContent = data.blockers?.length
    ? `预览已更新，还有 ${data.blockers.length} 个素材问题。`
    : "预览已更新，点击生成后会先写入当前项目并做最终检查。";
  updateGenerateAvailability();
  return data;
}

export async function syncSelectionsToProject({ preview = state.preview } = {}) {
  const project = currentVideoProject();
  if (!project) throw new Error("请先在首页新建或选择短视频项目。");
  const outputType = document.querySelector("#videoProductOutputType")?.value || "jianying_template";
  await window.videoProjects.updateCurrent({ outputMode: outputType });
  await postJson("/api/projects/clear-assets", {
    projectId: project.id,
    assetTypes: ["tts", "director", "image", "video", "bgm", "template"],
  });
  const audioId = document.querySelector("#videoProductAudio")?.value || "";
  const audio = state.sources?.audioJobs?.find((item) => String(item.id) === String(audioId));
  if (audio) {
    if (audio.text) await window.videoProjects.linkCurrent("selected_rewrite", `tts-text-${audio.id}`, "当前配音文案", { text: audio.text, source: "tts" });
    await window.videoProjects.linkCurrent("tts", audio.id, audio.voice_name || `配音 #${audio.id}`, { ...audio, source: "local_upload" });
  }
  const directorId = document.querySelector("#videoProductDirector")?.value || "";
  const director = state.sources?.directors?.find((item) => String(item.id) === String(directorId));
  if (director) {
    const full = await getJson(`/api/director/project?id=${encodeURIComponent(directorId)}`).catch(() => ({ project: director }));
    const value = full.project || director;
    await window.videoProjects.linkCurrent("director", directorId, value.title || `导演稿 #${directorId}`, { ...value, sceneCount: value.result?.storyboard?.length || value.scene_count || 0, subtitleTimeline: value.result?.subtitle_timeline || value.subtitle_timeline || [], source: "ai_generated" });
  }
  const selectedImageIds = new Set([
    ...Object.values(state.manualBindings || {}).map(String),
    ...(preview?.scenes || []).map((scene) => String(scene.image_asset_id || "")),
  ].filter(Boolean));
  const selectedImages = (state.sources?.imageAssets || []).filter((asset) => selectedImageIds.has(String(asset.id)));
  for (const asset of selectedImages) {
    await window.videoProjects.linkCurrent("image", asset.id, asset.filename || `图片 ${asset.id}`, { path: asset.original_path || asset.path || "", ratio: asset.aspect_ratio || "9:16", source: asset.source_type === "director" ? "ai_generated" : "local_upload", status: "ready" });
  }
  const strategy = document.querySelector("#videoProductBgmStrategy")?.value || "auto";
  const selectedBgmId = document.querySelector("#videoProductBgm")?.value || "";
  const bgm = state.sources?.bgmAssets?.find((item) => String(item.id) === String(selectedBgmId))
    || (strategy !== "generated_default" ? state.sources?.bgmAssets?.[0] : null);
  const bgmId = String(bgm?.id || "generated-default-bgm");
  const bgmSelect = document.querySelector("#videoProductBgm");
  if (bgm && bgmSelect) bgmSelect.value = String(bgm.id);
  await window.videoProjects.linkCurrent("bgm", bgmId, bgm?.filename || bgm?.title || "默认基础氛围 BGM", { path: bgm?.path || "", strategy: bgm ? (selectedBgmId ? "manual" : "auto") : "generated_default", source: bgm ? "local_upload" : "ai_generated", status: "ready" });
  if (["jianying", "jianying_template"].includes(outputType)) {
    const template = document.querySelector("#videoProductJianyingTemplate");
    await window.videoProjects.linkCurrent("template", template?.value || "education_tips", template?.selectedOptions?.[0]?.textContent || "学习技巧模板", { ratio: "9:16", source: "local_upload", status: "ready" });
  }
  return currentVideoProject();
}

function payload() {
  const project = currentVideoProject();
  return {
    projectId: project?.id || "",
    video_project_id: project?.id || "",
    source_director_project_id: Number(document.querySelector("#videoProductDirector")?.value || 0),
    audio_asset_id: Number(document.querySelector("#videoProductAudio")?.value || 0),
    image_source: document.querySelector("#videoProductImageSource")?.value || "director",
    output_type: document.querySelector("#videoProductOutputType")?.value || "jianying_template",
    jianying_template: document.querySelector("#videoProductJianyingTemplate")?.value || "education_tips",
    route_a_style_id: document.querySelector("#videoProductRouteAStyle")?.value || "black_gold_knowledge",
    route_a_custom_style: document.querySelector("#videoProductRouteACustomStyle")?.value.trim() || "",
    bgm_strategy: document.querySelector("#videoProductBgmStrategy")?.value || "auto",
    bgm_asset_id: document.querySelector("#videoProductBgm")?.value || "",
    manual_bindings: { ...state.manualBindings },
    target_duration: 30,
  };
}

export async function generateVideoProduct() {
  const status = document.querySelector("#videoProductStatus");
  const button = document.querySelector("#generateVideoProduct");
  if (!currentVideoProject()) {
    if (status) status.textContent = "请先在首页新建或选择短视频项目。";
    window.appNavigate?.("dashboard");
    return null;
  }
  if (button) button.disabled = true;
  try {
    if (!state.preview) await previewVideoProductTimeline();
    if (status) status.textContent = "正在同步项目文案、语音、导演稿、素材和 BGM...";
    await syncSelectionsToProject({ preview: state.preview });
    const readiness = await refreshReadiness();
    await refreshQualityCheck();
    if (!readiness?.ready) throw new Error(`暂不能生成：${readiness?.blockers?.map((item) => `${item.label}${item.detail}`).join("、") || "关键内容未完成"}`);
    if (status) status.textContent = "检查通过，正在创建剪映模板草稿任务...";
    const data = await postJson("/api/video-product/generate", payload());
    await pollVideoProductProject(data.project.project_id || data.project.id);
    return data.project;
  } catch (error) {
    if (status) status.textContent = error.message;
    throw error;
  } finally {
    updateGenerateAvailability();
  }
}

export async function pollVideoProductProject(id) {
  if (state.pollTimer) window.clearTimeout(state.pollTimer);
  const project = await loadTimelineProject(id);
  await loadVideoProductProjects();
  if (RUNNING_STATUSES.has(project.status)) {
    state.pollTimer = window.setTimeout(() => pollVideoProductProject(id).catch(() => {}), 1500);
  } else if (project.status === "completed") {
    await window.videoProjects?.setActiveProject?.(currentVideoProject()?.id);
    await Promise.allSettled([refreshReadiness(), refreshQualityCheck()]);
  }
  return project;
}

export async function openVideoProductOutput() {
  const status = document.querySelector("#videoProductStatus");
  if (!state.activeTimeline?.output_dir) {
    if (status) status.textContent = "当前成片任务还没有输出目录。";
    return;
  }
  await postJson("/api/open-path", { filePath: state.activeTimeline.output_dir });
  if (status) status.textContent = "已打开视频成片输出目录。";
}

async function openJianyingApp() {
  const note = document.querySelector("#videoOutputCompatibilityNote");
  try {
    const result = await postJson("/api/video-product/open-jianying", {});
    if (note) note.textContent = result.message || "已启动剪映专业版。";
  } catch (error) {
    if (note) note.textContent = error.message;
  }
}

function selectOutputType(outputType) {
  const select = document.querySelector("#videoProductOutputType");
  if (!select) return;
  select.value = outputType;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelectorAll("[data-main-output]").forEach((button) => button.classList.toggle("active", button.dataset.mainOutput === outputType));
}

function bindEvents() {
  document.querySelectorAll("[data-main-output]").forEach((button) => button.addEventListener("click", () => {
    selectOutputType(button.dataset.mainOutput);
  }));
  document.querySelectorAll(".video-route-card[data-video-output]").forEach((card) => card.addEventListener("click", () => {
    selectOutputType(card.dataset.videoOutput);
    document.querySelectorAll(".video-route-card[data-video-output]").forEach((item) => item.classList.toggle("primary", item === card));
  }));
  document.querySelector("#refreshVideoOutputTools")?.addEventListener("click", refreshToolStatus);
  document.querySelector("#openJianyingApp")?.addEventListener("click", openJianyingApp);
  document.querySelector("#refreshVideoProductSources")?.addEventListener("click", () => loadVideoProductSources().then(() => previewVideoProductTimeline()).catch(() => {}));
  document.querySelector("#refreshVideoProductProjects")?.addEventListener("click", () => loadVideoProductProjects().catch(() => {}));
  document.querySelector("#refreshVideoProjectReadiness")?.addEventListener("click", () => Promise.allSettled([refreshReadiness(), refreshQualityCheck()]));
  document.querySelector("#autoBindTimeline")?.addEventListener("click", async () => {
    try {
      const preview = await previewVideoProductTimeline();
      await syncSelectionsToProject({ preview });
      await Promise.allSettled([refreshReadiness(), refreshQualityCheck()]);
    } catch (error) {
      const status = document.querySelector("#videoProductStatus");
      if (status) status.textContent = error.message;
    }
  });
  document.querySelector("#generateVideoProduct")?.addEventListener("click", () => generateVideoProduct().catch(() => {}));
  document.querySelector("#openVideoProductOutput")?.addEventListener("click", () => openVideoProductOutput().catch(() => {}));
  document.querySelector("#clearVideoProductProjects")?.addEventListener("click", () => clearVideoProductProjects().catch((error) => window.alert(error.message)));
  document.querySelector("#videoProductProjects")?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-timeline-project-id]");
    const action = event.target.closest("[data-timeline-action]")?.dataset.timelineAction;
    if (!row || !action) return;
    if (action === "delete") deleteVideoProductProject(row.dataset.timelineProjectId).catch((error) => window.alert(error.message));
    else loadTimelineProject(row.dataset.timelineProjectId).catch(() => {});
  });
  document.querySelector("#videoProductScenes")?.addEventListener("change", (event) => {
    const select = event.target.closest(".video-product-image-select");
    if (!select) return;
    if (select.value) state.manualBindings[select.dataset.sceneIndex] = select.value;
    else delete state.manualBindings[select.dataset.sceneIndex];
    state.preview = null;
    previewVideoProductTimeline().catch(() => {});
  });
  ["videoProductDirector", "videoProductAudio", "videoProductImageSource", "videoProductOutputType", "videoProductBgmStrategy", "videoProductBgm", "videoProductRouteAStyle", "videoProductRouteACustomStyle"].forEach((id) => {
    document.querySelector(`#${id}`)?.addEventListener("change", () => {
      state.preview = null;
      updateGenerateAvailability();
      previewVideoProductTimeline().catch(() => {});
    });
  });
  const handleProjectChange = () => {
    state.preview = null;
    state.manualBindings = {};
    Promise.allSettled([loadVideoProductSources(), loadVideoProductProjects(), refreshReadiness(), refreshQualityCheck()])
      .then(() => previewVideoProductTimeline().catch(() => {}));
  };
  window.addEventListener("video-project-changed", handleProjectChange);
}

export async function initVideoOutputModule() {
  const page = document.querySelector('[data-page="video-output"]');
  if (page) page.dataset.module = "video-output";
  window.__modularVideoOutputReady = true;
  bindEvents();
  window.videoOutputModule = { loadVideoProductSources, loadVideoProductProjects, refreshReadiness, refreshQualityCheck, previewVideoProductTimeline, syncSelectionsToProject, generateVideoProduct, pollVideoProductProject, openVideoProductOutput };
  await Promise.allSettled([refreshToolStatus(), loadVideoProductSources(), loadVideoProductProjects(), refreshReadiness(), refreshQualityCheck()]);
  await previewVideoProductTimeline().catch(() => {});
}
