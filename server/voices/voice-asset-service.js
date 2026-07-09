import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createTtsProvider } from "../tts/providers/index.js";

const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;
const MIME_EXTENSIONS = {
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
};

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function sanitizeName(value) {
  return String(value || "voice")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .trim()
    .slice(0, 60) || "voice";
}

function parseTags(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,，、\n]/);
  return [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, 20);
}

function parseTestScripts(markdown) {
  const scripts = [];
  const pattern = /^##\s+([^|\n]+)\|\s*([^|\n]+)\|\s*([^\n]+)\s*\n+([\s\S]*?)(?=^##\s+|\s*$)/gm;
  let match;
  while ((match = pattern.exec(markdown))) {
    scripts.push({
      type: match[1].trim(),
      name: match[2].trim(),
      emotion: match[3].trim(),
      text: match[4].trim(),
    });
  }
  return scripts;
}

function decodeAudio(dataUrl, mimeHint = "") {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  const mimeType = String(match?.[1] || mimeHint || "").toLowerCase();
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("参考音频只支持 WAV、MP3 或 M4A。");
  const buffer = Buffer.from(match?.[2] || "", "base64");
  if (!buffer.length) throw new Error("参考音频为空。");
  if (buffer.length > MAX_SAMPLE_BYTES) throw new Error("参考音频不能超过 20MB。");
  return { buffer, mimeType: mimeType === "audio/x-wav" ? "audio/wav" : mimeType, extension };
}

export function createVoiceAssetService({ baseDir, taskStore, ttsService, getSettings, ffmpegPath }) {
  const voicesDir = path.join(baseDir, "voices");
  const samplesDir = path.join(voicesDir, "samples");
  const clonesDir = path.join(voicesDir, "clones");
  const previewsDir = path.join(voicesDir, "previews");
  const promptPath = path.join(baseDir, "prompts", "voice_test_script.md");

  for (const directory of [voicesDir, samplesDir, clonesDir, previewsDir]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  if (!fs.existsSync(promptPath)) throw new Error("缺少声音测试 Prompt：voice_test_script.md");

  const testScripts = parseTestScripts(fs.readFileSync(promptPath, "utf8"));
  if (testScripts.length !== 5) throw new Error("声音测试 Prompt 必须包含 5 类测试脚本。");

  function writeSample(dataUrl, mimeType, voiceName) {
    const audio = decodeAudio(dataUrl, mimeType);
    const filePath = path.join(samplesDir, `${Date.now()}-${sanitizeName(voiceName)}-${randomUUID().slice(0, 8)}${audio.extension}`);
    fs.writeFileSync(filePath, audio.buffer);
    return { path: filePath, mimeType: audio.mimeType, size: audio.buffer.length };
  }

  function writeCloneRecord(asset) {
    const filePath = path.join(clonesDir, `voice-${asset.id}-v${asset.version}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      id: asset.id,
      provider: asset.provider,
      voice_id: asset.voice_id,
      voice_name: asset.voice_name,
      version: asset.version,
      parent_voice_id: asset.parent_voice_id,
      status: asset.status,
      updated_at: asset.updated_at,
    }, null, 2), "utf8");
  }

  function providerFor(providerId) {
    const settings = getSettings();
    return createTtsProvider(providerId, {
      config: settings.tts?.[providerId] || {},
      ffmpegPath,
    });
  }

  async function cloneSample({ providerId, name, samplePath, mimeType, targetModel, transcript, consentConfirmed }) {
    const provider = providerFor(providerId);
    if (!provider) return { success: false, error: "未知 TTS Provider。" };
    return provider.cloneVoice({
      name,
      audioPath: samplePath,
      consentConfirmed,
      targetModel,
      mimeType,
      transcript,
    });
  }

  function enrichAsset(row, ratings = []) {
    if (!row) return null;
    const metadata = safeJson(row.metadata_json, {});
    const tags = safeJson(row.tags_json, []);
    const ownRatings = ratings.filter((rating) => Number(rating.voice_asset_id) === Number(row.id));
    const averageScore = ownRatings.length
      ? Math.round(ownRatings.reduce((sum, rating) => sum + Number(rating.score || 0), 0) / ownRatings.length)
      : 0;
    const averageStars = ownRatings.length
      ? Number((ownRatings.reduce((sum, rating) => sum + Number(rating.stars || 0), 0) / ownRatings.length).toFixed(1))
      : 0;
    const previewTest = taskStore.listVoiceTests({ voiceAssetId: row.id })
      .find((test) => test.status === "completed" && test.tts_job_id);
    return {
      ...row,
      tags,
      metadata,
      sample_url: row.sample_path ? `/api/voice-assets/audio?id=${row.id}&kind=sample` : metadata.sample_url || "",
      preview_url: previewTest
        ? `/api/tts/audio?id=${previewTest.tts_job_id}`
        : String(metadata.demo_audio || ""),
      supports_emotion: metadata.supports_emotion !== false,
      supports_speed: metadata.supports_speed !== false,
      rating_count: ownRatings.length,
      average_score: averageScore,
      average_stars: averageStars,
    };
  }

  function ensurePresetAssets() {
    ttsService.listVoices("aliyun_bailian");
  }

  function listAssets() {
    ensurePresetAssets();
    const ratings = taskStore.listVoiceRatings({});
    return taskStore.listVoices({}).map((row) => enrichAsset(row, ratings));
  }

  function getAsset(id) {
    const ratings = taskStore.listVoiceRatings({ voiceAssetId: id });
    return enrichAsset(taskStore.getVoiceAsset(id), ratings);
  }

  async function createAsset(input) {
    const rawVoiceName = String(input.voice_name || "").trim();
    if (!rawVoiceName) return { error: "请填写声音名称。" };
    const voiceName = sanitizeName(rawVoiceName);
    const provider = String(input.provider || "aliyun_bailian");
    const consentConfirmed = input.consent_confirmed === true;
    const manualVoiceId = String(input.voice_id || "").trim();
    const referenceId = String(input.reference_id || "").trim();
    const effectiveManualVoiceId = manualVoiceId || referenceId;
    let sample = null;
    if (input.sample_data) {
      try {
        sample = writeSample(input.sample_data, input.sample_mime, voiceName);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
    if (!effectiveManualVoiceId && !sample) return { error: "请上传参考音频，或填写已有 voice_id / reference_id。" };
    if (!effectiveManualVoiceId && !consentConfirmed) return { error: "必须确认拥有声音授权后才能复刻。" };

    const targetModel = String(input.target_model || "qwen3-tts-vc-2026-01-22").trim();
    let cloneResult = null;
    if (!effectiveManualVoiceId && sample) {
      cloneResult = await cloneSample({
        providerId: provider,
        name: String(input.preferred_name || voiceName),
        samplePath: sample.path,
        mimeType: sample.mimeType,
        targetModel,
        transcript: String(input.sample_transcript || ""),
        consentConfirmed,
      });
    }
    const voiceId = effectiveManualVoiceId || cloneResult?.voice_id || `pending-${randomUUID()}`;
    const status = effectiveManualVoiceId || cloneResult?.success ? "active" : "clone_failed";
    const metadata = {
      target_model: cloneResult?.metadata?.target_model || targetModel,
      reference_id: referenceId,
      fish_audio: provider === "fish_audio" ? { reference_id: referenceId || voiceId } : {},
      sample_mime: sample?.mimeType || "",
      sample_size: sample?.size || 0,
      sample_transcript: String(input.sample_transcript || ""),
      clone_request: cloneResult?.metadata || {},
      clone_error: cloneResult?.success === false ? String(cloneResult.error || cloneResult.detail || "复刻失败") : "",
      demo_audio: String(cloneResult?.metadata?.demo_audio || ""),
      supports_emotion: cloneResult?.metadata?.supports_emotion !== false,
      supports_speed: cloneResult?.metadata?.supports_speed !== false,
      consent_confirmed: consentConfirmed,
    };
    const asset = taskStore.createVoiceAsset({
      provider,
      voice_id: voiceId,
      voice_name: voiceName,
      voice_type: "clone",
      description: String(input.description || "").trim(),
      tags_json: JSON.stringify(parseTags(input.tags)),
      sample_path: sample?.path || "",
      preview_path: "",
      version: Number(input.version || 1),
      parent_voice_id: Number(input.parent_voice_id || 0),
      status,
      metadata_json: JSON.stringify(metadata),
    });
    writeCloneRecord(asset);
    return {
      asset: getAsset(asset.id),
      clone_error: metadata.clone_error,
    };
  }

  async function retryClone(id, input = {}) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    if (!asset.sample_path || !fs.existsSync(asset.sample_path)) return { error: "该声音没有可用的参考音频。" };
    if (input.consent_confirmed !== true) return { error: "必须确认拥有声音授权后才能复刻。" };
    const metadata = safeJson(asset.metadata_json, {});
    const mimeType = metadata.sample_mime || "audio/mpeg";
    const targetModel = String(input.target_model || metadata.target_model || "qwen3-tts-vc-2026-01-22");
    const result = await cloneSample({
      providerId: asset.provider,
      name: asset.voice_name,
      samplePath: asset.sample_path,
      mimeType,
      targetModel,
      transcript: metadata.sample_transcript || "",
      consentConfirmed: true,
    });
    if (!result.success) {
      const updated = taskStore.updateVoiceAsset(asset.id, {
        status: "clone_failed",
        metadata_json: JSON.stringify({
          ...metadata,
          clone_error: String(result.error || result.detail || "复刻失败"),
        }),
      });
      writeCloneRecord(updated);
      return { asset: getAsset(asset.id), error: result.error || result.detail || "复刻失败" };
    }
    const updated = taskStore.updateVoiceAsset(asset.id, {
      voice_id: result.voice_id,
      status: "active",
      metadata_json: JSON.stringify({
        ...metadata,
        target_model: result.metadata?.target_model || targetModel,
        clone_request: result.metadata || {},
        clone_error: "",
      }),
    });
    writeCloneRecord(updated);
    return { asset: getAsset(asset.id) };
  }

  function updateAsset(id, input) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    const changes = {};
    if (input.voice_name !== undefined) changes.voice_name = sanitizeName(input.voice_name);
    if (input.description !== undefined) changes.description = String(input.description || "").trim();
    if (input.tags !== undefined) changes.tags_json = JSON.stringify(parseTags(input.tags));
    if (input.voice_id !== undefined && String(input.voice_id || "").trim()) {
      changes.voice_id = String(input.voice_id).trim();
      changes.status = "active";
    }
    if (input.reference_id !== undefined) {
      const metadata = safeJson(asset.metadata_json, {});
      const referenceId = String(input.reference_id || "").trim();
      changes.metadata_json = JSON.stringify({
        ...metadata,
        reference_id: referenceId,
        fish_audio: { ...(metadata.fish_audio || {}), reference_id: referenceId },
      });
      if (!changes.voice_id && referenceId) {
        changes.voice_id = referenceId;
        changes.status = "active";
      }
    }
    if (input.is_favorite !== undefined) changes.is_favorite = Boolean(input.is_favorite);
    if (input.status !== undefined) changes.status = String(input.status || asset.status);
    const updated = taskStore.updateVoiceAsset(id, changes);
    if (updated.voice_type === "clone") writeCloneRecord(updated);
    return { asset: getAsset(id) };
  }

  function createVersion(id) {
    const source = taskStore.getVoiceAsset(id);
    if (!source) return { error: "声音资产不存在。" };
    const rootId = source.parent_voice_id || source.id;
    const versions = taskStore.listVoices({ provider: source.provider })
      .filter((row) => (row.parent_voice_id || row.id) === rootId);
    const version = Math.max(source.version, ...versions.map((row) => row.version || 1)) + 1;
    const metadata = safeJson(source.metadata_json, {});
    const asset = taskStore.createVoiceAsset({
      provider: source.provider,
      voice_id: source.voice_id,
      voice_name: source.voice_name,
      voice_type: source.voice_type,
      description: source.description,
      tags_json: source.tags_json,
      sample_path: source.sample_path,
      preview_path: source.preview_path,
      version,
      parent_voice_id: rootId,
      status: source.status,
      metadata_json: JSON.stringify({ ...metadata, copied_from_voice_asset_id: source.id }),
    });
    if (asset.voice_type === "clone") writeCloneRecord(asset);
    return { asset: getAsset(asset.id) };
  }

  function setDefault(id) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    const metadata = safeJson(asset.metadata_json, {});
    if (metadata.supports_emotion === false || metadata.supports_speed === false) {
      return { error: "该音色不同时支持情感与语速，不能设为默认。" };
    }
    return { asset: enrichAsset(taskStore.setDefaultVoice(id), taskStore.listVoiceRatings({ voiceAssetId: id })) };
  }

  function getDefault() {
    const asset = taskStore.getDefaultVoice();
    return asset ? getAsset(asset.id) : null;
  }

  function archive(id) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    if (asset.is_default) taskStore.setDefaultVoice(0);
    return { asset: taskStore.updateVoiceAsset(id, { archived: true, is_default: false }) };
  }

  async function deletePermanent(id) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    if (asset.is_default) taskStore.setDefaultVoice(0);

    if (asset.voice_type === "preset") {
      taskStore.updateVoiceAsset(id, {
        archived: true,
        is_default: false,
        status: "deleted",
      });
      return { deleted: 1, id: asset.id, permanent: true };
    }

    const provider = providerFor(asset.provider);
    if (asset.voice_type === "clone" && typeof provider?.deleteVoice === "function") {
      const remote = await provider.deleteVoice({
        voiceId: asset.voice_id,
        voiceType: "voice_cloning",
      });
      if (remote?.success === false) {
        return { error: remote.error || remote.detail || "平台音色删除失败。" };
      }
    }

    for (const filePath of [asset.sample_path, asset.preview_path]) {
      if (!filePath) continue;
      const resolved = path.resolve(filePath);
      if (
        [path.resolve(samplesDir), path.resolve(previewsDir)].some((root) => (
          resolved !== root && resolved.startsWith(`${root}${path.sep}`)
        ))
        && fs.existsSync(resolved)
      ) {
        fs.rmSync(resolved, { force: true });
      }
    }
    for (const file of fs.readdirSync(clonesDir)) {
      if (file.startsWith(`voice-${asset.id}-v`)) {
        fs.rmSync(path.join(clonesDir, file), { force: true });
      }
    }
    return {
      deleted: taskStore.deleteVoiceAsset(asset.id),
      id: asset.id,
      permanent: true,
    };
  }

  function reconcileTests(voiceAssetId = 0) {
    const tests = taskStore.listVoiceTests({ voiceAssetId });
    for (const test of tests) {
      if (!test.tts_job_id || !["waiting", "processing"].includes(test.status)) continue;
      const job = taskStore.getTtsJob(test.tts_job_id);
      if (!job) continue;
      if (job.status === "completed") {
        taskStore.updateVoiceTest(test.id, {
          status: "completed",
          audio_path: job.audio_path,
          error: "",
          completed_at: job.completed_at || new Date().toISOString(),
        });
        const asset = taskStore.getVoiceAsset(test.voice_asset_id);
        if (asset && !asset.preview_path) taskStore.updateVoiceAsset(asset.id, { preview_path: job.audio_path });
      } else if (job.status === "failed") {
        taskStore.updateVoiceTest(test.id, {
          status: "failed",
          error: job.error || "测试语音生成失败。",
          completed_at: job.completed_at || new Date().toISOString(),
        });
      } else if (job.status !== test.status) {
        taskStore.updateVoiceTest(test.id, { status: job.status });
      }
    }
    const ratings = taskStore.listVoiceRatings({ voiceAssetId });
    return taskStore.listVoiceTests({ voiceAssetId }).map((test) => ({
      ...test,
      audio_url: test.status === "completed" && test.tts_job_id ? `/api/tts/audio?id=${test.tts_job_id}` : "",
      rating: ratings.find((rating) => Number(rating.voice_test_id) === Number(test.id)) || null,
    }));
  }

  function createTests(id) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset) return { error: "声音资产不存在。" };
    if (asset.status !== "active" || !asset.voice_id || asset.voice_id.startsWith("pending-")) {
      return { error: "该声音尚未完成复刻，不能生成测试样音。" };
    }
    const metadata = safeJson(asset.metadata_json, {});
    const created = [];
    for (const script of testScripts) {
      const queued = ttsService.enqueue({
        provider: asset.provider,
        voice_id: asset.voice_id,
        voice_name: asset.voice_name,
        voice_asset_id: asset.id,
        model: metadata.target_model || "",
        text: script.text,
        emotion: script.emotion,
        style_prompt: `声音资产测试：${script.name}`,
        speed: 1,
        volume: 50,
        pitch: 1,
        format: "mp3",
      });
      if (queued.error) return { error: queued.error, tests: created };
      created.push(taskStore.createVoiceTest({
        voice_asset_id: asset.id,
        test_type: script.type,
        test_name: script.name,
        script: script.text,
        emotion: script.emotion,
        tts_job_id: queued.job.id,
        status: "waiting",
        metadata_json: JSON.stringify({ prompt: "voice_test_script.md" }),
      }));
    }
    return { tests: reconcileTests(asset.id) };
  }

  function saveRating(input) {
    const asset = taskStore.getVoiceAsset(input.voice_asset_id);
    if (!asset) return { error: "声音资产不存在。" };
    if (input.voice_test_id && !taskStore.getVoiceTest(input.voice_test_id)) return { error: "声音测试不存在。" };
    return { rating: taskStore.saveVoiceRating(input), asset: getAsset(asset.id) };
  }

  function resolveSamplePath(id) {
    const asset = taskStore.getVoiceAsset(id);
    if (!asset?.sample_path) return "";
    const resolved = path.resolve(asset.sample_path);
    const root = path.resolve(samplesDir);
    return resolved.startsWith(`${root}${path.sep}`) && fs.existsSync(resolved) ? resolved : "";
  }

  return {
    listAssets,
    getAsset,
    createAsset,
    retryClone,
    updateAsset,
    createVersion,
    setDefault,
    getDefault,
    archive,
    deletePermanent,
    createTests,
    listTests: reconcileTests,
    saveRating,
    resolveSamplePath,
    testScripts,
  };
}
