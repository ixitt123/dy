/**
 * content-normalizer.js — 内容规范化器
 *
 * 将 RawContentAsset 转化为 NormalizedContent：
 *   1. 提取基本信息（标题、分类、标签）
 *   2. 拆解脚本段落并标注类型/情感
 *   3. 识别内容结构（hook → painPoint → conflict → solution → proof → cta）
 *   4. 检测风格特征（语气、情感、节奏、语言风格）
 *   5. 提取关键词和可复用知识
 *
 * 使用 ModelRouter（taskType: 'director'）进行 AI 辅助分析。
 */

import { modelRouter } from "../model-router/model-router.js";

// ============================================================================
// 系统提示词
// ============================================================================

const NORMALIZER_SYSTEM_PROMPT = `你是一个专业的短视频内容分析师。你的任务是将原始脚本文本结构化为 JSON。

## 输出要求
你必须返回一个合法的 JSON 对象，不包含任何额外的解释或 Markdown 标记。

## JSON 结构
{
  "basicInfo": {
    "title": "提取或推断的标题",
    "description": "一段话概述内容",
    "category": "分类（如 知识分享/剧情/搞笑/美食/生活/职场/情感/科技/教育/其他）",
    "tags": ["标签1", "标签2"],
    "targetAudience": "目标受众描述",
    "duration": 预估秒数
  },
  "paragraphs": [
    {
      "index": 0,
      "text": "段落原文本",
      "type": "narration|dialogue|monologue|action|transition",
      "sentiment": "positive|negative|neutral|urgent|calm",
      "keywords": ["关键词"]
    }
  ],
  "structure": {
    "hook": { 开头钩子的段落 },
    "painPoint": { 痛点阐述的段落 },
    "conflict": { 冲突转折的段落 },
    "solution": { 解决方案的段落 },
    "proof": { 证明案例的段落 },
    "cta": { 行动号召的段落 }
  },
  "style": {
    "tone": "严肃|幽默|温情|激昂|犀利|平和",
    "emotion": "感动|愤怒|惊喜|恐惧|快乐|悲伤|好奇",
    "rhythm": "快节奏|慢节奏|张弛有度",
    "languageStyle": "口语化|文艺|专业|网感",
    "persona": "专家|朋友|导师|段子手|普通人"
  },
  "keywords": ["全局关键词1", "全局关键词2"],
  "reusableKnowledge": {
    "techniques": ["使用的技巧"],
    "patterns": ["可复用的结构模式"],
    "formulas": ["可复用的文案公式"],
    "hookTemplates": ["钩子模板"],
    "transitionPhrases": ["过渡金句"]
  }
}

## 分析原则
1. 段落拆分：按自然句号/换行拆分，每段控制在 15-50 字
2. 结构识别：按短视频经典结构（钩子→痛点→冲突→方案→证明→CTA）映射各段落
3. 风格检测：基于用词、句式、语气词判断
4. 关键词提取：提取文中核心概念词，排除废词
5. 可复用知识：提取可迁移到其他文案的模板和技巧`;

// ============================================================================
// 默认/回退值
// ============================================================================

const DEFAULT_BASIC_INFO = {
  title: "未命名内容",
  description: "",
  category: "其他",
  tags: [],
  targetAudience: "通用",
  duration: 60,
};

const DEFAULT_STRUCTURE = {
  hook: null,
  painPoint: null,
  conflict: null,
  solution: null,
  proof: null,
  cta: null,
};

const DEFAULT_STYLE = {
  tone: "平和",
  emotion: "中性",
  rhythm: "张弛有度",
  languageStyle: "口语化",
  persona: "普通人",
};

const DEFAULT_KNOWLEDGE = {
  techniques: [],
  patterns: [],
  formulas: [],
  hookTemplates: [],
  transitionPhrases: [],
};

// ============================================================================
// ContentNormalizer 类
// ============================================================================

export class ContentNormalizer {
  /**
   * @param {object} [options]
   * @param {boolean} [options.useAI=true] - 是否使用 AI 辅助分析
   * @param {object} [options.aiOptions] - 传递给 ModelRouter 的额外选项
   */
  constructor(options = {}) {
    this.useAI = options.useAI !== false;
    this.aiOptions = options.aiOptions || {};
  }

  /**
   * 将原始内容素材规范化为结构化内容
   *
   * @param {import("./content-schema.js").RawContentAsset} rawAsset
   * @returns {Promise<import("./content-schema.js").NormalizedContent>}
   */
  async normalize(rawAsset) {
    const { sourceText, sourceUrl, sourcePlatform, sourceId, metadata } = rawAsset;

    if (!sourceText || typeof sourceText !== "string" || sourceText.trim().length === 0) {
      throw new Error("ContentNormalizer: sourceText 不能为空");
    }

    const finalSourceId = sourceId || `content-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let normalized;

    if (this.useAI) {
      try {
        normalized = await this._normalizeWithAI(sourceText, sourcePlatform, metadata);
      } catch (err) {
        console.warn(`[ContentNormalizer] AI 分析失败，回退到规则分析: ${err.message}`);
        normalized = this._normalizeWithRules(sourceText);
      }
    } else {
      normalized = this._normalizeWithRules(sourceText);
    }

    // 补充原始信息
    normalized.sourceId = finalSourceId;
    normalized.rawText = sourceText;
    normalized.normalizedAt = new Date().toISOString();

    // 确保结构完整性
    normalized.basicInfo = { ...DEFAULT_BASIC_INFO, ...normalized.basicInfo };
    normalized.structure = { ...DEFAULT_STRUCTURE, ...normalized.structure };
    normalized.style = { ...DEFAULT_STYLE, ...normalized.style };
    normalized.reusableKnowledge = { ...DEFAULT_KNOWLEDGE, ...normalized.reusableKnowledge };
    normalized.keywords = normalized.keywords || [];
    normalized.paragraphs = normalized.paragraphs || [];

    return normalized;
  }

  /**
   * 使用 AI 进行规范化分析
   */
  async _normalizeWithAI(sourceText, sourcePlatform, metadata) {
    const userMessage = this._buildUserMessage(sourceText, sourcePlatform, metadata);

    const result = await modelRouter.generate({
      taskType: "director",
      messages: [
        { role: "system", content: NORMALIZER_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      options: {
        temperature: 0.3,
        maxTokens: 4096,
        ...this.aiOptions,
      },
    });

    const content = result.content || "";
    return this._parseAIResponse(content);
  }

  /**
   * 构建发送给 AI 的用户消息
   */
  _buildUserMessage(sourceText, sourcePlatform, metadata) {
    let msg = `## 原始脚本内容\n\n${sourceText}`;

    if (sourcePlatform) {
      msg += `\n\n## 来源平台\n${sourcePlatform}`;
    }

    if (metadata) {
      const metaParts = [];
      if (metadata.author) metaParts.push(`作者: ${metadata.author}`);
      if (metadata.publishDate) metaParts.push(`发布日期: ${metadata.publishDate}`);
      if (metadata.likes !== undefined) metaParts.push(`点赞: ${metadata.likes}`);
      if (metadata.comments !== undefined) metaParts.push(`评论: ${metadata.comments}`);
      if (metadata.shares !== undefined) metaParts.push(`分享: ${metadata.shares}`);
      if (metadata.views !== undefined) metaParts.push(`播放: ${metadata.views}`);

      if (metaParts.length > 0) {
        msg += `\n\n## 表现数据\n${metaParts.join(" | ")}`;
      }
    }

    msg += `\n\n请按 JSON 格式返回分析结果。`;
    return msg;
  }

  /**
   * 解析 AI 返回的 JSON 结果
   */
  _parseAIResponse(content) {
    // 尝试提取 JSON（处理 AI 可能在前后加说明文本的情况）
    let jsonStr = content.trim();

    // 移除可能的 Markdown 代码块标记
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // 尝试找到 JSON 对象的起止位置
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(jsonStr);
    } catch (err) {
      console.warn(`[ContentNormalizer] JSON 解析失败: ${err.message}`);
      throw new Error(`AI 返回了无效的 JSON: ${err.message}`);
    }
  }

  /**
   * 基于规则的回退分析（无 AI 时使用）
   */
  _normalizeWithRules(sourceText) {
    const text = sourceText.trim();
    const sentences = this._splitSentences(text);
    const paragraphs = this._buildParagraphs(sentences);
    const structure = this._inferStructure(paragraphs);
    const style = this._detectStyle(text);
    const keywords = this._extractKeywords(text);
    const basicInfo = this._inferBasicInfo(text);

    return {
      basicInfo,
      paragraphs,
      structure,
      style,
      keywords,
      reusableKnowledge: DEFAULT_KNOWLEDGE,
    };
  }

  /**
   * 按句子拆分文本
   */
  _splitSentences(text) {
    // 按中英文句子分隔符拆分
    const raw = text.split(/(?<=[。！？!?\n])/g);
    return raw
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * 将句子构建为段落
   */
  _buildParagraphs(sentences) {
    return sentences.map((text, index) => ({
      index,
      text,
      type: this._classifyParagraphType(text),
      sentiment: this._classifySentiment(text),
      keywords: [],
    }));
  }

  /**
   * 分类段落类型
   */
  _classifyParagraphType(text) {
    const t = text.trim();
    // 对话特征
    if (/[""「」『』]/.test(t) || /说|问|答|喊|叫道/.test(t)) return "dialogue";
    // 动作描述
    if (/[（(].*?[）)]/.test(t) || /走|跑|站|坐|拿|放|打开|关闭|出现/.test(t)) return "action";
    // 转场
    if (/接下来|然后|接着|过了|转眼|画面一转|换一个/.test(t)) return "transition";
    // 内心独白
    if (/我想|我觉得|其实|说实话|坦白说|心里/.test(t)) return "monologue";
    return "narration";
  }

  /**
   * 分类情感倾向
   */
  _classifySentiment(text) {
    if (/！|急|快|马上|立刻|紧急|千万别|一定要/.test(text)) return "urgent";
    if (/开心|真好|太棒了|喜欢|爱|美|幸福|成功|赚钱/.test(text)) return "positive";
    if (/难过|痛苦|失败|亏|惨|焦虑|害怕|担心|问题|坑/.test(text)) return "negative";
    if (/安|慢慢|静静|温柔|轻|淡/.test(text)) return "calm";
    return "neutral";
  }

  /**
   * 推断内容结构
   */
  _inferStructure(paragraphs) {
    if (paragraphs.length === 0) return DEFAULT_STRUCTURE;

    const structure = { ...DEFAULT_STRUCTURE };

    // 钩子：通常是前 1-2 段
    if (paragraphs.length >= 1) {
      structure.hook = { ...paragraphs[0], type: "narration" };
    }

    // CTA：通常是最后 1-2 段
    if (paragraphs.length >= 2) {
      const lastPara = paragraphs[paragraphs.length - 1];
      const secondLast = paragraphs[paragraphs.length - 2];
      if (/关注|点赞|评论|转发|收藏|关注我/.test(lastPara.text)) {
        structure.cta = lastPara;
      } else if (/关注|点赞|评论|转发|收藏/.test(secondLast?.text || "")) {
        structure.cta = secondLast;
      }
    }

    // 中间段落按关键词推测
    for (const para of paragraphs) {
      const t = para.text;
      if (/痛|问题|困扰|烦恼|难点|坑|陷阱|误区/.test(t) && !structure.painPoint && para !== structure.hook) {
        structure.painPoint = para;
      }
      if (/但是|然而|可是|其实|没想到|反转|真相/.test(t) && !structure.conflict) {
        structure.conflict = para;
      }
      if (/方法|技巧|秘诀|方案|步骤|解决|推荐|教你/.test(t) && !structure.solution) {
        structure.solution = para;
      }
      if (/案例|比如|例如|数据|证明|研究|实验|我.*试了/.test(t) && !structure.proof) {
        structure.proof = para;
      }
    }

    return structure;
  }

  /**
   * 检测风格特征
   */
  _detectStyle(text) {
    const style = { ...DEFAULT_STYLE };

    // 语气检测
    if (/哈哈|笑|搞笑|逗|段子|吐槽/.test(text)) {
      style.tone = "幽默";
      style.persona = "段子手";
    } else if (/感人|泪|温暖|爱|家|亲情/.test(text)) {
      style.tone = "温情";
    } else if (/必须|一定|绝对|永远|不可能/.test(text)) {
      style.tone = "激昂";
    } else if (/是不是|对吧|你.*吗|你说/.test(text)) {
      style.tone = "犀利";
    } else if (/究其|原理|数据|研究表明|据.*报道/.test(text)) {
      style.tone = "严肃";
      style.persona = "专家";
    }

    // 情感检测
    if (/感动|泪目|哭了|温暖/.test(text)) style.emotion = "感动";
    else if (/怒|气死|可恶|离谱|无语/.test(text)) style.emotion = "愤怒";
    else if (/惊喜|居然|没想到|天哪|太.*了/.test(text)) style.emotion = "惊喜";
    else if (/吓|恐怖|害怕|可怕|慎/.test(text)) style.emotion = "恐惧";
    else if (/开心|高兴|快乐|幸福/.test(text)) style.emotion = "快乐";
    else if (/难过|伤心|遗憾|可惜/.test(text)) style.emotion = "悲伤";
    else if (/为什么|怎么|什么.*呢|好奇/.test(text)) style.emotion = "好奇";

    // 节奏检测
    const sentences = this._splitSentences(text);
    const avgLen = sentences.reduce((sum, s) => sum + s.length, 0) / Math.max(sentences.length, 1);
    const shortSentences = sentences.filter((s) => s.length < 15).length;
    const shortRatio = shortSentences / Math.max(sentences.length, 1);

    if (shortRatio > 0.6 && avgLen < 25) {
      style.rhythm = "快节奏";
    } else if (avgLen > 40 && shortRatio < 0.3) {
      style.rhythm = "慢节奏";
    }

    // 语言风格检测
    if (/学术|理论|研究|数据|分析|逻辑|定义|原理/.test(text)) {
      style.languageStyle = "专业";
    } else if (/仿佛|如|似|月|风|花|夜|梦|光|影/.test(text)) {
      style.languageStyle = "文艺";
    } else if (/绝了|yyds|牛逼|整活|拿捏|破防|上头/.test(text)) {
      style.languageStyle = "网感";
    }

    return style;
  }

  /**
   * 提取关键词
   */
  _extractKeywords(text) {
    // 简单规则：提取高频2字以上中文词（排除停用词）
    const stopWords = new Set([
      "这个", "那个", "我们", "他们", "可以", "不是", "一个", "什么",
      "如果", "因为", "所以", "但是", "然后", "就是", "已经", "还是",
      "没有", "自己", "知道", "可能", "应该", "这么", "怎么", "为什么",
      "非常", "真的", "比较", "大家", "觉得", "一下", "一点", "很多",
    ]);

    const wordFreq = {};
    // 简单的中文分词：取连续2-4个中文字符
    const chineseWords = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];

    for (const word of chineseWords) {
      if (stopWords.has(word)) continue;
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }

    return Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word);
  }

  /**
   * 推断基本信息
   */
  _inferBasicInfo(text) {
    const info = { ...DEFAULT_BASIC_INFO };

    // 取前 30 字作为标题候选
    const firstLine = text.split(/\n|。|！|？/)[0].trim();
    info.title = firstLine.length > 40 ? firstLine.slice(0, 40) + "..." : firstLine;
    info.description = text.slice(0, 100).replace(/\n/g, " ");

    // 分类推断
    if (/赚钱|创业|项目|副业|收入|理财|投资/.test(text)) info.category = "职场";
    else if (/恋爱|婚姻|情感|分手|复合|相亲/.test(text)) info.category = "情感";
    else if (/做菜|美食|好吃|餐厅|食材/.test(text)) info.category = "美食";
    else if (/手机|电脑|软件|APP|工具|技巧/.test(text)) info.category = "科技";
    else if (/学习|考试|课程|知识|原理|历史/.test(text)) info.category = "知识分享";
    else if (/搞笑|笑死|哈哈哈|逗比/.test(text)) info.category = "搞笑";
    else if (/生活|日常|家居|收纳|清洁/.test(text)) info.category = "生活";
    else if (/教育|孩子|育儿|亲子/.test(text)) info.category = "教育";

    return info;
  }
}

// ============================================================================
// 单例导出
// ============================================================================

const contentNormalizer = new ContentNormalizer();

export { contentNormalizer };
export default contentNormalizer;
