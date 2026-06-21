import { getJson } from "./api.js";

const STATUS_LABELS = {
  capcutCli: "capcut-cli",
  ffmpeg: "FFmpeg",
  draftDirectory: "剪映草稿目录",
  templateMaster: "模板母版",
  outputDirectory: "输出目录",
};

function renderToolStatus(container, status) {
  const checks = status?.checks || {};
  container.innerHTML = Object.entries(STATUS_LABELS).map(([key, label]) => {
    const item = checks[key] || {};
    const ok = Boolean(item.ok);
    return `<div class="video-tool-check ${ok ? "ready" : "missing"}">
      <span>${label}</span>
      <strong>${item.label || (ok ? "可用" : "不可用")}</strong>
      ${item.detail ? `<small>${item.detail}</small>` : ""}
    </div>`;
  }).join("");
  const mode = status?.mode === "capcut_cli" ? "剪映模板命令模式" : "素材包兼容模式";
  const note = document.querySelector("#videoOutputCompatibilityNote");
  if (note) note.textContent = status?.mode === "capcut_cli"
    ? `工具就绪，当前使用${mode}。`
    : "capcut-cli 未安装或不可用，当前使用素材包兼容模式，不会中断任务。";
}

async function refreshToolStatus() {
  const container = document.querySelector("#videoOutputToolStatus");
  if (!container) return;
  container.setAttribute("aria-busy", "true");
  try {
    renderToolStatus(container, await getJson("/api/video-product/tools"));
  } catch (error) {
    container.innerHTML = `<p class="settings-status error">工具检测失败：${error.message}</p>`;
  } finally {
    container.removeAttribute("aria-busy");
  }
}

function selectOutputType(outputType) {
  const select = document.querySelector("#videoProductOutputType");
  if (!select) return;
  select.value = outputType;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelectorAll("[data-main-output]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mainOutput === outputType);
  });
}

export function initVideoOutputModule() {
  const page = document.querySelector('[data-page="video-output"]');
  if (page) page.dataset.module = "video-output";
  document.querySelectorAll("[data-main-output]").forEach((button) => {
    button.addEventListener("click", () => selectOutputType(button.dataset.mainOutput));
  });
  document.querySelector("#refreshVideoOutputTools")?.addEventListener("click", refreshToolStatus);
  refreshToolStatus();
}
