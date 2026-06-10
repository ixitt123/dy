/**
 * BilibiliAdapter — B站平台适配器（桩实现）
 * 
 * 当前为占位适配器，识别 B站链接但暂不实现提取逻辑。
 * 后续可集成 bilibili-API-collect 或自实现解析。
 * 
 * 支持的输入格式：
 *   - B站视频链接 (https://www.bilibili.com/video/BV...)
 *   - B站短链接 (https://b23.tv/...)
 */

import { BaseAdapter } from "./base-adapter.js";

const BILIBILI_URL_PATTERN =
  /(?:bilibili\.com|b23\.tv)/i;

export class BilibiliAdapter extends BaseAdapter {
  static name = "BilibiliAdapter";

  /**
   * 判断是否为 B站链接
   * @param {string|Object} input
   * @returns {boolean}
   */
  canHandle(input) {
    const url = typeof input === "string" ? input : input?.url || input?.shareUrl || input?.shareLink || "";
    if (!url) return false;
    return BILIBILI_URL_PATTERN.test(url);
  }

  /**
   * 提取 B站视频内容（桩实现，返回空资产）
   * @param {string|Object} input
   * @returns {Promise<import("./base-adapter.js").RawContentAsset>}
   */
  async extract(input) {
    const url = typeof input === "string" ? input : input?.url || input?.shareUrl || input?.shareLink || "";

    // TODO: 实现 B站视频解析
    // 集成方案：
    //   1. 使用 bilibili-API-collect 的 API
    //   2. 或通过 headless browser 爬取
    //   3. 或调用第三方解析服务
    console.warn(`[BilibiliAdapter] B站适配器尚未实现，返回桩数据: ${url}`);

    return {
      id: this.generateId("bilibili"),
      source: {
        platform: "bilibili",
        url,
        adapter: "BilibiliAdapter",
        author: null,
        authorId: null,
        publishTime: null,
      },
      media: {
        type: "video",
        localVideoPath: null,
        localAudioPath: null,
        coverPath: null,
        imagePaths: [],
        duration: null,
      },
      text: {
        title: `[B站视频 - 待实现] ${url}`,
        description: "B站适配器桩实现，等待后续开发",
        transcript: null,
        subtitles: null,
        ocrText: null,
        fullText: null,
      },
      metrics: {
        likes: null,
        comments: null,
        shares: null,
        views: null,
        favorites: null,
      },
      raw: { stub: true, url, message: "BilibiliAdapter not implemented yet" },
    };
  }
}
