import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const TIMELINE_STATUSES = new Set([
  "pending",
  "binding_assets",
  "building_timeline",
  "rendering",
  "exporting_draft",
  "completed",
  "failed",
]);

const OUTPUT_TYPES = new Set(["jianying", "mp4", "package", "template_mp4", "mix_mp4"]);
const IMAGE_REQUIRED_OUTPUT_TYPES = new Set(["jianying", "mp4", "package"]);
const MP4_OUTPUT_TYPES = new Set(["mp4", "template_mp4", "mix_mp4"]);

const OUTPUT_TYPE_LABELS = {
  jianying: "路线 C：剪映半成品素材包",
  mp4: "路线 B：AI 图文成片 MP4",
  template_mp4: "路线 A：模板快剪 MP4",
  mix_mp4: "路线 D：下载素材混剪 MP4",
  package: "标准素材包",
};

const PLATFORM_PRESETS = {
  douyin: { label: "抖音", ratio: "9:16", resolution: "1080x1920", fps: 30 },
  "video-account": { label: "视频号", ratio: "9:16", resolution: "1080x1920", fps: 30 },
  xiaohongshu: { label: "小红书", ratio: "3:4", resolution: "1080x1440", fps: 30 },
  bilibili: { label: "B站", ratio: "16:9", resolution: "1920x1080", fps: 30 },
  landscape: { label: "横版", ratio: "16:9", resolution: "1920x1080", fps: 30 },
};

function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function stringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function safeFileName(value) {
  return String(value || "timeline")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "timeline";
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  return filePath;
}

function parseResolution(value) {
  const match = String(value || "1080x1920").match(/^(\d+)x(\d+)$/i);
  return {
    width: match ? Number(match[1]) : 1080,
    height: match ? Number(match[2]) : 1920,
  };
}

function srtTimestamp(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  const ms = Math.round((value - Math.floor(value)) * 1000);
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(secs).padStart(2, "0"),
  ].join(":") + `,${String(ms).padStart(3, "0")}`;
}

function timelineToSrt(scenes) {
  return scenes.map((scene, index) => [
    String(index + 1),
    `${srtTimestamp(scene.start_time)} --> ${srtTimestamp(scene.end_time)}`,
    String(scene.subtitle_text || scene.narration_text || "").trim(),
    "",
  ].join("\n")).join("\n");
}

function textDurationWeight(text) {
  const length = String(text || "").replace(/\s+/g, "").length;
  return Math.max(1.8, Math.min(12, length / 5.5));
}

function normalizeSceneDuration(scene) {
  const explicit = Number(scene.duration || 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, explicit);
  return textDurationWeight(scene.voice_text || scene.subtitle || scene.purpose);
}

function runProcess(command, args, { cwd = "", signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: cwd || undefined,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      signal,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with ${code}`));
    });
  });
}

async function probeMediaDuration(ffmpegPath, mediaPath) {
  if (!ffmpegPath || !mediaPath || !fs.existsSync(mediaPath)) return 0;
  try {
    const result = await runProcess(ffmpegPath, ["-hide_banner", "-i", mediaPath]);
    const text = `${result.stderr}\n${result.stdout}`;
    const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  } catch (error) {
    const text = String(error?.message || "");
    const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
  }
}

function ffmpegFilterPath(filePath) {
  return String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function ffmpegDrawText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\n/g, " ");
}

function concatFileList(files) {
  return files.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
}

function publicTimelineProject(row, scenes = [], { includeScenes = true } = {}) {
  if (!row) return null;
  const metadata = safeJson(row.metadata_json, {});
  const blockers = stringArray(safeJson(row.blockers_json, []));
  const tracks = safeJson(row.tracks_json, {});
  return {
    ...row,
    project_id: Number(row.id || row.project_id || 0),
    tracks,
    blockers,
    metadata,
    scenes: includeScenes ? scenes.map((scene) => ({
      ...scene,
      metadata: safeJson(scene.metadata_json, {}),
    })) : undefined,
  };
}

export function createVideoProductService({
  baseDir,
  taskStore,
  imageService,
  ffmpegPath,
  onProgress = () => {},
  onIdle = () => {},
}) {
  const outputRoot = ensureDir(path.join(baseDir, "video-products"));
  const pending = [];
  let working = false;

  function platformPreset(platformId) {
    return PLATFORM_PRESETS[platformId] || PLATFORM_PRESETS.douyin;
  }

  function listImageAssets(limit = 500) {
    return imageService.getAssets({ limit })
      .filter((asset) => asset.original_path && fs.existsSync(asset.original_path));
  }

  function listDownloadedVideoAssets(limit = 200) {
    const seen = new Set();
    return taskStore.allTasks()
      .filter((task) => task.video_path && fs.existsSync(task.video_path))
      .map((task) => {
        const resolved = path.resolve(task.video_path);
        if (seen.has(resolved)) return null;
        seen.add(resolved);
        return {
          id: task.id,
          title: task.title || task.video_id || path.basename(resolved),
          video_id: task.video_id || "",
          path: resolved,
          filename: path.basename(resolved),
          source_url: task.url || "",
          created_at: task.completed_at || task.updated_at || task.created_at || "",
        };
      })
      .filter(Boolean)
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)));
  }

  function sourceProject(row, { includeScenes = true } = {}) {
    if (!row) return null;
    return publicTimelineProject(row, taskStore.listTimelineScenes(row.id), { includeScenes });
  }

  function listSources() {
    const directors = taskStore.listDirectorProjects({ limit: 200 })
      .filter((project) => project.status === "completed")
      .map((project) => {
        const metadata = safeJson(project.metadata_json, {});
        return {
          ...project,
          scene_count: Number(metadata.scene_count || taskStore.listDirectorScenes(project.id).length || 0),
          ratio: metadata.ratio || platformPreset(project.platform).ratio,
        };
      });
    const audioJobs = taskStore.listTtsJobs({ limit: 200 })
      .filter((job) => job.status === "completed" && job.audio_path && fs.existsSync(job.audio_path))
      .map((job) => ({
        ...job,
        label: `${job.voice_name || job.voice_id || job.provider} · #${job.id}`,
      }));
    const imageAssets = listImageAssets(500);
    const downloadedVideos = listDownloadedVideoAssets(200);
    return {
      directors,
      audioJobs,
      imageAssets,
      downloadedVideos,
      timelines: taskStore.listTimelineProjects({ limit: 50 }).map((row) => sourceProject(row, { includeScenes: false })),
      platforms: Object.entries(PLATFORM_PRESETS).map(([id, value]) => ({ id, ...value })),
      outputTypes: Object.entries(OUTPUT_TYPE_LABELS).map(([id, label]) => ({ id, label })),
    };
  }

  function selectImagesForScenes({ directorId, imageSource = "director", selectedImageIds = [], manualBindings = {} } = {}) {
    const all = listImageAssets(500);
    const selectedSet = new Set((Array.isArray(selectedImageIds) ? selectedImageIds : [])
      .map((id) => String(id || ""))
      .filter(Boolean));
    const selected = selectedSet.size ? all.filter((asset) => selectedSet.has(String(asset.id))) : all;
    const directorScoped = selected.filter((asset) => (
      asset.source_type === "director" && String(asset.source_id || "").startsWith(`${directorId}:`)
    ));
    const pool = imageSource === "director" && directorScoped.length ? directorScoped : selected;
    return { pool, all, directorScoped, manualBindings };
  }

  function bindSceneImage(scene, index, bindingContext) {
    const manualAssetId = String(bindingContext.manualBindings?.[scene.scene_index] || bindingContext.manualBindings?.[index + 1] || "");
    if (manualAssetId) {
      const manual = bindingContext.all.find((asset) => String(asset.id) === manualAssetId);
      if (manual) return manual;
    }
    const exact = bindingContext.pool.find((asset) => (
      asset.source_type === "director" && String(asset.source_id || "") === `${bindingContext.directorId}:${scene.scene_index}`
    ));
    if (exact) return exact;
    return bindingContext.pool[index % Math.max(1, bindingContext.pool.length)] || null;
  }

  async function buildTimeline(input = {}) {
    const directorId = Number(input.source_director_project_id || input.director_project_id || 0);
    const audioAssetId = Number(input.audio_asset_id || input.tts_job_id || 0);
    const director = taskStore.getDirectorProject(directorId);
    const audio = taskStore.getTtsJob(audioAssetId);
    const platformId = String(input.platform || director?.platform || "douyin");
    const platform = platformPreset(platformId);
    const blockers = [];

    if (!director || director.status !== "completed") blockers.push("缺少已完成的 AI 导演项目。");
    if (!audio || audio.status !== "completed" || !audio.audio_path || !fs.existsSync(audio.audio_path)) {
      blockers.push("缺少已生成的 TTS 音频。");
    }

    const directorScenes = director ? taskStore.listDirectorScenes(director.id) : [];
    if (!directorScenes.length) blockers.push("导演项目没有可用镜头列表。");

    const imageSource = String(input.image_source || "director");
    const selectedImageIds = Array.isArray(input.image_asset_ids) ? input.image_asset_ids : [];
    const manualBindings = safeJson(input.manual_bindings, input.manual_bindings || {});
    const bindingContext = {
      directorId,
      ...selectImagesForScenes({ directorId, imageSource, selectedImageIds, manualBindings }),
    };
    if (!bindingContext.pool.length) blockers.push("缺少可绑定的 AI 图片素材。");

    const rawDurations = directorScenes.map(normalizeSceneDuration);
    const rawTotal = rawDurations.reduce((sum, value) => sum + value, 0) || directorScenes.length * 3;
    const audioDuration = await probeMediaDuration(ffmpegPath, audio?.audio_path || "");
    const targetDuration = audioDuration > 0 ? audioDuration : rawTotal;
    const scale = rawTotal > 0 ? targetDuration / rawTotal : 1;

    let cursor = 0;
    const scenes = directorScenes.map((scene, index) => {
      const image = bindSceneImage(scene, index, bindingContext);
      const duration = Number(Math.max(1, rawDurations[index] * scale).toFixed(3));
      const start = Number(cursor.toFixed(3));
      cursor += duration;
      const end = Number(cursor.toFixed(3));
      const status = image ? "ready" : "blocked";
      return {
        scene_index: scene.scene_index || index + 1,
        narration_text: scene.voice_text || "",
        subtitle_text: scene.subtitle || scene.voice_text || "",
        start_time: start,
        end_time: end,
        duration,
        image_asset_id: image?.id || "",
        image_path: image?.original_path || "",
        motion_type: scene.motion_prompt || scene.camera || "slow_push_in",
        transition_type: scene.transition || "straight_cut",
        title_text: scene.purpose || `Scene ${index + 1}`,
        visual_prompt: scene.image_prompt || "",
        status,
        metadata_json: JSON.stringify({
          director_scene_id: scene.id,
          purpose: scene.purpose || "",
          emotion: scene.emotion || "",
          asset_type: scene.asset_type || "",
          image_prompt: scene.image_prompt || "",
          image_source: image ? {
            id: image.id,
            source_type: image.source_type,
            source_id: image.source_id,
            prompt: image.prompt,
          } : null,
        }),
      };
    });

    const missingImages = scenes.filter((scene) => !scene.image_path).map((scene) => scene.scene_index);
    if (missingImages.length) blockers.push(`缺少镜头图片：${missingImages.join("、")}。`);

    const tracks = {
      video: scenes.map((scene) => ({
        scene_index: scene.scene_index,
        source: scene.image_path,
        start: scene.start_time,
        duration: scene.duration,
        motion: scene.motion_type,
        transition: scene.transition_type,
      })),
      audio: audio?.audio_path ? [{
        asset_id: audio.id,
        source: audio.audio_path,
        start: 0,
        duration: targetDuration,
      }] : [],
      subtitles: scenes.map((scene) => ({
        scene_index: scene.scene_index,
        text: scene.subtitle_text,
        start: scene.start_time,
        duration: scene.duration,
      })),
    };

    return {
      director,
      audio,
      platform,
      duration: Number((scenes.at(-1)?.end_time || targetDuration || 0).toFixed(3)),
      tracks,
      scenes,
      blockers,
      metadata: {
        image_source: imageSource,
        selected_image_count: selectedImageIds.length,
        available_image_count: bindingContext.pool.length,
        audio_duration: Number(audioDuration.toFixed(3)),
        director_scene_count: directorScenes.length,
      },
    };
  }

  function updateProject(id, changes) {
    const project = taskStore.updateTimelineProject(id, changes);
    onProgress({ domain: "video-product", projectId: Number(id), project: sourceProject(project) });
    return project;
  }

  function writeTimelineFiles(project, timeline) {
    const baseName = `${project.id}_${safeFileName(timeline.director?.title || "video-product")}`;
    const projectDir = ensureDir(project.output_dir || path.join(outputRoot, baseName));
    const mediaDir = ensureDir(path.join(projectDir, "media"));
    const imageDir = ensureDir(path.join(mediaDir, "images"));
    const audioDir = ensureDir(path.join(mediaDir, "audio"));

    const packagedScenes = timeline.scenes.map((scene) => {
      let packagedImage = "";
      if (scene.image_path && fs.existsSync(scene.image_path)) {
        const ext = path.extname(scene.image_path) || ".png";
        packagedImage = path.join(imageDir, `scene_${String(scene.scene_index).padStart(2, "0")}${ext}`);
        fs.copyFileSync(scene.image_path, packagedImage);
      }
      return {
        ...scene,
        packaged_image_path: packagedImage,
      };
    });

    let packagedAudio = "";
    if (timeline.audio?.audio_path && fs.existsSync(timeline.audio.audio_path)) {
      const ext = path.extname(timeline.audio.audio_path) || ".mp3";
      packagedAudio = path.join(audioDir, `voiceover${ext}`);
      fs.copyFileSync(timeline.audio.audio_path, packagedAudio);
    }

    const timelineJson = {
      project_id: project.id,
      name: timeline.director?.title || `Timeline #${project.id}`,
      source_director_project_id: project.source_director_project_id,
      audio_asset_id: project.audio_asset_id,
      platform: project.platform,
      ratio: project.ratio,
      resolution: project.resolution,
      fps: project.fps,
      duration: timeline.duration,
      scenes: packagedScenes,
      tracks: {
        video: packagedScenes.map((scene) => ({
          scene_index: scene.scene_index,
          source: path.relative(projectDir, scene.packaged_image_path || scene.image_path || ""),
          start: scene.start_time,
          duration: scene.duration,
          motion: scene.motion_type,
          transition: scene.transition_type,
        })),
        audio: packagedAudio ? [{
          asset_id: timeline.audio.id,
          source: path.relative(projectDir, packagedAudio),
          start: 0,
          duration: timeline.duration,
        }] : [],
        subtitles: timeline.tracks.subtitles,
      },
      output_type: project.output_type,
      status: project.status,
      created_at: project.created_at,
      updated_at: new Date().toISOString(),
    };

    const timelinePath = writeJson(path.join(projectDir, "timeline.json"), timelineJson);
    const srtPath = path.join(projectDir, "subtitles.srt");
    fs.writeFileSync(srtPath, timelineToSrt(packagedScenes), "utf8");
    const manifestPath = writeJson(path.join(projectDir, "project_manifest.json"), {
      name: timeline.director?.title || `Timeline #${project.id}`,
      kind: "video-product-center",
      generated_at: new Date().toISOString(),
      stable_import_package: true,
      jianying_note: "第一版输出标准素材包、timeline.json 与 SRT 字幕；可人工导入剪映继续加工。",
      files: {
        timeline: path.basename(timelinePath),
        subtitles: path.basename(srtPath),
        audio: packagedAudio ? path.relative(projectDir, packagedAudio) : "",
        images: packagedScenes.map((scene) => path.relative(projectDir, scene.packaged_image_path || "")),
      },
      blockers: timeline.blockers,
      routes: {
        jianying: "导演稿 + 图片 + 音频 → 剪映半成品素材包",
        mp4: "导演稿 + 图片 + 音频 → FFmpeg MP4",
        package: "素材包 + 时间线 + 字幕",
      },
    });

    return {
      projectDir,
      packagedAudio,
      packagedScenes,
      timelineJson,
      timelinePath,
      srtPath,
      manifestPath,
    };
  }

  function writeDraftReference(projectDir, project, timelineFiles) {
    const now = Date.now();
    const draftContent = {
      note: "标准剪映半成品参考包，不伪造剪映私有工程格式。",
      version: 1,
      name: timelineFiles.timelineJson?.name || `Timeline #${project.id}`,
      ratio: project.ratio,
      resolution: project.resolution,
      fps: project.fps,
      timeline_file: "timeline.json",
      subtitles_file: "subtitles.srt",
      tracks: timelineFiles.timelineJson.tracks,
    };
    const draftMeta = {
      id: `timeline_${project.id}_${now}`,
      create_time: now,
      update_time: now,
      name: timelineFiles.timelineJson?.name || `Timeline #${project.id}`,
      status: "reference_package",
    };
    const draftContentPath = writeJson(path.join(projectDir, "draft_content.json"), draftContent);
    writeJson(path.join(projectDir, "draft_meta_info.json"), draftMeta);
    return draftContentPath;
  }

  async function renderMp4(project, timelineFiles) {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) throw new Error("FFmpeg 不可用，无法渲染 MP4。");
    const { width, height } = parseResolution(project.resolution);
    const segmentsDir = ensureDir(path.join(timelineFiles.projectDir, ".segments"));
    const segmentPaths = [];

    for (const scene of timelineFiles.packagedScenes) {
      if (!scene.packaged_image_path || !fs.existsSync(scene.packaged_image_path)) {
        throw new Error(`镜头 ${scene.scene_index} 缺少图片，无法渲染。`);
      }
      const frames = Math.max(1, Math.round(scene.duration * project.fps));
      const segmentPath = path.join(segmentsDir, `scene_${String(scene.scene_index).padStart(2, "0")}.mp4`);
      const zoom = scene.motion_type && scene.motion_type.includes("pull") ? "max(1.0,1.06-on/900)" : "min(zoom+0.0008,1.06)";
      const vf = [
        `scale=${width}:${height}:force_original_aspect_ratio=increase`,
        `crop=${width}:${height}`,
        `zoompan=z='${zoom}':d=${frames}:s=${width}x${height}:fps=${project.fps}`,
        "format=yuv420p",
      ].join(",");
      await runProcess(ffmpegPath, [
        "-y",
        "-loop", "1",
        "-i", scene.packaged_image_path,
        "-t", String(scene.duration),
        "-vf", vf,
        "-an",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        segmentPath,
      ]);
      segmentPaths.push(segmentPath);
    }

    const concatPath = path.join(segmentsDir, "concat.txt");
    fs.writeFileSync(
      concatPath,
      segmentPaths.map((file) => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"),
      "utf8",
    );

    const outputPath = path.join(timelineFiles.projectDir, `${safeFileName(project.metadata?.title || `timeline_${project.id}`)}.mp4`);
    const subtitleFilter = `subtitles='${ffmpegFilterPath(timelineFiles.srtPath)}':force_style='Fontsize=16,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=2,Alignment=2,MarginV=120'`;
    const args = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
    ];
    if (timelineFiles.packagedAudio) args.push("-i", timelineFiles.packagedAudio);
    args.push(
      "-vf", subtitleFilter,
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
    );
    if (timelineFiles.packagedAudio) args.push("-c:a", "aac", "-shortest");
    else args.push("-an");
    args.push(outputPath);
    await runProcess(ffmpegPath, args);
    return outputPath;
  }

  async function processProject(projectId) {
    let project = taskStore.getTimelineProject(projectId);
    if (!project) return;
    const input = safeJson(project.metadata_json, {});

    try {
      updateProject(project.id, {
        status: "binding_assets",
        progress: 15,
        current_step: "正在绑定导演镜头、图片和音频",
        error: "",
      });
      const timeline = await buildTimeline({
        ...input,
        source_director_project_id: project.source_director_project_id,
        audio_asset_id: project.audio_asset_id,
        platform: project.platform,
      });

      updateProject(project.id, {
        status: "building_timeline",
        progress: 35,
        current_step: "正在生成统一 Timeline Project",
        duration: timeline.duration,
        tracks_json: JSON.stringify(timeline.tracks),
        blockers_json: JSON.stringify(timeline.blockers),
        metadata_json: JSON.stringify({
          ...input,
          ...timeline.metadata,
          title: timeline.director?.title || input.title || "",
        }),
      });
      taskStore.replaceTimelineScenes(project.id, timeline.scenes);

      if (timeline.blockers.length) {
        updateProject(project.id, {
          status: "failed",
          progress: 35,
          current_step: "存在阻塞项，未输出文件",
          error: timeline.blockers.join(" "),
          blockers_json: JSON.stringify(timeline.blockers),
          completed_at: new Date().toISOString(),
        });
        return;
      }

      project = taskStore.getTimelineProject(project.id);
      const outputType = OUTPUT_TYPES.has(project.output_type) ? project.output_type : "jianying";
      updateProject(project.id, {
        status: outputType === "mp4" ? "rendering" : "exporting_draft",
        progress: outputType === "mp4" ? 52 : 58,
        current_step: outputType === "mp4" ? "正在准备 MP4 渲染素材" : "正在导出剪映半成品素材包",
      });

      const timelineFiles = writeTimelineFiles(project, timeline);
      const draftPath = writeDraftReference(timelineFiles.projectDir, project, timelineFiles);

      let mp4Path = "";
      if (outputType === "mp4") {
        updateProject(project.id, {
          status: "rendering",
          progress: 72,
          current_step: "正在使用 FFmpeg 合成 MP4",
        });
        mp4Path = await renderMp4({ ...project, metadata: safeJson(project.metadata_json, {}) }, timelineFiles);
      }

      updateProject(project.id, {
        status: "completed",
        progress: 100,
        current_step: outputType === "mp4" ? "MP4 成片已生成" : outputType === "package" ? "素材包已生成" : "剪映半成品素材包已生成",
        output_dir: timelineFiles.projectDir,
        timeline_path: timelineFiles.timelinePath,
        srt_path: timelineFiles.srtPath,
        manifest_path: timelineFiles.manifestPath,
        draft_path: draftPath,
        mp4_path: mp4Path,
        completed_at: new Date().toISOString(),
      });
    } catch (error) {
      updateProject(project.id, {
        status: "failed",
        progress: Math.max(1, project.progress || 0),
        current_step: "视频成片任务失败",
        error: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      });
    } finally {
      onIdle();
    }
  }

  async function drain() {
    if (working) return;
    working = true;
    try {
      while (pending.length) {
        await processProject(pending.shift());
      }
    } finally {
      working = false;
    }
  }

  function enqueue(input = {}) {
    const directorId = Number(input.source_director_project_id || input.director_project_id || 0);
    const audioId = Number(input.audio_asset_id || input.tts_job_id || 0);
    const outputType = OUTPUT_TYPES.has(String(input.output_type || "")) ? String(input.output_type) : "jianying";
    const platformId = String(input.platform || "douyin");
    const platform = platformPreset(platformId);
    const project = taskStore.createTimelineProject({
      source_director_project_id: directorId,
      audio_asset_id: audioId,
      platform: platformId,
      ratio: platform.ratio,
      resolution: platform.resolution,
      fps: platform.fps,
      output_type: outputType,
      status: "pending",
      progress: 0,
      current_step: "等待进入视频成片队列",
      metadata_json: JSON.stringify({
        title: String(input.title || ""),
        image_source: String(input.image_source || "director"),
        image_asset_ids: Array.isArray(input.image_asset_ids) ? input.image_asset_ids : [],
        manual_bindings: input.manual_bindings || {},
      }),
    });
    pending.push(project.id);
    drain().catch(() => {});
    return { project: sourceProject(project) };
  }

  async function preview(input = {}) {
    const timeline = await buildTimeline(input);
    return {
      ok: true,
      platform: timeline.platform,
      duration: timeline.duration,
      scenes: timeline.scenes,
      tracks: timeline.tracks,
      blockers: timeline.blockers,
      metadata: timeline.metadata,
    };
  }

  function getProject(id) {
    return sourceProject(taskStore.getTimelineProject(id));
  }

  function listProjects(limit = 50) {
    return taskStore.listTimelineProjects({ limit }).map((row) => sourceProject(row, { includeScenes: false }));
  }

  function resolveOutputPath(id, type = "dir") {
    const project = taskStore.getTimelineProject(Number(id || 0));
    if (!project) return "";
    const candidates = {
      dir: project.output_dir,
      timeline: project.timeline_path,
      srt: project.srt_path,
      manifest: project.manifest_path,
      draft: project.draft_path,
      mp4: project.mp4_path,
    };
    const target = candidates[type] || project.output_dir;
    if (!target || !fs.existsSync(target)) return "";
    const resolved = path.resolve(target);
    const root = path.resolve(outputRoot);
    return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : "";
  }

  for (const project of taskStore.listTimelineProjects({ limit: 500 }).reverse()) {
    if (!TIMELINE_STATUSES.has(project.status)) continue;
    if (["pending", "binding_assets", "building_timeline", "rendering", "exporting_draft"].includes(project.status)) {
      taskStore.updateTimelineProject(project.id, {
        status: "pending",
        progress: 0,
        current_step: "服务重启后等待重新处理",
        error: "",
      });
      pending.push(project.id);
    }
  }
  if (pending.length) setTimeout(() => drain().catch(() => {}), 0);

  return {
    enqueue,
    preview,
    getProject,
    listProjects,
    listSources,
    resolveOutputPath,
    outputRoot,
  };
}
