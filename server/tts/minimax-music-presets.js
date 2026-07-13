export const MINIMAX_MUSIC_MODEL = "music-2.6-free";

export const MINIMAX_MUSIC_PRESETS = [
  {
    id: "short_hook_pop",
    label: "短视频洗脑副歌",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文流行短视频副歌，明亮，强记忆点，适合教育口播片头，节拍感清楚，120-140 BPM",
    description: "适合把核心观点做成片头口号或结尾记忆点。",
    outro: "马上行动，今天开始。",
  },
  {
    id: "funny_rap",
    label: "搞怪说唱口播",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文搞怪说唱，轻松幽默，短句强节奏，适合知识类反差视频，120-150 BPM",
    description: "适合吐槽、反差、轻娱乐知识内容。",
    outro: "别光收藏，赶紧开练。",
  },
  {
    id: "nanjing_talk_rap",
    label: "南京口语感说唱",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文口语化说唱，带南京本地生活感，轻松直接，节奏清楚，120-140 BPM",
    description: "不是官方南京方言音色，用音乐风格模拟南京口语气质。",
    outro: "这个办法，今天就能用。",
  },
  {
    id: "yangzhou_soft_jingle",
    label: "扬州口语感小调",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文轻快小调，江南口语气质，温和亲切，广告歌质感，110-135 BPM",
    description: "不是官方扬州方言音色，用音乐风格模拟柔和口语气质。",
    outro: "慢慢来，也要马上开始。",
  },
  {
    id: "cartoon_fun",
    label: "卡通搞怪片头",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "卡通搞怪短视频音乐，俏皮，弹跳感，适合小黑配图，120-150 BPM",
    description: "适合搞怪角色、卡通风、轻松片头。",
    outro: "叮咚，知识点送到。",
  },
  {
    id: "clean_education_bgm",
    label: "清爽教育BGM",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "清爽教育类背景音乐，轻快不抢人声，适合英语学习和知识口播，120-135 BPM",
    description: "生成纯音乐，适合作为视频 BGM 素材。",
    instrumental: true,
  },
];

export function minimaxMusicVoiceId(presetId = "") {
  return `music:${String(presetId || "").trim()}`;
}

export function isMinimaxMusicVoiceId(voiceId = "") {
  return String(voiceId || "").startsWith("music:");
}

export function minimaxMusicPresetFromVoiceId(voiceId = "") {
  const presetId = String(voiceId || "").replace(/^music:/, "");
  return MINIMAX_MUSIC_PRESETS.find((preset) => preset.id === presetId) || null;
}

export function minimaxMusicPresetToVoiceAsset(preset = {}) {
  const metadata = {
    ...preset,
    asset_kind: "minimax_music_preset",
    category: "唱歌/音乐预设",
    useCase: preset.instrumental ? "纯音乐 BGM" : "唱歌、说唱、搞怪音乐",
    provider_kind: "minimax_music",
    model: preset.model || MINIMAX_MUSIC_MODEL,
    target_model: preset.model || MINIMAX_MUSIC_MODEL,
    previewText: preset.instrumental ? "" : (preset.outro || "马上行动，今天开始。"),
  };
  return {
    provider: "minimax",
    voice_id: minimaxMusicVoiceId(preset.id),
    voice_name: preset.label || preset.id,
    voice_type: "music",
    description: preset.description || preset.prompt || "",
    tags_json: JSON.stringify(["MiniMax Music", "唱歌/音乐", preset.instrumental ? "BGM" : "人声音乐"]),
    metadata_json: JSON.stringify(metadata),
    status: "active",
  };
}
