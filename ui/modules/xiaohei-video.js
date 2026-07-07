import { postJson } from "./api.js";

const EXAMPLE_TEXT = "看着明天仪征几千名初三学生奔赴考场，新初二、新初三的家长们，你们以为中考离你们还远吗？总觉得还有一年、两年时间，不着急。但你看看今年中考的阵仗和分流比例。";

export function initXiaoheiVideoModule() {
  const form = document.getElementById("xiaoheiVideoForm");
  if (!form) return;

  const titleInput = document.getElementById("xiaoheiVideoTitle");
  const textInput = document.getElementById("xiaoheiVideoText");
  const aspectRatioSelect = document.getElementById("xiaoheiVideoAspectRatio");
  const shotCountSelect = document.getElementById("xiaoheiVideoShotCount");
  const introOutroSelect = document.getElementById("xiaoheiVideoIntroOutro");
  const bgmModeSelect = document.getElementById("xiaoheiVideoBgmMode");
  const bgmPathInput = document.getElementById("xiaoheiVideoBgmPath");
  const chooseBgmButton = document.getElementById("xiaoheiVideoChooseBgm");
  const ctaTextInput = document.getElementById("xiaoheiVideoCtaText");
  const status = document.getElementById("xiaoheiVideoStatus");
  const message = document.getElementById("xiaoheiVideoMessage");
  const resultPanel = document.getElementById("xiaoheiVideoResult");
  const outputPath = document.getElementById("xiaoheiVideoOutputPath");
  const outputList = document.getElementById("xiaoheiVideoOutputList");
  const logPanel = document.getElementById("xiaoheiVideoLog");
  const generateButton = document.getElementById("xiaoheiVideoGenerate");
  const exampleButton = document.getElementById("xiaoheiVideoExample");
  const openFileButton = document.getElementById("xiaoheiVideoOpenFile");
  const openProjectButton = document.getElementById("xiaoheiVideoOpenProject");
  const openOutputButton = document.getElementById("xiaoheiVideoOpenOutput");
  const progressPanel = document.getElementById("xiaoheiVideoProgress");
  const progressStage = document.getElementById("xiaoheiVideoProgressStage");
  const progressPercent = document.getElementById("xiaoheiVideoProgressPercent");
  const progressFill = document.getElementById("xiaoheiVideoProgressFill");
  const progressTrack = progressPanel?.querySelector(".cs1-progress-track");

  let lastResult = null;
  let outputDir = "";
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
    setProgress(5, "分析文案结构");
    progressTimer = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      let target = 10;
      let stage = "生成导演稿和分镜";
      if (elapsed < 5) {
        target = 5 + elapsed * 3;
      } else if (elapsed < 12) {
        target = 22 + (elapsed - 5) * 2.6;
        stage = "写入配图提示和 VFX 合约";
      } else if (elapsed < 24) {
        target = 40 + (elapsed - 12) * 1.7;
        stage = "检查 HyperFrames 工程";
      } else if (elapsed < 72) {
        target = 60 + (elapsed - 24) * 0.65;
        stage = "渲染 MP4";
      } else {
        target = Math.min(96, 90 + (elapsed - 72) * 0.15);
        stage = "收尾导出";
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

  const renderOutputs = (outputs = []) => {
    if (!outputList) return;
    if (!outputs.length) {
      outputList.innerHTML = "<p>还没有生成视频。生成后这里会显示所有 MP4 地址。</p>";
      return;
    }
    outputList.innerHTML = outputs.slice(0, 30).map((item, index) => {
      const sizeMb = Number.isFinite(item.size) ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : "";
      const updatedAt = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "";
      return `<div class="cs1-output-item">
        <strong>${index + 1}. ${escapeHtml(item.name || "video.mp4")}</strong>
        <code>${escapeHtml(item.filePath || "")}</code>
        <small>${escapeHtml([sizeMb, updatedAt].filter(Boolean).join(" · "))}</small>
        <button class="ghost small" type="button" data-open-output="${escapeHtml(item.filePath || "")}">打开</button>
      </div>`;
    }).join("");
  };

  const loadOutputs = async () => {
    try {
      const response = await fetch("/api/xiaohei-video/outputs", { cache: "no-store" });
      const data = await response.json();
      outputDir = data.outputDir || outputDir;
      renderOutputs(Array.isArray(data.outputs) ? data.outputs : []);
    } catch {
      if (outputList) outputList.innerHTML = "<p>输出记录加载失败，请稍后刷新。</p>";
    }
  };

  chooseBgmButton?.addEventListener("click", async () => {
    chooseBgmButton.disabled = true;
    try {
      const data = await postJson("/api/local-media/choose-audio", {});
      if (data.filePath) {
        bgmPathInput.value = data.filePath;
        if (bgmModeSelect) bgmModeSelect.value = "local";
        setStatus("已选择音乐", "生成时会循环到视频长度，并自动加淡入淡出。");
      } else {
        setStatus("未选择音乐", "可以继续无 BGM 生成。");
      }
    } catch (error) {
      setStatus("选择音乐失败", error instanceof Error ? error.message : String(error));
    } finally {
      chooseBgmButton.disabled = false;
    }
  });

  exampleButton?.addEventListener("click", () => {
    titleInput.value = "仪征中考家长提醒";
    textInput.value = EXAMPLE_TEXT;
    ctaTextInput.value = "现在就看路径、节奏和风险";
    textInput.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    resultPanel.hidden = true;
    logPanel.textContent = "";
    generateButton.disabled = true;
    startProgress();
    setStatus("正在生成", "正在创建导演稿、分镜、配图提示、VFX 合约和 HyperFrames 视频。");
    try {
      const result = await postJson("/api/xiaohei-video/generate", {
        title: titleInput.value,
        text: textInput.value,
        aspectRatio: aspectRatioSelect?.value || "9:16",
        shotCount: shotCountSelect?.value || "5",
        introOutroMode: introOutroSelect?.value || "soft",
        bgmMode: bgmModeSelect?.value || "none",
        bgmPath: bgmPathInput?.value || "",
        ctaText: ctaTextInput?.value || "",
      });
      lastResult = result;
      outputPath.textContent = result.outputPath || "";
      outputDir = result.outputDir || outputDir;
      logPanel.textContent = [
        `Shots: ${result.shotCount || ""} · Duration: ${result.duration || ""}s`,
        result.aspectRatio ? `Aspect ratio: ${result.aspectRatio.label || result.aspectRatio.id}` : "",
        result.bgm?.label ? `BGM: ${result.bgm.label}` : "BGM: none",
        `Director script: ${result.directorScriptPath || ""}`,
        `Storyboard: ${result.storyboardPath || ""}`,
        `Image prompts: ${result.imagePromptsPath || ""}`,
        `Seedance VFX: ${result.seedanceContractPath || ""}`,
        "",
        result.checkLog || "",
        "",
        result.renderLog || "",
      ].filter(Boolean).join("\n").trim();
      resultPanel.hidden = false;
      await loadOutputs();
      completeProgress();
      setStatus("生成完成", "小黑说明视频已输出，工程目录里包含导演稿、分镜、配图提示和 VFX 合约。");
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
    if (outputDir) {
      openPath(outputDir);
    } else if (lastResult?.outputDir) {
      openPath(lastResult.outputDir);
    } else {
      setStatus("还没有输出", "先生成一个视频，完成后可以直接打开输出目录。");
    }
  });

  outputList?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-open-output]") : null;
    const filePath = button?.getAttribute("data-open-output");
    if (filePath) openPath(filePath);
  });

  loadOutputs();
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
