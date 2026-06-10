/**
 * content-analyzer.js — 内容分析器
 *
 * 对 NormalizedContent 进行深度分析，输出 ContentAnalysis：
 *   1. 综合评分（爆款潜力、互动吸引力、原创性、结构完整度）
 *   2. 爆款原因分析
 *   3. 受众画像
 *   4. 改写建议
 *   5. 导演建议
 *
 * 使用 ModelRouter（taskType: 'director'）进行 AI 分析。
 * 使用 node:sqlite (DatabaseSync) 持久化分析结果。
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { modelRouter } from "../model-router/model-router.js";

// ============================================================================
// 系统提示词
// ============================================================================

const ANALYZER_SYSTEM_PROMPT = `你是一个专业的短视频内容策略分析师。你需要对规范化后的脚本内容进行深度分析。

## 输出要求
你必须返回一个合法的 JSON 对象，不包含任何额外的解释或 Markdown 标记。

## JSON 结构
{
  "score": {
    "total": 综合评分 0-100,
    "viralPotential": 爆款潜力 0-100,
    "engagement": 互动吸引力 0-100,
    "originality": 原创性 0-100,
    "structure": 结构完整度 0-100
  },
  "viralReason": "为什么这个内容可能/不可能成为爆款的一段分析（80-150字）",
  "audience": {
    "primary": "主要受众群体描述",
    "interests": ["兴趣标签"],
    "demographics": {
      "ageRange": "年龄段",
      "gender": "男性为主|女性为主|中性",
      "regions": ["地域倾向"]
    },
    "painPoints": ["受众痛点匹配"]
  },
  "rewriteAdvice": {
    "suggestions": ["改写建议（每条 20-40 字）"],
    "improvements": ["具体改进点"],
    "alternativeHook": "备选钩子文案",
    "betterCTA": "更好的行动号召",
    "keywordOptimizations": ["关键词优化建议"]
  },
  "directorAdvice": {
    "visualTips": ["视觉呈现建议"],
    "pacingTips": ["节奏控制建议"],
    "musicTips": ["配乐建议"],
    "editingTips": ["剪辑建议"],
    "transitionTips": ["转场建议"]
  },
  "summary": "一句话总结该内容的核心价值（不超过50字）"
}

## 分析原则
1. 爆款潜力：评估话题热度、情绪共鸣度、转发动机、完播率预估
2. 互动吸引力：评估评论欲、点赞欲、收藏价值
3. 原创性：评估内容的独特性、视角新颖度
4. 结构完整度：评估钩子/痛点/冲突/方案/证明/CTA 各环节的完整性和质量
5. 受众画像：基于内容主题、语言风格、价值观推断目标人群
6. 建议必须具体可执行，避免泛泛而谈`;

// ============================================================================
// 默认/回退值
// ============================================================================

const DEFAULT_ANALYSIS = {
  score: {
    total: 50,
    viralPotential: 50,
    engagement: 50,
    originality: 50,
    structure: 50,
  },
  viralReason: "未进行 AI 深度分析，无法确定爆款原因。",
  audience: {
    primary: "通用受众",
    interests: [],
    demographics: {
      ageRange: "18-45",
      gender: "中性",
      regions: [],
    },
    painPoints: [],
  },
  rewriteAdvice: {
    suggestions: ["建议使用 AI 分析以获得更精准的建议"],
    improvements: [],
    alternativeHook: "",
    betterCTA: "",
    keywordOptimizations: [],
  },
  directorAdvice: {
    visualTips: [],
    pacingTips: [],
    musicTips: [],
    editingTips: [],
    transitionTips: [],
  },
  summary: "",
};

// ============================================================================
// ContentAnalysisStore — SQLite 存储
// ============================================================================

class ContentAnalysisStore {
  /**
   * @param {string} baseDir - 项目根目录
   */
  constructor(baseDir) {
    this.dbPath = path.join(baseDir, ".data", "content_analysis.sqlite");
    this.tableName = "content_analysis";
    this.db = null;
  }

  /** 初始化数据库和表 */
  init() {
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA busy_timeout=5000");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT NOT NULL DEFAULT '',
        normalized_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'waiting'
          CHECK(status IN ('waiting','processing','done','failed')),
        data_json TEXT NOT NULL DEFAULT '{}',
        raw_normalized_json TEXT NOT NULL DEFAULT '{}',
        error TEXT DEFAULT '',
        model_used TEXT DEFAULT '',
        tokens_used INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_source_id
        ON ${this.tableName}(source_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_normalized_id
        ON ${this.tableName}(normalized_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_status
        ON ${this.tableName}(status)
    `);
  }

  /**
   * 插入一条分析记录
   * @param {object} params
   * @param {string} params.sourceId
   * @param {string} params.normalizedId
   * @param {string} [params.status='processing']
   * @returns {object} 插入的记录
   */
  insert({ sourceId = "", normalizedId = "", status = "processing" } = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (source_id, normalized_id, status, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))
    `);
    const result = stmt.run(sourceId, normalizedId, status);
    return this.getById(result.lastInsertRowid);
  }

  /**
   * 更新分析结果
   * @param {number} id
   * @param {object} analysis - ContentAnalysis 对象
   * @param {object} normalized - NormalizedContent 对象（用于存档）
   * @param {object} [meta] - 额外元数据
   */
  updateResult(id, analysis, normalized = null, meta = {}) {
    const sets = [
      "status = ?",
      "data_json = ?",
      "updated_at = datetime('now','localtime')",
    ];
    const values = ["done", JSON.stringify(analysis)];

    if (normalized) {
      sets.push("raw_normalized_json = ?");
      values.push(JSON.stringify(normalized));
    }
    if (meta.modelUsed) {
      sets.push("model_used = ?");
      values.push(meta.modelUsed);
    }
    if (meta.tokensUsed !== undefined) {
      sets.push("tokens_used = ?");
      values.push(meta.tokensUsed);
    }

    values.push(id);
    this.db.prepare(`UPDATE ${this.tableName} SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  /**
   * 标记分析失败
   * @param {number} id
   * @param {string} error
   */
  markFailed(id, error) {
    this.db.prepare(`
      UPDATE ${this.tableName}
      SET status = 'failed', error = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(String(error || ""), id);
    return this.getById(id);
  }

  /**
   * 根据 ID 获取记录
   * @param {number} id
   * @returns {object|null}
   */
  getById(id) {
    const row = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).get(id);
    return row ? this._enrich(row) : null;
  }

  /**
   * 根据 source_id 获取记录
   * @param {string} sourceId
   * @returns {object|null}
   */
  getBySourceId(sourceId) {
    const row = this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE source_id = ? ORDER BY id DESC LIMIT 1`
    ).get(String(sourceId));
    return row ? this._enrich(row) : null;
  }

  /**
   * 根据 normalized_id 获取记录
   * @param {string} normalizedId
   * @returns {object|null}
   */
  getByNormalizedId(normalizedId) {
    const row = this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE normalized_id = ? ORDER BY id DESC LIMIT 1`
    ).get(String(normalizedId));
    return row ? this._enrich(row) : null;
  }

  /**
   * 列出所有分析记录
   * @param {object} [opts]
   * @param {number} [opts.limit=50]
   * @param {number} [opts.offset=0]
   * @param {string} [opts.status] - 按状态过滤
   * @returns {object[]}
   */
  listAll({ limit = 50, offset = 0, status } = {}) {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params = [];

    if (status) {
      sql += ` WHERE status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => this._enrich(r));
  }

  /**
   * 获取统计信息
   * @returns {object}
   */
  getStats() {
    const total = this.db.prepare(`SELECT COUNT(*) as c FROM ${this.tableName}`).get().c;
    const byStatus = {};
    for (const s of ["waiting", "processing", "done", "failed"]) {
      byStatus[s] = this.db.prepare(
        `SELECT COUNT(*) as c FROM ${this.tableName} WHERE status = ?`
      ).get(s).c;
    }

    // 平均分
    const avgScore = this.db.prepare(`
      SELECT AVG(json_extract(data_json, '$.score.total')) as avg_score
      FROM ${this.tableName}
      WHERE status = 'done' AND data_json != '{}'
    `).get();

    return {
      total,
      byStatus,
      avgScore: avgScore?.avg_score ? Math.round(avgScore.avg_score * 100) / 100 : null,
    };
  }

  /**
   * 删除一条记录
   * @param {number} id
   */
  delete(id) {
    this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
  }

  /** 关闭数据库连接 */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /** 解析 data_json 并返回 enriched 对象 */
  _enrich(row) {
    let data = {};
    let rawNormalized = null;
    try {
      data = JSON.parse(row.data_json || "{}");
    } catch { /* keep empty */ }
    try {
      rawNormalized = JSON.parse(row.raw_normalized_json || "{}");
    } catch { /* keep null */ }
    return {
      ...row,
      data,
      rawNormalized,
      analysis: data, // 别名，方便使用
    };
  }
}

// ============================================================================
// ContentAnalyzer 类
// ============================================================================

export class ContentAnalyzer {
  /**
   * @param {string} baseDir - 项目根目录（用于 SQLite 存储路径）
   * @param {object} [options]
   * @param {boolean} [options.useAI=true] - 是否使用 AI 深度分析
   * @param {boolean} [options.autoSave=true] - 是否自动保存到 SQLite
   * @param {object} [options.aiOptions] - 传递给 ModelRouter 的额外选项
   */
  constructor(baseDir, options = {}) {
    this.baseDir = baseDir;
    this.useAI = options.useAI !== false;
    this.autoSave = options.autoSave !== false;
    this.aiOptions = options.aiOptions || {};

    // 初始化 SQLite 存储
    this.store = new ContentAnalysisStore(baseDir);
    this.store.init();
  }

  /**
   * 对规范化内容进行深度分析
   *
   * @param {import("./content-schema.js").NormalizedContent} normalizedContent
   * @returns {Promise<import("./content-schema.js").ContentAnalysis>}
   */
  async analyze(normalizedContent) {
    if (!normalizedContent) {
      throw new Error("ContentAnalyzer: normalizedContent 不能为空");
    }

    const sourceId = normalizedContent.sourceId || `unknown-${Date.now()}`;
    const normalizedId = `n-${sourceId}`;

    // 1. 创建存储记录（processing 状态）
    let record = null;
    if (this.autoSave) {
      record = this.store.insert({
        sourceId,
        normalizedId,
        status: "processing",
      });
    }

    let analysis;

    try {
      if (this.useAI) {
        analysis = await this._analyzeWithAI(normalizedContent);
      } else {
        analysis = this._analyzeWithRules(normalizedContent);
      }

      // 补充分析元数据
      analysis.sourceId = sourceId;
      analysis.normalizedId = normalizedId;
      analysis.analyzedAt = new Date().toISOString();

      // 2. 保存到 SQLite
      if (record && this.autoSave) {
        this.store.updateResult(record.id, analysis, normalizedContent, {
          modelUsed: analysis.modelUsed || "",
          tokensUsed: analysis.tokensUsed || 0,
        });
      }

      return analysis;
    } catch (err) {
      // 标记失败
      if (record && this.autoSave) {
        this.store.markFailed(record.id, err.message);
      }

      // 返回回退分析
      console.warn(`[ContentAnalyzer] AI 分析失败，使用回退分析: ${err.message}`);
      const fallback = this._analyzeWithRules(normalizedContent);
      fallback.sourceId = sourceId;
      fallback.normalizedId = normalizedId;
      fallback.analyzedAt = new Date().toISOString();
      fallback.summary = `[分析失败: ${err.message}] ${fallback.summary || ""}`;
      return fallback;
    }
  }

  /**
   * 使用 AI 进行深度分析
   */
  async _analyzeWithAI(normalizedContent) {
    const userMessage = this._buildAnalysisPrompt(normalizedContent);

    const result = await modelRouter.generate({
      taskType: "director",
      messages: [
        { role: "system", content: ANALYZER_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      options: {
        temperature: 0.4,
        maxTokens: 4096,
        ...this.aiOptions,
      },
    });

    const content = result.content || "";
    const analysis = this._parseAIResponse(content);

    // 附加模型信息
    analysis.modelUsed = result.model || "unknown";
    analysis.tokensUsed = (result.usage?.totalTokens) || 0;

    return analysis;
  }

  /**
   * 构建 AI 分析提示
   */
  _buildAnalysisPrompt(normalizedContent) {
    const { basicInfo, paragraphs, structure, style, keywords } = normalizedContent;

    let prompt = "## 规范化内容\n\n";

    // 基本信息
    if (basicInfo) {
      prompt += `### 基本信息
- 标题: ${basicInfo.title || ""}
- 描述: ${basicInfo.description || ""}
- 分类: ${basicInfo.category || ""}
- 标签: ${(basicInfo.tags || []).join(", ")}
- 目标受众: ${basicInfo.targetAudience || ""}
- 预估时长: ${basicInfo.duration || 0}秒
`;
    }

    // 风格特征
    if (style) {
      prompt += `### 风格特征
- 语气: ${style.tone || ""}
- 核心情感: ${style.emotion || ""}
- 节奏: ${style.rhythm || ""}
- 语言风格: ${style.languageStyle || ""}
- 人设: ${style.persona || ""}
`;
    }

    // 关键词
    if (keywords && keywords.length > 0) {
      prompt += `### 关键词\n${keywords.join(", ")}\n`;
    }

    // 脚本段落
    if (paragraphs && paragraphs.length > 0) {
      prompt += `### 脚本段落（共${paragraphs.length}段）\n`;
      for (const p of paragraphs) {
        prompt += `- [${p.type || ""}|${p.sentiment || ""}] ${p.text}\n`;
      }
    }

    // 结构
    if (structure) {
      prompt += `### 内容结构\n`;
      const structKeys = ["hook", "painPoint", "conflict", "solution", "proof", "cta"];
      const structLabels = ["钩子", "痛点", "冲突", "方案", "证明", "CTA"];
      for (let i = 0; i < structKeys.length; i++) {
        const part = structure[structKeys[i]];
        prompt += `- ${structLabels[i]}: ${part?.text || "(缺失)"}\n`;
      }
    }

    prompt += `\n请基于以上信息进行深度分析，返回 JSON 格式结果。`;
    return prompt;
  }

  /**
   * 解析 AI 返回的 JSON 结果
   */
  _parseAIResponse(content) {
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
      console.warn(`[ContentAnalyzer] JSON 解析失败: ${err.message}`);
      throw new Error(`AI 返回了无效的 JSON: ${err.message}`);
    }
  }

  /**
   * 基于规则的回退分析（无 AI 时使用）
   */
  _analyzeWithRules(normalizedContent) {
    const { basicInfo, structure, style, paragraphs, keywords } = normalizedContent;
    const analysis = JSON.parse(JSON.stringify(DEFAULT_ANALYSIS)); // 深拷贝

    // --- 结构完整度评分 ---
    const structKeys = ["hook", "painPoint", "conflict", "solution", "proof", "cta"];
    const filledCount = structKeys.filter((k) => structure?.[k]?.text).length;
    analysis.score.structure = Math.round((filledCount / 6) * 100);

    // --- 原创性评分 ---
    const text = paragraphs?.map((p) => p.text).join(" ") || "";
    const hasUniqueWords = /独创|独家|首创|原创|第一个|首次/.test(text);
    const hasNewAngle = /新的|不同|换个|颠覆|反常识/.test(text);
    analysis.score.originality = hasUniqueWords || hasNewAngle ? 70 : 40;

    // --- 互动吸引力 ---
    let engagementScore = 30;
    if (/你|吗|呢|吧/.test(text)) engagementScore += 15; // 有对话感
    if (/关注|点赞|评论|转发/.test(text)) engagementScore += 15; // 有 CTA
    if (/问题|痛点|烦恼|坑/.test(text)) engagementScore += 10; // 引发共鸣
    if (/争议|难道|凭什么|为什么/.test(text)) engagementScore += 10; // 引发讨论
    analysis.score.engagement = Math.min(100, engagementScore);

    // --- 爆款潜力 ---
    let viralScore = 20;
    if (filledCount >= 4) viralScore += 20; // 结构完整
    if (analysis.score.engagement > 50) viralScore += 15;
    if (keywords?.length > 5) viralScore += 10;
    if (style?.emotion && style.emotion !== "中性" && style.emotion !== "") viralScore += 15;
    if (/热点|热门|最近|最新|新出|刚/.test(text)) viralScore += 10;
    analysis.score.viralPotential = Math.min(100, viralScore);

    // --- 综合评分 ---
    const scores = [
      analysis.score.viralPotential,
      analysis.score.engagement,
      analysis.score.originality,
      analysis.score.structure,
    ];
    analysis.score.total = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // --- 爆款原因 ---
    if (analysis.score.total >= 70) {
      analysis.viralReason = "该内容结构完整，情绪表达清晰，具备较强的话题性和共鸣点，受众匹配度高。";
    } else if (analysis.score.total >= 50) {
      analysis.viralReason = "该内容有一定基础结构，但缺乏差异化亮点或强共鸣点，可通过优化钩子和CTA提升传播力。";
    } else {
      analysis.viralReason = "该内容结构不完整或缺乏核心吸引力，建议重新设计钩子并补充价值输出。";
    }

    // --- 受众 ---
    if (basicInfo?.targetAudience) {
      analysis.audience.primary = basicInfo.targetAudience;
    }
    if (keywords?.length > 0) {
      analysis.audience.interests = keywords.slice(0, 5);
    }

    // --- 改写建议 ---
    analysis.rewriteAdvice.suggestions = [];
    if (!structure?.hook?.text) {
      analysis.rewriteAdvice.suggestions.push("缺少有效钩子，建议在开头3秒内设置悬念或痛点");
    }
    if (!structure?.cta?.text) {
      analysis.rewriteAdvice.suggestions.push("缺少行动号召，建议在结尾添加明确的关注/点赞引导");
    }
    if (filledCount < 4) {
      analysis.rewriteAdvice.suggestions.push("内容结构不完整，建议补充缺失的环节");
    }
    if (analysis.rewriteAdvice.suggestions.length === 0) {
      analysis.rewriteAdvice.suggestions.push("内容结构较为完整，可尝试优化细节表达");
    }

    // --- 导演建议 ---
    if (style?.rhythm === "快节奏") {
      analysis.directorAdvice.pacingTips.push("当前内容为快节奏风格，建议配合快速剪辑（1-2秒切换）");
    } else if (style?.rhythm === "慢节奏") {
      analysis.directorAdvice.pacingTips.push("当前内容为慢节奏风格，建议使用舒缓转场和留白");
    }

    if (style?.emotion === "感动" || style?.emotion === "悲伤") {
      analysis.directorAdvice.musicTips.push("建议使用温情/感伤类背景音乐，音量不宜过高");
    } else if (style?.emotion === "惊喜" || style?.emotion === "快乐") {
      analysis.directorAdvice.musicTips.push("建议使用轻快/活泼类背景音乐，增强积极氛围");
    } else if (style?.emotion === "愤怒" || style?.tone === "激昂") {
      analysis.directorAdvice.musicTips.push("建议使用有力量感的背景音乐，配合重音剪辑");
    }

    analysis.directorAdvice.visualTips.push("建议使用高清素材，色彩风格与内容基调保持一致");

    // --- 一句话总结 ---
    const category = basicInfo?.category || "通用";
    const title = basicInfo?.title || "未命名";
    analysis.summary = `[${category}] ${title}，综合评分 ${analysis.score.total}/100`;

    return analysis;
  }

  // ============================================================================
  // SQLite 存储查询方法
  // ============================================================================

  /**
   * 根据 sourceId 获取分析结果
   * @param {string} sourceId
   * @returns {import("./content-schema.js").ContentAnalysis|null}
   */
  getBySourceId(sourceId) {
    const record = this.store.getBySourceId(sourceId);
    if (!record || record.status !== "done") return null;
    return record.analysis;
  }

  /**
   * 根据 normalizedId 获取分析结果
   * @param {string} normalizedId
   * @returns {import("./content-schema.js").ContentAnalysis|null}
   */
  getByNormalizedId(normalizedId) {
    const record = this.store.getByNormalizedId(normalizedId);
    if (!record || record.status !== "done") return null;
    return record.analysis;
  }

  /**
   * 列出所有分析记录
   * @param {object} [opts]
   * @returns {object[]}
   */
  listAnalyses(opts) {
    return this.store.listAll(opts);
  }

  /**
   * 获取分析统计
   * @returns {object}
   */
  getStats() {
    return this.store.getStats();
  }

  /**
   * 删除分析记录
   * @param {number} id
   */
  deleteAnalysis(id) {
    this.store.delete(id);
  }

  /**
   * 关闭数据库连接
   */
  close() {
    this.store.close();
  }
}

// ============================================================================
// 工厂函数导出
// ============================================================================

/**
 * 创建 ContentAnalyzer 实例
 * @param {string} baseDir - 项目根目录
 * @param {object} [options] - 配置选项
 * @returns {ContentAnalyzer}
 */
function createContentAnalyzer(baseDir, options = {}) {
  return new ContentAnalyzer(baseDir, options);
}

export { ContentAnalysisStore, createContentAnalyzer };
export default ContentAnalyzer;
