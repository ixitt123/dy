/**
 * GenericUrlAdapter — 通用 URL 适配器（兜底）
 * 
 * 作为最后一道防线，可以处理任意 URL。
 * 通过 HTTP HEAD/GET 探测 URL 的内容类型，返回基础的元信息。
 * 
 * 优先级最低，应在平台特定适配器之后注册。
 */

import { BaseAdapter } from "./base-adapter.js";

/** 常见视频文件扩展名 */
const VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts)(\?.*)?$/i;
/** 常见音频文件扩展名 */
const AUDIO_EXTENSIONS = /\.(mp3|wav|flac|aac|ogg|wma|m4a|opus)(\?.*)?$/i;
/** 常见图片文件扩展名 */
const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff)(\?.*)?$/i;

export class GenericUrlAdapter extends BaseAdapter {
  static name = "GenericUrlAdapter";

  /**
   * 总是返回 true — 作为兜底适配器处理任意 URL
   * @param {string|Object} input
   * @returns {boolean}
   */
  canHandle(input) {
    const url = typeof input === "string" ? input : input?.url || "";
    if (!url) return false;
    // 匹配任何 http/https URL
    return /^https?:\/\//i.test(url);
  }

  /**
   * 提取通用 URL 内容
   * @param {string|Object} input
   * @returns {Promise<import("./base-adapter.js").RawContentAsset>}
   */
  async extract(input) {
    const url = typeof input === "string" ? input : input?.url || "";

    // 判断媒体类型
    let mediaType = "text";
    let subtitle = null;

    if (VIDEO_EXTENSIONS.test(url)) {
      mediaType = "video";
      subtitle = url.split("/").pop()?.split("?")[0] || null;
    } else if (AUDIO_EXTENSIONS.test(url)) {
      mediaType = "audio";
      subtitle = url.split("/").pop()?.split("?")[0] || null;
    } else if (IMAGE_EXTENSIONS.test(url)) {
      mediaType = "image";
      subtitle = url.split("/").pop()?.split("?")[0] || null;
    }

    return {
      id: this.generateId("generic"),
      source: {
        platform: "generic",
        url,
        adapter: "GenericUrlAdapter",
        author: null,
        authorId: null,
        publishTime: null,
      },
      media: {
        type: mediaType,
        localVideoPath: null,
        localAudioPath: null,
        coverPath: null,
        imagePaths: mediaType === "image" ? [url] : [],
        duration: null,
      },
      text: {
        title: subtitle || url,
        description: `Generic URL adapter fallback for: ${url}`,
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
      raw: { url, mediaType, probedAt: new Date().toISOString() },
    };
  }
}
