import fs from "node:fs";
import path from "node:path";

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function capcutTransitionSlug(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "straight_cut" || raw === "cut" || raw === "none") return "dissolve";
  const aliases = {
    fade: "dissolve",
    fade_in: "dissolve",
    fade_out: "dissolve",
    match_cut: "dissolve",
    whip_pan: "dissolve",
    push_slide: "dissolve",
    slide: "dissolve",
    crossfade: "dissolve",
  };
  return aliases[raw] || "dissolve";
}

export function buildCapcutCliPlan({ project = {}, timeline = {}, timelineFiles = {}, templateName = "education_tips" } = {}) {
  const scenes = Array.isArray(timeline.scenes) ? timeline.scenes : [];
  const packagedScenes = Array.isArray(timelineFiles.packagedScenes) ? timelineFiles.packagedScenes : [];
  const media = scenes.map((scene, index) => ({
    placeholder: `scene_${String(index + 1).padStart(2, "0")}_placeholder`,
    sceneIndex: Number(scene.scene_index || index + 1),
    type: firstValue(packagedScenes[index]?.packaged_video_path, scene.video_path) ? "video" : "image",
    path: firstValue(packagedScenes[index]?.packaged_video_path, packagedScenes[index]?.packaged_image_path, scene.video_path, scene.image_path),
    startTime: Number(scene.start_time || 0),
    endTime: Number(scene.end_time || 0),
    duration: Number(scene.duration || 0),
    motion: scene.motion_type || "none",
    transition: scene.transition_type || "dissolve",
  }));

  return {
    version: 1,
    projectId: Number(project.id || 0),
    title: firstValue(timeline.publish_title, timeline.name, project.metadata?.title, `Video Project ${project.id || ""}`),
    canvas: {
      ratio: project.ratio || timeline.ratio || "9:16",
      resolution: project.resolution || timeline.resolution || "1080x1920",
      fps: Number(project.fps || timeline.fps || 30),
    },
    template: {
      name: templateName,
      directory: `templates/jianying/${templateName}/draft_template`,
    },
    audio: {
      voiceover: firstValue(timelineFiles.packagedAudio, timeline.audio_path),
      bgm: firstValue(timelineFiles.packagedBgm, timeline.bgm_path),
      voiceoverPlaceholder: "voiceover_placeholder",
      bgmPlaceholder: "bgm_placeholder",
    },
    subtitles: {
      srt: timelineFiles.srtPath || "",
      ass: timelineFiles.assPath || "",
      timeline: scenes.map((scene) => ({
        startTime: Number(scene.start_time || 0),
        endTime: Number(scene.end_time || 0),
        text: scene.subtitle_text || scene.narration_text || "",
      })),
    },
    text: {
      hook: firstValue(scenes[0]?.title_text, scenes[0]?.subtitle_text, timeline.publish_title),
      cta: firstValue(timeline.cta_text, scenes.at(-1)?.title_text, "关注我，获取更多实用内容"),
      cover: firstValue(timeline.cover_text, timeline.publish_title, timeline.name),
    },
    media,
    output: {
      directory: timelineFiles.projectDir || "",
      preview: timelineFiles.projectDir ? path.join(timelineFiles.projectDir, "preview.mp4") : "",
    },
  };
}

export function buildCapcutCompileSpec({ project = {}, timeline = {}, timelineFiles = {}, templateName = "education_tips" } = {}) {
  const scenes = Array.isArray(timeline.scenes) ? timeline.scenes : [];
  const packagedScenes = Array.isArray(timelineFiles.packagedScenes) ? timelineFiles.packagedScenes : [];
  const duration = Number(timeline.duration || timelineFiles.timelineJson?.duration || 0);
  const title = firstValue(timeline.publish_title, timeline.name, timelineFiles.timelineJson?.name, project.metadata?.title, `Video Project ${project.id || ""}`);
  const [width, height] = String(project.resolution || timeline.resolution || "1080x1920")
    .split("x")
    .map((value) => Number(value) || 0);
  const videoItems = scenes
    .map((scene, index) => {
      const packaged = packagedScenes[index] || {};
      const source = firstValue(packaged.packaged_video_path, packaged.packaged_image_path, scene.video_path, scene.image_path);
      if (!source) return null;
      const isPhoto = !String(source).toLowerCase().match(/\.(mp4|mov|m4v|webm|avi|mkv)$/);
      return {
        ref: `scene_${String(index + 1).padStart(2, "0")}`,
        path: source,
        type: isPhoto ? "photo" : undefined,
        start: Number(scene.start_time || 0),
        duration: Math.max(0.1, Number(scene.duration || 0)),
        width: width || 1080,
        height: height || 1920,
        scale: 1.04,
      };
    })
    .filter(Boolean);
  const textItems = scenes
    .map((scene, index) => {
      const text = firstValue(scene.subtitle_text, scene.narration_text, scene.title_text);
      if (!text) return null;
      return {
        ref: `caption_${String(index + 1).padStart(2, "0")}`,
        text,
        start: Number(scene.start_time || 0),
        duration: Math.max(0.1, Number(scene.duration || 0)),
        fontSize: 34,
        color: "#FFFFFF",
        strokeColor: "#000000",
        strokeWidth: 5,
        backgroundColor: "rgba(0,0,0,0.28)",
        x: 0,
        y: 0.72,
      };
    })
    .filter(Boolean);
  const audioItems = [];
  const voiceoverDuration = Math.max(
    0.1,
    Math.min(
      duration || Number(timeline.metadata?.audio_duration || 0) || 0,
      Math.max(0.1, Number(timeline.metadata?.audio_duration || duration || 0) - 0.05),
    ),
  );
  if (timelineFiles.packagedAudio) {
    audioItems.push({
      ref: "voiceover",
      path: timelineFiles.packagedAudio,
      start: 0,
      duration: voiceoverDuration,
      volume: 1,
    });
  }
  if (timelineFiles.packagedBgm) {
    audioItems.push({
      ref: "bgm",
      path: timelineFiles.packagedBgm,
      start: 0,
      duration,
      volume: 0.16,
    });
  }
  const tracks = [
    videoItems.length ? { type: "video", name: "director-images", items: videoItems } : null,
    audioItems.length ? { type: "audio", name: "audio", items: audioItems } : null,
    textItems.length ? { type: "text", name: "subtitles", items: textItems } : null,
  ].filter(Boolean);
  const operations = videoItems.flatMap((item, index) => {
    const ops = [
      { op: "keyframe", target: item.ref, property: "uniform_scale", time: item.start, value: 1 },
      { op: "keyframe", target: item.ref, property: "uniform_scale", time: item.start + item.duration, value: 1.06 },
    ];
    if (index < videoItems.length - 1) {
      const scene = scenes[index] || {};
      const transitionSlug = capcutTransitionSlug(scene.transition_type);
      if (transitionSlug) ops.push({ op: "transition", target: item.ref, slug: transitionSlug, duration: 0.32 });
    }
    return ops;
  });
  if (duration > 0) {
    operations.push({ op: "filter", slug: "vivid", start: 0, duration, intensity: 0.18, trackName: "color-grade" });
  }
  return {
    name: title,
    width: width || 1080,
    height: height || 1920,
    fps: Number(project.fps || timeline.fps || 30),
    ratio: project.ratio || timeline.ratio || "9:16",
    metadata: {
      projectId: Number(project.id || 0),
      templateName,
      generatedBy: "dy-video-product-service",
    },
    tracks,
    operations,
  };
}

export function writeCapcutCliPlan(filePath, plan) {
  fs.writeFileSync(filePath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return filePath;
}
