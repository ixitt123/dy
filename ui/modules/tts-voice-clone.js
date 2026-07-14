(() => {
  const FALLBACK_REQUIREMENTS = {
    aliyun_bailian: {
      provider: "aliyun_bailian",
      label: "阿里云百炼 CosyVoice / Qwen-TTS",
      formats: ["wav", "mp3", "m4a"],
      min_duration_seconds: 10,
      max_duration_seconds: 60,
      recommended_duration: "10–20 秒",
      max_file_bytes: 7 * 1024 * 1024,
      max_file_label: "原文件建议不超过 7 MB（Base64 请求体需小于 10 MB）",
      min_sample_rate: 24000,
      channels: 1,
      text_required: true,
      models: [
        { value: "qwen3-tts-vc-2026-01-22", label: "Qwen3-TTS VC（质量优先）" },
        { value: "qwen3-tts-vc-realtime-2026-01-15", label: "Qwen3-TTS VC Realtime（速度优先）" },
      ],
    },
    minimax: {
      provider: "minimax",
      label: "MiniMax Speech",
      formats: ["wav", "mp3", "m4a"],
      min_duration_seconds: 10,
      max_duration_seconds: 300,
      recommended_duration: "10 秒以上，建议使用清晰连续朗读",
      max_file_bytes: 20 * 1024 * 1024,
      max_file_label: "不超过 20 MB",
      min_sample_rate: 0,
      channels: 0,
      text_required: true,
      models: [
        { value: "speech-2.6-hd", label: "MiniMax speech-2.6-hd（质量优先）" },
        { value: "speech-2.6-turbo", label: "MiniMax speech-2.6-turbo（速度优先）" },
      ],
    },
  };

  const state = {
    provider: "aliyun_bailian",
    requirements: FALLBACK_REQUIREMENTS.aliyun_bailian,
    sourceMode: "file",
    sampleFile: null,
    sampleObjectUrl: "",
    audioQuality: null,
    draft: null,
    busy: false,
    recorder: null,
    recorderStream: null,
    recorderChunks: [],
    recorderStartedAt: 0,
    recorderTimer: 0,
  };

  let nodes = {};

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const error = new Error(data.message || data.error || `请求失败（${response.status}）`);
      error.data = data;
      throw error;
    }
    return data;
  }

  function setStatus(message, tone = "") {
    if (!nodes.status) return;
    nodes.status.textContent = message;
    nodes.status.dataset.tone = tone;
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function fileExtension(file) {
    const name = String(file?.name || "").toLowerCase();
    const match = name.match(/\.([a-z0-9]+)$/);
    if (match) return match[1] === "jpeg" ? "jpg" : match[1];
    const mime = String(file?.type || "").toLowerCase();
    if (mime.includes("wav")) return "wav";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
    return "";
  }

  function fileMime(file) {
    const extension = fileExtension(file);
    if (extension === "wav") return "audio/wav";
    if (extension === "mp3") return "audio/mpeg";
    if (extension === "m4a") return "audio/mp4";
    return String(file?.type || "").toLowerCase();
  }

  function renderRequirements() {
    const requirements = state.requirements;
    const sampleRate = requirements.min_sample_rate ? `采样率 ≥ ${requirements.min_sample_rate / 1000} kHz` : "采样率按平台默认处理";
    const channels = requirements.channels ? `${requirements.channels === 1 ? "单声道" : `${requirements.channels} 声道`}` : "声道数按平台默认处理";
    nodes.requirements.innerHTML = `
      <div class="tts-clone-requirement-title">${escapeHtml(requirements.label)} · 上传要求</div>
      <div class="tts-clone-requirement-list">
        <span>格式：${escapeHtml(requirements.formats.join(" / ").toUpperCase())}</span>
        <span>时长：${requirements.min_duration_seconds}–${requirements.max_duration_seconds >= 300 ? "300" : requirements.max_duration_seconds} 秒（推荐 ${escapeHtml(requirements.recommended_duration)}）</span>
        <span>${escapeHtml(requirements.max_file_label)}</span>
        <span>${escapeHtml(sampleRate)} · ${escapeHtml(channels)}</span>
        <span>连续清晰人声，避免背景音乐、环境噪音和其他人声</span>
      </div>
    `;
  }

  function renderModelOptions() {
    const models = Array.isArray(state.requirements.models) ? state.requirements.models : [];
    nodes.model.innerHTML = models.map((model) => `<option value="${escapeHtml(model.value)}">${escapeHtml(model.label)}</option>`).join("");
  }

  async function loadRequirements(providerId) {
    state.provider = providerId;
    state.requirements = FALLBACK_REQUIREMENTS[providerId] || FALLBACK_REQUIREMENTS.aliyun_bailian;
    renderRequirements();
    renderModelOptions();
    try {
      const data = await requestJson(`/api/voice-assets/clone-requirements?provider=${encodeURIComponent(providerId)}`);
      if (data.requirements) state.requirements = data.requirements;
    } catch {
      // The fallback keeps the UI usable when an older server is still running.
    }
    renderRequirements();
    renderModelOptions();
    if (state.sampleFile) await inspectAudio(state.sampleFile);
    renderTextChecks();
  }

  function renderChecks(container, checks) {
    container.innerHTML = checks.map((check) => `
      <div class="tts-clone-check ${check.state}">
        <b>${check.state === "ok" ? "✓" : check.state === "warn" ? "!" : "×"}</b>
        <span><strong>${escapeHtml(check.label)}</strong>${check.detail ? `：${escapeHtml(check.detail)}` : ""}</span>
      </div>
    `).join("");
  }

  function inspectText(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const chars = clean.replace(/\s/g, "").length;
    const hasControl = /[\u0000-\u001f\u007f]/u.test(clean);
    const hasPunctuation = /[。！？!?；;，,.:：]/u.test(clean);
    const hasSensitive = /(色情|赌博|毒品|诈骗|暴恐|恐怖袭击|自杀|制作炸弹|仇恨)/iu.test(clean);
    const checks = [
      { label: "文字内容", state: chars >= 3 && !hasControl ? "ok" : "bad", detail: chars >= 3 ? `${chars} 字` : "至少填写 3 个字，并移除控制字符" },
      { label: "文字长度", state: chars <= 2400 ? "ok" : "bad", detail: chars <= 2400 ? "在 2400 字以内" : "不能超过 2400 字" },
      { label: "标点与停顿", state: hasPunctuation || chars < 24 ? "ok" : "warn", detail: hasPunctuation ? "已检测到停顿标记" : "建议补充句号、逗号等停顿" },
      { label: "基础敏感内容", state: hasSensitive ? "bad" : "ok", detail: hasSensitive ? "请移除敏感内容后再提交" : "未发现明显敏感词" },
    ];
    return { clean, chars, checks, ok: checks.every((check) => check.state === "ok") };
  }

  function renderTextChecks() {
    if (!nodes.transcript) return;
    const result = inspectText(nodes.transcript.value);
    renderChecks(nodes.textChecks, result.checks);
    renderSubmitState();
  }

  function db(value) {
    return value > 0 ? 20 * Math.log10(value) : -100;
  }

  async function decodeAudio(file) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error("当前浏览器不支持音频质量分析。");
    const context = new AudioContextCtor();
    try {
      return await context.decodeAudioData(await file.arrayBuffer());
    } finally {
      await context.close().catch(() => {});
    }
  }

  async function inspectAudio(file) {
    if (!file) {
      state.audioQuality = null;
      nodes.audioChecks.innerHTML = "";
      renderSubmitState();
      return;
    }
    setStatus("正在分析音频质量……");
    try {
      const buffer = await decodeAudio(file);
      const channelData = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      const mono = channelData[0] || new Float32Array();
      const frameSize = Math.max(256, Math.floor(buffer.sampleRate * 0.02));
      let frames = 0;
      let activeFrames = 0;
      let totalEnergy = 0;
      let peak = 0;
      for (let offset = 0; offset < mono.length; offset += frameSize) {
        const end = Math.min(mono.length, offset + frameSize);
        let energy = 0;
        for (let index = offset; index < end; index += 1) {
          const value = Math.abs(mono[index]);
          peak = Math.max(peak, value);
          energy += value * value;
        }
        const rms = Math.sqrt(energy / Math.max(1, end - offset));
        totalEnergy += energy;
        frames += 1;
        if (rms >= 0.01) activeFrames += 1;
      }
      const rms = Math.sqrt(totalEnergy / Math.max(1, mono.length));
      const duration = Number(buffer.duration || 0);
      const voiceRatio = frames ? activeFrames / frames : 0;
      const extension = fileExtension(file);
      const mime = fileMime(file);
      const requirements = state.requirements;
      const checks = [
        { label: "格式", state: requirements.formats.includes(extension) ? "ok" : "bad", detail: extension ? extension.toUpperCase() : mime || "无法识别" },
        { label: "时长", state: duration >= requirements.min_duration_seconds && duration <= requirements.max_duration_seconds ? "ok" : "bad", detail: `${duration.toFixed(1)} 秒` },
        { label: "文件大小", state: file.size <= requirements.max_file_bytes ? "ok" : "bad", detail: formatBytes(file.size) },
        { label: "清晰度 / 响度", state: db(rms) >= -45 && db(peak) < -0.5 ? "ok" : "bad", detail: `RMS ${db(rms).toFixed(1)} dB，峰值 ${db(peak).toFixed(1)} dB` },
        { label: "人声占比估算", state: voiceRatio >= 0.2 ? "ok" : "bad", detail: `${Math.round(voiceRatio * 100)}%` },
      ];
      if (requirements.min_sample_rate) {
        checks.push({ label: "采样率", state: buffer.sampleRate >= requirements.min_sample_rate ? "ok" : "bad", detail: `${Math.round(buffer.sampleRate / 1000)} kHz` });
      }
      if (requirements.channels) {
        checks.push({ label: "声道", state: buffer.numberOfChannels === requirements.channels ? "ok" : "bad", detail: buffer.numberOfChannels === 1 ? "单声道" : `${buffer.numberOfChannels} 声道` });
      }
      state.audioQuality = { duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels, voiceRatio, checks };
      renderChecks(nodes.audioChecks, checks);
      setStatus(checks.every((check) => check.state === "ok") ? "音频质量校正通过，请继续检查文字。" : "音频质量校正未通过，请按提示更换或重新录制。", checks.every((check) => check.state === "ok") ? "success" : "error");
    } catch (error) {
      state.audioQuality = null;
      renderChecks(nodes.audioChecks, [{ label: "音频解析", state: "bad", detail: error instanceof Error ? error.message : String(error) }]);
      setStatus("音频无法解析，请改用 WAV、MP3 或 M4A 文件。", "error");
    }
    renderSubmitState();
  }

  function renderSubmitState() {
    const textResult = inspectText(nodes.transcript?.value || "");
    const audioOk = Boolean(state.audioQuality?.checks?.every((check) => check.state === "ok"));
    nodes.analyze.disabled = state.busy || !state.sampleFile || !audioOk || !textResult.ok;
  }

  function clearSample() {
    if (state.sampleObjectUrl) URL.revokeObjectURL(state.sampleObjectUrl);
    state.sampleObjectUrl = "";
    state.sampleFile = null;
    state.audioQuality = null;
    nodes.sourceAudio.removeAttribute("src");
    nodes.sourceAudio.hidden = true;
    nodes.sampleMeta.textContent = "尚未选择参考音频。";
    nodes.audioChecks.innerHTML = "";
    renderSubmitState();
  }

  async function setSampleFile(file) {
    if (!file) {
      clearSample();
      return;
    }
    if (state.sampleObjectUrl) URL.revokeObjectURL(state.sampleObjectUrl);
    state.sampleFile = file;
    state.sampleObjectUrl = URL.createObjectURL(file);
    nodes.sourceAudio.src = state.sampleObjectUrl;
    nodes.sourceAudio.hidden = false;
    nodes.sampleMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
    await inspectAudio(file);
  }

  function stopRecorderStream() {
    state.recorderStream?.getTracks?.().forEach((track) => track.stop());
    state.recorderStream = null;
  }

  function setRecorderTimer(active) {
    window.clearInterval(state.recorderTimer);
    if (!active) {
      nodes.recordTimer.textContent = "00:00";
      return;
    }
    state.recorderStartedAt = Date.now();
    state.recorderTimer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - state.recorderStartedAt) / 1000);
      nodes.recordTimer.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
      if (elapsed >= Number(state.requirements.max_duration_seconds || 300)) stopRecording();
    }, 250);
  }

  function audioBufferToWav(buffer) {
    const channels = Math.min(2, buffer.numberOfChannels || 1);
    const length = buffer.length * channels * 2;
    const output = new ArrayBuffer(44 + length);
    const view = new DataView(output);
    const writeString = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    writeString(0, "RIFF");
    view.setUint32(4, 36 + length, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, length, true);
    const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
    let offset = 44;
    for (let index = 0; index < buffer.length; index += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channelData[channel][index] || 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return output;
  }

  async function blobToWav(blob) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error("当前浏览器不支持麦克风音频转换。");
    const context = new AudioContextCtor();
    try {
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      return audioBufferToWav(buffer);
    } finally {
      await context.close().catch(() => {});
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus("当前浏览器不支持麦克风录音，请改用本地上传。", "error");
      return;
    }
    clearSample();
    try {
      state.recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
      state.recorder = new MediaRecorder(state.recorderStream, mimeType ? { mimeType } : undefined);
      state.recorderChunks = [];
      state.recorder.ondataavailable = (event) => { if (event.data?.size) state.recorderChunks.push(event.data); };
      state.recorder.onstop = async () => {
        setRecorderTimer(false);
        stopRecorderStream();
        nodes.recordButton.disabled = true;
        setStatus("正在整理录音并分析质量……");
        try {
          const blob = new Blob(state.recorderChunks, { type: state.recorder.mimeType || "audio/webm" });
          const wav = await blobToWav(blob);
          await setSampleFile(new File([wav], "microphone-reference.wav", { type: "audio/wav" }));
          setStatus("录音已转换为 WAV，请确认音频和文字校正结果。", "success");
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error), "error");
        } finally {
          nodes.recordButton.disabled = false;
        }
      };
      state.recorder.start();
      setRecorderTimer(true);
      nodes.recordButton.textContent = "停止录音";
      nodes.recordButton.classList.add("recording");
      setStatus("正在录音，请按正常语速连续朗读参考文字……");
    } catch (error) {
      stopRecorderStream();
      setStatus(error instanceof Error ? error.message : "无法访问麦克风。", "error");
    }
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
    state.recorder = null;
    nodes.recordButton.textContent = "开始录音";
    nodes.recordButton.classList.remove("recording");
  }

  function setSourceMode(mode) {
    state.sourceMode = mode;
    nodes.fileMode.hidden = mode !== "file";
    nodes.micMode.hidden = mode !== "mic";
    nodes.sourceButtons.forEach((button) => button.classList.toggle("active", button.dataset.cloneSource === mode));
    clearSample();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("参考音频读取失败。"));
      reader.readAsDataURL(file);
    });
  }

  async function analyzeAndClone() {
    const textResult = inspectText(nodes.transcript.value);
    const audioOk = Boolean(state.audioQuality?.checks?.every((check) => check.state === "ok"));
    if (!state.sampleFile || !audioOk || !textResult.ok) {
      setStatus("请先通过音频质量和文字双校正。", "error");
      renderSubmitState();
      return;
    }
    state.busy = true;
    nodes.analyze.disabled = true;
    nodes.provider.disabled = true;
    nodes.model.disabled = true;
    nodes.previewPanel.hidden = true;
    setStatus("正在上传参考音频、提取音色并生成试听，请稍候……");
    try {
      const data = await requestJson("/api/voice-assets/clone-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: state.provider,
          target_model: nodes.model.value,
          voice_name: "待命名音色",
          preferred_name: `clone_${Date.now().toString().slice(-8)}`,
          sample_data: await fileToDataUrl(state.sampleFile),
          sample_mime: fileMime(state.sampleFile),
          sample_transcript: textResult.clean,
          consent_notice_acknowledged: true,
        }),
      });
      state.draft = data.draft;
      nodes.clonePreview.src = `${data.draft.preview_url || `/api/voice-assets/clone-draft/audio?id=${encodeURIComponent(data.draft.id)}`}&_=${Date.now()}`;
      nodes.clonePreview.load();
      nodes.previewPanel.hidden = false;
      nodes.cloneName.value = "";
      setStatus("声音提取成功，请试听并修改名称后保存。", "success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    } finally {
      state.busy = false;
      nodes.provider.disabled = Boolean(state.draft);
      nodes.model.disabled = Boolean(state.draft);
      renderSubmitState();
    }
  }

  async function saveClone() {
    const name = nodes.cloneName.value.trim();
    if (!state.draft) return;
    if (!name) {
      setStatus("请先填写保存到音色库的名称。", "error");
      nodes.cloneName.focus();
      return;
    }
    nodes.save.disabled = true;
    setStatus("正在保存到音色库……");
    try {
      const data = await requestJson("/api/voice-assets/clone-draft/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: state.draft.id,
          voice_name: name,
          target_model: nodes.model.value,
          save_style: false,
          consent_notice_acknowledged: true,
        }),
      });
      if (typeof window.loadVoiceAssets === "function") await window.loadVoiceAssets();
      if (data.asset && typeof window.applyVoiceAssetToTts === "function") {
        await window.applyVoiceAssetToTts(data.asset).catch(() => {});
      }
      setStatus(`“${name}”已添加到音色库，并已切换为当前声音。`, "success");
      state.draft = null;
      nodes.previewPanel.hidden = true;
      nodes.provider.disabled = false;
      nodes.model.disabled = false;
      nodes.save.disabled = false;
    } catch (error) {
      nodes.save.disabled = false;
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function discardDraft() {
    if (!state.draft) return;
    nodes.discard.disabled = true;
    try {
      await requestJson("/api/voice-assets/clone-draft/discard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: state.draft.id }),
      });
      state.draft = null;
      nodes.previewPanel.hidden = true;
      nodes.provider.disabled = false;
      nodes.model.disabled = false;
      nodes.discard.disabled = false;
      setStatus("临时克隆已删除，可以重新上传或录音。", "success");
    } catch (error) {
      nodes.discard.disabled = false;
      setStatus(error instanceof Error ? error.message : String(error), "error");
    }
  }

  function closeModule() {
    if (state.recorder) stopRecording();
    nodes.module.hidden = true;
    nodes.selectionCard.hidden = false;
    nodes.trigger.textContent = "声音克隆";
    nodes.trigger.setAttribute("aria-expanded", "false");
  }

  function openModule() {
    nodes.module.hidden = false;
    nodes.selectionCard.hidden = true;
    nodes.trigger.textContent = "返回选择声音";
    nodes.trigger.setAttribute("aria-expanded", "true");
    nodes.module.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function bind() {
    nodes.trigger.addEventListener("click", () => (nodes.module.hidden ? openModule() : closeModule()));
    nodes.close.addEventListener("click", closeModule);
    nodes.provider.addEventListener("change", () => loadRequirements(nodes.provider.value));
    nodes.sourceButtons.forEach((button) => button.addEventListener("click", () => setSourceMode(button.dataset.cloneSource)));
    nodes.fileInput.addEventListener("change", () => setSampleFile(nodes.fileInput.files?.[0] || null));
    nodes.recordButton.addEventListener("click", () => {
      if (state.recorder?.state === "recording") stopRecording();
      else startRecording();
    });
    nodes.rerecordButton.addEventListener("click", () => {
      if (state.recorder) stopRecording();
      clearSample();
      startRecording();
    });
    nodes.transcript.addEventListener("input", renderTextChecks);
    nodes.analyze.addEventListener("click", analyzeAndClone);
    nodes.save.addEventListener("click", saveClone);
    nodes.discard.addEventListener("click", discardDraft);
  }

  function buildModule() {
    const lab = document.querySelector("#ttsLab");
    const lane = lab?.querySelector(".tts-settings-lane");
    const selectionCard = lane?.querySelector(".tts-control-column");
    const heading = lane?.querySelector(".studio-lane-heading");
    if (!lab || !lane || !selectionCard || !heading || document.querySelector("#ttsVoiceCloneModule")) return;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ghost small tts-voice-clone-trigger";
    trigger.textContent = "声音克隆";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "ttsVoiceCloneModule");
    heading.appendChild(trigger);

    const module = document.createElement("section");
    module.id = "ttsVoiceCloneModule";
    module.className = "tts-voice-clone-module";
    module.hidden = true;
    module.innerHTML = `
      <div class="tts-clone-module-head">
        <div>
          <span class="section-eyebrow">声音克隆</span>
          <h3>创建自定义音色</h3>
          <p>选择平台，上传或录制参考音频，完成音频质量与文字双校正后生成试听。</p>
          <small class="tts-clone-consent-notice">授权提示：请只使用你拥有克隆和生成授权的声音，平台仍会进行内容审核。</small>
        </div>
        <button class="ghost small" type="button" data-clone-close>返回选择声音</button>
      </div>
      <div class="tts-clone-flow-grid">
        <div class="tts-clone-source-pane">
          <label>克隆平台
            <select data-clone-provider>
              <option value="aliyun_bailian">阿里云百炼 CosyVoice / Qwen-TTS</option>
              <option value="minimax">MiniMax Speech</option>
            </select>
          </label>
          <label>目标模型
            <select data-clone-model></select>
          </label>
          <div class="tts-clone-requirements" data-clone-requirements></div>
          <div class="tts-clone-source-tabs" role="tablist" aria-label="参考音频来源">
            <button class="ghost small active" type="button" data-clone-source="file">上传参考音频</button>
            <button class="ghost small" type="button" data-clone-source="mic">麦克风录音</button>
          </div>
          <div data-clone-file-mode>
            <label>参考音频文件
              <input data-clone-file type="file" accept=".wav,.mp3,.m4a,audio/wav,audio/mpeg,audio/mp4" />
            </label>
          </div>
          <div data-clone-mic-mode hidden>
            <div class="tts-clone-record-row">
              <button class="ghost" type="button" data-clone-record>开始录音</button>
              <strong data-clone-record-timer>00:00</strong>
              <button class="ghost small" type="button" data-clone-rerecord>重新录制</button>
            </div>
            <small>按正常语速连续朗读参考文字，停止后自动转成 WAV 并分析。</small>
          </div>
          <div class="tts-clone-sample-meta" data-clone-sample-meta>尚未选择参考音频。</div>
          <audio class="tts-clone-source-audio" data-clone-source-audio controls preload="metadata" hidden></audio>
          <div class="tts-clone-checks" data-clone-audio-checks></div>
        </div>
        <div class="tts-clone-text-pane">
          <label>参考音频对应文字
            <textarea data-clone-transcript rows="9" placeholder="请填写参考音频中实际朗读的文字，用于文字校正和提高复刻准确度。"></textarea>
          </label>
          <div class="tts-clone-checks" data-clone-text-checks></div>
          <div class="tts-clone-actions">
            <button class="primary" type="button" data-clone-analyze disabled>校正并提取声音</button>
            <span data-clone-status>等待选择参考音频和文字。</span>
          </div>
        </div>
      </div>
      <div class="tts-clone-preview-panel" data-clone-preview-panel hidden>
        <div>
          <span class="section-eyebrow">Preview</span>
          <h3>试听克隆结果</h3>
          <p>试听满意后可修改名称并添加到 TTS 音色库。</p>
        </div>
        <audio data-clone-preview controls preload="metadata"></audio>
        <div class="tts-clone-save-row">
          <label>音色名称
            <input data-clone-name type="text" maxlength="60" placeholder="例如：老师知识口播" />
          </label>
          <button class="primary" type="button" data-clone-save>添加到音色库</button>
          <button class="ghost danger-action" type="button" data-clone-discard>删除临时克隆</button>
        </div>
      </div>
    `;
    lane.appendChild(module);

    nodes = {
      lab,
      lane,
      selectionCard,
      heading,
      trigger,
      module,
      close: module.querySelector("[data-clone-close]"),
      provider: module.querySelector("[data-clone-provider]"),
      model: module.querySelector("[data-clone-model]"),
      requirements: module.querySelector("[data-clone-requirements]"),
      sourceButtons: [...module.querySelectorAll("[data-clone-source]")],
      fileMode: module.querySelector("[data-clone-file-mode]"),
      micMode: module.querySelector("[data-clone-mic-mode]"),
      fileInput: module.querySelector("[data-clone-file]"),
      recordButton: module.querySelector("[data-clone-record]"),
      rerecordButton: module.querySelector("[data-clone-rerecord]"),
      recordTimer: module.querySelector("[data-clone-record-timer]"),
      sampleMeta: module.querySelector("[data-clone-sample-meta]"),
      sourceAudio: module.querySelector("[data-clone-source-audio]"),
      audioChecks: module.querySelector("[data-clone-audio-checks]"),
      transcript: module.querySelector("[data-clone-transcript]"),
      textChecks: module.querySelector("[data-clone-text-checks]"),
      analyze: module.querySelector("[data-clone-analyze]"),
      status: module.querySelector("[data-clone-status]"),
      previewPanel: module.querySelector("[data-clone-preview-panel]"),
      clonePreview: module.querySelector("[data-clone-preview]"),
      cloneName: module.querySelector("[data-clone-name]"),
      save: module.querySelector("[data-clone-save]"),
      discard: module.querySelector("[data-clone-discard]"),
    };
    state.provider = document.querySelector("#ttsProvider")?.value || "aliyun_bailian";
    nodes.provider.value = state.provider;
    bind();
    renderTextChecks();
    loadRequirements(state.provider);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildModule, { once: true });
  else buildModule();
})();
