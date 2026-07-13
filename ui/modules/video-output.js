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
  templateManuallySelected: false,
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
    audioId: String(project?.selectedTtsAudio?.id || project?.selectedTtsAudio?.assetId || ""),
    bgmId: String(project?.bgm?.id || project?.bgm?.assetId || ""),
    bgmStrategy: String(project?.bgm?.strategy || project?.bgm?.source || ""),
  };
}

function bgmOptionLabel(row = {}) {
  if (!row.id) return row.filename || "自动匹配本地 BGM；没有则基础生成";
  const bpm = Number(row.bpm || 0) ? `${Number(row.bpm)} BPM` : "BPM 未标注";
  const license = {
    authorized: "已授权",
    attribution_required: "需署名",
    unknown_review_required: "授权待确认",
  }[row.license_status] || "授权待确认";
  const source = row.source_label ? `${row.source_label} · ` : "";
  return `${source}${row.filename || row.title || "BGM"} · ${bpm} · ${license}`;
}

function canAttemptGeneration() {
  return Boolean(
    document.querySelector("#videoProductAudio")?.value
  );
}

function generationMissingReason() {
  if (!currentVideoProject()?.id) return "请先在首页新建或选择一个短视频项目。";
  if (!document.querySelector("#videoProductAudio")?.value) return "请先选择已完成的 TTS 语音。";
  return "";
}

function updateGenerateAvailability() {
  const button = document.querySelector("#generateVideoProduct");
  if (!button) return;
  if (button.dataset.running === "true") return;
  button.disabled = false;
  button.title = generationMissingReason() || "先同步当前选择并检查素材，再创建成片任务";
}

async function ensureVideoProjectForOutput() {
  const current = currentVideoProject();
  if (current?.id) return current;
  const audioText = document.querySelector("#videoProductAudio")?.selectedOptions?.[0]?.textContent || "";
  const title = audioText
    .replace(/^#\d+\s*/, "")
    .replace(/·.*$/, "")
    .trim() || "高质量剪映草稿";
  const created = await window.videoProjects?.create?.({
    title,
    videoType: "短视频",
    outputMode: "jianying_template",
  });
  if (!created?.id) throw new Error("自动创建短视频项目失败。");
  await window.videoProjects?.setActiveProject?.(created.id, { fetch: false });
  return created;
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
  const appInput = document.querySelector("#jianyingAppPathInput");
  const draftInput = document.querySelector("#jianyingDraftDirInput");
  if (appInput && !appInput.value.trim() && status?.suggestions?.appPaths?.[0]) appInput.placeholder = status.suggestions.appPaths[0];
  if (draftInput && !draftInput.value.trim() && status?.suggestions?.draftDirs?.[0]) draftInput.placeholder = status.suggestions.draftDirs[0];
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

function selectLatestAvailableAudio() {
  const select = document.querySelector("#videoProductAudio");
  const jobs = state.sources?.audioJobs || [];
  if (!select || !jobs.length) return null;
  const preferred = projectSourcePreferences().audioId;
  const selected = jobs.find((job) => String(job.id) === String(preferred))
    || jobs.slice().sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
  if (selected) {
    select.value = String(selected.id);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return selected || null;
}

async function selectAndLinkTemplate() {
  await loadVideoProductSources();
  const select = document.querySelector("#videoProductJianyingTemplate");
  renderJianyingTemplateOptions();
  const templateConfig = state.sources?.jianyingTemplates?.find((item) => String(item.id) === String(select?.value || ""))
    || sortedJianyingTemplates()[0];
  if (!select || !templateConfig) throw new Error("没有可用剪映模板配置。");
  select.value = String(templateConfig.id);
  state.templateManuallySelected = true;
  const project = currentVideoProject() || await ensureVideoProjectForOutput();
  await window.videoProjects?.setActiveProject?.(project.id);
  await window.videoProjects.linkCurrent("template", templateConfig.id, templateConfig.name || templateConfig.label || templateConfig.id, {
    ...templateConfig,
    ratio: templateConfig.ratio || "9:16",
    source: templateConfig.hasMaster ? "local_upload" : "built_in_preset",
    status: "ready",
    note: templateConfig.hasMaster ? "" : "未导入真实剪映母版，生成时使用内置模板预设或兼容素材包。",
  });
  const status = document.querySelector("#videoProductStatus");
  if (status) status.textContent = `已选择剪映模板：${templateConfig.name || templateConfig.label || templateConfig.id}${templateConfig.hasMaster ? "" : "（内置预设）"}`;
  await Promise.allSettled([refreshReadiness(), refreshQualityCheck()]);
  return templateConfig;
}

async function assertJianyingReadyForDraft() {
  const status = await getJson("/api/video-product/tools");
  const checks = status.checks || {};
  const container = document.querySelector("#videoOutputToolStatus");
  if (container) renderToolStatus(container, status);
  const missing = [];
  if (!checks.jianyingApp?.ok) missing.push(`剪映程序路径：${status.suggestions?.appPaths?.[0] || "请填写 JianyingPro.exe 完整路径"}`);
  if (!checks.draftDirectory?.ok) missing.push(`剪映草稿目录：${status.suggestions?.draftDirs?.[0] || "请填写 com.lveditor.draft 目录"}`);
  if (!checks.templateMaster?.ok) missing.push(`剪映模板母版：请放到 ${status.suggestions?.templatesRoot || "templates/jianying/<模板ID>/draft_template"}`);
  if (!missing.length) return status;
  const message = `一键导入剪映草稿前还缺少：\n\n${missing.join("\n")}\n\n请在本页“本地剪映对接”填写路径或导入模板母版后重试。`;
  window.alert(message);
  document.querySelector(".local-jianying-config")?.scrollIntoView({ behavior: "smooth", block: "center" });
  throw new Error(message);
}

function compactText(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, "");
}

function scoreTemplateKeywordList(list, targetText) {
  const target = compactText(targetText);
  if (!target) return 0;
  return (Array.isArray(list) ? list : []).reduce((score, item) => (
    target.includes(compactText(item)) || compactText(item).includes(target) ? score + 2 : score
  ), 0);
}

function currentTemplateContext() {
  const project = currentVideoProject();
  const audioId = document.querySelector("#videoProductAudio")?.value || "";
  const audio = state.sources?.audioJobs?.find((item) => String(item.id) === String(audioId));
  return {
    videoType: project?.videoType || project?.type || "",
    title: project?.title || audio?.title || audio?.seo_title || "",
    visualStyle: "",
  };
}

function sortedJianyingTemplates() {
  const templates = state.sources?.jianyingTemplates || [];
  const context = currentTemplateContext();
  return templates
    .map((template) => {
      const score = Number(template.hasMaster) * 5
        + scoreTemplateKeywordList(template.recommendedVideoTypes, `${context.videoType} ${context.title}`)
        + scoreTemplateKeywordList(template.recommendedStyles, context.visualStyle)
        + scoreTemplateKeywordList(template.tags, `${context.videoType} ${context.title} ${context.visualStyle}`);
      return { ...template, recommendationScore: score };
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore || Number(b.hasMaster) - Number(a.hasMaster) || String(a.name).localeCompare(String(b.name), "zh-Hans-CN"));
}

function renderJianyingTemplateOptions() {
  const select = document.querySelector("#videoProductJianyingTemplate");
  if (!select) return;
  const rows = sortedJianyingTemplates();
  const recommended = rows[0];
  const preferred = state.templateManuallySelected ? select.value : recommended?.id;
  setOptions(select, rows, (row) => {
    const prefix = recommended && row.id === recommended.id ? "【推荐】" : "";
    const master = row.hasMaster ? "" : " · 缺母版";
    return `${prefix}${row.name || row.id} · ${row.category || "模板"}${master}`;
  }, preferred);
  const note = document.querySelector("#videoProductTemplateRecommendation");
  if (note) note.textContent = recommended
    ? `推荐：${recommended.name || recommended.id}，匹配 ${recommended.category || "当前项目"}；${recommended.hasMaster ? "母版已就绪" : "还缺剪映母版文件"}。`
    : "暂无模板配置，请先导入本地剪映模板母版。";
}

async function loadJianyingLocalConfig() {
  const appInput = document.querySelector("#jianyingAppPathInput");
  const draftInput = document.querySelector("#jianyingDraftDirInput");
  if (!appInput && !draftInput) return;
  const data = await getJson("/api/jianying/local-config").catch(() => null);
  if (!data) return;
  if (appInput) appInput.value = data.appPath || "";
  if (draftInput) draftInput.value = data.draftDir || "";
}

async function saveJianyingLocalConfig() {
  const note = document.querySelector("#videoOutputCompatibilityNote");
  const body = {
    appPath: document.querySelector("#jianyingAppPathInput")?.value.trim() || "",
    draftDir: document.querySelector("#jianyingDraftDirInput")?.value.trim() || "",
  };
  const result = await postJson("/api/jianying/local-config", body);
  if (note) note.textContent = `已保存本地剪映对接：${result.draftDir || "未填写草稿目录"}`;
  await refreshToolStatus();
}

async function importJianyingTemplate() {
  const input = document.querySelector("#jianyingTemplateSourcePath");
  const status = document.querySelector("#jianyingTemplateStatus");
  const sourcePath = input?.value.trim() || "";
  if (!sourcePath) {
    if (status) status.textContent = "请先粘贴已解压的剪映模板母版目录。";
    return;
  }
  if (status) status.textContent = "正在导入模板母版...";
  const data = await postJson("/api/video-product/import-template", { sourcePath });
  state.sources = data;
  state.templateManuallySelected = false;
  renderJianyingTemplateOptions();
  if (status) status.textContent = `已导入：${data.template?.name || data.template?.id || "模板"}，并加入自动推荐。`;
  await refreshToolStatus();
}

export async function loadVideoProductSources() {
  const data = await getJson("/api/video-product/sources");
  state.sources = data;
  const preferred = projectSourcePreferences();
  const directorSelect = document.querySelector("#videoProductDirector");
  const audioSelect = document.querySelector("#videoProductAudio");
  if (!preferred.audioId && audioSelect) audioSelect.value = "";
  setOptions(directorSelect, [{ id: "", title: "生产线内部自动分镜", scene_count: 0 }], (row) => row.title, "");
  setOptions(audioSelect, [{ id: "", label: "请选择当前项目的已完成语音" }, ...(data.audioJobs || [])], (row) => row.label || `#${row.id} ${row.voice_name || "配音"}`, preferred.audioId);
  setOptions(document.querySelector("#videoProductBgm"), [{ id: "", filename: "自动匹配本地 BGM；没有则基础生成" }, ...(data.bgmAssets || [])], bgmOptionLabel, preferred.bgmId);
  setOptions(document.querySelector("#videoProductRouteAStyle"), data.routeAStyles || [], (row) => row.label || row.id);
  const strategyIds = new Set((data.bgmStrategies || []).map((row) => String(row.id || "")));
  const preferredStrategy = strategyIds.has(preferred.bgmStrategy) ? preferred.bgmStrategy : "auto";
  setOptions(document.querySelector("#videoProductBgmStrategy"), data.bgmStrategies || [], (row) => row.label || row.id, preferredStrategy);
  const bgmHint = document.querySelector("#videoProductBgmLibraryHint");
  if (bgmHint) {
    const deleted = Array.isArray(data.deletedOutOfRangeBgmAssets) ? data.deletedOutOfRangeBgmAssets.length : 0;
    bgmHint.textContent = `已识别 ${(data.bgmAssets || []).length} 首 BGM；自动匹配只使用 120-150 BPM${deleted ? `，已删除 ${deleted} 首不合格预设` : ""}。`;
  }
  if (audioSelect && !audioSelect.value && data.audioJobs?.length) {
    const latestAudio = data.audioJobs.slice().sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
    if (latestAudio?.id) audioSelect.value = String(latestAudio.id);
  }
  renderJianyingTemplateOptions();
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
    <div class="readiness-row ${item.ok ? "ready" : "missing"}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.detail)}</strong>${item.ok ? "" : `<button class="ghost small" type="button" data-readiness-action="${escapeHtml(item.id)}" data-nav="${escapeHtml(item.page)}">${escapeHtml(item.action)}</button>`}</div>`).join("") : '<span>选择短视频项目后显示检查结果。</span>';
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
    ["timeline", "timeline.json", project?.timeline_path],
    ["srt", "subtitles.srt", project?.srt_path],
    ["manifest", "project_manifest.json", project?.manifest_path],
    ["draft", "剪映草稿 / 执行计划", project?.draft_path],
    ["mp4", "MP4 预览", project?.mp4_path],
    ["title", "标题 title.txt", project?.output_dir],
    ["description", "描述 description.txt", project?.output_dir],
    ["hashtags", "标签 hashtags.txt", project?.output_dir],
    ["publish_meta", "发布元数据 publish_meta.json", project?.output_dir],
    ["report", "render_report.json", project?.output_dir],
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
  if (!document.querySelector("#videoProductAudio")?.value) {
    if (status) status.textContent = "请先选择已完成的 TTS 音频。";
    updateGenerateAvailability();
    return null;
  }
  if (status) status.textContent = "正在按当前 TTS 音频生成生产线分镜并匹配素材...";
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

async function autoMatchExistingImageAssets() {
  const status = document.querySelector("#videoProductStatus");
  await loadVideoProductSources();
  selectLatestAvailableAudio();
  const imageSource = document.querySelector("#videoProductImageSource");
  const imageCount = state.sources?.imageAssets?.length || 0;
  if (!imageCount) {
    if (status) status.textContent = "图片资产库暂无可用图片，请先在图片生成页生成或加入现有图片。";
    window.appNavigate?.("image");
    return null;
  }
  if (imageSource) imageSource.value = "all";
  let preview = await previewVideoProductTimeline();
  if (preview?.blockers?.some((item) => String(item).includes("缺少镜头图片") || String(item).includes("图片素材"))) {
    if (imageSource) imageSource.value = "all";
    preview = await previewVideoProductTimeline();
  }
  await syncSelectionsToProject({ preview });
  const matched = Object.keys(state.manualBindings || {}).length;
  if (status) status.textContent = `已从图片资产库自动匹配 ${matched || preview?.scenes?.filter((scene) => scene.image_asset_id).length || 0} 张素材；图片文件地址已写入镜头下方。`;
  await Promise.allSettled([refreshReadiness(), refreshQualityCheck()]);
  return preview;
}

async function handleReadinessAction(action) {
  const status = document.querySelector("#videoProductStatus");
  if (!action) return;
  if (action === "voice") {
    await ensureVideoProjectForOutput();
    await loadVideoProductSources();
    const audio = selectLatestAvailableAudio();
    if (!audio) {
      if (status) status.textContent = "没有找到已完成且可用的 TTS 音频，请先生成语音。";
      window.appNavigate?.("tts");
      return;
    }
    await syncSelectionsToProject({ preview: state.preview });
    if (status) status.textContent = `已选择语音：${audio.label || audio.voice_name || `#${audio.id}`}`;
    await Promise.allSettled([refreshReadiness(), refreshQualityCheck()]);
    return;
  }
  if (action === "assets") {
    await ensureVideoProjectForOutput();
    await autoMatchExistingImageAssets();
    return;
  }
  if (action === "template") {
    await ensureVideoProjectForOutput();
    await selectAndLinkTemplate();
    return;
  }
  const row = document.querySelector(`[data-readiness-action="${CSS.escape(action)}"]`);
  const target = row?.dataset.nav;
  if (target) window.appNavigate?.(target);
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
    const audioTitle = audio.title || audio.seo_title || audio.publish_title || audio.platform_titles?.douyin || audio.voice_name || `配音 #${audio.id}`;
    await window.videoProjects.linkCurrent("tts", audio.id, audioTitle, { ...audio, title: audioTitle, source: "local_upload" });
  }
  const selectedImageIds = new Set([
    ...Object.values(state.manualBindings || {}).map(String),
    ...(preview?.scenes || []).map((scene) => String(scene.image_asset_id || "")),
  ].filter(Boolean));
  const selectedImages = (state.sources?.imageAssets || []).filter((asset) => selectedImageIds.has(String(asset.id)));
  for (const asset of selectedImages) {
    await window.videoProjects.linkCurrent("image", asset.id, asset.filename || `图片 ${asset.id}`, {
      path: asset.original_path || asset.path || "",
      ratio: asset.aspect_ratio || "9:16",
      source: asset.source_type === "director" ? "ai_generated" : "local_upload",
      sourceId: asset.source_id || "",
      sceneIndex: Number(asset.scene_index || 0),
      assetOrder: Number(asset.asset_order || 0),
      status: "ready",
    });
  }
  const strategy = document.querySelector("#videoProductBgmStrategy")?.value || "auto";
  const selectedBgmId = document.querySelector("#videoProductBgm")?.value || "";
  const bgm = state.sources?.bgmAssets?.find((item) => String(item.id) === String(selectedBgmId))
    || (["auto", "local_auto", "manual"].includes(strategy) ? state.sources?.bgmAssets?.[0] : null);
  const bgmSelect = document.querySelector("#videoProductBgm");
  if (bgm && bgmSelect) bgmSelect.value = String(bgm.id);
  if (bgm) {
    await window.videoProjects.linkCurrent("bgm", String(bgm.id), bgm.filename || bgm.title || "BGM", {
      path: bgm.path || "",
      strategy: selectedBgmId ? "manual" : strategy,
      source: "local_upload",
      status: "ready",
    });
  }
  if (["jianying", "jianying_template"].includes(outputType)) {
    const template = document.querySelector("#videoProductJianyingTemplate");
    const templateConfig = state.sources?.jianyingTemplates?.find((item) => String(item.id) === String(template?.value || ""));
    await window.videoProjects.linkCurrent("template", template?.value || "education_tips", templateConfig?.name || template?.selectedOptions?.[0]?.textContent || "学习技巧模板", {
      ...templateConfig,
      ratio: templateConfig?.ratio || "9:16",
      source: templateConfig?.hasMaster === false ? "built_in_preset" : "local_upload",
      status: "ready",
      note: templateConfig?.hasMaster === false ? "未导入真实剪映母版，生成时使用内置模板预设或兼容素材包。" : "",
    });
  }
  return currentVideoProject();
}

function payload({ forceExecution = false } = {}) {
  const project = currentVideoProject();
  return {
    projectId: project?.id || "",
    video_project_id: project?.id || "",
    source_director_project_id: 0,
    audio_asset_id: Number(document.querySelector("#videoProductAudio")?.value || 0),
    image_source: document.querySelector("#videoProductImageSource")?.value || "all",
    output_type: document.querySelector("#videoProductOutputType")?.value || "jianying_template",
    jianying_template: document.querySelector("#videoProductJianyingTemplate")?.value || "education_tips",
    route_a_style_id: document.querySelector("#videoProductRouteAStyle")?.value || "black_gold_knowledge",
    route_a_custom_style: document.querySelector("#videoProductRouteACustomStyle")?.value.trim() || "",
    bgm_strategy: document.querySelector("#videoProductBgm")?.value ? (document.querySelector("#videoProductBgmStrategy")?.value || "manual") : (document.querySelector("#videoProductBgmStrategy")?.value || "auto"),
    bgm_asset_id: document.querySelector("#videoProductBgm")?.value || "",
    manual_bindings: { ...state.manualBindings },
    target_duration: 30,
    force_execution: Boolean(forceExecution),
    force_timeline_blockers: Boolean(forceExecution),
    force_quality_review: Boolean(forceExecution),
  };
}

function isForceableVideoProductError(message = "") {
  const text = String(message || "");
  return /相似度|随机音频匹配|质量审查未通过|码率偏低|标题仍是内部导演稿名称|缺少 BGM 素材/.test(text);
}

function confirmForceVideoProduct(message = "") {
  return window.confirm(`当前成片检查有风险：\n\n${message}\n\n确定后将强制继续生成剪映草稿/成片，并在报告里保留风险记录。是否继续？`);
}

export async function generateVideoProduct({ forceExecution = false } = {}) {
  const status = document.querySelector("#videoProductStatus");
  const button = document.querySelector("#generateVideoProduct");
  await ensureVideoProjectForOutput();
  const missingReason = generationMissingReason();
  if (missingReason) {
    if (status) status.textContent = missingReason;
    if (!currentVideoProject()?.id) {
      document.querySelector("#videoProjectReadiness")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      document.querySelector("#videoProductAudio")?.focus();
    }
    return null;
  }
  if (!currentVideoProject()) {
    if (status) status.textContent = "请先在首页新建或选择短视频项目。";
    document.querySelector("#videoProjectReadiness")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return null;
  }
  if (button) {
    button.dataset.running = "true";
    button.disabled = true;
  }
  try {
    if (!state.preview) await previewVideoProductTimeline();
    if (status) status.textContent = "正在同步项目文案、语音、素材和 BGM...";
    await syncSelectionsToProject({ preview: state.preview });
    const readiness = await refreshReadiness();
    await refreshQualityCheck();
    if (!readiness?.ready) throw new Error(`暂不能生成：${readiness?.blockers?.map((item) => `${item.label}${item.detail}`).join("、") || "关键内容未完成"}`);
    if (status) status.textContent = forceExecution ? "已确认风险，正在强制创建剪映模板草稿任务..." : "检查通过，正在创建剪映模板草稿任务...";
    const data = await postJson("/api/video-product/generate", payload({ forceExecution }));
    const projectId = data.project.project_id || data.project.id;
    return await waitForVideoProductCompletion(projectId);
  } catch (error) {
    if (status) status.textContent = error.message;
    throw error;
  } finally {
    if (button) {
      button.dataset.running = "false";
      button.disabled = false;
    }
    updateGenerateAvailability();
  }
}

async function generateJianyingDraftAndOpen({ forceExecution = false } = {}) {
  selectOutputType("jianying_template");
  const status = document.querySelector("#videoProductStatus");
  await ensureVideoProjectForOutput();
  const missingReason = generationMissingReason();
  if (missingReason) {
    if (status) status.textContent = missingReason;
    if (!currentVideoProject()?.id) document.querySelector("#videoProjectReadiness")?.scrollIntoView({ behavior: "smooth", block: "center" });
    else document.querySelector("#videoProductAudio")?.focus();
    return null;
  }
  if (status) status.textContent = "正在一键生成剪映模板草稿...";
  await assertJianyingReadyForDraft();
  const project = await generateVideoProduct({ forceExecution });
  if (!project?.draft_path) {
    throw new Error("成片任务完成了，但没有返回剪映草稿路径；请检查模板母版和 capcut-result.json。");
  }
  if (status) status.textContent = `剪映草稿已生成：${project.draft_path}，正在打开剪映专业版...`;
  const openResult = await openJianyingApp();
  if (status) status.textContent = openResult?.ok
    ? `剪映草稿已导入并请求打开剪映：${project.draft_path}`
    : `剪映草稿已生成：${project.draft_path}；但剪映未打开：${openResult?.message || "未知原因"}`;
  return project;
}

async function autoRunWorkflowFromCurrentProject() {
  const status = document.querySelector("#videoProductStatus");
  const project = currentVideoProject();
  if (!project?.id) {
    if (status) status.textContent = "请先选择当前短视频项目。";
    window.appNavigate?.("dashboard");
    return null;
  }
  if (!project.selectedRewriteText && !project.transcriptText) {
    if (status) status.textContent = "当前项目还没有可用文案，请先完成文案提取并选择改写文案。";
    return null;
  }
  if (!project.selectedTtsAudio?.id) {
    const text = project.selectedRewriteText || project.transcriptText || "";
    const ttsText = document.querySelector("#ttsText");
    if (ttsText) {
      ttsText.value = text;
      ttsText.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (status) status.textContent = "已把当前文案送入 TTS，语音完成后可直接进入生产线。";
    window.appNavigate?.("tts");
    document.querySelector("#generateTts")?.click();
    return null;
  }
  if (!state.preview) await previewVideoProductTimeline();
  return generateJianyingDraftAndOpen();
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

async function waitForVideoProductCompletion(id, { timeoutMs = 180000, intervalMs = 1500 } = {}) {
  const startedAt = Date.now();
  let project = null;
  while (Date.now() - startedAt < timeoutMs) {
    project = await loadTimelineProject(id);
    await loadVideoProductProjects();
    if (!RUNNING_STATUSES.has(project.status)) {
      if (project.status === "completed") {
        await window.videoProjects?.setActiveProject?.(currentVideoProject()?.id);
        await Promise.allSettled([refreshReadiness(), refreshQualityCheck()]);
        return project;
      }
      throw new Error(project.error || project.blockers?.join("；") || "剪映草稿生成失败。");
    }
    const status = document.querySelector("#videoProductStatus");
    if (status) status.textContent = `${project.current_step || "正在生成剪映草稿"} · ${Number(project.progress || 0)}%`;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  throw new Error("剪映草稿生成超时，请到成片任务列表查看失败原因。");
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
    return result;
  } catch (error) {
    if (note) note.textContent = error.message;
    return { ok: false, message: error.message };
  }
}

function selectOutputType(outputType) {
  const select = document.querySelector("#videoProductOutputType");
  if (!select) return;
  select.value = outputType;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelectorAll("[data-main-output]").forEach((button) => button.classList.toggle("active", button.dataset.mainOutput === outputType));
}

function simplifyVideoOutputActions() {
  const generateButton = document.querySelector("#generateVideoProduct");
  if (generateButton) {
    generateButton.textContent = "一键导入剪映草稿";
    generateButton.title = "自动绑定语音、生产线分镜和镜头素材，生成剪映草稿并尝试打开剪映。";
  }
  ["autoBindTimeline", "autoRunWorkflow"].forEach((id) => {
    const button = document.querySelector(`#${id}`);
    if (button) button.hidden = true;
  });
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
  document.querySelector("#saveJianyingLocalConfig")?.addEventListener("click", () => saveJianyingLocalConfig().catch((error) => {
    const note = document.querySelector("#videoOutputCompatibilityNote");
    if (note) note.textContent = error.message;
  }));
  document.querySelector("#importJianyingTemplate")?.addEventListener("click", () => importJianyingTemplate().catch((error) => {
    const status = document.querySelector("#jianyingTemplateStatus");
    if (status) status.textContent = error.message;
  }));
  document.querySelector("#refreshVideoProductSources")?.addEventListener("click", () => loadVideoProductSources().then(() => previewVideoProductTimeline()).catch(() => {}));
  document.querySelector("#refreshVideoProductProjects")?.addEventListener("click", () => loadVideoProductProjects().catch(() => {}));
  document.querySelector("#refreshVideoProjectReadiness")?.addEventListener("click", () => Promise.allSettled([refreshReadiness(), refreshQualityCheck()]));
  document.querySelector("#videoProjectReadiness")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-readiness-action]");
    if (!button) return;
    const action = button.dataset.readinessAction || "";
    if (["voice", "assets", "template"].includes(action)) {
      event.preventDefault();
      event.stopPropagation();
      handleReadinessAction(action).catch((error) => {
        const status = document.querySelector("#videoProductStatus");
        if (status) status.textContent = error.message || "检查项处理失败。";
      });
    }
  });
  document.querySelector("#autoBindTimeline")?.addEventListener("click", async () => {
    try {
      await autoMatchExistingImageAssets();
    } catch (error) {
      const status = document.querySelector("#videoProductStatus");
      if (status) status.textContent = error.message;
    }
  });
  document.querySelector("#autoRunWorkflow")?.addEventListener("click", () => autoRunWorkflowFromCurrentProject().catch((error) => {
    const status = document.querySelector("#videoProductStatus");
    if (status) status.textContent = error.message;
  }));
  document.querySelector("#generateVideoProduct")?.addEventListener("click", () => generateJianyingDraftAndOpen().catch((error) => {
    const status = document.querySelector("#videoProductStatus");
    if (isForceableVideoProductError(error.message) && confirmForceVideoProduct(error.message)) {
      generateJianyingDraftAndOpen({ forceExecution: true }).catch((retryError) => {
        if (status) status.textContent = retryError.message || "强制生成剪映草稿失败。";
        else window.alert(retryError.message || "强制生成剪映草稿失败。");
      });
      return;
    }
    if (status) status.textContent = error.message || "生成剪映草稿失败，请检查生成前检查面板。";
    else window.alert(error.message || "生成剪映草稿失败，请检查生成前检查面板。");
  }));
  document.querySelector("#openVideoProductOutput")?.addEventListener("click", () => openVideoProductOutput().catch(() => {}));
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "j")) return;
    if (document.querySelector("#videoOutputPage")?.classList.contains("active") === false) return;
    event.preventDefault();
    generateJianyingDraftAndOpen().catch((error) => {
      const status = document.querySelector("#videoProductStatus");
      if (isForceableVideoProductError(error.message) && confirmForceVideoProduct(error.message)) {
        generateJianyingDraftAndOpen({ forceExecution: true }).catch((retryError) => {
          if (status) status.textContent = retryError.message || "强制生成剪映草稿失败。";
        });
        return;
      }
      if (status) status.textContent = error.message || "生成剪映草稿失败，请检查生成前检查面板。";
    });
  });
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
  document.querySelector("#videoProductJianyingTemplate")?.addEventListener("change", () => {
    state.templateManuallySelected = true;
    state.preview = null;
    previewVideoProductTimeline().catch(() => {});
  });
  ["videoProductAudio", "videoProductImageSource", "videoProductOutputType", "videoProductBgmStrategy", "videoProductBgm", "videoProductRouteAStyle", "videoProductRouteACustomStyle"].forEach((id) => {
    document.querySelector(`#${id}`)?.addEventListener("change", () => {
      if (id === "videoProductBgmStrategy" && document.querySelector("#videoProductBgmStrategy")?.value !== "manual") {
        const bgmSelect = document.querySelector("#videoProductBgm");
        if (bgmSelect) bgmSelect.value = "";
      }
      if (id === "videoProductBgm" && document.querySelector("#videoProductBgm")?.value) {
        const strategySelect = document.querySelector("#videoProductBgmStrategy");
        if (strategySelect) strategySelect.value = "manual";
      }
      if (id === "videoProductAudio") {
        state.manualBindings = {};
      }
      state.preview = null;
      updateGenerateAvailability();
      previewVideoProductTimeline().catch(() => {});
    });
  });
  const handleProjectChange = () => {
    state.preview = null;
    state.manualBindings = {};
    state.templateManuallySelected = false;
    Promise.allSettled([loadVideoProductSources(), loadVideoProductProjects(), refreshReadiness(), refreshQualityCheck()])
      .then(() => previewVideoProductTimeline().catch(() => {}));
  };
  window.addEventListener("video-project-changed", handleProjectChange);
}

export async function initVideoOutputModule() {
  const page = document.querySelector('[data-page="video-output"]');
  if (page) page.dataset.module = "video-output";
  window.__modularVideoOutputReady = true;
  simplifyVideoOutputActions();
  bindEvents();
  window.videoOutputModule = { loadVideoProductSources, loadVideoProductProjects, refreshReadiness, refreshQualityCheck, previewVideoProductTimeline, syncSelectionsToProject, generateVideoProduct, generateJianyingDraftAndOpen, autoRunWorkflowFromCurrentProject, pollVideoProductProject, openVideoProductOutput };
  await Promise.allSettled([loadJianyingLocalConfig(), refreshToolStatus(), loadVideoProductSources(), loadVideoProductProjects(), refreshReadiness(), refreshQualityCheck()]);
  await previewVideoProductTimeline().catch(() => {});
}
