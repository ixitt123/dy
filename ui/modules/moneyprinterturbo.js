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
          <p>保留原版工作台与模板体系；服务未配置时会显示安装和启动状态，不影响其他生产线。</p>
        </div>
        <div class="production-line-actions">
          <button class="ghost" id="moneyPrinterRefresh" type="button">检测服务</button>
          <button class="secondary" id="moneyPrinterOpen" type="button">在浏览器打开</button>
        </div>
      </div>
      <div class="production-line-notice" id="moneyPrinterStatus">正在检测 MoneyPrinterTurbo...</div>
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
  const frame = page.querySelector("#moneyPrinterFrame");
  let serviceUrl = "http://127.0.0.1:8501";
  const installInput = settingsPanel.querySelector("#moneyPrinterInstallDir");
  const serviceInput = settingsPanel.querySelector("#moneyPrinterServiceUrl");
  const settingsStatus = settingsPanel.querySelector("#moneyPrinterSettingsStatus");
  async function refresh() {
    try {
      const response = await fetch("/api/moneyprinterturbo/status");
      const data = await response.json();
      serviceUrl = data.serviceUrl || serviceUrl;
      installInput.value = data.installDir || "";
      serviceInput.value = serviceUrl;
      settingsStatus.textContent = data.message || "检测完成";
      status.textContent = data.online
        ? `服务已连接：${serviceUrl}`
        : `服务未启动。${data.message || "请在系统设置中配置并启动。"}`;
      frame.src = data.online ? serviceUrl : "about:blank";
    } catch (error) {
      status.textContent = `检测失败：${error.message || error}`;
    }
  }
  async function post(action, body = {}) {
    const response = await fetch(`/api/moneyprinterturbo/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.message || "操作失败");
    settingsStatus.textContent = data.message || "操作完成";
    return data;
  }
  page.querySelector("#moneyPrinterRefresh").addEventListener("click", refresh);
  page.querySelector("#moneyPrinterOpen").addEventListener("click", () => window.open(serviceUrl, "_blank", "noopener"));
  settingsPanel.querySelector("#moneyPrinterSave").addEventListener("click", async () => {
    try {
      await post("settings", { installDir: installInput.value.trim(), serviceUrl: serviceInput.value.trim() });
      await refresh();
    } catch (error) { settingsStatus.textContent = error.message || String(error); }
  });
  settingsPanel.querySelector("#moneyPrinterStart").addEventListener("click", async () => {
    try { await post("start"); setTimeout(refresh, 2500); } catch (error) { settingsStatus.textContent = error.message || String(error); }
  });
  settingsPanel.querySelector("#moneyPrinterStop").addEventListener("click", async () => {
    try { await post("stop"); await refresh(); } catch (error) { settingsStatus.textContent = error.message || String(error); }
  });
  settingsPanel.querySelector("#moneyPrinterUpdate").addEventListener("click", async () => {
    try { await post("update"); await refresh(); } catch (error) { settingsStatus.textContent = error.message || String(error); }
  });
  document.addEventListener("workbench:route", (event) => {
    if (event.detail?.page === "moneyprinterturbo") refresh();
  });
  refresh();
  if (window.location.hash === "#moneyprinterturbo") {
    window.workbenchNavigate?.("moneyprinterturbo", { fromHash: true, instant: true });
  }
}
