const state = {
  config: null,
  plan: null,
  ttsJob: null,
  selectedTtsJob: null,
  audioJobs: [],
  images: [],
  outputDir: "",
  promptsText: "",
  voiceChoices: new Map(),
  savedApis: [],
  musicPresets: [],
  selectedMusic: null,
  referenceProfile: null,
  referenceCloneDraft: null,
  referenceStylePresets: [],
  pendingUploads: new Map(),
  projectId: localStorage.getItem("ian-xiaohei-project-id") || `xiaohei-${Date.now()}`,
};
const embeddedMode = new URLSearchParams(window.location.search).get("embedded") === "1";
localStorage.setItem("ian-xiaohei-project-id", state.projectId);

const PURPOSE_TEMPLATE_META = {
  article: {
    name: "小黑 Skill · 纯白手绘解释图",
    description: "白纸、黑色小人、橙色流程线，适合正文拆解。",
    tags: ["正文", "手绘"],
    accent: "#f0bd69",
    line: "#71d7ff",
  },
  wechat: {
    name: "公众号配图 · 图文叙事",
    description: "更像文章内页配图，留白更稳，适合长文段落。",
    tags: ["公众号", "图文"],
    accent: "#72d5b7",
    line: "#f0bd69",
  },
  knowledge: {
    name: "知识观点 · 认知锚点",
    description: "突出判断、问题和反差，适合观点类短视频。",
    tags: ["观点", "解释"],
    accent: "#806bff",
    line: "#72d5b7",
  },
  workflow: {
    name: "方法流程 · 系统装置",
    description: "输入、处理、输出的流程感更强，适合方法论。",
    tags: ["流程", "系统"],
    accent: "#71d7ff",
    line: "#f0bd69",
  },
  "cover-reference": {
    name: "封面参考 · 强钩子画面",
    description: "更强调第一眼冲突和核心物件，可做封面参考。",
    tags: ["封面", "钩子"],
    accent: "#ff7068",
    line: "#806bff",
  },
};

const els = {
  titleInput: document.querySelector("#titleInput"),
  minimaxStatus: document.querySelector("#minimaxStatus"),
  minimaxApiKey: document.querySelector("#minimaxApiKey"),
  minimaxModel: document.querySelector("#minimaxModel"),
  savedApiSelect: document.querySelector("#savedApiSelect"),
  savedApiDetail: document.querySelector("#savedApiDetail"),
  saveMinimaxSettings: document.querySelector("#saveMinimaxSettings"),
  testMinimaxSettings: document.querySelector("#testMinimaxSettings"),
  deleteMinimaxApi: document.querySelector("#deleteMinimaxApi"),
  integrationStatus: document.querySelector("#integrationStatus"),
  copyInput: document.querySelector("#copyInput"),
  voiceSelect: document.querySelector("#voiceSelect"),
  emotionSelect: document.querySelector("#emotionSelect"),
  speedSelect: document.querySelector("#speedSelect"),
  aspectRatioSelect: document.querySelector("#aspectRatioSelect"),
  purposeSelect: document.querySelector("#purposeSelect"),
  voiceDescription: document.querySelector("#voiceDescription"),
  previewVoice: document.querySelector("#previewVoice"),
  setDefaultVoice: document.querySelector("#setDefaultVoice"),
  deleteVoice: document.querySelector("#deleteVoice"),
  localAudioInput: document.querySelector("#localAudioInput"),
  musicPreset: document.querySelector("#musicPreset"),
  musicPromptExtra: document.querySelector("#musicPromptExtra"),
  musicLyrics: document.querySelector("#musicLyrics"),
  generateMusic: document.querySelector("#generateMusic"),
  referenceStyleSelect: document.querySelector("#referenceStyleSelect"),
  setDefaultReferenceStyle: document.querySelector("#setDefaultReferenceStyle"),
  deleteReferenceStyle: document.querySelector("#deleteReferenceStyle"),
  musicStatus: document.querySelector("#musicStatus"),
  musicPreviewPanel: document.querySelector("#musicPreviewPanel"),
  musicPreviewTitle: document.querySelector("#musicPreviewTitle"),
  musicPreview: document.querySelector("#musicPreview"),
  referenceAudioInput: document.querySelector("#referenceAudioInput"),
  referenceCloneName: document.querySelector("#referenceCloneName"),
  referenceCloneConsent: document.querySelector("#referenceCloneConsent"),
  analyzeReferenceAudio: document.querySelector("#analyzeReferenceAudio"),
  createReferenceClone: document.querySelector("#createReferenceClone"),
  confirmReferenceClone: document.querySelector("#confirmReferenceClone"),
  discardReferenceClone: document.querySelector("#discardReferenceClone"),
  referenceCloneControls: document.querySelector("#referenceCloneControls"),
  referenceCloneDefault: document.querySelector("#referenceCloneDefault"),
  referenceProfile: document.querySelector("#referenceProfile"),
  referenceClonePreviewPanel: document.querySelector("#referenceClonePreviewPanel"),
  referenceClonePreviewTitle: document.querySelector("#referenceClonePreviewTitle"),
  referenceClonePreview: document.querySelector("#referenceClonePreview"),
  generateAudio: document.querySelector("#generateAudio"),
  confirmAudio: document.querySelector("#confirmAudio"),
  audioPreviewPanel: document.querySelector("#audioPreviewPanel"),
  audioPreviewTitle: document.querySelector("#audioPreviewTitle"),
  audioPreview: document.querySelector("#audioPreview"),
  audioJobs: document.querySelector("#audioJobs"),
  generateImages: document.querySelector("#generateImages"),
  planPrompts: document.querySelector("#planPrompts"),
  copyPrompts: document.querySelector("#copyPrompts"),
  openOutputDir: document.querySelector("#openOutputDir"),
  refreshOutputs: document.querySelector("#refreshOutputs"),
  statusLabel: document.querySelector("#statusLabel"),
  statusDetail: document.querySelector("#statusDetail"),
  progressStep: document.querySelector("#progressStep"),
  progressPercent: document.querySelector("#progressPercent"),
  progressBar: document.querySelector("#progressBar"),
  promptResults: document.querySelector("#promptResults"),
  imageResults: document.querySelector("#imageResults"),
  outputHistory: document.querySelector("#outputHistory"),
  outputHistoryPanel: document.querySelector("#outputHistoryPanel"),
  outputHistoryCount: document.querySelector("#outputHistoryCount"),
  outputDirLabel: document.querySelector("#outputDirLabel"),
  planCount: document.querySelector("#planCount"),
  imageCount: document.querySelector("#imageCount"),
  templateGrid: document.querySelector("#xiaoheiTemplateGrid"),
  templateSummary: document.querySelector("#xiaoheiTemplateSummary"),
  ttsSourceTitle: document.querySelector("#ttsSourceTitle"),
  ttsSourceMeta: document.querySelector("#ttsSourceMeta"),
  ttsSourceText: document.querySelector("#ttsSourceText"),
};

init().catch((error) => setStatus("初始化失败", error.message || String(error), 0, true));

async function init() {
  if (embeddedMode) document.body.classList.add("embedded-production-mode");
  bindEvents();
  window.addEventListener("message", handleParentHandoff);
  await loadConfig();
  await Promise.all([loadAudioJobs(), loadOutputs()]);
  if (embeddedMode) window.parent.postMessage({ type: "video-factory:xiaohei-ready" }, window.location.origin);
}

async function handleParentHandoff(event) {
  if (event.origin !== window.location.origin || event.data?.type !== "video-factory:xiaohei-handoff") return;
  const handoff = event.data.handoff || {};
  const job = handoff.ttsJob || {};
  if (!job.id || job.status !== "completed" || !isTtsAlignmentConfirmed(job)) {
    setStatus("缺少已确认音频", "请先在 TTS 语音页检查并确认最终文案和字幕时间轴。", 0, true);
    return;
  }
  state.projectId = String(handoff.projectId || state.projectId);
  localStorage.setItem("ian-xiaohei-project-id", state.projectId);
  const handoffTitle = handoff.title || handoff.projectTitle || "小黑配图视频";
  const handoffText = handoff.text || confirmedTtsText(job);
  els.titleInput.value = handoffTitle;
  els.copyInput.value = handoffText;
  state.ttsJob = job;
  try {
    const data = await fetchJson("/api/ian-xiaohei/audio-select", {
      method: "POST",
      body: JSON.stringify({ project_id: state.projectId, job_id: job.id }),
    });
    state.selectedTtsJob = data.job;
    state.ttsJob = data.job;
    syncTtsSource(data.job, { title: handoffTitle, text: handoffText });
    resetVisualWorkflow();
    await loadAudioJobs();
    setStatus("已接收 TTS 资产", "文案、音频和同步时间戳已绑定，可以根据真实时间轴分析分镜配图。", 100, false, "等待分镜分析");
  } catch (error) {
    setStatus("TTS 资产接收失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

function syncTtsSource(job, { title = "", text = "" } = {}) {
  if (!job) {
    if (els.ttsSourceTitle) els.ttsSourceTitle.textContent = "还没有绑定 TTS 音频";
    if (els.ttsSourceMeta) els.ttsSourceMeta.textContent = "请先在 TTS 语音页生成并确认字幕时间轴，然后发送到小黑配图软件。";
    if (els.ttsSourceText) els.ttsSourceText.textContent = "收到后，这里会显示 TTS 最终文案，不在本页手动输入。";
    hideAudio();
    return;
  }
  const finalText = String(text || confirmedTtsText(job) || job.text || "").trim();
  const titleText = String(title || els.titleInput?.value || job.title || job.seo_title || job.voice_name || `TTS 音频 #${job.id}`).trim();
  if (els.titleInput) els.titleInput.value = titleText;
  if (els.copyInput) els.copyInput.value = finalText;
  const timeline = Array.isArray(job.subtitle_timeline) ? job.subtitle_timeline : [];
  const duration = Number(job.audio_duration || job.metadata?.audio_duration || job.duration || 0);
  if (els.ttsSourceTitle) els.ttsSourceTitle.textContent = titleText || `TTS 音频 #${job.id}`;
  if (els.ttsSourceMeta) {
    els.ttsSourceMeta.textContent = [
      `音频 #${job.id}`,
      job.voice_name || job.provider || "",
      duration > 0 ? `${duration.toFixed(1)} 秒` : "",
      timeline.length ? `${timeline.length} 段同步字幕` : "已确认同步时间轴",
    ].filter(Boolean).join(" · ");
  }
  if (els.ttsSourceText) els.ttsSourceText.textContent = finalText || "这条 TTS 资产暂时没有最终文案。";
  showAudio(job.audio_url || `/api/tts/audio?id=${job.id}`, `已绑定 TTS 音频 #${job.id}`);
}

function bindEvents() {
  els.planPrompts.addEventListener("click", () => createPlan());
  els.saveMinimaxSettings.addEventListener("click", () => saveMinimaxSettings());
  els.testMinimaxSettings.addEventListener("click", () => testMinimaxSettings());
  els.deleteMinimaxApi.addEventListener("click", () => deleteMinimaxApi());
  els.generateImages.addEventListener("click", () => generateCompleteWorkflow());
  els.generateAudio.addEventListener("click", () => generateAudioOnly());
  els.confirmAudio.addEventListener("click", () => confirmCurrentAudio());
  els.generateMusic.addEventListener("click", () => generateMusicMaterial());
  els.analyzeReferenceAudio.addEventListener("click", () => analyzeReferenceAudio());
  els.createReferenceClone.addEventListener("click", () => createReferenceClone());
  els.confirmReferenceClone.addEventListener("click", () => confirmReferenceClone());
  els.discardReferenceClone.addEventListener("click", () => discardReferenceClone());
  els.setDefaultReferenceStyle.addEventListener("click", () => setCurrentReferenceStyleDefault());
  els.deleteReferenceStyle.addEventListener("click", () => deleteCurrentReferenceStyle());
  els.musicPreset.addEventListener("change", () => {
    renderSelectedMusicStatus(state.config?.music || {});
  });
  els.previewVoice.addEventListener("click", () => previewCurrentVoice());
  els.setDefaultVoice.addEventListener("click", () => setCurrentVoiceDefault());
  els.deleteVoice.addEventListener("click", () => deleteCurrentVoice());
  els.voiceSelect.addEventListener("change", () => renderVoiceDescription());
  els.savedApiSelect.addEventListener("change", () => renderSavedApiDetail());
  els.aspectRatioSelect.addEventListener("change", () => resetVisualWorkflow("视频比例已改变，请重新生成分镜计划。"));
  els.purposeSelect.addEventListener("change", () => {
    renderPurposeTemplates();
    resetVisualWorkflow("视觉模板已改变，请重新生成分镜计划。");
  });
  els.templateGrid?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-purpose-template]");
    if (!card) return;
    const purpose = card.dataset.purposeTemplate || "";
    if (!purpose || els.purposeSelect.value === purpose) return;
    els.purposeSelect.value = purpose;
    els.purposeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  els.copyPrompts.addEventListener("click", () => copyAllPrompts());
  els.openOutputDir.addEventListener("click", () => openOutputDir());
  els.refreshOutputs.addEventListener("click", () => loadOutputs());
  els.audioJobs.addEventListener("click", handleAudioJobAction);
  els.promptResults.addEventListener("click", handlePromptAction);
  els.promptResults.addEventListener("change", handlePromptFileChange);
  els.outputHistory.addEventListener("click", handleOutputHistoryAction);
}

async function loadConfig() {
  const data = await fetchJson("/api/ian-xiaohei/config");
  state.config = data;
  state.outputDir = data.outputDir || "";
  els.outputDirLabel.textContent = state.outputDir;
  els.purposeSelect.innerHTML = (data.purposes || [])
    .map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
  renderPurposeTemplates();
  els.aspectRatioSelect.innerHTML = (data.aspectRatios || [{ id: "16:9", label: "16:9 横版（默认）" }])
    .map((item) => `<option value="${escapeAttr(item.id)}" ${item.id === "16:9" ? "selected" : ""}>${escapeHtml(item.label)}</option>`)
    .join("");
  els.emotionSelect.innerHTML = (data.tts?.emotions || ["自然"])
    .map((item) => `<option value="${escapeAttr(item)}" ${item === "自然" ? "selected" : ""}>${escapeHtml(item)}</option>`)
    .join("");
  els.speedSelect.innerHTML = (data.tts?.speeds || [1])
    .map((speed) => `<option value="${speed}" ${Number(speed) === 1 ? "selected" : ""}>${Number(speed).toFixed(1)}×</option>`)
    .join("");
  els.minimaxStatus.textContent = data.tts?.minimaxConfigured
    ? "已配置，可生成配音和固化试听样音"
    : "未配置，请填写 API Key";
  els.minimaxStatus.className = data.tts?.minimaxConfigured ? "success" : "error";
  els.minimaxModel.value = data.tts?.minimaxModel || "speech-2.6-hd";
  renderSavedApis(data.savedApis || []);
  renderIntegrationStatus(data.integrations || {});
  renderVoiceChoices(data.tts || {});
  renderMusicPresets(data.music || {}, data.referenceAudio || {});
}

function renderSavedApis(savedApis) {
  state.savedApis = Array.isArray(savedApis) ? savedApis : [];
  if (!els.savedApiSelect) return;
  if (!state.savedApis.length) {
    els.savedApiSelect.innerHTML = `<option value="">暂无已保存 API</option>`;
    renderSavedApiDetail();
    return;
  }
  els.savedApiSelect.innerHTML = state.savedApis.map((item) => `
    <option value="${escapeAttr(item.id)}">
      ${escapeHtml(item.activeDefault ? "默认 · " : "")}${escapeHtml(item.group)} · ${escapeHtml(item.label)}${item.apiKeyMask ? ` · ${escapeHtml(item.apiKeyMask)}` : ""}
    </option>
  `).join("");
  if (state.savedApis.some((item) => item.id === "minimax")) els.savedApiSelect.value = "minimax";
  renderSavedApiDetail();
}

function renderSavedApiDetail() {
  if (!els.savedApiDetail) return;
  const item = state.savedApis?.find((api) => api.id === els.savedApiSelect?.value);
  if (!item) {
    els.savedApiDetail.textContent = "没有读取到已保存 API。请先到系统设置保存 API。";
    els.savedApiDetail.className = "api-detail warning";
    return;
  }
  const detail = [
    item.activeDefault ? "当前默认" : "",
    item.feature,
    item.model ? `模型：${item.model}` : "",
    item.baseUrl ? `Base URL：${item.baseUrl}` : "",
    item.apiKeyMask ? `Key：${item.apiKeyMask}` : "",
  ].filter(Boolean).join(" ｜ ");
  els.savedApiDetail.textContent = detail || "已保存。";
  els.savedApiDetail.className = `api-detail ${item.activeDefault ? "success" : ""}`;
}

function renderIntegrationStatus(integrations) {
  if (!els.integrationStatus) return;
  const items = [
    `剪映草稿目录：${integrations.jianyingDraftDir ? "已配置" : "未配置"}`,
    `输出目录：${integrations.outputDir ? "正常" : "异常"}`,
  ];
  els.integrationStatus.textContent = items.join(" ｜ ");
  els.integrationStatus.className = `integration-status ${integrations.jianyingDraftDir && integrations.outputDir ? "success" : "warning"}`;
}

function renderPurposeTemplates() {
  if (!els.templateGrid || !els.purposeSelect) return;
  const options = [...els.purposeSelect.options].map((option) => ({
    id: option.value,
    label: option.textContent || option.value,
  })).filter((item) => item.id);
  if (!options.length) {
    els.templateGrid.innerHTML = '<div class="empty">正在读取小黑视觉模板。</div>';
    return;
  }
  const current = els.purposeSelect.value || options[0].id;
  if (els.templateSummary) {
    const selected = options.find((item) => item.id === current) || options[0];
    const meta = PURPOSE_TEMPLATE_META[selected.id] || {};
    els.templateSummary.textContent = `${meta.name || selected.label} · 后台调用小黑分镜、提示词、素材包和剪映草稿模块。`;
  }
  els.templateGrid.innerHTML = options.map((item) => {
    const meta = PURPOSE_TEMPLATE_META[item.id] || {};
    const active = item.id === current;
    const tags = meta.tags || [item.label, "Skill"];
    return `
      <article class="xiaohei-template-card${active ? " active" : ""}" data-purpose-template="${escapeAttr(item.id)}" style="--template-accent:${escapeAttr(meta.accent || "#f0bd69")};--template-line:${escapeAttr(meta.line || "#71d7ff")}">
        <div class="xiaohei-template-visual" aria-hidden="true"></div>
        <div class="xiaohei-template-copy">
          <strong>${escapeHtml(meta.name || item.label)}</strong>
          <p>${escapeHtml(meta.description || "调用小黑视频风格生成模块，自动完成分镜和素材包规划。")}</p>
          <div class="xiaohei-template-meta">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          <button class="xiaohei-template-use" type="button">${active ? "正在使用" : "立即使用"}</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderMusicPresets(music, referenceAudio = {}) {
  const generatedPresets = (Array.isArray(music.presets) ? music.presets : [])
    .map((preset) => ({ ...preset, source: preset.source || "minimax_music" }));
  const localAssets = (Array.isArray(music.localAssets) ? music.localAssets : [])
    .map((asset) => ({ ...asset, source: "local_bgm" }));
  state.musicPresets = [...generatedPresets, ...localAssets];
  state.referenceStylePresets = Array.isArray(referenceAudio.stylePresets) ? referenceAudio.stylePresets : [];
  renderReferenceStyleChoices();
  if (!state.musicPresets.length) {
    els.musicPreset.innerHTML = '<option value="">暂无音乐预设</option>';
    els.musicStatus.textContent = "当前没有可用音乐预设。";
    return;
  }
  els.musicPreset.innerHTML = state.musicPresets.map((preset, index) => `
    <option value="${escapeAttr(preset.id)}">${index + 1}. ${escapeHtml(preset.source === "local_bgm" ? "本地预制 · " : "在线生成 · ")}${escapeHtml(preset.label)}${preset.instrumental ? " · 纯音乐" : ""}</option>
  `).join("");
  renderSelectedMusicStatus(music);
}

function renderReferenceStyleChoices() {
  if (!els.referenceStyleSelect) return;
  const presets = state.referenceStylePresets;
  if (!presets.length) {
    els.referenceStyleSelect.innerHTML = '<option value="">暂未保存参考配乐风格</option>';
    els.setDefaultReferenceStyle.disabled = true;
    els.deleteReferenceStyle.disabled = true;
    return;
  }
  const defaultPreset = presets.find((preset) => preset.is_default) || presets[0];
  els.referenceStyleSelect.innerHTML = presets.map((preset, index) => {
    const bpm = Math.round(Number(preset.profile?.target_bpm || preset.profile?.estimated_bpm || 120));
    const defaultLabel = preset.is_default ? "默认 · " : "";
    return `<option value="${escapeAttr(preset.id)}" ${preset.id === defaultPreset.id ? "selected" : ""}>${index + 1}. ${escapeHtml(defaultLabel + preset.name)} · ${bpm} BPM</option>`;
  }).join("");
  els.setDefaultReferenceStyle.disabled = false;
  els.deleteReferenceStyle.disabled = false;
}

function currentReferenceStylePreset() {
  return state.referenceStylePresets.find((preset) => preset.id === els.referenceStyleSelect?.value) || null;
}

function currentMusicPreset() {
  return state.musicPresets.find((preset) => preset.id === els.musicPreset.value) || state.musicPresets[0] || null;
}

function isLocalMusicPreset(preset) {
  return preset?.source === "local_bgm" || String(preset?.id || "").startsWith("local_bgm:");
}

function renderSelectedMusicStatus(music = {}) {
  const preset = currentMusicPreset();
  if (!preset) {
    els.musicStatus.textContent = "当前没有可用音乐预设。";
    return;
  }
  state.selectedMusic = preset;
  if (isLocalMusicPreset(preset)) {
    els.generateMusic.textContent = "试听本地音频";
    els.musicStatus.textContent = `${preset.label}：${preset.description || "本地预制音频，可直接试听。"}`;
    return;
  }
  els.generateMusic.textContent = "生成音乐素材";
  els.musicStatus.textContent = music.configured
    ? `${preset.label}：${preset.description || "可生成本地 mp3 素材。"}`
    : "MiniMax API 未配置；仍可选择下方“本地预制”音频试听。";
}

async function generateMusicMaterial() {
  const preset = currentMusicPreset();
  if (!preset) {
    setStatus("没有音乐预设", "请先刷新配置或检查 MiniMax 配置。", 0, true);
    return;
  }
  if (isLocalMusicPreset(preset)) {
    if (!preset.audio_url) {
      setStatus("本地音频不可用", "这个本地预制音频缺少可试听地址。", 0, true);
      return;
    }
    state.selectedMusic = preset;
    els.musicPreview.src = preset.audio_url;
    els.musicPreviewTitle.textContent = `本地预制 · ${preset.label}`;
    els.musicPreviewPanel.hidden = false;
    els.musicStatus.textContent = `已载入本地预制音频：${preset.fileName || preset.label}`;
    setStatus("已载入本地预制音频", preset.fileName || preset.label, 100, false, "本地音乐素材");
    return;
  }
  const lyrics = (els.musicLyrics.value.trim() || els.copyInput.value.trim()).slice(0, 3200);
  if (!preset.instrumental && !lyrics) {
    setStatus("缺少歌词", "唱歌和搞怪音乐需要歌词或口号；也可以选择纯音乐 BGM 预设。", 0, true);
    return;
  }
  setBusy(true);
  els.musicStatus.textContent = `正在生成：${preset.label}，请等待 MiniMax 返回 mp3。`;
  setStatus("正在生成音乐素材", `${preset.label} · ${preset.description || ""}`, 35, false, "MiniMax Music");
  try {
    const data = await fetchJson("/api/ian-xiaohei/music", {
      method: "POST",
      body: JSON.stringify({
        preset_id: preset.id,
        style_preset_id: currentReferenceStylePreset()?.id || "",
        title: els.titleInput.value.trim(),
        lyrics,
        prompt_extra: els.musicPromptExtra.value.trim(),
      }),
    });
    if (data.audio_url) {
      els.musicPreview.src = data.audio_url;
      els.musicPreviewTitle.textContent = `${data.preset_label || preset.label} · ${data.model || ""}`;
      els.musicPreviewPanel.hidden = false;
    }
    els.musicStatus.textContent = `${data.message || "音乐素材已生成。"} ${data.audio_path || ""}`;
    setStatus("音乐素材已生成", data.audio_path || "可以在下方试听。", 100, false, "完成");
  } catch (error) {
    els.musicStatus.textContent = error.payload?.message || error.message || String(error);
    setStatus("音乐生成失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function analyzeReferenceAudio() {
  const file = els.referenceAudioInput.files?.[0];
  if (!file) {
    setStatus("缺少参考音频", "请先上传一个参考视频或音频。", 0, true);
    return;
  }
  setBusy(true);
  state.referenceCloneDraft = null;
  els.referenceCloneControls.hidden = true;
  resetReferenceClonePreview();
  renderReferenceProfile(null, "正在读取并分析参考音频...");
  setStatus("正在分析参考音频", "正在提取 BPM、响度、峰值和结尾收束。", 25, false, "参考音频分析");
  try {
    const mediaData = await readFileDataUrl(file);
    const data = await fetchJson("/api/ian-xiaohei/reference-audio/analyze", {
      method: "POST",
      body: JSON.stringify({
        media_data: mediaData,
        media_mime: file.type,
        file_name: file.name,
      }),
    });
    state.referenceProfile = data.profile;
    state.referenceCloneDraft = null;
    resetReferenceClonePreview();
    els.referenceCloneControls.hidden = false;
    renderReferenceProfile(data.profile);
    setStatus("参考音频分析完成", data.profile?.summary || "已生成音频风格参数。", 100, false, "完成");
  } catch (error) {
    renderReferenceProfile(null, error.payload?.message || error.message || String(error));
    setStatus("参考音频分析失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function createReferenceClone() {
  if (!state.referenceProfile) {
    setStatus("缺少参考音频", "请先分析授权参考视频或音频。", 0, true);
    return;
  }
  const voiceName = els.referenceCloneName.value.trim();
  if (!voiceName || !els.referenceCloneConsent.checked) {
    setStatus("克隆资料不完整", "请填写音色名称并确认拥有该声音的长期克隆与生成授权。", 0, true);
    return;
  }
  setBusy(true);
  setStatus("正在创建克隆音色", "正在自动提取清晰人声、调用 MiniMax 创建克隆，并生成固定试听。", 35, false, "创建克隆与试听");
  try {
    const data = await fetchJson("/api/ian-xiaohei/reference-audio/clone-draft", {
      method: "POST",
      body: JSON.stringify({
        voice_name: voiceName,
        preferred_name: `xiaohei-${Date.now().toString().slice(-8)}`,
        consent_confirmed: true,
        profile: state.referenceProfile,
      }),
    });
    state.referenceCloneDraft = data.draft;
    els.referenceClonePreview.src = data.draft.preview_url;
    els.referenceClonePreviewTitle.textContent = `${data.draft.voice_name} · 克隆音色试听`;
    els.referenceClonePreviewPanel.hidden = false;
    els.referenceCloneControls.hidden = true;
    setStatus("克隆试听已生成", "请先试听。满意后点“确认加入预设音色”；不满意可永久删除这次临时克隆。", 100, false, "等待试听确认");
  } catch (error) {
    setStatus("创建克隆音色失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function confirmReferenceClone() {
  const draft = state.referenceCloneDraft;
  if (!draft?.id) {
    setStatus("没有可确认的克隆试听", "请先创建并试听克隆音色。", 0, true);
    return;
  }
  setBusy(true);
  try {
    const data = await fetchJson("/api/ian-xiaohei/reference-audio/clone-confirm", {
      method: "POST",
      body: JSON.stringify({
        draft_id: draft.id,
        set_default: els.referenceCloneDefault.checked,
        save_style: true,
        tags: ["授权克隆", "小黑视频", "口播"],
      }),
    });
    state.referenceCloneDraft = null;
    els.referenceCloneName.value = "";
    els.referenceCloneConsent.checked = false;
    els.referenceCloneDefault.checked = false;
    resetReferenceClonePreview();
    els.referenceCloneControls.hidden = true;
    await loadConfig();
    const styleName = data.style_preset?.name ? `；已同时保存“${data.style_preset.name}”配乐风格` : "";
    setStatus("克隆音色已加入预设", `“${data.asset?.voice_name || "新音色"}”现在可在配音音色中直接选择${styleName}。`, 100, false, "完成");
  } catch (error) {
    setStatus("保存克隆音色失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function discardReferenceClone() {
  const draft = state.referenceCloneDraft;
  if (!draft?.id) return;
  if (!window.confirm(`放弃“${draft.voice_name}”的克隆试听？本地临时文件和 MiniMax 临时音色都会永久删除。`)) return;
  setBusy(true);
  try {
    await fetchJson("/api/ian-xiaohei/reference-audio/clone-discard", {
      method: "POST",
      body: JSON.stringify({ draft_id: draft.id }),
    });
    state.referenceCloneDraft = null;
    resetReferenceClonePreview();
    els.referenceCloneControls.hidden = false;
    setStatus("临时克隆已删除", "没有加入配音音色库。可以换一段更清晰的授权样本后重新创建。", 100, false, "已删除");
  } catch (error) {
    setStatus("删除临时克隆失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

function resetReferenceClonePreview() {
  els.referenceClonePreview.removeAttribute("src");
  els.referenceClonePreview.load();
  els.referenceClonePreviewPanel.hidden = true;
}

async function setCurrentReferenceStyleDefault() {
  const preset = currentReferenceStylePreset();
  if (!preset) return;
  try {
    await fetchJson("/api/ian-xiaohei/reference-audio/style-default", {
      method: "POST",
      body: JSON.stringify({ id: preset.id }),
    });
    await loadConfig();
    setStatus("默认配乐风格已更新", `“${preset.name}”会优先用于后续音乐素材生成。`, 100, false, "完成");
  } catch (error) {
    setStatus("设置默认风格失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

async function deleteCurrentReferenceStyle() {
  const preset = currentReferenceStylePreset();
  if (!preset) return;
  if (!window.confirm(`永久删除配乐风格“${preset.name}”？删除后不提供恢复。`)) return;
  try {
    await fetchJson("/api/ian-xiaohei/reference-audio/style-delete", {
      method: "POST",
      body: JSON.stringify({ id: preset.id }),
    });
    await loadConfig();
    setStatus("配乐风格已删除", `“${preset.name}”已从本地风格库移除。`, 100, false, "完成");
  } catch (error) {
    setStatus("删除配乐风格失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

function renderReferenceProfile(profile, message = "") {
  if (!els.referenceProfile) return;
  if (!profile) {
    els.referenceProfile.className = "reference-profile empty";
    els.referenceProfile.textContent = message || "还没有分析参考音频。";
    return;
  }
  els.referenceProfile.className = "reference-profile";
  els.referenceProfile.innerHTML = [
    `<strong>${escapeHtml(profile.summary || "参考音频风格")}</strong>`,
    `时长：${Number(profile.duration || 0).toFixed(1)}s`,
    `目标节拍：${Math.round(Number(profile.target_bpm || 120))} BPM`,
    `目标响度：${Number(profile.target_lufs || -14).toFixed(1)} LUFS`,
    `平均音量：${Number(profile.mean_volume_db || 0).toFixed(1)} dB`,
    `峰值：${Number(profile.max_volume_db || 0).toFixed(1)} dB`,
    `结尾收束：${Number(profile.ending_fade_seconds || 2.5).toFixed(1)}s`,
  ].map((line) => `<div>${line}</div>`).join("");
}

async function saveMinimaxSettings() {
  const apiKey = els.minimaxApiKey.value.trim();
  if (!apiKey && !state.config?.tts?.minimaxConfigured) {
    setStatus("缺少 API Key", "请填写 MiniMax（稀宇）API Key。", 0, true);
    return;
  }
  els.saveMinimaxSettings.disabled = true;
  try {
    await fetchJson("/api/tts/settings", {
      method: "POST",
      body: JSON.stringify({
        provider: "minimax",
        api_key: apiKey,
        base_url: state.config?.tts?.minimaxBaseUrl || "https://api.minimaxi.com",
        model: els.minimaxModel.value || "speech-2.6-hd",
      }),
    });
    els.minimaxApiKey.value = "";
    await loadConfig();
    setStatus("MiniMax 配置已保存", "API Key 仅保存在本地；点击某个音色的“试听当前音色”时才会生成并缓存该音色样音。", 100);
  } catch (error) {
    setStatus("配置保存失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    els.saveMinimaxSettings.disabled = false;
  }
}

async function testMinimaxSettings() {
  const selected = state.savedApis?.find((item) => item.id === els.savedApiSelect?.value);
  if (!selected) {
    setStatus("没有可测试的 API", "请先到系统设置保存 API。", 0, true);
    return;
  }
  setBusy(true);
  setStatus(`正在测试 ${selected.label}`, "正在验证本地保存的 API 配置。", 35, false, "测试连接");
  try {
    const data = selected.id === "minimax"
      ? await fetchJson("/api/ian-xiaohei/test-minimax", { method: "POST", body: "{}" })
      : await fetchJson("/api/settings/test-provider", {
        method: "POST",
        body: JSON.stringify({ id: selected.id }),
      });
    await loadConfig();
    setStatus(data.ok ? `${selected.label} 连接正常` : `${selected.label} 连接异常`, data.message || "测试完成。", 100, !data.ok, "测试完成");
  } catch (error) {
    setStatus(`${selected.label} 测试失败`, error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function deleteMinimaxApi() {
  if (!window.confirm("删除本地保存的 MiniMax API Key？删除后预设试听和语音生成会停止，已生成的音频文件不会删除。")) return;
  setBusy(true);
  try {
    await fetchJson("/api/tts/settings", {
      method: "POST",
      body: JSON.stringify({ provider: "minimax", clear_secret: true }),
    });
    els.minimaxApiKey.value = "";
    await loadConfig();
    setStatus("MiniMax API 已删除", "本地配置已清空。重新生成语音前需要再次填写 API Key。", 100);
  } catch (error) {
    setStatus("删除 API 失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

function renderVoiceChoices(tts) {
  state.voiceChoices.clear();
  const assets = Array.isArray(tts.voiceAssets) ? tts.voiceAssets : [];
  const presetInfo = new Map((tts.voices || []).flatMap((voice) => [
    [`${voice.provider || ""}:${voice.id}`, voice],
    [voice.id, voice],
  ]));
  const options = [];
  for (const asset of assets) {
    const info = presetInfo.get(`${asset.provider || ""}:${asset.voice_id}`) || presetInfo.get(asset.voice_id) || {};
    const providerLabel = asset.provider_label || info.providerLabel || asset.provider || "";
    const key = `asset:${asset.id}`;
    state.voiceChoices.set(key, {
      voiceAssetId: Number(asset.id),
      provider: asset.provider,
      providerLabel,
      voiceId: asset.voice_id,
      voiceName: asset.voice_name,
      voiceType: asset.voice_type,
      model: asset.metadata?.target_model || asset.metadata?.model || info.model || "",
      description: asset.description || info.description || "",
      category: info.category || asset.metadata?.category || "",
      useCase: info.useCase || "",
      previewUrl: asset.preview_url || "",
      supportsEmotion: asset.supports_emotion !== false && info.supportsEmotion !== false,
      supportsSpeed: asset.supports_speed !== false && info.supportsSpeed !== false,
      isDefault: Boolean(asset.is_default),
    });
    const presetLabel = [info.category, info.useCase || "平台预设"].filter(Boolean).join(" / ");
    const baseLabel = `${asset.is_default ? "默认 · " : ""}${asset.voice_name} · ${asset.voice_type === "clone" ? "我的克隆音色" : presetLabel}`;
    options.push({
      key,
      label: `${baseLabel}${providerLabel ? ` - ${providerLabel}` : ""}`,
      selected: Boolean(asset.is_default || Number(tts.defaultVoice?.id || 0) === Number(asset.id)),
    });
  }
  if (!options.length) {
    els.voiceSelect.innerHTML = '<option value="">请先在系统设置中配置 MiniMax</option>';
    renderVoiceDescription();
    return;
  }
  const selectedIndex = Math.max(0, options.findIndex((item) => item.selected));
  els.voiceSelect.innerHTML = options.map((item, index) => (
    `<option value="${escapeAttr(item.key)}" ${index === selectedIndex ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  )).join("");
  renderVoiceDescription();
}

function renderVoiceDescription() {
  const choice = currentVoiceChoice();
  if (!choice) {
    els.voiceDescription.textContent = "请先配置 MiniMax API Key 或创建克隆音色。";
    return;
  }
  els.voiceDescription.textContent = [
    choice.voiceType === "clone" ? "我的克隆音色" : "精选预设",
    choice.category,
    choice.useCase,
    choice.description,
  ].filter(Boolean).join(" · ");
  const supported = choice.supportsEmotion && choice.supportsSpeed;
  els.setDefaultVoice.disabled = !supported;
}

function currentVoiceChoice() {
  return state.voiceChoices.get(els.voiceSelect.value) || null;
}

async function previewCurrentVoice() {
  const choice = currentVoiceChoice();
  if (!choice) {
    setStatus("无法试听", "请先选择可用音色。", 0, true);
    return;
  }
  if (choice.previewUrl) {
    showAudio(choice.previewUrl, `${choice.voiceName} · 音色试听`);
    return;
  }
  setBusy(true);
  setStatus("正在生成试听", `正在生成“${choice.voiceName}”的真实试听音频。`, 25, false, "音色试听");
  try {
    const data = await fetchJson("/api/ian-xiaohei/voice-preview", {
      method: "POST",
      body: JSON.stringify({
        voice_asset_id: choice.voiceAssetId,
        provider: choice.provider,
        voice_id: choice.voiceId,
        voice_name: choice.voiceName,
        model: choice.model,
      }),
    });
    if (data.preview_url) {
      choice.previewUrl = data.preview_url;
      showAudio(data.preview_url, `${choice.voiceName} · 音色试听`);
    } else {
      const job = await pollTtsJob(data.job.id, "正在生成真实试听");
      showAudio(job.audio_url, `${choice.voiceName} · 音色试听`);
    }
    setStatus("试听已生成", "可以直接播放对比声音效果。", 100, false, "完成");
  } catch (error) {
    setStatus("试听失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
  }
}

async function setCurrentVoiceDefault() {
  const choice = currentVoiceChoice();
  if (!choice?.voiceAssetId) return;
  try {
    await fetchJson("/api/ian-xiaohei/voice-default", {
      method: "POST",
      body: JSON.stringify({ id: choice.voiceAssetId }),
    });
    await loadConfig();
    setStatus("默认音色已更新", `${choice.voiceName} 已设为默认。`, 100);
  } catch (error) {
    setStatus("设置失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

async function deleteCurrentVoice() {
  const choice = currentVoiceChoice();
  if (!choice?.voiceAssetId) return;
  if (!window.confirm(`永久删除“${choice.voiceName}”？删除后不提供恢复。`)) return;
  try {
    await fetchJson("/api/ian-xiaohei/voice-delete", {
      method: "POST",
      body: JSON.stringify({ id: choice.voiceAssetId }),
    });
    await loadConfig();
    setStatus("音色已永久删除", `${choice.voiceName} 已从配音音色中移除。`, 100);
  } catch (error) {
    setStatus("删除失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

async function createPlan() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少 TTS 资产", "请先在 TTS 语音页发送已确认的文案、音频和同步时间戳。", 0, true);
    return null;
  }
  if (
    !state.selectedTtsJob
    || !isTtsAlignmentConfirmed(state.selectedTtsJob)
    || normalizeComparableText(confirmedTtsText(state.selectedTtsJob)) !== normalizeComparableText(payload.text)
  ) {
    setStatus("请先从 TTS 发送", "小黑配图只接收 TTS 语音页确认后的最终文案、音频和字幕时间轴。", 0, true);
    return null;
  }
  setBusy(true);
  setStatus("正在按 TTS 时间轴分析分镜", "正在结合已确认音频时长、同步字幕和文案语义生成分镜提示词。", 35, false, "TTS 时间轴分析");
  try {
    const data = await fetchJson("/api/ian-xiaohei/timeline-plan", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        project_id: state.projectId,
        tts_job_id: state.selectedTtsJob.id,
      }),
    });
    state.plan = data;
    state.images = [];
    state.pendingUploads.clear();
    renderPlan(data);
    renderImages([], []);
    setStatus("分镜配图分析完成", data.analysisNote || `已生成 ${data.shots?.length || 0} 个配图方案。`, 100, false, "等待上传图片");
    return data;
  } catch (error) {
    setStatus("分镜分析失败", error.payload?.message || error.message || String(error), 0, true);
    return null;
  } finally {
    setBusy(false);
  }
}

async function generateAudioOnly() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少文案", "请先输入需要配音的文案。", 0, true);
    return null;
  }
  setBusy(true);
  try {
    const job = els.localAudioInput.files?.[0]
      ? await uploadAndValidateAudio(payload)
      : await generateTts(payload);
    state.ttsJob = job;
    showAudio(job.audio_url || `/api/tts/audio?id=${job.id}`, `音频 #${job.id} · 待确认`);
    await loadAudioJobs();
    if (isTtsAlignmentConfirmed(job)) {
      setStatus("音频和字幕已确认", "可以试听并点击“确定本视频使用”。", 100, false, "等待试听确认");
    } else {
      setStatus("音频生成完成，字幕待校准", "请到 TTS 语音页检查最终识别文案和时间轴，确认后再返回选择。", 100, false, "等待字幕确认");
    }
    return job;
  } catch (error) {
    setStatus("音频生成失败", error.payload?.message || error.message || String(error), 100, true);
    return null;
  } finally {
    setBusy(false);
  }
}

async function confirmCurrentAudio() {
  const job = state.ttsJob;
  if (!job || job.status !== "completed" || !isTtsAlignmentConfirmed(job)) {
    setStatus("字幕尚未确认", "请先到 TTS 语音页检查并确认最终文案和字幕时间轴。", 0, true);
    return null;
  }
  const text = confirmedTtsText(job);
  if (!text) {
    setStatus("缺少最终文案", "这条 TTS 音频没有最终文案，不能用于小黑配图。", 0, true);
    return null;
  }
  if (els.copyInput) els.copyInput.value = text;
  try {
    const data = await fetchJson("/api/ian-xiaohei/audio-select", {
      method: "POST",
      body: JSON.stringify({ project_id: state.projectId, job_id: job.id }),
    });
    state.selectedTtsJob = data.job;
    state.ttsJob = data.job;
    resetVisualWorkflow();
    await loadAudioJobs();
    syncTtsSource(data.job, { title: els.titleInput?.value || "", text });
    setStatus("TTS 资产已确定", "文案、音频和字幕时间轴将严格使用这条 TTS 资产。", 100, false, "可以继续生成");
    return data.job;
  } catch (error) {
    setStatus("确认失败", error.payload?.message || error.message || String(error), 100, true);
    return null;
  }
}

async function generateCompleteWorkflow() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少 TTS 资产", "请先在 TTS 语音页发送已确认的文案、音频和同步时间戳。", 0, true);
    return;
  }
  if (
    !state.selectedTtsJob
    || !isTtsAlignmentConfirmed(state.selectedTtsJob)
    || normalizeComparableText(confirmedTtsText(state.selectedTtsJob)) !== normalizeComparableText(payload.text)
  ) {
    setStatus("请先从 TTS 发送", "当前项目还没有来自 TTS 的最终文案、音频和同步时间戳，不能生成素材包。", 0, true);
    return;
  }
  if (!state.plan?.shots?.length) {
    setStatus("缺少分镜计划", "请先点击“根据 TTS 时间轴分析分镜配图”，再逐段上传确认图片。", 0, true);
    return;
  }
  const missingImages = missingShotImages(state.plan, state.images);
  if (missingImages.length) {
    setStatus(
      "缺少分镜图片",
      `请先补齐这些分镜图片：${missingImages.map((shot) => `#${shot.index} ${shot.sourceText || shot.topic || ""}`).join("；")}`,
      0,
      true,
    );
    return;
  }

  setBusy(true);
  try {
    const ttsJob = state.selectedTtsJob;
    state.ttsJob = ttsJob;
    showAudio(ttsJob.audio_url || `/api/tts/audio?id=${ttsJob.id}`, `已确定使用 · 音频 #${ttsJob.id}`);

    setStatus("正在生成小黑素材包", "图片、TTS 和字幕已绑定，正在写入小黑生产线输出目录。", 88, false, "写入文件");
    const exported = await fetchJson("/api/ian-xiaohei/export-draft", {
      method: "POST",
      body: JSON.stringify({
        project_id: state.projectId,
        tts_job_id: ttsJob.id,
        plan: state.plan,
        images: state.images,
        jianying_template: "education_tips",
        bgm_strategy: "none",
      }),
    });
    const project = exported.project || {};
    await loadOutputs();
    if (project.status !== "completed") throw new Error(project.error || "小黑素材包生成失败。");
    setStatus(
      "完整素材已生成",
      `素材包已生成：${project.output_dir || exported.packageDir || ""}`,
      100,
      false,
      "完成",
    );
  } catch (error) {
    setStatus("生成失败", error.payload?.message || error.message || String(error), 100, true, "已停止");
  } finally {
    setBusy(false);
  }
}

async function generateTts(payload) {
  const choice = currentVoiceChoice();
  if (!choice) throw new Error("请先选择可用音色。");
  if (!choice.supportsEmotion || !choice.supportsSpeed) throw new Error("当前音色不同时支持情感和语速。");
  setStatus("正在生成 TTS", "使用选中的音色、情感和语速生成完整口播音频。", 8, false, "提交配音");
  const queued = await fetchJson("/api/ian-xiaohei/tts", {
    method: "POST",
    body: JSON.stringify({
      project_id: state.projectId,
      text: payload.text,
      provider: choice.provider,
      voice_id: choice.voiceId,
      voice_name: choice.voiceName,
      voice_asset_id: choice.voiceAssetId,
      model: choice.model,
      speed: Number(els.speedSelect.value || 1),
      emotion: els.emotionSelect.value || "自然",
    }),
  });
  return pollTtsJob(queued.job.id);
}

async function pollTtsJob(id, label = "正在生成 TTS") {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const data = await fetchJson(`/api/ian-xiaohei/tts-job?id=${encodeURIComponent(id)}`);
    const job = data.job;
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error || "TTS 生成失败。");
    setStatus(
      label,
      job.stage || (job.status === "processing" ? "语音合成中。" : "等待语音任务。"),
      Number(job.progress || 0),
      false,
      job.stage || "生成配音",
    );
    await delay(1000);
  }
  throw new Error("TTS 生成超时。");
}

async function uploadAndValidateAudio(payload) {
  const file = els.localAudioInput.files[0];
  setStatus("正在核对本地 TTS", "正在识别音频，并检查是否与输入文案一致。", 8, false, "上传并识别");
  const audioData = await readFileDataUrl(file);
  const data = await fetchJson("/api/ian-xiaohei/upload-audio", {
    method: "POST",
    body: JSON.stringify({
      project_id: state.projectId,
      text: payload.text,
      audio_data: audioData,
      audio_mime: file.type,
    }),
  });
  return data.job;
}

async function loadAudioJobs() {
  const data = await fetchJson(`/api/ian-xiaohei/audio-jobs?project_id=${encodeURIComponent(state.projectId)}`);
  state.audioJobs = data.jobs || [];
  state.selectedTtsJob = data.selected || null;
  if (!state.ttsJob && state.selectedTtsJob) state.ttsJob = state.selectedTtsJob;
  if (state.selectedTtsJob) syncTtsSource(state.selectedTtsJob, { title: els.titleInput?.value || "" });
  else if (!state.ttsJob) syncTtsSource(null);
  renderAudioJobs();
}

function renderAudioJobs() {
  if (!state.audioJobs.length) {
    els.audioJobs.className = "audio-job-list empty";
    els.audioJobs.textContent = "当前项目还没有从 TTS 接收音频。";
    return;
  }
  els.audioJobs.className = "audio-job-list";
  els.audioJobs.innerHTML = state.audioJobs.map((job) => {
    const selected = Boolean(job.metadata?.selected_for_project);
    const alignmentConfirmed = isTtsAlignmentConfirmed(job);
    const alignmentLabel = alignmentConfirmed
      ? "字幕已确认"
      : job.alignment_status === "review_required"
        ? "字幕待检查"
        : job.alignment_status === "failed"
          ? "字幕校准失败"
          : "字幕处理中";
    return `
      <article class="audio-job ${selected ? "selected" : ""}">
        <div>
          <strong>TTS 音频 #${job.id} · ${escapeHtml(job.voice_name || job.provider || "配音")} ${selected ? "· 本视频使用" : ""}</strong>
          <p>${escapeHtml(job.emotion || "自然")} · ${Number(job.speed || 1).toFixed(1)}× · ${escapeHtml(statusLabel(job.status))} · ${escapeHtml(alignmentLabel)}</p>
        </div>
        <div class="audio-job-actions">
          ${job.status === "completed" ? `<button type="button" data-audio-action="preview" data-id="${job.id}">试听</button>` : ""}
          ${job.status === "completed" && alignmentConfirmed && !selected ? `<button type="button" data-audio-action="select" data-id="${job.id}">使用</button>` : ""}
          ${!["waiting", "processing"].includes(job.status) ? `<button type="button" class="danger" data-audio-action="delete" data-id="${job.id}">删除</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

async function handleAudioJobAction(event) {
  const button = event.target.closest("[data-audio-action]");
  if (!button) return;
  const job = state.audioJobs.find((item) => Number(item.id) === Number(button.dataset.id));
  if (!job) return;
  const action = button.dataset.audioAction;
  if (action === "preview") {
    state.ttsJob = job;
    showAudio(job.audio_url, `音频 #${job.id} · ${job.voice_name || job.provider}`);
    return;
  }
  if (action === "select") {
    state.ttsJob = job;
    await confirmCurrentAudio();
    return;
  }
  if (action === "delete" && window.confirm(`删除音频 #${job.id}？音频文件也会删除。`)) {
    try {
      const data = await fetchJson("/api/ian-xiaohei/audio-delete", {
        method: "POST",
        body: JSON.stringify({ project_id: state.projectId, job_id: job.id }),
      });
      state.ttsJob = data.selected || null;
      await loadAudioJobs();
      if (data.selected) showAudio(data.selected.audio_url, `自动使用 · 音频 #${data.selected.id}`);
      else hideAudio();
      resetVisualWorkflow();
      setStatus("音频已删除", data.selected ? `已自动改用音频 #${data.selected.id}。` : "当前项目暂无可用音频。", 100);
    } catch (error) {
      setStatus("删除失败", error.payload?.message || error.message || String(error), 100, true);
    }
  }
}

async function handlePromptFileChange(event) {
  const input = event.target.closest("[data-shot-upload]");
  if (!input?.files?.[0]) return;
  const index = Number(input.dataset.shotUpload);
  const file = input.files[0];
  const dataUrl = await readFileDataUrl(file);
  state.pendingUploads.set(index, { dataUrl, mimeType: file.type, fileName: file.name });
  renderPlan(state.plan);
}

async function handlePromptAction(event) {
  const button = event.target.closest("[data-prompt-action]");
  if (!button) return;
  const index = Number(button.dataset.index);
  const action = button.dataset.promptAction;
  if (action === "choose-image") {
    els.promptResults.querySelector(`[data-shot-upload="${index}"]`)?.click();
    return;
  }
  if (action === "cancel-image") {
    state.pendingUploads.delete(index);
    renderPlan(state.plan);
    return;
  }
  if (action === "confirm-image") await uploadShotImage(index);
}

async function uploadShotImage(index) {
  const pending = state.pendingUploads.get(index);
  const shot = state.plan?.shots?.find((item) => Number(item.index) === Number(index));
  if (!pending || !shot || !state.plan) return;
  const existing = state.images.find((image) => Number(image.index) === Number(index));
  setStatus("正在替换分镜图片", `正在裁剪并绑定分镜 #${index}。`, 55, false, "本地图片");
  try {
    const data = await fetchJson("/api/ian-xiaohei/upload-shot-image", {
      method: "POST",
      body: JSON.stringify({
        batchId: state.plan.batchId,
        plan: state.plan,
        shot,
        aspectRatio: state.plan.aspectRatio,
        image_data: pending.dataUrl,
        image_mime: pending.mimeType,
        replace_asset_id: existing?.assetId || "",
      }),
    });
    state.images = [
      ...state.images.filter((image) => Number(image.index) !== Number(index)),
      data.image,
    ].sort((left, right) => Number(left.index) - Number(right.index));
    state.pendingUploads.delete(index);
    renderPlan(state.plan);
    renderImages(state.images, []);
    setStatus("本地图片已绑定", `分镜 #${index} 后续只使用这张已确认图片。`, 100, false, "完成");
  } catch (error) {
    setStatus("图片替换失败", error.payload?.message || error.message || String(error), 100, true);
  }
}

async function loadOutputs() {
  const data = await fetchJson("/api/ian-xiaohei/outputs");
  state.outputDir = data.outputDir || state.outputDir;
  els.outputDirLabel.textContent = state.outputDir;
  renderHistory(data.batches || []);
}

async function openOutputDir() {
  await fetchJson("/api/ian-xiaohei/open-output", { method: "POST", body: "{}" });
}

function formPayload() {
  const sourceJob = state.selectedTtsJob || state.ttsJob;
  const sourceText = confirmedTtsText(sourceJob);
  return {
    title: els.titleInput?.value.trim() || sourceJob?.title || sourceJob?.seo_title || "小黑配图视频",
    text: els.copyInput?.value.trim() || sourceText,
    purpose: els.purposeSelect?.value || "article",
    aspectRatio: els.aspectRatioSelect?.value || "16:9",
  };
}

function renderPlan(plan) {
  const shots = plan?.shots || [];
  els.planCount.textContent = String(shots.length);
  state.promptsText = shots.map((shot) => `#${shot.index} ${shot.topic}\n对应原文：${shot.sourceText}\n${shot.prompt}`).join("\n\n---\n\n");
  if (!shots.length) {
    els.promptResults.className = "prompt-list empty";
    els.promptResults.textContent = "还没有生成提示词。";
    return;
  }
  const ratioStyle = previewRatioStyle(plan.aspectRatio);
  els.promptResults.className = "prompt-list";
  els.promptResults.innerHTML = shots.map((shot) => {
    const image = state.images.find((item) => Number(item.index) === Number(shot.index));
    const pending = state.pendingUploads.get(Number(shot.index));
    return `
      <article class="prompt-card" data-shot-card="${shot.index}">
        <h3>#${shot.index} ${escapeHtml(shot.topic)}</h3>
        <p class="meta">${shot.startTime !== undefined ? `${formatTime(shot.startTime)}–${formatTime(shot.endTime)} · ${Number(shot.duration || 0).toFixed(1)} 秒 · ` : ""}${escapeHtml(shot.role || "自动角色")} · ${escapeHtml(shot.structureType)}</p>
        <div class="semantic-binding">
          <strong>对应原文</strong>
          <p>${escapeHtml(shot.sourceText || "")}</p>
          <dl>
            <dt>核心意思</dt><dd>${escapeHtml(shot.coreIdea || "")}</dd>
            <dt>小黑动作</dt><dd>${escapeHtml(shot.xiaoheiAction || "")}</dd>
            <dt>视觉隐喻</dt><dd>${escapeHtml(shot.visualMetaphor || "")}</dd>
          </dl>
        </div>
        <details>
          <summary>查看完整生图提示词</summary>
          <pre>${escapeHtml(shot.prompt)}</pre>
        </details>
        <div class="prompt-actions">
          <button type="button" data-prompt-action="choose-image" data-index="${shot.index}">${image ? "替换本地图片" : "添加本地图片素材"}</button>
          <input hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" data-shot-upload="${shot.index}" />
          ${image ? `<span class="binding-ok">已绑定本地图片</span>` : ""}
        </div>
        ${image ? `
          <div class="shot-image-state">
            <strong>本分镜当前使用图片</strong>
            <img style="${ratioStyle}" src="${escapeAttr(image.imageUrl || image.thumbnailUrl || "")}" alt="${escapeAttr(shot.topic)}" />
            <span class="path">${escapeHtml(image.imagePath || "")}</span>
          </div>
        ` : ""}
        ${pending ? `
          <div class="manual-preview">
            <strong>裁剪前预览：${escapeHtml(pending.fileName)}</strong>
            <img style="${ratioStyle}" src="${escapeAttr(pending.dataUrl)}" alt="待上传本地图片" />
            <p class="meta">确认后系统会按 ${escapeHtml(plan.aspectRatio || "16:9")} 居中裁剪，并直接覆盖旧图。</p>
            <div class="manual-preview-actions">
              <button type="button" class="primary" data-prompt-action="confirm-image" data-index="${shot.index}">确认使用</button>
              <button type="button" data-prompt-action="cancel-image" data-index="${shot.index}">取消</button>
            </div>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function renderImages(images, errors = []) {
  els.imageCount.textContent = String(images.length);
  if (!images.length && !errors.length) {
    els.imageResults.className = "image-list empty";
    els.imageResults.textContent = "上传并确认后的图片会显示在这里。";
    return;
  }
  els.imageResults.className = "image-list";
  const ratioStyle = previewRatioStyle(state.plan?.aspectRatio);
  const imageHtml = images.map((image) => {
    const shot = state.plan?.shots?.find((item) => Number(item.index) === Number(image.index));
    return `
      <article class="image-card">
        <img style="${ratioStyle}" src="${escapeAttr(image.imageUrl || image.thumbnailUrl || "")}" alt="${escapeAttr(image.topic || "小黑配图")}" />
        <h3>#${image.index} ${escapeHtml(image.topic || "小黑配图")}</h3>
        <p class="meta">${escapeHtml(shot?.sourceText || image.purpose || "")}</p>
        <p class="path">${escapeHtml(image.imagePath || "")}</p>
      </article>
    `;
  }).join("");
  const errorHtml = errors.map((error) => `
    <article class="image-card">
      <h3 class="error">#${escapeHtml(error.index || "-")} 生成失败</h3>
      <p>${escapeHtml(error.topic || "")}</p>
      <p class="error">${escapeHtml(error.message || "未知错误")}</p>
    </article>
  `).join("");
  els.imageResults.innerHTML = imageHtml + errorHtml;
}

function missingShotImages(plan, images = []) {
  const imageByIndex = new Map((images || []).map((image) => [Number(image.index), image]));
  return (plan?.shots || []).filter((shot) => {
    const image = imageByIndex.get(Number(shot.index));
    return !image?.assetId;
  });
}

function renderHistory(batches) {
  if (els.outputHistoryCount) els.outputHistoryCount.textContent = String(batches.length || 0);
  if (!batches.length) {
    els.outputHistory.className = "history-list empty";
    els.outputHistory.textContent = "暂无历史输出。";
    return;
  }
  els.outputHistory.className = "history-list";
  els.outputHistory.innerHTML = batches.map((batch) => `
    <article class="history-card">
      <div class="history-head">
        <div>
          <h3>${escapeHtml(batch.title || batch.id)}</h3>
          <p class="meta">${escapeHtml(batch.files?.length || 0)} 张 · ${escapeHtml(batch.updatedAt || "")}</p>
        </div>
        <div class="history-actions">
          <button type="button" data-output-action="open" data-id="${escapeAttr(batch.id)}">打开目录</button>
          <button type="button" class="danger" data-output-action="delete" data-id="${escapeAttr(batch.id)}" data-timeline-id="${escapeAttr(batch.timelineProjectId || "")}">永久删除</button>
        </div>
      </div>
      <p class="path">${escapeHtml(batch.folderPath || "")}</p>
      ${batch.draftPath ? `<p class="path">剪映草稿：${escapeHtml(batch.draftPath)}</p>` : ""}
      <div class="history-images">
        ${(batch.files || []).slice(0, 4).map((file) => `
          <img src="${escapeAttr(file.imageUrl)}" alt="${escapeAttr(file.name)}" />
          <p class="path">${escapeHtml(file.path)}</p>
        `).join("")}
      </div>
    </article>
  `).join("");
}

async function handleOutputHistoryAction(event) {
  const button = event.target.closest("[data-output-action]");
  if (!button) return;
  const id = button.dataset.id || "";
  const action = button.dataset.outputAction;
  if (action === "open") {
    await fetchJson("/api/ian-xiaohei/output-open", {
      method: "POST",
      body: JSON.stringify({ id }),
    });
    return;
  }
  if (action === "delete") {
    if (!window.confirm(`永久删除历史输出“${id}”？本地草稿、素材包和记录会一起删除，不能恢复。`)) return;
    setBusy(true);
    try {
      await fetchJson("/api/ian-xiaohei/output-delete", {
        method: "POST",
        body: JSON.stringify({ id, timeline_project_id: button.dataset.timelineId || "" }),
      });
      await loadOutputs();
      setStatus("历史输出已删除", `已永久删除 ${id} 及对应本地文件。`, 100);
    } catch (error) {
      setStatus("删除历史输出失败", error.payload?.message || error.message || String(error), 100, true);
    } finally {
      setBusy(false);
    }
  }
}

async function copyAllPrompts() {
  if (!state.promptsText) await createPlan();
  if (!state.promptsText) return;
  await navigator.clipboard.writeText(state.promptsText);
  setStatus("已复制提示词", "提示词已经复制。", 100);
}

function resetVisualWorkflow(message = "") {
  state.plan = null;
  state.images = [];
  state.pendingUploads.clear();
  state.promptsText = "";
  renderPlan(null);
  renderImages([], []);
  if (message) setStatus("需要重新生成分镜", message, 0);
}

function showAudio(url, title = "当前试听音频") {
  els.audioPreview.src = url;
  els.audioPreviewTitle.textContent = title;
  els.audioPreviewPanel.hidden = false;
}

function hideAudio() {
  els.audioPreview.removeAttribute("src");
  els.audioPreview.load();
  els.audioPreviewPanel.hidden = true;
}

function setBusy(busy) {
  for (const element of [
    els.generateImages,
    els.saveMinimaxSettings,
    els.testMinimaxSettings,
    els.deleteMinimaxApi,
    els.generateMusic,
    els.analyzeReferenceAudio,
    els.createReferenceClone,
    els.confirmReferenceClone,
    els.discardReferenceClone,
    els.setDefaultReferenceStyle,
    els.deleteReferenceStyle,
    els.generateAudio,
    els.confirmAudio,
    els.planPrompts,
    els.copyPrompts,
    els.previewVoice,
    els.setDefaultVoice,
    els.deleteVoice,
  ].filter(Boolean)) {
    element.disabled = busy;
  }
  if (!busy) {
    renderVoiceDescription();
    renderReferenceStyleChoices();
  }
}

function imageProgress(done, total) {
  if (!total) return 35;
  return Math.round(35 + (Math.max(0, Math.min(done, total)) / total) * 48);
}

function setStatus(label, detail, progress = 0, isError = false, step = "") {
  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  els.statusLabel.textContent = label;
  els.statusLabel.className = isError ? "error" : safeProgress >= 100 ? "success" : "";
  els.statusDetail.textContent = detail || "";
  els.progressStep.textContent = step || (safeProgress >= 100 ? "完成" : "处理中");
  els.progressPercent.textContent = `${safeProgress}%`;
  els.progressBar.style.width = `${safeProgress}%`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.error || `请求失败 ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取文件失败。"));
    reader.readAsDataURL(file);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(value) {
  const total = Math.max(0, Number(value || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function statusLabel(value) {
  return {
    waiting: "等待中",
    processing: "生成中",
    completed: "已完成",
    failed: "失败",
  }[value] || String(value || "");
}

function normalizeComparableText(value) {
  return String(value || "").toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, "");
}

function isTtsAlignmentConfirmed(job) {
  return String(job?.alignment_status || job?.metadata?.alignment_status || "") === "confirmed";
}

function confirmedTtsText(job) {
  return String(
    job?.final_text
    || job?.metadata?.final_text
    || job?.tts_prepared_text
    || job?.original_text
    || job?.text
    || "",
  ).trim();
}

function previewRatioStyle(ratio) {
  if (ratio === "9:16") return "--preview-ratio: 9 / 16";
  if (ratio === "1:1") return "--preview-ratio: 1 / 1";
  return "--preview-ratio: 16 / 9";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
