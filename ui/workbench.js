const workbenchPages = {
  dashboard: {
    title: "首页",
    description: "查看任务进度、最近生成和内容生产流程。",
  },
  collector: {
    title: "视频下载",
    description: "粘贴链接、创建批量任务并管理下载队列。",
  },
  transcript: {
    title: "文案提取",
    description: "查看提取结果，并将文案送入改写。",
  },
  analysis: {
    title: "AI分析",
    description: "分析钩子、情绪、痛点、标签和行动号召。",
  },
  rewrite: {
    title: "AI改写",
    description: "原文、改写设置和多版本结果。",
  },
  tts: {
    title: "TTS语音",
    description: "选择声音、调整表达并生成配音。",
  },
  voices: {
    title: "声音资产",
    description: "管理预设音色、克隆音色和默认声音。",
  },
  director: {
    title: "AI导演",
    description: "从文案生成 Storyboard、镜头列表和导演稿。",
  },
  vfo: {
    title: "视频工厂",
    description: "视频策划、素材规划与渲染准备。",
  },
  files: {
    title: "文件资产",
    description: "集中查看、打开和清理本地文件。",
  },
  settings: {
    title: "系统设置",
    description: "API Key、模型映射和系统配置。",
  },
  imageStudio: {
    title: "图片生成",
    description: "输入 Prompt 生成图片，管理图片资产。",
  },
};

let activeWorkbenchPage = "dashboard";
let dashboardAudioJobs = [];
let workbenchOverviewTimer = 0;

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
  if (columns[1]) settingsLane.appendChild(columns[1]);
  [
    body.querySelector(".rewrite-result-head"),
    body.querySelector(".rewrite-progress"),
    body.querySelector(".rewrite-versions"),
  ].filter(Boolean).forEach((element) => outputLane.appendChild(element));

  addLaneHeading(sourceLane, "原始文案与分析", "确认输入内容和已有分析");
  addLaneHeading(settingsLane, "改写设置", "模型、方向、风格和修改要求");
  addLaneHeading(outputLane, "生成结果", "独立编辑、保存和发送到下一环节");

  originalGrid.remove();
  studio.append(sourceLane, settingsLane, outputLane);
  body.appendChild(studio);
}

function setupTtsStudio() {
  const lab = document.querySelector("#ttsLab");
  const oldWorkbench = lab?.querySelector(".tts-workbench");
  if (!lab || !oldWorkbench || lab.querySelector(".tts-studio-grid")) return;

  const scriptColumn = oldWorkbench.querySelector(".tts-script-column");
  const controlColumn = oldWorkbench.querySelector(".tts-control-column");
  const settings = lab.querySelector(".tts-settings");
  const preview = lab.querySelector(".tts-preview");
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

  addLaneHeading(inputLane, "输入文案", "手动输入或从改写结果带入");
  addLaneHeading(settingsLane, "声音设置", "平台、音色、语速、音量和情绪");
  addLaneHeading(resultLane, "试听结果", "播放、检查并管理生成记录");

  oldWorkbench.remove();
  studio.append(inputLane, settingsLane, resultLane);
  lab.querySelector(".tts-head")?.after(studio);
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
  addLaneHeading(resultLane, "Storyboard结果", "镜头、字幕、Prompt和导出");

  oldWorkbench.remove();
  studio.append(sourceLane, settingsLane, resultLane);
  system.querySelector(".director-head")?.after(studio);
}

function setupVfoFutureStep() {
  const system = document.querySelector("#vfoSystem");
  if (!system || system.querySelector(".vfo-next-stage")) return;
  const nextStage = document.createElement("section");
  nextStage.className = "vfo-next-stage";
  nextStage.innerHTML = `
    <div>
      <span class="section-eyebrow">NEXT STAGE</span>
      <strong>生成成品视频 MVP</strong>
      <p>本地图片 + TTS音频 + 字幕 + 简单转场，使用 FFmpeg 输出 MP4。</p>
    </div>
    <button type="button" disabled title="第二阶段开发">下一阶段开发</button>
  `;
  system.appendChild(nextStage);
}

function buildWorkbenchInformationArchitecture() {
  const content = document.querySelector("#workbenchContent");
  const dashboard = document.querySelector("#dashboardPage");
  if (!content || !dashboard) return;

  dashboard.classList.add("workbench-page");
  dashboard.dataset.page = "dashboard";

  const apiPanel = document.querySelector(".api-panel");
  const settingsPage = createWorkbenchPage("settings");
  const settingsTopbar = appendExisting(settingsPage, ".topbar");
  if (settingsTopbar) {
    const title = settingsTopbar.querySelector("h1");
    if (title) title.textContent = "目录与存储";
  }
  if (apiPanel) settingsPage.appendChild(apiPanel);
  const v2Settings = document.getElementById("v2SettingsPanel");
  if (v2Settings) settingsPage.appendChild(v2Settings);

  const pageMap = {
    collector: [".workspace", ".batch-area"],
    transcript: [".result-area"],
    analysis: ["#analysisPanel"],
    rewrite: ["#rewritePanel"],
    tts: ["#ttsLab"],
    voices: ["#voiceAssetCenter"],
    director: ["#directorSystem"],
    vfo: ["#vfoSystem"],
    files: [".files-area"],
    imageStudio: ["#imageStudioPanel"],
  };

  const pages = [dashboard];
  Object.entries(pageMap).forEach(([pageId, selectors]) => {
    const page = createWorkbenchPage(pageId);
    selectors.forEach((selector) => appendExisting(page, selector));
    pages.push(page);
  });
  pages.push(settingsPage);
  content.replaceChildren(...pages);

  setupRewriteStudio();
  setupTtsStudio();
  setupDirectorStudio();
  setupVfoFutureStep();
  setupImageStudio();
  setupV2Settings();
}

function navigateWorkbench(pageId, options = {}) {
  const target = workbenchPages[pageId] ? pageId : "dashboard";
  activeWorkbenchPage = target;
  document.querySelectorAll(".workbench-page").forEach((page) => {
    page.classList.toggle("active", page.dataset.page === target);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.nav === target;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  const config = workbenchPages[target];
  const title = document.querySelector("#workbenchPageTitle");
  const description = document.querySelector("#workbenchPageDescription");
  if (title) title.textContent = config.title;
  if (description) description.textContent = config.description;

  if (target === "analysis" && analysisPanel) analysisPanel.hidden = false;
  if (target === "rewrite" && rewritePanel) rewritePanel.hidden = false;
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

function renderRail(tasks, directors, vfoProjects, audioJobs) {
  const current = document.querySelector("#railCurrentTask");
  const recent = document.querySelector("#railRecentOutput");
  const errors = document.querySelector("#railErrors");
  const running = tasks.find((task) => ["下载中", "提取中", "running", "processing"].includes(task.status));

  if (current) {
    current.innerHTML = running
      ? `
        <strong>${escapeHtml(running.title || `任务 #${running.id}`)}</strong>
        <small>${escapeHtml(running.message || running.status)}</small>
        <div class="rail-progress"><i style="width:${Math.max(0, Math.min(100, Number(running.progress || 0)))}%"></i></div>
        <span>${Number(running.progress || 0)}%</span>
      `
      : "<strong>暂无运行任务</strong><small>新任务会显示在这里</small>";
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
    errors.innerHTML = failed.length
      ? failed.map((task) => `
        <button type="button" class="rail-list-item error-item" data-nav="collector">
          <span>任务 #${Number(task.id || 0)}</span>
          <strong>${escapeHtml(task.error || task.message || "处理失败")}</strong>
        </button>
      `).join("")
      : '<div class="rail-empty success-text">当前没有错误</div>';
  }
}

function renderWorkbenchOverview() {
  const tasks = typeof allTasks === "undefined" ? [] : allTasks;
  const directors = typeof directorProjectsState === "undefined" ? [] : directorProjectsState;
  const vfoItems = typeof vfoProjectsState === "undefined" ? [] : vfoProjectsState;

  setMetric("metricTodayVideos", tasks.filter((task) => isToday(task.created_at)).length);
  setMetric("metricTranscripts", tasks.filter((task) => task.txt_path).length);
  setMetric("metricRewrites", tasks.filter(hasRewrite).length);
  setMetric("metricAudio", dashboardAudioJobs.filter((job) => job.status === "completed").length);
  setMetric("metricDirectors", directors.filter((project) => project.status === "completed").length);
  setMetric("metricRenderPlans", vfoItems.filter((project) => project.status === "completed").length);
  renderDashboardTasks(tasks);
  renderRail(tasks, directors, vfoItems, dashboardAudioJobs);
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

function bindWorkbenchInteractions() {
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      navigateWorkbench(nav.dataset.nav, {
        focusPrimary: nav.dataset.nav === "collector" && activeWorkbenchPage === "dashboard",
      });
    }

    if (event.target.closest(".transcript-analyze")) navigateWorkbench("analysis");
    if (event.target.closest(".transcript-rewrite")) navigateWorkbench("rewrite");
    if (event.target.closest(".rewrite-tts-one, .voice-use")) navigateWorkbench("tts");
    if (event.target.closest(".rewrite-director-one")) navigateWorkbench("director");
    if (event.target.closest("#sendDirectorToVfo")) navigateWorkbench("vfo");
    if (event.target.closest("#closeAnalysis, #closeRewrite")) navigateWorkbench("transcript");
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
  bindWorkbenchInteractions();
  startWorkbenchObservers();

  // WebSocket 进度监听
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${location.port}/ws/progress`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.taskId) {
        const rail = document.getElementById("railRecentOutput");
        if (rail) {
          rail.innerHTML = `<div class="rail-item"><span class="task-status">${data.status || 'running'}</span> ${data.currentStep || data.taskId}</div>` + rail.innerHTML.replace(/<div class="rail-empty">.*<\/div>/, "");
        }
      }
    };
    ws.onerror = () => {}; // 静默处理
  } catch {}
  window.addEventListener("hashchange", () => {
    const pageId = window.location.hash.replace(/^#/, "");
    if (workbenchPages[pageId]) navigateWorkbench(pageId, { instant: true, fromHash: true });
  });
  const hashPage = window.location.hash.replace(/^#/, "");
  const saved = localStorage.getItem("short-video-workbench-page");
  navigateWorkbench(
    workbenchPages[hashPage] ? hashPage : workbenchPages[saved] ? saved : "dashboard",
    { instant: true, fromHash: Boolean(workbenchPages[hashPage]) }
  );
}

function setupImageStudio() {
  const panel = document.getElementById("imageStudioPanel");
  if (!panel) return;

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
    });
  });

  // 生成按钮
  document.getElementById("imageGenerateBtn").addEventListener("click", async () => {
    const prompt = document.getElementById("imagePrompt").value.trim();
    if (!prompt) { setStatus("请先输入图片描述"); return; }

    const count = parseInt(panel.querySelector(".btn-count.active").dataset.count);
    const aspectRatio = document.getElementById("imageAspectRatio").value;
    const btn = document.getElementById("imageGenerateBtn");
    const statusEl = document.getElementById("imageGenerateStatus");

    btn.disabled = true;
    btn.textContent = "⏳ 生成中...";
    setStatus(`正在生成 ${count} 张图片...`);

    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, count, aspectRatio }),
      });
      const data = await res.json();
      if (data.jobId) {
        setStatus(`✅ 生成完成：成功 ${data.success} 张` + (data.failed > 0 ? `，失败 ${data.failed} 张` : ""));
        renderResults(data.results || []);
      } else {
        setStatus("❌ " + (data.error || "生成失败"));
      }
    } catch (e) {
      setStatus("❌ 请求失败: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "🎨 生成图片";
    }
  });

  function setStatus(msg) {
    const el = document.getElementById("imageGenerateStatus");
    if (el) el.textContent = msg;
  }

  function renderResults(results) {
    const grid = document.getElementById("imageResultsGrid");
    if (!results.length) { grid.innerHTML = '<div class="empty-state">无结果</div>'; return; }
    grid.innerHTML = results.map((r, i) => {
      if (!r.success) return `<div class="img-card error">第${i+1}张: ${r.error || "失败"}</div>`;
      return `<div class="img-card" data-asset-id="${r.assetId || ""}">
        <div class="img-preview">
          <img src="/api/image/file?path=${encodeURIComponent(r.imagePath || "")}" alt="生成图片" loading="lazy" />
        </div>
        <div class="img-actions">
          <button class="btn-sm" onclick="window.open('/api/image/file?path=${encodeURIComponent(r.imagePath || "")}')">预览</button>
          <button class="btn-sm" onclick="fetch('/api/image/assets/${r.assetId}/delete',{method:'POST'}).then(()=>this.closest('.img-card').remove())">删除</button>
          <button class="btn-sm" onclick="document.getElementById('imagePrompt').value='${(prompt || "").replace(/'/g, "\\'")}';document.getElementById('imageGenerateBtn').click()">重新生成</button>
        </div>
      </div>`;
    }).join("");
  }

  async function loadImageAssets() {
    const grid = document.getElementById("imageAssetsGrid");
    try {
      const res = await fetch("/api/image/assets");
      const data = await res.json();
      const assets = data.assets || [];
      if (!assets.length) { grid.innerHTML = '<div class="empty-state">暂无保存的图片资产</div>'; return; }
      grid.innerHTML = assets.map(a => `
        <div class="img-card">
          <div class="img-preview">
            <img src="/api/image/file?path=${encodeURIComponent(a.original_path || "")}" alt="asset" loading="lazy" />
          </div>
          <div class="img-meta">
            <span>${(a.prompt || "").slice(0, 30)}</span>
            <span class="text-xs text-secondary">${(a.created_at || "").slice(0, 10)}</span>
          </div>
          <div class="img-actions">
            <button class="btn-sm" onclick="window.open('/api/image/file?path=${encodeURIComponent(a.original_path || "")}')">预览</button>
            <button class="btn-sm" onclick="fetch('/api/image/assets/${a.id}/delete',{method:'POST'}).then(()=>this.closest('.img-card').remove())">删除</button>
          </div>
        </div>
      `).join("");
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
    const nav = e.target.closest("[data-nav]");
    if (nav && nav.dataset.nav === "image-studio") {
      setTimeout(loadImageAssets, 100);
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
    { key: "rewrite", label: "AI 改写", hint: "多版本文案生成" },
    { key: "director", label: "AI 导演", hint: "故事弧、分镜、镜头计划" },
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
      ${provider.supportsModel ? `
        <label>
          默认模型
          <input class="provider-input" data-field="model" data-provider="${html(provider.id)}" type="text" value="${html(provider.model || "")}" placeholder="模型名" list="${datalistId}" />
          <datalist id="${datalistId}">
            ${(provider.models || []).map((model) => `<option value="${html(model)}"></option>`).join("")}
          </datalist>
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
              </div>
            </div>
            <div class="provider-fields">
              ${providerInputTemplate(provider)}
            </div>
            <div class="provider-actions">
              <button class="primary small" type="button" data-save-provider="${html(provider.id)}">保存</button>
              ${provider.group === "文本模型" || provider.group === "TTS 语音" ? `<button class="ghost small" type="button" data-default-provider="${html(provider.id)}">设为默认</button>` : ""}
              <button class="ghost small" type="button" data-test-provider="${html(provider.id)}">检查</button>
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
initWorkbench();
