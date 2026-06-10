/**
 * BaseAdapter — 所有平台适配器的抽象基类
 * 
 * 设计模式参考 yt-dlp：每个适配器实现 canHandle + extract，
 * 由 AdapterRegistry 统一管理和路由。
 * 
 * 所有适配器输出统一格式的 RawContentAsset。
 */

/**
 * RawContentAsset 统一输出结构
 * @typedef {Object} RawContentAsset
 * @property {string} id - 唯一标识
 * @property {Object} source - 来源信息
 * @property {string} source.platform - 平台名称 (douyin/bilibili/generic/local/webpage)
 * @property {string} source.url - 原始 URL
 * @property {string} source.adapter - 处理该资产的适配器名称
 * @property {string} [source.author] - 作者/创作者
 * @property {string} [source.authorId] - 作者 ID
 * @property {string} [source.publishTime] - 发布时间 (ISO 8601)
 * @property {Object} media - 媒体信息
 * @property {string} media.type - 媒体类型 (video/image/text/mixed)
 * @property {string} [media.localVideoPath] - 本地视频文件路径
 * @property {string} [media.localAudioPath] - 本地音频文件路径
 * @property {string} [media.coverPath] - 封面图路径
 * @property {string[]} [media.imagePaths] - 图片路径列表
 * @property {number} [media.duration] - 时长 (秒)
 * @property {Object} text - 文本信息
 * @property {string} [text.title] - 标题
 * @property {string} [text.description] - 描述
 * @property {string} [text.transcript] - 转写文本
 * @property {string} [text.subtitles] - 字幕
 * @property {string} [text.ocrText] - OCR 文本
 * @property {string} [text.fullText] - 完整文本
 * @property {Object} metrics - 指标数据
 * @property {number} [metrics.likes] - 点赞数
 * @property {number} [metrics.comments] - 评论数
 * @property {number} [metrics.shares] - 分享数
 * @property {number} [metrics.views] - 播放/阅读数
 * @property {number} [metrics.favorites] - 收藏数
 * @property {any} raw - 原始数据 (平台特定)
 */

/**
 * @abstract
 * @class BaseAdapter
 */
export class BaseAdapter {
  /** 适配器名称，子类必须覆盖 */
  static name = "base";

  /**
   * 判断此适配器能否处理给定的输入
   * @abstract
   * @param {*} input - 输入数据 (URL 字符串、文件路径、或包含更多上下文的对象)
   * @returns {boolean|Promise<boolean>}
   */
  canHandle(input) {
    throw new Error("BaseAdapter.canHandle() must be implemented by subclass");
  }

  /**
   * 从输入中提取内容，返回统一的 RawContentAsset
   * @abstract
   * @param {*} input - 输入数据
   * @returns {Promise<RawContentAsset>}
   */
  async extract(input) {
    throw new Error("BaseAdapter.extract() must be implemented by subclass");
  }

  /**
   * 生成唯一 ID
   * @param {string} prefix - 前缀
   * @returns {string}
   */
  generateId(prefix = "asset") {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${ts}${rand}`;
  }
}
