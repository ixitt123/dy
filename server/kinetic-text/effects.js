const EFFECT_ROWS = [
  ["center-stair-flip", "中心阶梯翻入", "中心阶梯排版，逐字纵轴翻入", "#f7f2e8", "#f0cf63"],
  ["diagonal-scatter-flip", "斜轴散字翻入", "字符沿斜轴散开并翻转归位", "#f4f1ea", "#f2a7b5"],
  ["vertical-3d-flip", "纵轴立体翻转", "大字绕纵轴立体翻转", "#ffffff", "#84bfff"],
  ["perspective-focus-flip", "透视聚焦翻转", "远近透视聚焦并翻入", "#f3f3f3", "#efd36a"],
  ["outline-footer-pop", "描边底栏弹入", "描边标题配底部说明弹入", "#fff6ef", "#ee9aad"],
  ["scatter-copy-reveal", "散点文案渐显", "小字散点依次渐显", "#f1f1ed", "#ffffff"],
  ["neon-outline-letters", "霓虹描边逐字入场", "粉白霓虹描边逐字出现", "#fff2f6", "#f2a7b5"],
  ["blue-yellow-stairs", "蓝黄分层阶梯弹入", "蓝黄层级文字阶梯弹入", "#85c3ff", "#ffeb66"],
  ["grayscale-depth-focus", "灰阶景深聚焦", "灰阶文字从模糊景深聚焦", "#e8e8e8", "#ffffff"],
  ["handwritten-callout", "手写重点标注入场", "手写重点词与标注符号铺开", "#f8eeee", "#ef9aa8"],
  ["scatter-keyword-close", "散排收束关键词", "散排小字最终收束到关键词", "#f0f0eb", "#f0d95f"],
  ["guide-list-focus", "导读列表聚焦", "列表逐行推进并高亮当前句", "#ffffff", "#ffffff"],
  ["green-white-offset", "绿白错位翻入", "绿白关键词错位翻转入场", "#ffffff", "#54e6a2"],
];

export const KINETIC_TEXT_EFFECTS = EFFECT_ROWS.map(([id, name, description, primary, accent], index) => ({
  id,
  number: index + 1,
  name,
  description,
  primary,
  accent,
  defaultParams: {
    fontFamily: index === 9 ? "KaiTi" : "Microsoft YaHei",
    fontSize: index === 5 || index === 11 ? 58 : 92,
    x: 50,
    y: 50,
    scale: 100,
    rotationAxis: [0, 2, 6, 12].includes(index) ? "y" : index === 1 ? "z" : "none",
    stagger: [0, 2, 6, 12].includes(index) ? 0.07 : 0.04,
    introDuration: index === 8 ? 0.6 : 0.42,
    holdDuration: 0.25,
    primaryColor: primary,
    accentColor: accent,
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
  const effect = effectById(project.effectId);
  return {
    engine: "motion-canvas",
    engineVersion: "3.17.2",
    renderer: "motion-canvas-2d+ffmpeg",
    resolution: [1920, 1080],
    frameRate: 30,
    effect: {
      id: effect.id,
      number: effect.number,
      name: effect.name,
      params: { ...effect.defaultParams, ...(project.effectParams || {}) },
    },
    scenes: (project.segments || []).map((segment) => ({
      id: segment.id,
      start: segment.start,
      end: segment.end,
      text: segment.text,
      keywords: segment.keywords || [],
      lineBreaks: segment.lineBreaks || [],
      overrides: segment.overrides || {},
    })),
  };
}
