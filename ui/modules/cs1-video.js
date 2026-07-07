import { postJson } from "./api.js";

const EXAMPLE_TEXT = "看着明天仪征几千名初三学生奔赴考场，新初二、新初三的家长们，你们以为中考离你们还远吗？别等初三，现在就开始查短板、定节奏。";

export function initCs1VideoModule() {
  const form = document.getElementById("cs1VideoForm");
  if (!form) return;

  const titleInput = document.getElementById("cs1VideoTitle");
  const textInput = document.getElementById("cs1VideoText");
  const styleSelect = document.getElementById("cs1VideoStyleSelect");
  const beatCountSelect = document.getElementById("cs1VideoBeatCount");
  const styleDescription = document.getElementById("cs1VideoStyleDescription");
  const styleSummary = document.getElementById("cs1VideoStyleSummary");
  const deleteStyleButton = document.getElementById("cs1VideoDeleteStyle");
  const aiInput = document.getElementById("cs1VideoAiRefine");
  const status = document.getElementById("cs1VideoStatus");
  const message = document.getElementById("cs1VideoMessage");
  const resultPanel = document.getElementById("cs1VideoResult");
  const outputPath = document.getElementById("cs1VideoOutputPath");
  const logPanel = document.getElementById("cs1VideoLog");
  const generateButton = document.getElementById("cs1VideoGenerate");
  const exampleButton = document.getElementById("cs1VideoExample");
  const openFileButton = document.getElementById("cs1VideoOpenFile");
  const openProjectButton = document.getElementById("cs1VideoOpenProject");
  const openOutputButton = document.getElementById("cs1VideoOpenOutput");
  const progressPanel = document.getElementById("cs1VideoProgress");
  const progressStage = document.getElementById("cs1VideoProgressStage");
  const progressPercent = document.getElementById("cs1VideoProgressPercent");
  const progressFill = document.getElementById("cs1VideoProgressFill");
  const progressTrack = progressPanel?.querySelector(".cs1-progress-track");
  let lastResult = null;
  let styleCatalog = [];
  let progressTimer = null;
  let progressValue = 0;

  const setStatus = (value, detail = "") => {
    status.textContent = value;
    message.textContent = detail;
  };

  const setProgress = (value, stage = "") => {
    if (!progressPanel) return;
    const nextValue = Math.max(0, Math.min(100, Math.round(value)));
    progressValue = nextValue;
    progressPanel.hidden = false;
    if (progressStage && stage) progressStage.textContent = stage;
    if (progressPercent) progressPercent.textContent = `${nextValue}%`;
    if (progressFill) progressFill.style.width = `${nextValue}%`;
    progressTrack?.setAttribute("aria-valuenow", String(nextValue));
  };

  const stopProgress = () => {
    if (progressTimer) window.clearInterval(progressTimer);
    progressTimer = null;
  };

  const startProgress = () => {
    stopProgress();
    progressValue = 0;
    progressPanel?.classList.remove("error");
    const startedAt = Date.now();
    setProgress(4, "准备工程");
    progressTimer = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      let target = 8;
      let stage = "创建 HyperFrames 工程";
      if (elapsed < 4) {
        target = 4 + elapsed * 2;
      } else if (elapsed < 10) {
        target = 12 + (elapsed - 4) * 2.7;
        stage = "检查工程结构";
      } else if (elapsed < 18) {
        target = 28 + (elapsed - 10) * 1.8;
        stage = "验证画面与文字";
      } else if (elapsed < 28) {
        target = 42 + (elapsed - 18) * 1.3;
        stage = "检查布局溢出";
      } else if (elapsed < 70) {
        target = 55 + (elapsed - 28) * 0.72;
        stage = "渲染视频帧";
      } else {
        target = Math.min(96, 85 + (elapsed - 70) * 0.2);
        stage = "编码 MP4";
      }
      setProgress(Math.max(progressValue, target), stage);
    }, 800);
  };

  const completeProgress = () => {
    stopProgress();
    progressPanel?.classList.remove("error");
    setProgress(100, "生成完成");
  };

  const failProgress = () => {
    stopProgress();
    progressPanel?.classList.add("error");
    setProgress(Math.max(progressValue, 8), "生成失败");
  };

  const selectedStyle = () => styleSelect?.value || form.querySelector('input[name="cs1VideoStyle"]:checked')?.value || "cs1";

  form.querySelectorAll(".cs1-style-card").forEach((card) => {
    card.addEventListener("click", () => {
      form.querySelectorAll(".cs1-style-card").forEach((item) => item.classList.remove("active"));
      card.classList.add("active");
    });
  });

  const updateStyleDescription = () => {
    const style = styleCatalog.find((item) => item.id === selectedStyle());
    const description = style?.description || "选择模板后，这里会显示中文风格说明和适用场景。";
    if (styleDescription) styleDescription.textContent = description;
    if (styleSummary) styleSummary.textContent = description;
  };

  const loadStyles = async () => {
    if (!styleSelect) return;
    try {
      const response = await fetch("/api/cs1-video/styles", { cache: "no-store" });
      const data = await response.json();
      styleCatalog = Array.isArray(data.styles) ? data.styles : [];
      if (!styleCatalog.length) return;
      const current = styleSelect.value || "cs1";
      styleSelect.innerHTML = styleCatalog
        .map((style, index) => {
          const number = String(style.display_index || index + 1).padStart(2, "0");
          const sourceLabel = style.source === "hyperframes" ? "官方模板" : "本地模板";
          return `<option value="${escapeHtml(style.id)}">${number}. ${escapeHtml(style.name)} · ${sourceLabel}</option>`;
        })
        .join("");
      styleSelect.value = styleCatalog.some((style) => style.id === current) ? current : styleCatalog[0]?.id || "cs1";
      updateStyleDescription();
    } catch {
      updateStyleDescription();
    }
  };

  styleSelect?.addEventListener("change", updateStyleDescription);
  loadStyles();

  deleteStyleButton?.addEventListener("click", async () => {
    if (!styleCatalog.length) return;
    const id = selectedStyle();
    const style = styleCatalog.find((item) => item.id === id);
    deleteStyleButton.disabled = true;
    try {
      await postJson("/api/cs1-video/styles/delete", { id });
      setStatus("模板已删除", `已从下拉框隐藏：${style?.name || id}`);
      await loadStyles();
    } catch (error) {
      setStatus("删除失败", error instanceof Error ? error.message : String(error));
    } finally {
      deleteStyleButton.disabled = false;
    }
  });

  exampleButton?.addEventListener("click", () => {
    titleInput.value = "仪征中考家长提醒";
    textInput.value = EXAMPLE_TEXT;
    textInput.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resultPanel.hidden = true;
    logPanel.textContent = "";
    generateButton.disabled = true;
    startProgress();
    setStatus("正在生成", "正在创建 HyperFrames 工程、检查布局并渲染 MP4，通常需要 30-90 秒。");
    try {
      const result = await postJson("/api/cs1-video/generate", {
        title: titleInput.value,
        text: textInput.value,
        style: selectedStyle(),
        beatCount: beatCountSelect?.value || "5",
        aiRefine: aiInput.checked,
      });
      lastResult = result;
      outputPath.textContent = result.outputPath || "";
      logPanel.textContent = [
        result.aiUsed ? `AI beat refinement: used · ${result.beatCount || beatCountSelect?.value || 5} beats` : `AI beat refinement: local fallback · ${result.beatCount || beatCountSelect?.value || 5} beats`,
        "",
        result.checkLog || "",
        "",
        result.renderLog || "",
      ].join("\n").trim();
      resultPanel.hidden = false;
      const style = styleCatalog.find((item) => item.id === result.style);
      completeProgress();
      setStatus("生成完成", `模板：${result.templateName || style?.name || result.style}。视频已输出到本机。`);
    } catch (error) {
      failProgress();
      setStatus("生成失败", error instanceof Error ? error.message : String(error));
      logPanel.textContent = error instanceof Error ? error.stack || error.message : String(error);
    } finally {
      generateButton.disabled = false;
    }
  });

  openFileButton?.addEventListener("click", () => {
    if (lastResult?.outputPath) openPath(lastResult.outputPath);
  });
  openProjectButton?.addEventListener("click", () => {
    if (lastResult?.projectDir) openPath(lastResult.projectDir);
  });
  openOutputButton?.addEventListener("click", () => {
    if (lastResult?.outputPath) {
      openPath(lastResult.outputPath);
    } else {
      setStatus("还没有输出", "先生成一个视频，完成后可以直接打开输出位置。");
    }
  });
}

async function openPath(filePath) {
  await postJson("/api/open-path", { filePath });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
