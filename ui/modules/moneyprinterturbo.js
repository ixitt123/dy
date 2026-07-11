const MONEYPRINTER_HANDOFF_KEY = "video-factory-moneyprinterturbo-handoff";

function activeProject() {
  return window.videoProjects?.current?.() || null;
}

function navigateToMoneyPrinter() {
  window.appNavigate?.("moneyprinterturbo");
  window.workbenchNavigate?.("moneyprinterturbo", { preserveScroll: true });
}

function readHandoff() {
  try {
    return JSON.parse(localStorage.getItem(MONEYPRINTER_HANDOFF_KEY) || "null");
  } catch {
    return null;
  }
}

function writeHandoff(handoff) {
  if (!handoff) {
    localStorage.removeItem(MONEYPRINTER_HANDOFF_KEY);
    return;
  }
  localStorage.setItem(MONEYPRINTER_HANDOFF_KEY, JSON.stringify(handoff));
}

async function postJson(url, body = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || "请求失败");
  return data;
}

async function copyText(text) {
  await navigator.clipboard.writeText(String(text || ""));
}

async function openLocalPath(filePath) {
  return await postJson("/api/open-path", { filePath });
}

export function sendConfirmedTtsToMoneyPrinterTurbo(job, project = activeProject()) {
  if (!job?.id || job.status !== "completed" || !job.audio_path) {
    throw new Error("请先生成、试听并确认一条可用的 TTS 音频。");
  }
  const handoff = {
    projectId: project?.id || "",
    projectTitle: project?.title || "",
    title: project?.title || job.voice_name || "MoneyPrinterTurbo 视频",
    text: String(job.text || project?.selectedRewriteText || project?.transcriptText || "").trim(),
    ttsJob: job,
    sentAt: new Date().toISOString(),
  };
  if (!handoff.text) throw new Error("已确认音频缺少对应文案，无法发送到 MoneyPrinterTurbo。");
  writeHandoff(handoff);
  navigateToMoneyPrinter();
  window.dispatchEvent(new CustomEvent("video-factory:moneyprinterturbo-handoff", { detail: handoff }));
  return handoff;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function initMoneyPrinterTurboModule() {
  const nav = document.querySelector('[data-nav="settings"]')?.closest(".nav-group");
  const settingsPage = document.querySelector('[data-page="settings"]');
  if (!nav || !settingsPage || document.querySelector('[data-nav="moneyprinterturbo"]')) return;

  const group = document.createElement("div");
  group.className = "nav-group";
  group.innerHTML = `
    <button class="nav-item" type="button" data-nav="moneyprinterturbo">
      <span class="nav-index">07</span><span>MoneyPrinterTurbo</span>
    </button>`;
  nav.before(group);

  const page = document.createElement("section");
  page.className = "workbench-page";
  page.dataset.page = "moneyprinterturbo";
  page.id = "moneyPrinterTurboPage";
  page.innerHTML = `
    <section class="embedded-production-line">
      <div class="result-head production-line-head">
        <div>
          <span class="section-eyebrow">PRODUCTION LINE 03</span>
          <h2>MoneyPrinterTurbo</h2>
          <p>保留官方原版工作台，同时支持把当前确认的 TTS 文案与真实音频直接送入官方 API。</p>
        </div>
        <div class="production-line-actions">
          <button class="ghost" id="moneyPrinterRefresh" type="button">检测服务</button>
          <button class="secondary" id="moneyPrinterOpen" type="button">在浏览器打开</button>
        </div>
      </div>
      <div class="production-line-notice" id="moneyPrinterStatus">正在检测 MoneyPrinterTurbo...</div>
      <div class="production-line-notice" id="moneyPrinterHandoffStatus">请先在 TTS 语音页确认音频，再发送到 MoneyPrinterTurbo。</div>
      <div class="production-line-actions">
        <button class="primary" id="moneyPrinterLaunchFromTts" type="button">用当前 TTS 启动官方任务</button>
        <button class="ghost" id="moneyPrinterCopyScript" type="button">复制文案</button>
        <button class="ghost" id="moneyPrinterOpenAudio" type="button">打开音频文件</button>
      </div>
      <div class="settings-grid moneyprinter-launch-grid">
        <label>输出比例
          <select id="moneyPrinterAspect">
            <option value="9:16" selected>9:16 竖屏</option>
            <option value="16:9">16:9 横屏</option>
            <option value="1:1">1:1 方屏</option>
          </select>
        </label>
        <label>素材来源
          <select id="moneyPrinterSource">
            <option value="pexels" selected>Pexels 官方素材</option>
            <option value="pixabay">Pixabay 官方素材</option>
          </select>
        </label>
        <label>单段时长（秒）
          <input id="moneyPrinterClipDuration" type="number" min="2" max="8" step="1" value="5" />
        </label>
      </div>
      <div class="production-line-notice" id="moneyPrinterTaskStatus">等待官方任务。</div>
      <div class="result-log" id="moneyPrinterTaskLinks"></div>
      <iframe id="moneyPrinterFrame" class="production-line-frame" title="MoneyPrinterTurbo 原版工作台"></iframe>
    </section>`;
  settingsPage.before(page);

  const settingsPanel = document.createElement("section");
  settingsPanel.className = "settings-section moneyprinter-settings";
  settingsPanel.innerHTML = `
    <div class="result-head">
      <div>
        <h2>MoneyPrinterTurbo 设置</h2>
        <p>管理官方源码目录、原版 WebUI 地址和后台服务。更新只影响 MoneyPrinterTurbo 子模块。</p>
      </div>
    </div>
    <div class="settings-grid">
      <label>源码目录<input id="moneyPrinterInstallDir" type="text" /></label>
      <label>服务地址<input id="moneyPrinterServiceUrl" type="url" value="http://127.0.0.1:8501" /></label>
    </div>
    <div class="settings-actions">
      <button class="secondary" id="moneyPrinterSave" type="button">保存设置</button>
      <button class="primary" id="moneyPrinterStart" type="button">后台启动</button>
      <button class="ghost" id="moneyPrinterStop" type="button">停止服务</button>
      <button class="ghost" id="moneyPrinterUpdate" type="button">更新官方源码</button>
      <span id="moneyPrinterSettingsStatus">等待检测</span>
    </div>`;
  settingsPage.append(settingsPanel);

  const status = page.querySelector("#moneyPrinterStatus");
  const handoffStatus = page.querySelector("#moneyPrinterHandoffStatus");
  const taskStatus = page.querySelector("#moneyPrinterTaskStatus");
  const taskLinks = page.querySelector("#moneyPrinterTaskLinks");
  const frame = page.querySelector("#moneyPrinterFrame");
  const aspectSelect = page.querySelector("#moneyPrinterAspect");
  const sourceSelect = page.querySelector("#moneyPrinterSource");
  const clipDurationInput = page.querySelector("#moneyPrinterClipDuration");
  const launchButton = page.querySelector("#moneyPrinterLaunchFromTts");
  const installInput = settingsPanel.querySelector("#moneyPrinterInstallDir");
  const serviceInput = settingsPanel.querySelector("#moneyPrinterServiceUrl");
  const settingsStatus = settingsPanel.querySelector("#moneyPrinterSettingsStatus");
  let serviceUrl = "http://127.0.0.1:8501";
  let serviceOnline = false;
  let activeHandoff = readHandoff();
  let pollingTimer = 0;
  let activeTaskId = "";

  const renderTask = (task = null) => {
    if (!task) {
      taskLinks.innerHTML = "";
      return;
    }
    const links = [
      ...(Array.isArray(task.videos) ? task.videos.map((item, index) => ({ label: `成片 ${index + 1}`, href: item })) : []),
      ...(Array.isArray(task.combined_videos) ? task.combined_videos.map((item, index) => ({ label: `拼接视频 ${index + 1}`, href: item })) : []),
      task.subtitle_path ? { label: "字幕", href: task.subtitle_path } : null,
      task.audio_file ? { label: "音频", href: task.audio_file } : null,
    ].filter(Boolean);
    taskLinks.innerHTML = [
      `<div><strong>Task:</strong> ${escapeHtml(task.task_id || activeTaskId || "-")}</div>`,
      `<div><strong>状态:</strong> ${escapeHtml(task.state || "unknown")} · ${Number(task.progress || 0)}%</div>`,
      links.length
        ? links.map((item) => {
          const href = String(item.href || "");
          if (/^[a-z]:[\\/]/i.test(href) || href.startsWith("\\\\")) {
            return `<div><button class="ghost small" type="button" data-open-local-path="${escapeHtml(href)}">${escapeHtml(item.label)}</button></div>`;
          }
          return `<div><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(item.label)}</a></div>`;
        }).join("")
        : "<div>任务还没有可打开的产物。</div>",
    ].join("");
  };

  const syncHandoffStatus = () => {
    const handoff = activeHandoff;
    const ready = Boolean(handoff?.ttsJob?.audio_path && handoff?.text);
    handoffStatus.textContent = ready
      ? `已接收确认音频 #${handoff.ttsJob?.id || "-"}：${handoff.title || "未命名项目"}。将把真实音频作为 custom_audio_file 送入官方任务。`
      : "请先在 TTS 语音页确认音频，再发送到 MoneyPrinterTurbo。";
    launchButton.disabled = !ready || !serviceOnline;
  };

  const stopPolling = () => {
    if (pollingTimer) window.clearTimeout(pollingTimer);
    pollingTimer = 0;
  };

  const pollTask = async (taskId) => {
    stopPolling();
    if (!taskId) return;
    activeTaskId = taskId;
    try {
      const data = await fetch(`/api/moneyprinterturbo/tasks?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" }).then((res) => res.json());
      if (!data.ok) throw new Error(data.message || "读取官方任务失败");
      const task = data.task || {};
      const taskState = String(task.state || "").toUpperCase();
      taskStatus.textContent = `官方任务 ${task.task_id || taskId}：${task.state || "unknown"} · ${Number(task.progress || 0)}%`;
      renderTask(task);
      if (["COMPLETE", "COMPLETED", "SUCCESS"].includes(taskState) || Number(task.progress || 0) >= 100) return;
      if (["FAILED", "ERROR"].includes(taskState)) return;
      pollingTimer = window.setTimeout(() => pollTask(taskId), 2500);
    } catch (error) {
      taskStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  };

  async function refresh() {
    try {
      const response = await fetch("/api/moneyprinterturbo/status");
      const data = await response.json();
      serviceUrl = data.serviceUrl || serviceUrl;
      serviceOnline = Boolean(data.online);
      installInput.value = data.installDir || "";
      serviceInput.value = serviceUrl;
      settingsStatus.textContent = data.message || "检测完成";
      status.textContent = data.online
        ? `服务已连接：${serviceUrl}`
        : `服务未启动。${data.message || "请在系统设置中配置并启动。"}`;
      frame.src = data.online ? serviceUrl : "about:blank";
      syncHandoffStatus();
    } catch (error) {
      serviceOnline = false;
      status.textContent = `检测失败：${error.message || error}`;
      syncHandoffStatus();
    }
  }

  async function post(action, body = {}) {
    const data = await postJson(`/api/moneyprinterturbo/${action}`, body);
    settingsStatus.textContent = data.message || "操作完成";
    return data;
  }

  page.querySelector("#moneyPrinterRefresh").addEventListener("click", refresh);
  page.querySelector("#moneyPrinterOpen").addEventListener("click", () => window.open(serviceUrl, "_blank", "noopener"));
  page.querySelector("#moneyPrinterCopyScript").addEventListener("click", async () => {
    if (!activeHandoff?.text) {
      taskStatus.textContent = "当前没有可复制的 MoneyPrinterTurbo 文案。";
      return;
    }
    try {
      await copyText(activeHandoff.text);
      taskStatus.textContent = "已复制当前确认文案。";
    } catch (error) {
      taskStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  page.querySelector("#moneyPrinterOpenAudio").addEventListener("click", async () => {
    if (!activeHandoff?.ttsJob?.audio_path) {
      taskStatus.textContent = "当前没有可打开的确认音频。";
      return;
    }
    try {
      await openLocalPath(activeHandoff.ttsJob.audio_path);
      taskStatus.textContent = `已打开确认音频：#${activeHandoff.ttsJob.id}`;
    } catch (error) {
      taskStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  launchButton.addEventListener("click", async () => {
    if (!activeHandoff?.ttsJob?.audio_path || !activeHandoff?.text) {
      taskStatus.textContent = "请先在 TTS 语音页确认音频并发送到 MoneyPrinterTurbo。";
      return;
    }
    launchButton.disabled = true;
    taskStatus.textContent = "正在提交官方任务...";
    try {
      const clipDuration = Math.max(2, Math.min(8, Number(clipDurationInput.value || 5) || 5));
      const data = await postJson("/api/moneyprinterturbo/videos", {
        video_subject: activeHandoff.title || "MoneyPrinterTurbo 视频",
        video_script: activeHandoff.text,
        video_aspect: aspectSelect.value || "9:16",
        video_source: sourceSelect.value || "pexels",
        video_clip_duration: clipDuration,
        video_count: 1,
        match_materials_to_script: true,
        custom_audio_file: activeHandoff.ttsJob.audio_path,
        subtitle_enabled: true,
        bgm_type: "",
      });
      activeTaskId = data.taskId || data.task?.task_id || "";
      taskStatus.textContent = `官方任务已提交：${activeTaskId || "等待回执"}。正在轮询状态...`;
      renderTask(data.task || null);
      if (activeTaskId) pollTask(activeTaskId);
    } catch (error) {
      taskStatus.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      launchButton.disabled = !activeHandoff?.ttsJob?.audio_path || !serviceOnline;
    }
  });
  taskLinks.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-open-local-path]");
    if (!button) return;
    try {
      await openLocalPath(button.getAttribute("data-open-local-path") || "");
    } catch (error) {
      taskStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  });

  settingsPanel.querySelector("#moneyPrinterSave").addEventListener("click", async () => {
    try {
      await post("settings", { installDir: installInput.value.trim(), serviceUrl: serviceInput.value.trim() });
      await refresh();
    } catch (error) {
      settingsStatus.textContent = error.message || String(error);
    }
  });
  settingsPanel.querySelector("#moneyPrinterStart").addEventListener("click", async () => {
    try {
      await post("start");
      setTimeout(refresh, 2500);
    } catch (error) {
      settingsStatus.textContent = error.message || String(error);
    }
  });
  settingsPanel.querySelector("#moneyPrinterStop").addEventListener("click", async () => {
    try {
      stopPolling();
      await post("stop");
      await refresh();
    } catch (error) {
      settingsStatus.textContent = error.message || String(error);
    }
  });
  settingsPanel.querySelector("#moneyPrinterUpdate").addEventListener("click", async () => {
    try {
      await post("update");
      await refresh();
    } catch (error) {
      settingsStatus.textContent = error.message || String(error);
    }
  });

  window.addEventListener("video-factory:moneyprinterturbo-handoff", (event) => {
    activeHandoff = event.detail?.ttsJob?.audio_path ? event.detail : null;
    syncHandoffStatus();
    if (activeHandoff?.ttsJob?.id) {
      taskStatus.textContent = `已接收确认音频 #${activeHandoff.ttsJob.id}，可直接启动官方任务。`;
    }
  });

  document.addEventListener("workbench:route", (event) => {
    if (event.detail?.page !== "moneyprinterturbo") return;
    const latest = readHandoff();
    if (latest?.ttsJob?.audio_path && latest?.sentAt !== activeHandoff?.sentAt) {
      activeHandoff = latest;
    }
    refresh();
  });

  activeHandoff = readHandoff();
  syncHandoffStatus();
  refresh();
  if (window.location.hash === "#moneyprinterturbo") {
    window.workbenchNavigate?.("moneyprinterturbo", { fromHash: true, instant: true });
  }
  window.videoFactorySendToMoneyPrinterTurbo = sendConfirmedTtsToMoneyPrinterTurbo;
}
