export default {
  id: "rolling-focus-subtitle",
  name: "滚动聚焦大字字幕",
  description: "纯黑横屏、左侧 5 行上下文队列，当前短句放大并显示 ▶，按校正音频时间连续上滚。",
  previewImage: "/subtitle-templates/rolling-focus-subtitle/preview.png",
  previewVideo: "/subtitle-templates/rolling-focus-subtitle/preview.mp4",
  supportedTiming: ["sentence", "word"] as Array<"sentence" | "word">,
  supportedAspectRatios: ["16:9", "9:16", "1:1"] as Array<"16:9" | "9:16" | "1:1">,
};
