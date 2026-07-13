import { postJson } from "./api.js";

const DEFAULT_SUBJECT = "人工智能如何改变普通人的日常生活";
const POLL_INTERVAL_MS = 2500;

export function initMoneyPrinterModule() {
  const page = document.getElementById("moneyPrinterPage");
  if (!page) return;

  const els = {
    status: document.getElementById("moneyPrinterStatus"),
    detail: document.getElementById("moneyPrinterDetail"),
    apiBadge: document.getElementById("moneyPrinterApiBadge"),
    rootPath: document.getElementById("moneyPrinterRootPath"),
    startApi: document.getElementById("moneyPrinterStartApi"),
    refresh: document.getElementById("moneyPrinterRefresh"),
    openDocs: document.getElementById("moneyPrinterOpenDocs"),
    openRoot: document.getElementById("moneyPrinterOpenRoot"),
    openTasks: document.getElementById("moneyPrinterOpenTasks"),
    form: document.getElementById("moneyPrinterForm"),
    subject: document.getElementById("moneyPrinterSubject"),
    script: document.getElementById("moneyPrinterScript"),
    terms: document.getElementById("moneyPrinterTerms"),
    source: document.getElementById("moneyPrinterSource"),
    localMaterials: document.getElementById("moneyPrinterLocalMaterials"),
    aspect: document.getElementById("moneyPrinterAspect"),
    voice: document.getElementById("moneyPrinterVoice"),
    bgm: document.getElementById("moneyPrinterBgm"),
    clipDuration: document.getElementById("moneyPrinterClipDuration"),
    videoCount: document.getElementById("moneyPrinterVideoCount"),
    matchScript: document.getElementById("moneyPrinterMatchScript"),
    submit: document.getElementById("moneyPrinterSubmit"),
    example: document.getElementById("moneyPrinterExample"),
    progress: document.getElementById("moneyPrinterProgress"),
    progressFill: document.getElementById("moneyPrinterProgressFill"),
    progressPercent: document.getElementById("moneyPrinterProgressPercent"),
    taskId: document.getElementById("moneyPrinterTaskId"),
    taskState: document.getElementById("moneyPrinterTaskState"),
    taskVideos: document.getElementById("moneyPrinterTaskVideos"),
    taskList: document.getElementById("moneyPrinterTaskList"),
    assetList: document.getElementById("moneyPrinterAssets"),
    apiLogs: document.getElementById("moneyPrinterApiLogs"),
  };

  let currentStatus = null;
  let currentTaskId = "";
  let pollTimer = null;

  const setStatus = (title, detail = "", isError = false) => {
    if (els.status) els.status.textContent = title;
    if (els.detail) els.detail.textContent = detail;
    page.classList.toggle("money-printer-error", Boolean(isError));
  };

  const setProgress = (value) => {
    const percent = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
    if (els.progressFill) els.progressFill.style.width = `${percent}%`;
    if (els.progressPercent) els.progressPercent.textContent = `${percent}%`;
  };

  const stopPolling = () => {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = null;
  };

  const renderStatus = (status) => {
    currentStatus = status;
    const installed = Boolean(status.installed);
    const online = Boolean(status.api?.online);
    els.apiBadge.textContent = online ? "API 在线" : installed ? "API 未启动" : "未安装";
    els.apiBadge.className = `money-printer-badge ${online ? "ready" : installed ? "warning" : "error"}`;
    els.rootPath.textContent = status.root || "";
    els.startApi.disabled = !installed || online;
    els.openDocs.disabled = !online;
    els.openRoot.disabled = !installed;
    els.openTasks.disabled = !installed;
    els.submit.disabled = !online;
    if (status.defaults) {
      if (!els.aspect.value) els.aspect.value = status.defaults.aspect || "16:9";
      if (!els.voice.value) els.voice.value = status.defaults.voice || "zh-CN-XiaoxiaoNeural-Female";
    }
    renderLogs(status.process?.logs || []);
    setStatus(
      online ? "MoneyPrinterTurbo 已就绪" : installed ? "MoneyPrinterTurbo 已克隆，等待启动 API" : "未找到 MoneyPrinterTurbo",
      online ? `API：${status.api.baseUrl}` : installed ? "首次启动会通过 uv 准备依赖，可能需要几分钟。" : "请先确认 D:\\cs1\\MoneyPrinterTurbo 是否存在。",
      !installed,
    );
  };

  const renderLogs = (logs = []) => {
    if (!els.apiLogs) return;
    els.apiLogs.textContent = logs.length ? logs.slice(-40).join("\n") : "暂无 API 启动日志。";
  };

  const refreshStatus = async () => {
    try {
      const response = await fetch("/api/money-printer/status", { cache: "no-store" });
      const data = await response.json();
      renderStatus(data);
      if (data.api?.online) {
        await Promise.all([loadAssets(), loadTasks()]);
      }
      return data;
    } catch (error) {
      setStatus("状态读取失败", error instanceof Error ? error.message : String(error), true);
      return null;
    }
  };

  const loadAssets = async () => {
    if (!els.assetList) return;
    try {
      const response = await fetch("/api/money-printer/assets", { cache: "no-store" });
      const data = await response.json();
      if (!data.apiOnline) {
        els.assetList.innerHTML = "<p>API 启动后显示本地 BGM 和本地素材。</p>";
        return;
      }
      const bgm = Array.isArray(data.bgm) ? data.bgm : [];
      const materials = Array.isArray(data.materials) ? data.materials : [];
      els.assetList.innerHTML = `
        <div><strong>BGM</strong><span>${bgm.length} 个</span></div>
        <div><strong>本地素材</strong><span>${materials.length} 个</span></div>
        <small>本地素材来自 MoneyPrinterTurbo 的 storage/local_videos 目录。</small>
      `;
    } catch {
      els.assetList.innerHTML = "<p>素材列表读取失败。</p>";
    }
  };

  const loadTasks = async () => {
    if (!els.taskList) return;
    try {
      const response = await fetch("/api/money-printer/tasks", { cache: "no-store" });
      const data = await response.json();
      const tasks = Array.isArray(data.tasks) ? data.tasks : [];
      if (!tasks.length) {
        els.taskList.innerHTML = "<p>还没有 MoneyPrinterTurbo 任务。</p>";
        return;
      }
      els.taskList.innerHTML = tasks.slice(0, 10).map((task) => `
        <button type="button" data-mpt-task="${escapeHtml(task.task_id || "")}">
          <strong>${escapeHtml(task.task_id || "unknown")}</strong>
          <span>${escapeHtml(task.stateLabel || "")} · ${Number(task.progress || 0)}%</span>
        </button>
      `).join("");
    } catch {
      els.taskList.innerHTML = "<p>任务列表读取失败。</p>";
    }
  };

  const pollTask = async (taskId) => {
    if (!taskId) return;
    try {
      const response = await fetch(`/api/money-printer/task?id=${encodeURIComponent(taskId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.message || "读取任务失败。");
      renderTask(data.task);
      if (Number(data.task.state) === 1 || Number(data.task.state) === -1) {
        stopPolling();
        await loadTasks();
      }
    } catch (error) {
      stopPolling();
      setStatus("任务轮询失败", error instanceof Error ? error.message : String(error), true);
    }
  };

  const renderTask = (task) => {
    currentTaskId = task.task_id || currentTaskId;
    els.taskId.textContent = currentTaskId || "未创建";
    els.taskState.textContent = task.stateLabel || "等待中";
    setProgress(task.progress || 0);
    const videos = Array.isArray(task.videos) ? task.videos : [];
    if (!videos.length) {
      els.taskVideos.innerHTML = "<p>生成完成后这里会出现 MP4 链接。</p>";
      return;
    }
    els.taskVideos.innerHTML = videos.map((video, index) => `
      <div class="money-printer-video-row">
        <a href="${escapeAttr(video)}" target="_blank" rel="noreferrer">成片 ${index + 1}</a>
        <button type="button" data-open-video="${escapeAttr(video)}">打开</button>
      </div>
    `).join("");
  };

  const startApi = async () => {
    els.startApi.disabled = true;
    setStatus("正在启动 MoneyPrinterTurbo API", "首次启动会安装/校验 Python 依赖，请耐心等一下。");
    try {
      const data = await postJson("/api/money-printer/start-api", {});
      renderStatus(data);
      if (!data.api?.online) {
        const waitTimer = window.setInterval(async () => {
          const next = await refreshStatus();
          if (next?.api?.online) window.clearInterval(waitTimer);
        }, 3000);
      }
    } catch (error) {
      setStatus("启动失败", error instanceof Error ? error.message : String(error), true);
    } finally {
      els.startApi.disabled = Boolean(currentStatus?.api?.online);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    stopPolling();
    els.submit.disabled = true;
    setProgress(4);
    setStatus("正在提交 MoneyPrinterTurbo 任务", "任务创建后会自动轮询进度。");
    try {
      const payload = {
        video_subject: els.subject.value.trim(),
        video_script: els.script.value.trim(),
        video_terms: els.terms.value.trim(),
        video_source: els.source.value,
        video_materials: els.localMaterials.value.trim(),
        video_aspect: els.aspect.value,
        voice_name: els.voice.value.trim(),
        bgm_type: els.bgm.value,
        video_clip_duration: els.clipDuration.value,
        video_count: els.videoCount.value,
        match_materials_to_script: els.matchScript.checked,
      };
      const data = await postJson("/api/money-printer/generate", payload);
      currentTaskId = data.task?.task_id || "";
      els.taskId.textContent = currentTaskId || "已创建";
      els.taskState.textContent = "生成中";
      setStatus("任务已创建", `MoneyPrinterTurbo task_id：${currentTaskId}`);
      pollTimer = window.setInterval(() => pollTask(currentTaskId), POLL_INTERVAL_MS);
      await pollTask(currentTaskId);
    } catch (error) {
      setStatus("创建任务失败", error instanceof Error ? error.message : String(error), true);
    } finally {
      els.submit.disabled = !currentStatus?.api?.online;
    }
  };

  const openTarget = async (target, extra = {}) => {
    try {
      await postJson("/api/money-printer/open", { target, ...extra });
    } catch (error) {
      setStatus("打开失败", error instanceof Error ? error.message : String(error), true);
    }
  };

  els.startApi.addEventListener("click", startApi);
  els.refresh.addEventListener("click", refreshStatus);
  els.openDocs.addEventListener("click", () => openTarget("docs"));
  els.openRoot.addEventListener("click", () => openTarget("root"));
  els.openTasks.addEventListener("click", () => openTarget("tasks"));
  els.example.addEventListener("click", () => {
    els.subject.value = DEFAULT_SUBJECT;
    els.script.value = "";
    els.terms.value = "daily life, artificial intelligence, technology, future";
  });
  els.source.addEventListener("change", () => {
    page.classList.toggle("money-printer-local-source", els.source.value === "local");
  });
  els.taskVideos.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-video]");
    if (button) openTarget("task-video", { url: button.dataset.openVideo });
  });
  els.taskList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mpt-task]");
    if (!button) return;
    stopPolling();
    currentTaskId = button.dataset.mptTask || "";
    pollTask(currentTaskId);
  });
  els.form.addEventListener("submit", submit);

  page.classList.toggle("money-printer-local-source", els.source.value === "local");
  refreshStatus();
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
