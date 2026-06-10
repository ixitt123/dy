/**
 * content-schema.js — 内容模块的类型定义（JSDoc 接口）
 *
 * 本文件定义了内容处理流水线中的所有核心数据结构：
 *   RawContentAsset -> ContentNormalizer -> NormalizedContent
 *   NormalizedContent -> ContentAnalyzer -> ContentAnalysis
 *
 * 所有接口以 JSDoc @typedef 形式定义，供 IDE 智能提示使用。
 */

// ============================================================================
// RawContentAsset — 原始内容素材
// ============================================================================

/**
 * @typedef {object} RawContentAsset
 * @property {string} sourceText - 原始脚本文本（必填）
 * @property {string} [sourceUrl] - 来源链接
 * @property {string} [sourcePlatform] - 来源平台（如 douyin/kuaishou/xiaohongshu）
 * @property {string} [sourceId] - 来源唯一标识
 * @property {object} [metadata] - 附加元数据
 * @property {string} [metadata.author] - 作者
 * @property {string} [metadata.publishDate] - 发布日期
 * @property {number} [metadata.likes] - 点赞数
 * @property {number} [metadata.comments] - 评论数
 * @property {number} [metadata.shares] - 分享数
 * @property {number} [metadata.views] - 播放量
 */

// ============================================================================
// NormalizedContent — 规范化后的内容
// ============================================================================

/**
 * @typedef {object} BasicInfo
 * @property {string} title - 标题/主题
 * @property {string} description - 简要描述
 * @property {string} category - 分类（如 知识分享/剧情/搞笑/美食）
 * @property {string[]} tags - 标签列表
 * @property {string} [targetAudience] - 目标受众
 * @property {number} [duration] - 预估时长（秒）
 */

/**
 * @typedef {object} ScriptParagraph
 * @property {number} index - 段落序号（从 0 开始）
 * @property {string} text - 段落文本
 * @property {'narration'|'dialogue'|'monologue'|'action'|'transition'} type - 段落类型
 * @property {'positive'|'negative'|'neutral'|'urgent'|'calm'} sentiment - 情感倾向
 * @property {string[]} [keywords] - 段落关键词
 * @property {number} [startTime] - 起始时间（秒）
 * @property {number} [endTime] - 结束时间（秒）
 */

/**
 * @typedef {object} ContentStructure
 * @property {ScriptParagraph} hook - 开头钩子（前 3 秒抓注意力）
 * @property {ScriptParagraph} painPoint - 痛点阐述（用户困境/需求）
 * @property {ScriptParagraph} conflict - 冲突/转折（戏剧张力）
 * @property {ScriptParagraph} solution - 解决方案（价值输出）
 * @property {ScriptParagraph} proof - 证明/案例（建立信任）
 * @property {ScriptParagraph} cta - 行动号召（关注/点赞/评论引导）
 */

/**
 * @typedef {object} ContentStyle
 * @property {string} tone - 语气（严肃/幽默/温情/激昂/犀利/平和）
 * @property {string} emotion - 核心情感（感动/愤怒/惊喜/恐惧/快乐/悲伤）
 * @property {string} rhythm - 节奏（快节奏/慢节奏/张弛有度）
 * @property {string} languageStyle - 语言风格（口语化/文艺/专业/网感）
 * @property {string} [persona] - 人设特征（专家/朋友/导师/段子手）
 */

/**
 * @typedef {object} ReusableKnowledge
 * @property {string[]} techniques - 使用的技巧手法（如"反转""悬念""对比""排比"）
 * @property {string[]} patterns - 可复用的结构模式
 * @property {string[]} formulas - 可复用的文案公式
 * @property {string[]} [hookTemplates] - 钩子模板
 * @property {string[]} [transitionPhrases] - 过渡金句
 */

/**
 * @typedef {object} NormalizedContent
 * @property {string} sourceId - 来源 ID
 * @property {BasicInfo} basicInfo - 基本信息
 * @property {ScriptParagraph[]} paragraphs - 脚本段落列表
 * @property {ContentStructure} structure - 内容结构
 * @property {ContentStyle} style - 风格特征
 * @property {string[]} keywords - 全局关键词
 * @property {ReusableKnowledge} reusableKnowledge - 可复用知识
 * @property {string} [rawText] - 原始文本（保留引用）
 * @property {string} normalizedAt - 规范化时间 (ISO 8601)
 */

// ============================================================================
// ContentAnalysis — 内容分析结果
// ============================================================================

/**
 * @typedef {object} ContentScore
 * @property {number} total - 综合评分 (0-100)
 * @property {number} viralPotential - 爆款潜力 (0-100)
 * @property {number} engagement - 互动吸引力 (0-100)
 * @property {number} originality - 原创性 (0-100)
 * @property {number} structure - 结构完整度 (0-100)
 */

/**
 * @typedef {object} AudienceAnalysis
 * @property {string} primary - 主要受众群体
 * @property {string[]} interests - 兴趣标签
 * @property {object} demographics - 人口统计
 * @property {string} demographics.ageRange - 年龄段
 * @property {string} demographics.gender - 性别倾向
 * @property {string[]} [demographics.regions] - 地域倾向
 * @property {string[]} [painPoints] - 受众痛点匹配
 */

/**
 * @typedef {object} RewriteAdvice
 * @property {string[]} suggestions - 改写建议列表
 * @property {string[]} improvements - 具体改进点
 * @property {string} [alternativeHook] - 备选钩子
 * @property {string} [betterCTA] - 更好的行动号召
 * @property {string[]} [keywordOptimizations] - 关键词优化建议
 */

/**
 * @typedef {object} DirectorAdvice
 * @property {string[]} visualTips - 视觉呈现建议
 * @property {string[]} pacingTips - 节奏控制建议
 * @property {string[]} musicTips - 配乐建议
 * @property {string[]} [editingTips] - 剪辑建议
 * @property {string[]} [transitionTips] - 转场建议
 */

/**
 * @typedef {object} ContentAnalysis
 * @property {string} sourceId - 关联的来源 ID
 * @property {string} normalizedId - 关联的规范化内容 ID
 * @property {ContentScore} score - 评分
 * @property {string} viralReason - 爆款原因分析
 * @property {AudienceAnalysis} audience - 受众分析
 * @property {RewriteAdvice} rewriteAdvice - 改写建议
 * @property {DirectorAdvice} directorAdvice - 导演建议
 * @property {string} [summary] - 一句话总结
 * @property {string} analyzedAt - 分析时间 (ISO 8601)
 * @property {string} [modelUsed] - 使用的 AI 模型
 * @property {number} [tokensUsed] - 消耗的 token 数
 */

// ============================================================================
// ContentAnalysisRecord — SQLite 存储记录（内部使用）
// ============================================================================

/**
 * @typedef {object} ContentAnalysisRecord
 * @property {number} id - 自增主键
 * @property {string} source_id - 来源 ID
 * @property {string} normalized_id - 规范化内容 ID
 * @property {string} status - 状态 (waiting/processing/done/failed)
 * @property {string} data_json - 分析结果 JSON
 * @property {string} error - 错误信息
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 */

export {};
