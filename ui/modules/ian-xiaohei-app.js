const state = {
  config: null,
  plan: null,
  ttsJob: null,
  images: [],
  outputDir: "",
  promptsText: "",
  voiceChoices: new Map(),
};

const els = {
  titleInput: document.querySelector("#titleInput"),
  copyInput: document.querySelector("#copyInput"),
  voiceSelect: document.querySelector("#voiceSelect"),
  speedSelect: document.querySelector("#speedSelect"),
  purposeSelect: document.querySelector("#purposeSelect"),
  localAudioInput: document.querySelector("#localAudioInput"),
  cloneVoiceName: document.querySelector("#cloneVoiceName"),
  cloneAudioInput: document.querySelector("#cloneAudioInput"),
  cloneTranscript: document.querySelector("#cloneTranscript"),
  cloneConsent: document.querySelector("#cloneConsent"),
  cloneVoice: document.querySelector("#cloneVoice"),
  audioPreviewPanel: document.querySelector("#audioPreviewPanel"),
  audioPreview: document.querySelector("#audioPreview"),
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
  outputDirLabel: document.querySelector("#outputDirLabel"),
  planCount: document.querySelector("#planCount"),
  imageCount: document.querySelector("#imageCount"),
};

init().catch((error) => setStatus("初始化失败", error.message || String(error), 0, true));

async function init() {
  bindEvents();
  await loadConfig();
  await loadOutputs();
}

function bindEvents() {
  els.planPrompts.addEventListener("click", () => createPlan());
  els.generateImages.addEventListener("click", () => generateCompleteWorkflow());
  els.cloneVoice.addEventListener("click", () => createCloneVoice());
  els.copyPrompts.addEventListener("click", () => copyAllPrompts());
  els.openOutputDir.addEventListener("click", () => openOutputDir());
  els.refreshOutputs.addEventListener("click", () => loadOutputs());
}

async function loadConfig() {
  const data = await fetchJson("/api/ian-xiaohei/config");
  state.config = data;
  state.outputDir = data.outputDir || "";
  els.outputDirLabel.textContent = state.outputDir;
  els.purposeSelect.innerHTML = (data.purposes || [])
    .map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.label)}</option>`)
    .join("");
  renderVoiceChoices(data.tts || {});
}

function renderVoiceChoices(tts) {
  state.voiceChoices.clear();
  const options = [];
  const assets = Array.isArray(tts.voiceAssets) ? tts.voiceAssets : [];
  const presets = Array.isArray(tts.voices) ? tts.voices : [];
  for (const asset of assets) {
    const key = `asset:${asset.id}`;
    state.voiceChoices.set(key, {
      voiceAssetId: Number(asset.id),
      provider: asset.provider,
      voiceId: asset.voice_id,
      voiceName: asset.voice_name,
      model: asset.metadata?.target_model || "",
    });
    options.push({
      key,
      label: `${asset.is_default ? "默认 · " : ""}${asset.voice_name} · ${asset.voice_type === "clone" ? "我的克隆音色" : asset.provider}`,
      selected: Boolean(asset.is_default || Number(tts.defaultVoice?.id || 0) === Number(asset.id)),
    });
  }
  for (const voice of presets) {
    const key = `preset:${voice.id}`;
    state.voiceChoices.set(key, {
      voiceAssetId: 0,
      provider: tts.defaultProvider || "aliyun_bailian",
      voiceId: voice.id,
      voiceName: voice.name,
      model: voice.model || "",
    });
    options.push({
      key,
      label: `${voice.name} · 平台预设`,
      selected: !options.some((item) => item.selected) && false,
    });
  }
  if (!options.length) {
    els.voiceSelect.innerHTML = '<option value="">请先在系统设置中配置 TTS</option>';
    return;
  }
  const selectedIndex = Math.max(0, options.findIndex((item) => item.selected));
  els.voiceSelect.innerHTML = options.map((item, index) => (
    `<option value="${escapeAttr(item.key)}" ${index === selectedIndex ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  )).join("");
}

async function createPlan() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少文案", "请先输入需要配图的中文文案。", 0, true);
    return null;
  }
  setBusy(true);
  setStatus("正在分析文案", "正在提取完整语义段和小黑核心动作。", 35, false, "分析文案");
  try {
    const sentenceCount = payload.text.split(/(?<=[。！？!?；;])|\n+/).filter((item) => item.trim()).length;
    const data = await fetchJson("/api/ian-xiaohei/plan", {
      method: "POST",
      body: JSON.stringify({ ...payload, count: Math.max(1, Math.min(9, sentenceCount)) }),
    });
    state.plan = data;
    renderPlan(data);
    setStatus("配图分析完成", data.analysisNote || `已生成 ${data.shots?.length || 0} 个配图方案。`, 100, false, "分析完成");
    return data;
  } catch (error) {
    setStatus("文案分析失败", error.message || String(error), 0, true);
    return null;
  } finally {
    setBusy(false);
  }
}

async function generateCompleteWorkflow() {
  const payload = formPayload();
  if (!payload.text) {
    setStatus("缺少文案", "请先输入需要制作视频的文案。", 0, true);
    return;
  }
  setBusy(true);
  state.images = [];
  renderImages([], []);
  try {
    const ttsJob = els.localAudioInput.files?.[0]
      ? await uploadAndValidateAudio(payload)
      : await generateTts(payload);
    state.ttsJob = ttsJob;
    showAudio(ttsJob.audio_url || `/api/tts/audio?id=${ttsJob.id}`);

    setStatus("正在按音频分镜", "正在读取真实音频时长，并按 3–5 秒语义节奏绑定文案。", 28, false, "音频与文案对齐");
    const plan = await fetchJson("/api/ian-xiaohei/timeline-plan", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        tts_job_id: ttsJob.id,
      }),
    });
    state.plan = plan;
    renderPlan(plan);

    const images = [];
    const errors = [];
    const shots = plan.shots || [];
    for (let index = 0; index < shots.length; index += 1) {
      const shot = shots[index];
      setStatus(
        "正在生成小黑配图",
        `第 ${index + 1}/${shots.length} 张，对应 ${formatTime(shot.startTime)}–${formatTime(shot.endTime)}。`,
        imageProgress(index, shots.length),
        false,
        `${index}/${shots.length}`,
      );
      try {
        const data = await fetchJson("/api/ian-xiaohei/generate-shot", {
          method: "POST",
          body: JSON.stringify({ batchId: plan.batchId, plan, shot }),
        });
        images.push(data.image);
      } catch (error) {
        errors.push({
          index: shot.index,
          topic: shot.topic,
          message: error.payload?.message || error.message || String(error),
        });
      }
      renderImages(images, errors);
    }
    state.images = images;
    if (errors.length || images.length !== shots.length) {
      throw new Error(`配图未全部完成：成功 ${images.length} 张，失败 ${errors.length} 张。已停止导入剪映。`);
    }

    setStatus("正在创建剪映草稿", "图片、TTS 和字幕已绑定，正在写入剪映模板草稿。", 88, false, "提交剪映任务");
    const queued = await fetchJson("/api/ian-xiaohei/export-draft", {
      method: "POST",
      body: JSON.stringify({ plan, images, jianying_template: "education_tips", bgm_strategy: "none" }),
    });
    const project = await pollVideoProject(queued.project.id);
    await loadOutputs();
    if (project.status !== "completed") {
      throw new Error(project.error || "剪映草稿生成失败。");
    }
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
  const choice = state.voiceChoices.get(els.voiceSelect.value) || {};
  setStatus("正在生成 TTS", "使用选中的音色生成完整口播音频。", 8, false, "提交配音");
  const queued = await fetchJson("/api/ian-xiaohei/tts", {
    method: "POST",
    body: JSON.stringify({
      text: payload.text,
      provider: choice.provider,
      voice_id: choice.voiceId,
      voice_name: choice.voiceName,
      voice_asset_id: choice.voiceAssetId,
      model: choice.model,
      speed: Number(els.speedSelect.value || 1),
    }),
  });
  return pollTtsJob(queued.job.id);
}

async function pollTtsJob(id) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const data = await fetchJson(`/api/ian-xiaohei/tts-job?id=${encodeURIComponent(id)}`);
    const job = data.job;
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(job.error || "TTS 生成失败。");
    setStatus("正在生成 TTS", job.status === "processing" ? "语音合成中。" : "等待语音任务。", Math.min(24, 10 + attempt / 8), false, "生成配音");
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
      text: payload.text,
      audio_data: audioData,
      audio_mime: file.type,
    }),
  });
  return data.job;
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
  setStatus("正在创建克隆音色", "正在上传参考音频并创建可重复使用的音色。", 30, false, "声音复刻");
  try {
    const sampleData = await readFileDataUrl(file);
    const data = await fetchJson("/api/voice-assets/create", {
      method: "POST",
      body: JSON.stringify({
        voice_name: name,
        preferred_name: `xiaohei${Date.now().toString().slice(-6)}`,
        provider: "aliyun_bailian",
        target_model: "qwen3-tts-vc-2026-01-22",
        sample_data: sampleData,
        sample_mime: file.type,
        sample_transcript: els.cloneTranscript.value.trim(),
        consent_confirmed: true,
        tags: ["小黑视频", "口播"],
      }),
    });
    await loadConfig();
    setStatus("克隆音色已保存", data.message || "现在可以在配音音色中选择。", 100, false, "完成");
  } catch (error) {
    setStatus("克隆音色失败", error.payload?.message || error.message || String(error), 100, true);
  } finally {
    setBusy(false);
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
  els.promptResults.className = "prompt-list";
  els.promptResults.innerHTML = shots.map((shot) => `
    <article class="prompt-card">
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
    </article>
  `).join("");
}

function renderImages(images, errors = []) {
  els.imageCount.textContent = String(images.length);
  if (!images.length && !errors.length) {
    els.imageResults.className = "image-list empty";
    els.imageResults.textContent = "生成后的图片会显示在这里。";
    return;
  }
  els.imageResults.className = "image-list";
  const imageHtml = images.map((image) => {
    const shot = state.plan?.shots?.find((item) => Number(item.index) === Number(image.index));
    return `
      <article class="image-card">
        <img src="${escapeAttr(image.imageUrl || image.thumbnailUrl || "")}" alt="${escapeAttr(image.topic || "小黑配图")}" />
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

function renderHistory(batches) {
  if (!batches.length) {
    els.outputHistory.className = "history-list empty";
    els.outputHistory.textContent = "暂无历史输出。";
    return;
  }
  els.outputHistory.className = "history-list";
  els.outputHistory.innerHTML = batches.map((batch) => `
    <article class="history-card">
      <h3>${escapeHtml(batch.id)}</h3>
      <p class="meta">${escapeHtml(batch.files?.length || 0)} 张 · ${escapeHtml(batch.folderPath || "")}</p>
      <div class="history-images">
        ${(batch.files || []).slice(0, 4).map((file) => `
          <img src="${escapeAttr(file.imageUrl)}" alt="${escapeAttr(file.name)}" />
          <p class="path">${escapeHtml(file.path)}</p>
        `).join("")}
      </div>
    </article>
  `).join("");
}

async function copyAllPrompts() {
  if (!state.promptsText) await createPlan();
  if (!state.promptsText) return;
  await navigator.clipboard.writeText(state.promptsText);
  setStatus("已复制提示词", "提示词已经复制。", 100);
}

function showAudio(url) {
  els.audioPreview.src = url;
  els.audioPreviewPanel.hidden = false;
}

function setBusy(busy) {
  for (const element of [els.generateImages, els.planPrompts, els.copyPrompts, els.cloneVoice]) {
    element.disabled = busy;
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
