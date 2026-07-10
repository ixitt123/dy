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
  pendingUploads: new Map(),
  projectId: localStorage.getItem("ian-xiaohei-project-id") || `xiaohei-${Date.now()}`,
};
localStorage.setItem("ian-xiaohei-project-id", state.projectId);

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
  cloneVoiceName: document.querySelector("#cloneVoiceName"),
  cloneAudioInput: document.querySelector("#cloneAudioInput"),
  cloneTranscript: document.querySelector("#cloneTranscript"),
  cloneConsent: document.querySelector("#cloneConsent"),
  cloneVoice: document.querySelector("#cloneVoice"),
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
};

init().catch((error) => setStatus("初始化失败", error.message || String(error), 0, true));

async function init() {
  bindEvents();
  await loadConfig();
  await Promise.all([loadAudioJobs(), loadOutputs()]);
}

function bindEvents() {
  els.planPrompts.addEventListener("click", () => createPlan());
  els.saveMinimaxSettings.addEventListener("click", () => saveMinimaxSettings());
  els.testMinimaxSettings.addEventListener("click", () => testMinimaxSettings());
  els.deleteMinimaxApi.addEventListener("click", () => deleteMinimaxApi());
  els.generateImages.addEventListener("click", () => generateCompleteWorkflow());
  els.generateAudio.addEventListener("click", () => generateAudioOnly());
  els.confirmAudio.addEventListener("click", () => confirmCurrentAudio());
  els.cloneVoice.addEventListener("click", () => createCloneVoice());
  els.previewVoice.addEventListener("click", () => previewCurrentVoice());
  els.setDefaultVoice.addEventListener("click", () => setCurrentVoiceDefault());
  els.deleteVoice.addEventListener("click", () => deleteCurrentVoice());
  els.voiceSelect.addEventListener("change", () => renderVoiceDescription());
  els.savedApiSelect.addEventListener("change", () => renderSavedApiDetail());
  els.aspectRatioSelect.addEventListener("change", () => resetVisualWorkflow("视频比例已改变，请重新生成分镜计划。"));
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
    `图片：${integrations.imageProviderConfigured ? "已配置" : "未配置"}${integrations.imageProvider ? ` · ${integrations.imageProvider}` : ""}`,
    `剪映草稿目录：${integrations.jianyingDraftDir ? "已配置" : "未配置"}`,
    `输出目录：${integrations.outputDir ? "正常" : "异常"}`,
  ];
  els.integrationStatus.textContent = items.join(" ｜ ");
  els.integrationStatus.className = `integration-status ${integrations.imageProviderConfigured && integrations.jianyingDraftDir ? "success" : "warning"}`;
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
        base_url: state.config?.tts?.minimaxBaseUrl || "https://api.minimax.io/v1",
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
      useCase: info.useCase || "",
      previewUrl: asset.preview_url || "",
      supportsEmotion: asset.supports_emotion !== false && info.supportsEmotion !== false,
      supportsSpeed: asset.supports_speed !== false && info.supportsSpeed !== false,
      isDefault: Boolean(asset.is_default),
    });
    const baseLabel = `${asset.is_default ? "默认 · " : ""}${asset.voice_name} · ${asset.voice_type === "clone" ? "我的克隆音色" : info.useCase || "平台预设"}`;
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
    setStatus("缺少文案", "请先输入需要配图的中文文案。", 0, true);
    return null;
  }
  if (
    !state.selectedTtsJob
    || normalizeComparableText(state.selectedTtsJob.text) !== normalizeComparableText(payload.text)
  ) {
    setStatus("请先生成并确认音频", "没有确认音频时不能分析分镜配图。请先生成 TTS、试听，并点击“确定本视频使用”。", 0, true);
    return null;
  }
  setBusy(true);
  setStatus("正在按音频分析分镜", "正在结合已确认音频时长和文案语义生成分镜提示词。", 35, false, "音频+文案分析");
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
    setStatus("音频生成完成，等待确认", "请试听这条音频；满意后点击“确定本视频使用”。", 100, false, "等待试听确认");
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
  const text = formPayload().text;
  if (!job || job.status !== "completed") {
    setStatus("没有可确认的音频", "请先生成或试听一条已完成音频。", 0, true);
    return null;
  }
  if (normalizeComparableText(job.text) !== normalizeComparableText(text)) {
    setStatus("文案不一致", "当前试听音频不是由此文案生成，请重新生成音频。", 0, true);
    return null;
  }
  try {
    const data = await fetchJson("/api/ian-xiaohei/audio-select", {
      method: "POST",
      body: JSON.stringify({ project_id: state.projectId, job_id: job.id }),
    });
    state.selectedTtsJob = data.job;
    state.ttsJob = data.job;
    resetVisualWorkflow();
    await loadAudioJobs();
    showAudio(data.job.audio_url, `已确定使用 · 音频 #${data.job.id}`);
    setStatus("音频已确定", "时间轴和分镜将严格使用这条音频的真实时长。", 100, false, "可以继续生成");
    return data.job;
  } catch (error) {
    setStatus("确认失败", error.payload?.message || error.message || String(error), 100, true);
    return null;
  }
}

async function generateCompleteWorkflow() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少文案", "请先输入需要制作视频的文案。", 0, true);
    return;
  }
  if (
    !state.selectedTtsJob
    || normalizeComparableText(state.selectedTtsJob.text) !== normalizeComparableText(payload.text)
  ) {
    setStatus("请先确认音频", "当前文案还没有确认音频，不能生成剪映草稿。请先生成、试听并确认音频。", 0, true);
    return;
  }
  if (!state.plan?.shots?.length) {
    setStatus("缺少分镜计划", "请先点击“根据音频分析分镜配图”，再逐段上传确认图片。", 0, true);
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

    setStatus("正在创建剪映草稿", "图片、TTS 和字幕已绑定，正在写入剪映模板草稿。", 88, false, "提交剪映任务");
    const queued = await fetchJson("/api/ian-xiaohei/export-draft", {
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
    const project = await pollVideoProject(queued.project.id);
    await loadOutputs();
    if (project.status !== "completed") throw new Error(project.error || "剪映草稿生成失败。");
    setStatus(
      "完整素材已生成",
      project.draft_path
        ? `剪映草稿已写入：${project.draft_path}`
        : `素材包已生成，但没有检测到可见剪映草稿：${project.output_dir || ""}`,
      100,
      !project.draft_path,
      "完成",
    );
    if (project.draft_path) {
      await fetchJson("/api/video-product/open-jianying", { method: "POST", body: "{}" }).catch(() => null);
    }
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
    setStatus(label, job.status === "processing" ? "语音合成中。" : "等待语音任务。", Math.min(90, 10 + attempt / 7), false, "生成配音");
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
  renderAudioJobs();
}

function renderAudioJobs() {
  if (!state.audioJobs.length) {
    els.audioJobs.className = "audio-job-list empty";
    els.audioJobs.textContent = "当前项目还没有音频。";
    return;
  }
  els.audioJobs.className = "audio-job-list";
  els.audioJobs.innerHTML = state.audioJobs.map((job) => {
    const selected = Boolean(job.metadata?.selected_for_project);
    return `
      <article class="audio-job ${selected ? "selected" : ""}">
        <div>
          <strong>音频 #${job.id} · ${escapeHtml(job.voice_name || job.provider || "配音")} ${selected ? "· 本视频使用" : ""}</strong>
          <p>${escapeHtml(job.emotion || "自然")} · ${Number(job.speed || 1).toFixed(1)}× · ${escapeHtml(statusLabel(job.status))}</p>
        </div>
        <div class="audio-job-actions">
          ${job.status === "completed" ? `<button type="button" data-audio-action="preview" data-id="${job.id}">试听</button>` : ""}
          ${job.status === "completed" && !selected ? `<button type="button" data-audio-action="select" data-id="${job.id}">使用</button>` : ""}
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

async function pollVideoProject(id) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const data = await fetchJson(`/api/ian-xiaohei/video-job?id=${encodeURIComponent(id)}`);
    const project = data.project;
    const progress = Math.max(88, Math.min(99, Number(project.progress || 0) * 0.11 + 88));
    setStatus("正在创建剪映草稿", project.current_step || "处理中。", progress, false, `${Math.round(Number(project.progress || 0))}%`);
    if (project.status === "completed" || project.status === "failed") return project;
    await delay(1500);
  }
  throw new Error("剪映草稿任务超时。");
}

async function createCloneVoice() {
  const name = els.cloneVoiceName.value.trim();
  const file = els.cloneAudioInput.files?.[0];
  if (!name || !file || !els.cloneConsent.checked) {
    setStatus("克隆资料不完整", "请填写名称、上传本人授权音频并确认授权。", 0, true);
    return;
  }
  setBusy(true);
  setStatus("正在创建克隆音色", "正在上传参考音频并创建可重复使用的 MiniMax 音色。", 30, false, "声音克隆");
  try {
    const sampleData = await readFileDataUrl(file);
    const data = await fetchJson("/api/voice-assets/create", {
      method: "POST",
      body: JSON.stringify({
        voice_name: name,
        preferred_name: `xiaohei${Date.now().toString().slice(-8)}`,
        provider: "minimax",
        target_model: "speech-2.6-hd",
        sample_data: sampleData,
        sample_mime: file.type,
        sample_transcript: els.cloneTranscript.value.trim(),
        consent_confirmed: true,
        tags: ["小黑视频", "口播"],
      }),
    });
    await loadConfig();
    setStatus("克隆音色已保存", data.message || "现在可以在配音音色中选择并试听。", 100, false, "完成");
  } catch (error) {
    setStatus("克隆音色失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
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
  return {
    title: els.titleInput.value.trim(),
    text: els.copyInput.value.trim(),
    purpose: els.purposeSelect.value || "article",
    aspectRatio: els.aspectRatioSelect.value || "16:9",
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
          ${image ? `<span class="binding-ok">已绑定 ${escapeHtml(image.source === "local_upload" ? "本地图片" : "AI 图片")}</span>` : ""}
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
    els.imageResults.textContent = "生成或上传后的图片会显示在这里。";
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
    els.generateAudio,
    els.confirmAudio,
    els.planPrompts,
    els.copyPrompts,
    els.cloneVoice,
    els.previewVoice,
    els.setDefaultVoice,
    els.deleteVoice,
  ]) {
    element.disabled = busy;
  }
  if (!busy) renderVoiceDescription();
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
