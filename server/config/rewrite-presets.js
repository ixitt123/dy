export const DEFAULT_REWRITE_REFERENCE = "忠于原文主题、事实、人物和事件；只优化表达、结构、节奏、钩子和口播感；不要凭空换行业、换对象、换场景，不要强行改成教育招生或家长话题；不要像AI作文。";
export const REWRITE_DIRECTIONS = ["保留原意优化", "短视频口播", "短视频开场钩子", "完整口播脚本", "知识解释", "痛点共鸣", "评论区引导", "朋友圈文案", "短视频口播稿", "成交转化", "招生引流"];
export const REWRITE_STYLES = ["保留原意强化表达", "小黑漫画解释类", "爆款口播重构", "知识拆解型", "痛点共鸣型", "转化引导型", "朋友圈叙事型", "短视频旁白型", "老板风格", "痞里带刺", "接地气", "强冲突", "强转化"];
export const REWRITE_VERSION_DEFS = [
  ["strongHook", "强钩子版"],
  ["parentAnxiety", "共鸣解释版"],
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
