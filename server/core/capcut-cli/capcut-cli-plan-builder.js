import fs from "node:fs";
import path from "node:path";

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

export function buildCapcutCliPlan({ project = {}, timeline = {}, timelineFiles = {}, templateName = "education_tips" } = {}) {
  const scenes = Array.isArray(timeline.scenes) ? timeline.scenes : [];
  const packagedScenes = Array.isArray(timelineFiles.packagedScenes) ? timelineFiles.packagedScenes : [];
  const media = scenes.map((scene, index) => ({
    placeholder: `scene_${String(index + 1).padStart(2, "0")}_placeholder`,
    sceneIndex: Number(scene.scene_index || index + 1),
    type: scene.video_path ? "video" : "image",
    path: firstValue(packagedScenes[index]?.packaged_image_path, scene.image_path, scene.video_path),
    startTime: Number(scene.start_time || 0),
    endTime: Number(scene.end_time || 0),
    duration: Number(scene.duration || 0),
    motion: scene.motion_type || "none",
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

export function writeCapcutCliPlan(filePath, plan) {
  fs.writeFileSync(filePath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return filePath;
}
