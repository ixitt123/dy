import { postJson } from "./api.js";

const HANDOFF_KEY = "dy:handoff:cs1-video:audio";
const EXAMPLE_TEXT = "看着明天仪征几千名初三学生奔赴考场，新初二、新初三的家长们，你们以为中考离你们还远吗？别等初三，现在就开始查短板、定节奏。";
const DEFAULT_SCRIPT_FORMAT = [
  "标题：一句话说清主题。",
  "开场：15-24 字钩子，直接点明痛点或结果。",
  "主体：按 3-5 个节拍拆开，每段只讲一个观点。",
  "字幕：短句优先，每句 12-20 字，避免长段落。",
  "结尾：给出行动提醒、CTA 或一句总结。",
].join("\n");

export function initCs1VideoModule() {
  const form = document.getElementById("cs1VideoForm");
  if (!form) return;

  const titleInput = document.getElementById("cs1VideoTitle");
  const textInput = document.getElementById("cs1VideoText");
  const aspectRatioSelect = document.getElementById("cs1VideoAspectRatio");
  const styleSelect = document.getElementById("cs1VideoStyleSelect");
  const beatCountSelect = document.getElementById("cs1VideoBeatCount");
  const cardHoldSelect = document.getElementById("cs1VideoCardHold");
  const styleDescription = document.getElementById("cs1VideoStyleDescription");
  const styleSummary = document.getElementById("cs1VideoStyleSummary");
  const scriptFormat = document.getElementById("cs1VideoScriptFormat");
  const copyFormatButton = document.getElementById("cs1VideoCopyFormat");
  const deleteStyleButton = document.getElementById("cs1VideoDeleteStyle");
  const bgmModeSelect = document.getElementById("cs1VideoBgmMode");
  const bgmPathInput = document.getElementById("cs1VideoBgmPath");
  const chooseBgmButton = document.getElementById("cs1VideoChooseBgm");
  const iconVariantSelect = document.getElementById("cs1IconVariant");
  const textPaletteSelect = document.getElementById("cs1TextPalette");
  const layoutVariantSelect = document.getElementById("cs1LayoutVariant");
  const backgroundPatternSelect = document.getElementById("cs1BackgroundPattern");
  const introTemplateSelect = document.getElementById("cs1IntroTemplate");
  const outroTemplateSelect = document.getElementById("cs1OutroTemplate");
  const ctaTextInput = document.getElementById("cs1CtaText");
  const watermarkEnabledInput = document.getElementById("cs1WatermarkEnabled");
  const watermarkTextInput = document.getElementById("cs1WatermarkText");
  const watermarkPositionSelect = document.getElementById("cs1WatermarkPosition");
  const watermarkOpacitySelect = document.getElementById("cs1WatermarkOpacity");
  const watermarkAnimationSelect = document.getElementById("cs1WatermarkAnimation");
  const aiInput = document.getElementById("cs1VideoAiRefine");
  const status = document.getElementById("cs1VideoStatus");
  const message = document.getElementById("cs1VideoMessage");
  const resultPanel = document.getElementById("cs1VideoResult");
  const outputPath = document.getElementById("cs1VideoOutputPath");
  const outputList = document.getElementById("cs1VideoOutputList");
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
  const timelineContainer = document.getElementById("cs1SubtitleTimeline");
  const timelineStatus = document.getElementById("cs1TimelineStatus");
  const progressTrack = progressPanel?.querySelector(".cs1-progress-track");
  let lastResult = null;
  let styleCatalog = [];
  let outputDir = "";
  let progressTimer = null;
  let progressValue = 0;
  let currentTtsHandoff = null;

  if (beatCountSelect && !beatCountSelect.querySelector('option[value="auto"]')) {
    beatCountSelect.insertAdjacentHTML("afterbegin", [
      '<option value="auto">自动 · 按文案结构决定</option>',
      '<option value="2">2 节拍 · 极简观点</option>',
    ].join(""));
    beatCountSelect.value = "auto";
  }

  const setStatus = (value, detail = "") => {
    status.textContent = value;
    message.textContent = detail;
  };

  const ttsText = (payload = {}) => String(payload.text || payload.final_text || payload.tts_prepared_text || payload.original_text || "").trim();

  const timelineRows = (payload = currentTtsHandoff) => {
    const rows = Array.isArray(payload?.sentence_timeline) && payload.sentence_timeline.length
      ? payload.sentence_timeline
      : Array.isArray(payload?.subtitle_timeline)
        ? payload.subtitle_timeline
        : [];
    return rows.map((row, index) => ({
      ...row,
      index,
      start: Number(row.start || 0),
      end: Number(row.end || 0),
      text: String(row.text || ""),
    })).filter((row) => row.text && row.end > row.start);
  };

  const renderTimeline = () => {
    if (!timelineContainer) return;
    const rows = timelineRows();
    if (!rows.length) {
      timelineContainer.innerHTML = '<p class="shared-subtitle-empty">请先从 TTS 语音页发送已确认的字幕时间轴。</p>';
      if (timelineStatus) timelineStatus.textContent = "等待 TTS 字幕";
      return;
    }
    timelineContainer.innerHTML = rows.map((row, index) => `
      <div class="shared-subtitle-timeline-row" data-row-index="${index}">
        <span>${index + 1}</span>
        <input value="${row.start.toFixed(2)}" readonly aria-readonly="true" />
        <input value="${row.end.toFixed(2)}" readonly aria-readonly="true" />
        <textarea data-field="text" rows="2">${escapeHtml(row.text)}</textarea>
      </div>
    `).join("");
    if (timelineStatus) timelineStatus.textContent = `共 ${rows.length} 段 · 文字失去焦点自动保存`;
  };

  const receiveTts = (payload = {}, { navigate = false } = {}) => {
    if (!payload?.id) return null;
    currentTtsHandoff = payload;
    localStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
    const text = ttsText(payload);
    if (text) textInput.value = text;
    if (titleInput) titleInput.value = payload.title || payload.seo_title || payload.publish_title || `TTS #${payload.display_number || payload.id}`;
    if (bgmPathInput) bgmPathInput.value = payload.audio_path || "";
    if (bgmModeSelect) bgmModeSelect.value = payload.audio_path ? "local" : "auto";
    renderTimeline();
    setStatus("已接收 TTS 三件套", "CS1 正在使用公共文案、音频和时间戳字幕。");
    if (navigate) window.workbenchNavigate?.("cs1-video");
    return currentTtsHandoff;
  };

  const publishTimelineEdit = async () => {
    if (!currentTtsHandoff?.id || !timelineContainer) return;
    const rows = timelineRows().map((row, index) => ({
      ...row,
      text: timelineContainer.querySelector(`[data-row-index="${index}"] [data-field="text"]`)?.value.trim() || "",
    }));
    if (timelineStatus) timelineStatus.textContent = "正在自动保存...";
    try {
      currentTtsHandoff = await window.sharedTtsHandoff.syncTimeline(rows, {
        sourceTarget: "cs1-video",
        title: titleInput.value.trim() || currentTtsHandoff.title,
      });
      textInput.value = ttsText(currentTtsHandoff);
      renderTimeline();
      setStatus("字幕已同步", "原时间戳已保留，原字幕文件和其他三条生产线已更新。");
    } catch (error) {
      if (timelineStatus) timelineStatus.textContent = `自动保存失败：${error.message || error}`;
      setStatus("字幕保存失败", error.message || String(error));
    }
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
      const response = await fetch("/api/cs1-video/outputs", { cache: "no-store" });
      const data = await response.json();
      outputDir = data.outputDir || outputDir;
      renderOutputs(Array.isArray(data.outputs) ? data.outputs : []);
    } catch {
      if (outputList) outputList.innerHTML = "<p>输出记录加载失败，请稍后刷新。</p>";
    }
  };

  form.querySelectorAll(".cs1-style-card").forEach((card) => {
    card.addEventListener("click", () => {
      form.querySelectorAll(".cs1-style-card").forEach((item) => item.classList.remove("active"));
      card.classList.add("active");
    });
  });

  window.cs1VideoProduction = { receiveTts };
  window.addEventListener("tts-shared-handoff-updated", (event) => {
    if (event.detail?.sourceTarget === "cs1-video") return;
    receiveTts(event.detail?.payload, { navigate: false });
  });
  window.addEventListener("cs1-video-handoff", (event) => receiveTts(event.detail, { navigate: true }));
  try {
    const shared = window.sharedTtsHandoff?.read?.();
    const stored = shared?.id ? shared : JSON.parse(localStorage.getItem(HANDOFF_KEY) || "null");
    if (stored?.id) receiveTts(stored, { navigate: false });
  } catch {}

  const updateStyleDescription = () => {
    const style = styleCatalog.find((item) => item.id === selectedStyle());
    const description = style?.description || "选择模板后，这里会显示中文风格说明和适用场景。";
    if (styleDescription) styleDescription.textContent = description;
    if (styleSummary) styleSummary.textContent = description;
    if (scriptFormat) scriptFormat.textContent = style?.scriptFormat || DEFAULT_SCRIPT_FORMAT;
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
  loadOutputs();

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

  copyFormatButton?.addEventListener("click", async () => {
    const text = scriptFormat?.textContent?.trim() || DEFAULT_SCRIPT_FORMAT;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("已复制", "文案格式要求已复制，可直接粘贴到 AI 改写或提示词里。");
    } catch {
      setStatus("复制失败", "浏览器未允许剪贴板权限，请手动选中文案格式复制。");
    }
  });

  chooseBgmButton?.addEventListener("click", async () => {
    chooseBgmButton.disabled = true;
    try {
      const data = await postJson("/api/local-media/choose-audio", {});
      if (data.filePath) {
        bgmPathInput.value = data.filePath;
        if (bgmModeSelect) bgmModeSelect.value = "local";
        setStatus("已选择音乐", "生成时会把本地音乐写入 HyperFrames 视频。");
      } else {
        setStatus("未选择音乐", "继续使用默认 128BPM 暗色律动或不添加 BGM。");
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
    textInput.focus();
  });
  timelineContainer?.addEventListener("focusout", (event) => {
    if (event.target.matches('[data-field="text"]')) publishTimelineEdit();
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
        aspectRatio: aspectRatioSelect?.value || "9:16",
        style: selectedStyle(),
        beatCount: beatCountSelect?.value || "auto",
        cardHoldPreset: cardHoldSelect?.value || "auto",
        bgmMode: bgmModeSelect?.value || "builtin_dark_pulse_128",
        bgmPath: bgmPathInput?.value || "",
        iconVariant: iconVariantSelect?.value || "orbit_nodes",
        textPalette: textPaletteSelect?.value || "gold_green",
        layoutVariant: layoutVariantSelect?.value || "left_right",
        backgroundPattern: backgroundPatternSelect?.value || "vignette",
        introTemplateId: introTemplateSelect?.value || "none",
        outroTemplateId: outroTemplateSelect?.value || "none",
        ctaText: ctaTextInput?.value || "",
        watermarkEnabled: Boolean(watermarkEnabledInput?.checked),
        watermarkText: watermarkTextInput?.value || "",
        watermarkPosition: watermarkPositionSelect?.value || "top-right",
        watermarkOpacity: watermarkOpacitySelect?.value || "0.45",
        watermarkAnimation: watermarkAnimationSelect?.value || "float_y",
        aiRefine: aiInput.checked,
      });
      lastResult = result;
      outputPath.textContent = result.outputPath || "";
      outputDir = result.outputDir || outputDir;
      logPanel.textContent = [
        result.aiUsed ? `Structure refinement: AI used · ${result.beatCount || beatCountSelect?.value || "auto"} cards` : `Structure refinement: local parser · ${result.beatCount || beatCountSelect?.value || "auto"} cards`,
        result.aspectRatio ? `Aspect ratio: ${result.aspectRatio.label || result.aspectRatio.id || aspectRatioSelect?.value || "9:16"} · ${result.aspectRatio.platforms || ""}` : `Aspect ratio: ${aspectRatioSelect?.value || "9:16"}`,
        result.cardHold ? `Card hold: ${result.cardHold.label || result.cardHold.id || "auto"}` : `Card hold: ${cardHoldSelect?.value || "auto"}`,
        result.bgm?.label ? `BGM: ${result.bgm.label}` : "BGM: none",
        result.visualOptions ? `Visual: icon=${result.visualOptions.iconVariant} · palette=${result.visualOptions.textPalette} · layout=${result.visualOptions.layoutVariant} · background=${result.visualOptions.backgroundPattern}` : `Visual: icon=${iconVariantSelect?.value || "orbit_nodes"} · palette=${textPaletteSelect?.value || "gold_green"} · layout=${layoutVariantSelect?.value || "left_right"} · background=${backgroundPatternSelect?.value || "vignette"}`,
        result.packaging ? `Packaging: intro=${result.packaging.introTemplateId || "none"} · outro=${result.packaging.outroTemplateId || "none"} · watermark=${result.packaging.watermark?.enabled ? `${result.packaging.watermark.position}/${result.packaging.watermark.animation || "none"}` : "off"}` : "Packaging: none",
        "",
        result.checkLog || "",
        "",
        result.renderLog || "",
      ].join("\n").trim();
      resultPanel.hidden = false;
      await loadOutputs();
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
    if (outputDir) {
      openPath(outputDir);
    } else if (lastResult?.outputDir) {
      openPath(lastResult.outputDir);
    } else {
      setStatus("还没有输出", "先生成一个视频，完成后可以直接打开输出位置。");
    }
  });

  outputList?.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-open-output]") : null;
    const filePath = button?.getAttribute("data-open-output");
    if (filePath) openPath(filePath);
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
