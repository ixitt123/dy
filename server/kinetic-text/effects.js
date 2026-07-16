const BASE_CONFIG = {
  fontFamily: "Microsoft YaHei",
  fontSize: 88,
  x: 50,
  y: 64,
  maxLines: 2,
  animationSpeed: 1,
  backgroundOpacity: 72,
  outlineEnabled: true,
  shadowEnabled: true,
};

const TEMPLATE_DEFS = [
  {
    id: "rolling-focus",
    name: "滚动聚焦",
    description: "当前句放大提亮，上下文平滑滚动，适合知识口播与课程。",
    scene: "知识口播 / 教育",
    primary: "#F8FAFC",
    accent: "#B7FF5A",
    muted: "#7B8493",
    tokenMode: "line",
    timingMode: "sentence",
    renderMode: "rolling-focus",
    layout: "rolling-stack",
    motion: "focus-scroll",
    supportedTiming: ["sentence"],
    requiresWordTiming: false,
    defaultParams: { fontSize: 78, y: 54, maxLines: 3, animationSpeed: 0.9, lineGapBoost: 0.67, contextLines: 0 },
    source: "CapCut 2024-2026 lyric/focus layouts + deterministic timing primitives",
    license: "Integration code: project-owned; see SOURCE.md",
  },
  {
    id: "rolling-focus-subtitle",
    name: "滚动聚焦大字字幕",
    description: "黑底左侧 5 行语义队列，当前短句以白色粗体和 ▶ 聚焦，按校正时间轴连续上滚。",
    scene: "知识口播 / 英语教学",
    primary: "#FFFFFF",
    accent: "#FFFFFF",
    muted: "#B7B7B7",
    tokenMode: "line",
    timingMode: "sentence",
    renderMode: "rolling-focus-left",
    layout: "left-focus-queue",
    motion: "vertical-queue",
    supportedTiming: ["sentence", "word"],
    requiresWordTiming: false,
    defaultParams: {
      fontSize: 72,
      x: 5,
      y: 50,
      maxLines: 1,
      animationSpeed: 1,
      backgroundOpacity: 0,
      outlineEnabled: false,
      shadowEnabled: false,
      contextRows: 5,
      transitionMs: 220,
      leadMs: 90,
      resetGapMs: 1200,
    },
    source: "User-provided 2026 reference video 7月15日.mp4; structure reimplemented from measured frames",
    license: "Original project integration; reference video supplies visual behavior only and no code/assets are copied",
  },
];

export const KINETIC_TEXT_EFFECTS = TEMPLATE_DEFS.map((template, index) => ({
  ...template,
  number: index + 1,
  previewImage: `/subtitle-templates/${template.id}/preview.png`,
  previewVideo: `/subtitle-templates/${template.id}/preview.mp4`,
  supportedAspectRatios: ["16:9", "9:16", "1:1"],
  defaultParams: {
    ...BASE_CONFIG,
    ...(template.defaultParams || {}),
    primaryColor: template.primary,
    accentColor: template.accent,
  },
}));

export const KINETIC_TEXT_EFFECT_MAP = new Map(KINETIC_TEXT_EFFECTS.map((item) => [item.id, item]));

export function normalizeEffectId(value) {
  const requested = String(value || "").trim();
  return KINETIC_TEXT_EFFECT_MAP.has(requested) ? requested : KINETIC_TEXT_EFFECTS[0].id;
}

export function effectById(value) {
  return KINETIC_TEXT_EFFECT_MAP.get(normalizeEffectId(value));
}

export function defaultEffectParams(effectId) {
  return { ...effectById(effectId).defaultParams };
}

export function motionCanvasProjectDescriptor(project = {}) {
  const template = effectById(project.effectId);
  const aspectRatio = ["16:9", "9:16", "1:1"].includes(project.aspectRatio) ? project.aspectRatio : "9:16";
  const resolution = aspectRatio === "16:9" ? [1920, 1080] : aspectRatio === "1:1" ? [1080, 1080] : [1080, 1920];
  return {
    schema: "subtitle-template-project/v1",
    renderer: "ffmpeg-libass-deterministic",
    visualReferenceCutoff: "2022-01-01",
    resolution,
    frameRate: Number(project.frameRate) === 60 ? 60 : 30,
    aspectRatio,
    template: {
      id: template.id,
      name: template.name,
      renderMode: template.renderMode,
      timingMode: template.timingMode,
      supportedTiming: template.supportedTiming,
      params: { ...template.defaultParams, ...(project.effectParams || {}) },
    },
    segments: (project.segments || []).map((segment) => ({
      id: segment.id,
      startMs: Math.round(Number(segment.start || 0) * 1000),
      endMs: Math.round(Number(segment.end || 0) * 1000),
      text: segment.text,
      words: segment.words || [],
      speaker: segment.speaker || "",
      emphasisWords: segment.keywords || [],
    })),
  };
}
