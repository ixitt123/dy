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
  {
    id: "hook_drum_chant",
    label: "开场钩子鼓点",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文短视频开场钩子音乐，鼓点清楚，口号式副歌，前三秒有记忆点，适合观点开场和课程引流，128-145 BPM",
    description: "适合开头三秒抓注意力，把核心判断做成强节奏口号。",
    outro: "先别划走，重点来了。",
  },
  {
    id: "enrollment_conversion_pop",
    label: "招生转化副歌",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文教育招生转化广告歌，明亮可信，副歌短促有行动号召，适合课程报名和体验课引导，118-136 BPM",
    description: "适合课程、训练营、体验课结尾转化，不要太吵。",
    outro: "现在开始，报名行动。",
  },
  {
    id: "parent_empathy_folk",
    label: "家长共鸣民谣",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文温暖民谣广告歌，家长共鸣，轻柔但有希望感，适合家庭教育、学习规划和成长类内容，90-115 BPM",
    description: "适合家长沟通、成长陪伴、温和劝告类视频。",
    outro: "陪孩子慢慢变好。",
  },
  {
    id: "knowledge_kuaiban_rap",
    label: "知识快板说唱",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文知识快板说唱，节奏明快，句子短，重点词清晰，适合知识点总结、方法口诀和学习技巧，130-155 BPM",
    description: "适合把方法论、步骤和口诀做成更容易记住的节奏。",
    outro: "记住这步，就能少走弯路。",
  },
  {
    id: "contrast_roast_trap",
    label: "反差吐槽Trap",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文反差吐槽 Trap，说唱感强，幽默犀利，适合反常识观点、误区拆解和短视频吐槽，125-150 BPM",
    description: "适合犀利开场、反差观点、错误示范和轻吐槽内容。",
    outro: "别再踩坑，赶紧改。",
  },
  {
    id: "healing_growth_bgm",
    label: "治愈成长BGM",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "治愈成长类中文短视频背景音乐，温柔、清澈、不抢人声，适合陪伴感旁白和学习成长故事，85-105 BPM",
    description: "纯音乐，适合温柔旁白、成长故事和情绪收束。",
    instrumental: true,
  },
  {
    id: "urgent_countdown_bgm",
    label: "紧迫倒计时BGM",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "短视频紧迫倒计时背景音乐，轻微悬念，节奏推进明显但不压过人声，适合限时提醒和重点警示，120-140 BPM",
    description: "纯音乐，适合警示、倒计时、报名截止和紧迫提醒。",
    instrumental: true,
  },
  {
    id: "product_seed_pop",
    label: "轻快种草广告歌",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文轻快种草广告歌，明亮、干净、亲和，副歌短，适合产品推荐、工具介绍和服务卖点，118-138 BPM",
    description: "适合产品种草、工具推荐、卖点总结和软性转化。",
    outro: "好用的方法，今天就试。",
  },
  {
    id: "guofeng_memory_jingle",
    label: "国风记忆小调",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "中文国风短视频小调，轻快、有记忆点，融合古筝或笛子气质，适合文化、语文、城市和知识类内容，100-125 BPM",
    description: "适合文化感、语文知识、城市口播和温和品牌感内容。",
    outro: "一句记住，越学越顺。",
  },
  {
    id: "summary_lofi_bgm",
    label: "复盘总结Lo-fi",
    model: MINIMAX_MUSIC_MODEL,
    prompt: "Lo-fi 学习总结背景音乐，稳定、安静、有轻微律动，适合复盘、清单、结尾总结和知识回顾，80-100 BPM",
    description: "纯音乐，适合结尾总结、清单复盘和知识回顾。",
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
