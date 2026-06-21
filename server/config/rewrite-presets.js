export const DEFAULT_REWRITE_REFERENCE = "痞里带刺、幽默自嘲、生活化观察、少说废话、有冲突、有观点、适合教育招生、让家长有感觉、不要像官方通稿、不要像AI作文。";
export const REWRITE_DIRECTIONS = ["招生引流", "家长焦虑", "单招升学", "暑假班转化", "英语提分", "朋友圈文案", "短视频口播"];
export const REWRITE_STYLES = ["老板风格", "痞里带刺", "接地气", "温和专业", "强冲突", "强转化"];
export const REWRITE_VERSION_DEFS = [
  ["strongHook", "强钩子版"],
  ["parentAnxiety", "家长焦虑版"],
  ["shortVideoScript", "短视频口播版"],
  ["moments", "朋友圈版"],
  ["conversion", "成交转化版"],
];
export const REWRITE_VERSION_DEFAULTS = {
  strongHook: { direction: "招生引流", wordCount: "150字左右" },
  parentAnxiety: { direction: "家长焦虑", wordCount: "150字左右" },
  shortVideoScript: { direction: "短视频口播", wordCount: "220字左右" },
  moments: { direction: "朋友圈文案", wordCount: "220字左右" },
  conversion: { direction: "暑假班转化", wordCount: "150字左右" },
};
