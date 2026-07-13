export const DEFAULT_REWRITE_REFERENCE = "忠于原文主题、事实、人物和事件；只优化表达、结构、节奏、钩子和口播感；不要凭空换行业、换对象、换场景，不要强行改成教育招生或家长话题；不要像AI作文。";
export const REWRITE_DIRECTIONS = ["短视频口播", "招生引流", "朋友圈文案", "视频成片口播稿", "知识解释", "成交转化"];
export const REWRITE_STYLES = ["小黑漫画解释类", "口播爆款", "知识解释", "朋友圈图文", "强钩子转化", "温和专业", "老板风格", "痞里带刺", "接地气", "强冲突", "强转化"];
export const REWRITE_VERSION_DEFS = [
  ["strongHook", "强钩子版"],
  ["parentAnxiety", "家长焦虑版"],
  ["shortVideoScript", "短视频口播版"],
  ["moments", "朋友圈版"],
  ["conversion", "成交转化版"],
];
export const REWRITE_VERSION_DEFAULTS = {
  strongHook: { direction: "短视频口播", wordCount: "160字左右" },
  parentAnxiety: { direction: "知识解释", wordCount: "160字左右" },
  shortVideoScript: { direction: "短视频口播", wordCount: "160字左右" },
  moments: { direction: "朋友圈文案", wordCount: "160字左右" },
  conversion: { direction: "成交转化", wordCount: "160字左右" },
};
