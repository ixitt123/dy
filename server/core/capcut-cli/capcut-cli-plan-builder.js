import fs from "node:fs";
import path from "node:path";
import { getJianyingTemplatePreset } from "../../config/jianying-template-presets.js";

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

function capcutTransitionSlug(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "straight_cut" || raw === "cut" || raw === "none") return "dissolve";
  const supported = new Set([
    "dissolve",
    "slide",
    "pull-in",
    "white-flash",
    "flash",
    "twinkle-zoom",
    "rgb-glitch",
    "camera-flash",
    "blur",
    "fold",
  ]);
  const aliases = {
    fade: "dissolve",
    fade_in: "dissolve",
    fade_out: "dissolve",
    zoom: "twinkle-zoom",
    match_cut: "dissolve",
    whip_pan: "slide",
    push_slide: "slide",
    crossfade: "dissolve",
  };
  const slug = aliases[raw] || raw;
  return supported.has(slug) ? slug : "dissolve";
}

function pickTemplateTransition(preset, index, fallback = "") {
  const transitions = Array.isArray(preset.transitions) ? preset.transitions : [];
  return capcutTransitionSlug(fallback || transitions[index % Math.max(1, transitions.length)] || "dissolve");
}

function styleTextItem(base = {}, overrides = {}) {
  return {
    fontSize: Number(overrides.fontSize || base.fontSize || 34),
    color: overrides.color || base.color || "#FFFFFF",
    strokeColor: overrides.strokeColor || base.strokeColor || "#000000",
    strokeWidth: Number(overrides.strokeWidth ?? base.strokeWidth ?? 5),
    backgroundColor: overrides.backgroundColor || base.backgroundColor || "rgba(0,0,0,0.28)",
    x: Number(overrides.x ?? base.x ?? 0),
    y: Number(overrides.y ?? base.y ?? 0.72),
  };
}

function captionVisualLength(value = "") {
  return String(value || "").replace(/\s+/g, "").length;
}

function splitCaptionSegment(segment = "", maxCharsPerLine = 15) {
  const text = String(segment || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  if (captionVisualLength(text) <= maxCharsPerLine) return [text];
  if (/[A-Za-z]/.test(text)) {
    const tokens = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?|[0-9]+(?:\.[0-9]+)?|[\u4e00-\u9fa5]+|[^\s]/g) || [];
    const chunks = [];
    let current = "";
    for (const token of tokens) {
      const joinsAsWord = current && /^[A-Za-z0-9]/.test(token) && /[A-Za-z0-9]$/.test(current);
      const candidate = current ? `${current}${joinsAsWord ? " " : ""}${token}` : token;
      if (captionVisualLength(candidate) <= maxCharsPerLine) {
        current = candidate;
        continue;
      }
      if (current) chunks.push(current.trim());
      current = token;
    }
    if (current) chunks.push(current.trim());
    return chunks.filter(Boolean);
  }
  const chars = Array.from(text.replace(/\s+/g, ""));
  const chunks = [];
  for (let index = 0; index < chars.length; index += maxCharsPerLine) {
    chunks.push(chars.slice(index, index + maxCharsPerLine).join("").trim());
  }
  return chunks.filter(Boolean);
}

function wrapCaptionText(value = "", maxCharsPerLine = 15, maxLines = 2) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const parts = text.split(/(?<=[\u3002\uff01\uff1f!?\uff1b;\uff0c\u3001,])/u).map((item) => item.trim()).filter(Boolean);
  const lines = [];
  let current = "";
  const pushCurrent = () => {
    if (current) lines.push(current);
    current = "";
  };
  for (const part of (parts.length ? parts : [text])) {
    const candidate = current ? `${current}${part}` : part;
    if (captionVisualLength(candidate) <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    pushCurrent();
    for (const chunk of splitCaptionSegment(part, maxCharsPerLine)) {
      lines.push(chunk);
      if (lines.length >= maxLines) break;
    }
    if (lines.length >= maxLines) break;
  }
  pushCurrent();
  return lines.slice(0, maxLines).filter(Boolean).join("\n");
}

function captionKeywordCandidates(scene = {}, text = "") {
  const explicit = Array.isArray(scene.caption_keywords) ? scene.caption_keywords : [];
  const title = String(scene.title_text || scene.purpose || "").replace(/^Scene\s+\d+/i, "").trim();
  const matches = String(text || "").match(/英语|单词|开口|成绩|技术|方法|家长|孩子|招生|报名|提分|改变|行动|不要|必须|核心|关键|解决|流量|成交|客户|AI|系统|效率/g) || [];
  return [...explicit, title, ...matches]
    .map((item) => String(item || "").replace(/[，。！？!?,、\s]/g, "").trim())
    .filter((item) => item.length >= 2 && item.length <= 8)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 2);
}

function buildTextRangeOperation(target, text, keywords, style = {}) {
  const ranges = [];
  const color = style.highlightColor || style.keywordColor || "#FFD15A";
  const fontSize = Number(style.highlightFontSize || style.fontSize || 38) + 4;
  for (const keyword of keywords) {
    const start = text.indexOf(keyword);
    if (start < 0) continue;
    const end = start + keyword.length;
    if (ranges.some((range) => start < range.end && end > range.start)) continue;
    ranges.push({
      start,
      end,
      font_color: color,
      font_size: fontSize,
      bold: true,
    });
  }
  if (!ranges.length) return null;
  return { op: "text-ranges", target, ranges };
}

function sceneMetadata(scene = {}) {
  try {
    return typeof scene.metadata_json === "string" ? JSON.parse(scene.metadata_json) : (scene.metadata_json || {});
  } catch {
    return {};
  }
}

export function buildCapcutCliPlan({ project = {}, timeline = {}, timelineFiles = {}, templateName = "education_tips" } = {}) {
  const templatePreset = getJianyingTemplatePreset(templateName);
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
      preset: templatePreset.label,
      captionStyle: templatePreset.caption,
      transitions: templatePreset.transitions,
      targetBpm: templatePreset.bgmBpm,
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
  const templatePreset = getJianyingTemplatePreset(templateName);
  const scenes = Array.isArray(timeline.scenes) ? timeline.scenes : [];
  const packagedScenes = Array.isArray(timelineFiles.packagedScenes) ? timelineFiles.packagedScenes : [];
  const duration = Number(timeline.duration || timelineFiles.timelineJson?.duration || 0);
  const title = firstValue(timeline.publish_title, timeline.name, timelineFiles.timelineJson?.name, project.metadata?.title, `Video Project ${project.id || ""}`);
  const [width, height] = String(project.resolution || timeline.resolution || "1080x1920")
    .split("x")
    .map((value) => Number(value) || 0);
  const rawVideoItems = scenes
    .map((scene, index) => {
      const packaged = packagedScenes[index] || {};
      const source = firstValue(packaged.packaged_video_path, packaged.packaged_image_path, scene.video_path, scene.image_path);
      if (!source) return null;
      const isPhoto = !String(source).toLowerCase().match(/\.(mp4|mov|m4v|webm|avi|mkv)$/);
      const metadata = sceneMetadata(scene);
      return {
        ref: `scene_${String(index + 1).padStart(2, "0")}`,
        path: source,
        visualKey: firstValue(metadata.source_scene_index, scene.source_scene_index, scene.director_scene_index, scene.scene_index, index + 1),
        type: isPhoto ? "photo" : undefined,
        start: Number(scene.start_time || 0),
        duration: Math.max(0.1, Number(scene.duration || 0)),
        width: width || 1080,
        height: height || 1920,
        scale: Number(templatePreset.motion?.fromScale || 1.04),
        sourceScene: scene,
      };
    })
    .filter(Boolean);
  const videoItems = rawVideoItems.reduce((items, item) => {
    const previous = items.at(-1);
    if (previous && String(previous.visualKey) === String(item.visualKey)) {
      const previousEnd = previous.start + previous.duration;
      const itemEnd = item.start + item.duration;
      previous.duration = Number((Math.max(previousEnd, itemEnd) - previous.start).toFixed(3));
      return items;
    }
    items.push({ ...item, ref: `scene_${String(items.length + 1).padStart(2, "0")}` });
    return items;
  }, []);
  const captionStyle = templatePreset.caption || {};
  const titleStyle = templatePreset.titleCard || {};
  const ctaStyle = templatePreset.ctaCard || {};
  const titleText = firstValue(timeline.publish_title, timeline.name, title);
  const ctaText = firstValue(timeline.cta_text, scenes.at(-1)?.title_text, "关注账号，获取更多实用内容");
  const captionItems = scenes
    .map((scene, index) => {
      const rawText = firstValue(scene.subtitle_text, scene.narration_text, scene.title_text);
      const text = wrapCaptionText(rawText);
      if (!text) return null;
      return {
        ref: `caption_${String(index + 1).padStart(2, "0")}`,
        text,
        rawText,
        scene,
        start: Number(scene.start_time || 0),
        duration: Math.max(0.1, Number(scene.duration || 0)),
        ...styleTextItem(captionStyle, { y: captionStyle.y ?? -0.62 }),
      };
    })
    .filter(Boolean);
  const textItems = [
    titleText ? {
      ref: "title_card",
      text: titleText,
      start: 0,
      duration: Math.max(1.2, Math.min(2.2, duration || 1.6)),
      ...styleTextItem(captionStyle, titleStyle),
    } : null,
    ...captionItems.map(({ rawText, scene, ...item }) => item),
    ctaText && duration > 2 ? {
      ref: "cta_card",
      text: ctaText,
      start: Math.max(0, duration - 2.2),
      duration: Math.min(2.2, duration),
      ...styleTextItem(captionStyle, ctaStyle),
    } : null,
  ].filter(Boolean);
  const audioItems = [];
  const audioTrack = Array.isArray(timeline.tracks?.audio) ? timeline.tracks.audio[0] : null;
  const voiceStart = Math.max(0, Number(audioTrack?.start || 0));
  const voiceoverDuration = Math.max(
    0.1,
    Math.min(
      Math.max(0.1, duration - voiceStart),
      Math.max(0.1, Number(audioTrack?.duration || timeline.metadata?.audio_duration || duration || 0) - 0.05),
    ),
  );
  if (timelineFiles.packagedAudio) {
    audioItems.push({
      ref: "voiceover",
      path: timelineFiles.packagedAudio,
      start: voiceStart,
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
    videoItems.length ? { type: "video", name: "director-images", items: videoItems.map(({ visualKey, sourceScene, ...item }) => item) } : null,
    audioItems.length ? { type: "audio", name: "audio", items: audioItems } : null,
    textItems.length ? { type: "text", name: "subtitles", items: textItems } : null,
  ].filter(Boolean);
  const operations = videoItems.flatMap((item, index) => {
    const ops = [
      { op: "keyframe", target: item.ref, property: "uniform_scale", time: item.start, value: 1 },
      { op: "keyframe", target: item.ref, property: "uniform_scale", time: item.start + item.duration, value: Number(templatePreset.motion?.toScale || 1.06) },
    ];
    if (index < videoItems.length - 1) {
      const scene = item.sourceScene || scenes[index] || {};
      const transitionSlug = pickTemplateTransition(templatePreset, index, scene.transition_type);
      if (transitionSlug) ops.push({ op: "transition", target: item.ref, slug: transitionSlug, duration: 0.32 });
    }
    return ops;
  });
  const textRangeOperations = captionItems
    .map((item) => buildTextRangeOperation(item.ref, item.text, captionKeywordCandidates(item.scene, item.text), captionStyle))
    .filter(Boolean);
  operations.push(...textRangeOperations);
  if (timelineFiles.packagedAudio) {
    operations.push({ op: "audio-fade", target: "voiceover", fadeIn: 0.08, fadeOut: 0.2 });
  }
  if (timelineFiles.packagedBgm) {
    operations.push({ op: "audio-fade", target: "bgm", fadeIn: 0.65, fadeOut: 1 });
  }
  if (duration > 0) {
    operations.push({
      op: "filter",
      slug: templatePreset.filter?.slug || "vivid",
      start: 0,
      duration,
      intensity: Number(templatePreset.filter?.intensity || 0.18),
      trackName: "color-grade",
    });
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
      templatePreset: templatePreset.label,
      targetBpm: templatePreset.bgmBpm || 132,
      voiceStart,
      voiceoverDuration,
      captionPlacement: "bottom_safe_area",
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
