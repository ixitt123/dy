export const DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL = "doubao-seedream-5-0-lite-260128";
export const DEFAULT_MODEL_MAPPING = {
  analyze: { provider: "deepseek", model: "deepseek-chat" },
  rewrite: { provider: "deepseek", model: "deepseek-chat" },
  director: { provider: "deepseek", model: "deepseek-chat" },
  storyboard: { provider: "deepseek", model: "deepseek-chat" },
  image_prompt: { provider: "deepseek", model: "deepseek-chat" },
  image: { provider: "volcengine_ark", model: DEFAULT_VOLCENGINE_ARK_IMAGE_MODEL },
  video: { provider: "kling", model: "kling" },
  tts: { provider: "aliyun_bailian", model: "cosyvoice-v2" },
};
export const SETTINGS_TASKS = {
  analyze: {
    label: "内容分析",
    purpose: "解析文案结构、受众、爆款点和改写建议。",
    route: "使用模型中心的 analyze 映射，默认 DeepSeek。",
  },
  rewrite: {
    label: "AI 改写",
    purpose: "生成多版本招生、朋友圈、口播等文案。",
    route: "使用 AI 改写页选择的文本 Provider；模型中心可同步默认 Provider。",
  },
  director: {
    label: "AI 导演",
    purpose: "生成故事弧、分镜、字幕、声音和镜头计划。",
    route: "使用 AI 导演页选择的文本 Provider；模型中心可设置默认项。",
  },
  storyboard: {
    label: "分镜生成",
    purpose: "把导演稿拆成可执行镜头与提示词。",
    route: "使用文本模型 Provider。",
  },
  image_prompt: {
    label: "图片提示词",
    purpose: "把文案改成画面提示词、风格参考和构图要求。",
    route: "使用文本模型 Provider。",
  },
  image: {
    label: "图片生成",
    purpose: "按已经确认的分镜提示词生成并保存图片素材。",
    route: "使用设置中心当前图片生成 Provider，默认火山方舟 Seedream。",
  },
  tts: {
    label: "TTS 语音",
    purpose: "把文案生成配音，可用于短视频口播。",
    route: "使用 TTS Provider，目前主要接入阿里云百炼和自定义 TTS。",
  },
};
