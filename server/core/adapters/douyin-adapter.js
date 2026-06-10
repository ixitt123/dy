/**
 * DouyinAdapter — 抖音平台适配器
 * 
 * 封装 @yc-w-cn/douyin-mcp-server 的核心解析与下载逻辑。
 * 由于该包作为 MCP CLI 工具设计，未导出可编程 API，
 * 本适配器使用 Node.js 内置 fetch 实现相同的 HTTP 请求逻辑。
 * 
 * 支持的输入格式：
 *   - 抖音分享链接 (https://v.douyin.com/...)
 *   - 抖音视频链接 (https://www.douyin.com/video/...)
 *   - 包含分享链接的文本
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as stream from "node:stream";
import { BaseAdapter } from "./base-adapter.js";

// 与 @yc-w-cn/douyin-mcp-server 保持一致的请求头
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1",
};

/** 抖音相关域名匹配 */
const DOUYIN_URL_PATTERN =
  /(?:douyin\.com|iesdouyin\.com|v\.douyin\.com)/i;

export class DouyinAdapter extends BaseAdapter {
  static name = "DouyinAdapter";

  /** @type {string} 临时文件目录，默认 .data/ */
  #workDir;

  constructor(workDir = ".data") {
    super();
    this.#workDir = workDir;
    fs.mkdirSync(this.#workDir, { recursive: true });
  }

  /**
   * 判断是否为抖音链接
   * @param {string|Object} input
   * @returns {boolean}
   */
  canHandle(input) {
    const url = typeof input === "string" ? input : input?.url || input?.shareUrl || input?.shareLink || "";
    if (!url) return false;
    return DOUYIN_URL_PATTERN.test(url);
  }

  /**
   * 提取抖音视频内容
   * @param {string|Object} input
   * @returns {Promise<import("./base-adapter.js").RawContentAsset>}
   */
  async extract(input) {
    const shareText = typeof input === "string" ? input : input?.url || input?.shareUrl || input?.shareLink || "";
    const downloadVideo = input?.download !== false; // 默认下载

    // 解析分享链接获取视频信息
    const videoInfo = await this.#parseShareUrl(shareText);

    let localVideoPath = null;
    if (downloadVideo) {
      try {
        localVideoPath = await this.#downloadVideo(videoInfo);
      } catch (err) {
        // 下载失败不阻塞，继续返回元信息
        console.error(`[DouyinAdapter] 视频下载失败: ${err.message}`);
      }
    }

    return {
      id: this.generateId("douyin"),
      source: {
        platform: "douyin",
        url: shareText,
        adapter: "DouyinAdapter",
        author: videoInfo.author || undefined,
        authorId: videoInfo.authorId || undefined,
        publishTime: undefined,
      },
      media: {
        type: "video",
        localVideoPath,
        localAudioPath: null,
        coverPath: null,
        imagePaths: [],
        duration: videoInfo.duration || undefined,
      },
      text: {
        title: videoInfo.title || "",
        description: videoInfo.description || "",
        transcript: null,
        subtitles: null,
        ocrText: null,
        fullText: null,
      },
      metrics: {
        likes: videoInfo.likes || undefined,
        comments: videoInfo.comments || undefined,
        shares: videoInfo.shares || undefined,
        views: videoInfo.views || undefined,
        favorites: videoInfo.favorites || undefined,
      },
      raw: videoInfo,
    };
  }

  /**
   * 解析抖音分享链接，提取视频信息
   * （逻辑来源于 @yc-w-cn/douyin-mcp-server 的 DouyinProcessor.parseShareUrl）
   */
  async #parseShareUrl(shareText) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = shareText.match(urlRegex);
    if (!urls || urls.length === 0) {
      throw new Error("未找到有效的抖音分享链接");
    }

    const shareUrl = urls[0];
    // 跟随重定向获取最终 URL
    const shareResponse = await fetch(shareUrl, {
      headers: HEADERS,
      redirect: "follow",
    });
    const finalUrl = shareResponse.url || shareUrl;

    // 从最终 URL 提取 video ID
    const videoIdMatch = finalUrl.match(/video\/([^/?]+)/);
    const videoId = videoIdMatch
      ? videoIdMatch[1]
      : this.#generateVideoId();

    const videoPageUrl = `https://www.iesdouyin.com/share/video/${videoId}`;
    const response = await fetch(videoPageUrl, { headers: HEADERS });
    const html = await response.text();

    return this.#extractVideoInfo(html, videoId);
  }

  /**
   * 从 HTML 中提取视频信息
   * （逻辑来源于 @yc-w-cn/douyin-mcp-server 的 DouyinProcessor.extractVideoInfoFromHtml）
   */
  #extractVideoInfo(html, videoId) {
    const result = { videoId, title: "", url: "" };

    // 提取无水印视频 URL
    const videoUrlMatch = html.match(
      /"play_addr"[^}]*"url_list"[^\[]*\[\s*"([^"]+)"/
    );
    if (videoUrlMatch && videoUrlMatch[1]) {
      const decodedUrl = this.#decodeJsonString(videoUrlMatch[1]);
      const cleanUrl = decodedUrl.replace("playwm", "play");
      result.url = cleanUrl;
    } else {
      result.url = `https://aweme.snssdk.com/aweme/v1/play/?video_id=${videoId}`;
    }

    // 提取标题
    const titleMatch =
      html.match(/"desc"\s*:\s*"([^"]+)"/) ||
      html.match(/<title>([^<]+)<\/title>/);
    const rawTitle = titleMatch ? this.#decodeJsonString(titleMatch[1]) : "";
    result.title = rawTitle
      ? this.#sanitizeFileName(rawTitle).trim()
      : `douyin_${videoId}`;

    // 提取描述
    const descMatch = html.match(/"desc"\s*:\s*"([^"]+)"/);
    result.description = descMatch
      ? this.#decodeJsonString(descMatch[1])
      : "";

    // 提取作者信息
    const authorMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    result.author = authorMatch
      ? this.#decodeJsonString(authorMatch[1])
      : "";

    const authorIdMatch = html.match(/"sec_uid"\s*:\s*"([^"]+)"/);
    result.authorId = authorIdMatch
      ? authorIdMatch[1]
      : "";

    // 提取统计数据
    const diggMatch = html.match(/"digg_count"\s*:\s*(\d+)/);
    result.likes = diggMatch ? parseInt(diggMatch[1], 10) : 0;

    const commentMatch = html.match(/"comment_count"\s*:\s*(\d+)/);
    result.comments = commentMatch ? parseInt(commentMatch[1], 10) : 0;

    const shareMatch = html.match(/"share_count"\s*:\s*(\d+)/);
    result.shares = shareMatch ? parseInt(shareMatch[1], 10) : 0;

    const playMatch = html.match(/"play_count"\s*:\s*(\d+)/);
    result.views = playMatch ? parseInt(playMatch[1], 10) : 0;

    // 提取时长（毫秒）
    const durationMatch = html.match(/"duration"\s*:\s*(\d+)/);
    result.duration = durationMatch
      ? parseInt(durationMatch[1], 10) / 1000
      : undefined;

    return result;
  }

  /**
   * 下载视频到本地
   */
  async #downloadVideo(videoInfo) {
    const filepath = this.#makeFilePath(videoInfo);
    const response = await fetch(videoInfo.url, { headers: HEADERS });

    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`);
    }

    // 使用 stream 写入文件
    const writer = fs.createWriteStream(filepath);
    const reader = response.body;

    if (!reader) {
      throw new Error("响应无 body");
    }

    // Node.js fetch 返回的 body 是 ReadableStream (Web Streams)
    // 需要转换为 Node.js WriteStream
    await new Promise((resolve, reject) => {
      const nodeStream = stream.Readable.fromWeb(reader);
      nodeStream.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
      nodeStream.on("error", reject);
    });

    return filepath;
  }

  #makeFilePath(videoInfo) {
    const fallback =
      this.#sanitizeFileName(
        videoInfo.videoId || `douyin_${Date.now()}`
      ) || `douyin_${Date.now()}`;
    const base = (
      this.#sanitizeFileName(videoInfo.title) || fallback
    ).slice(0, 120);
    const filename = `${base}.mp4`;
    const filepath = path.join(this.#workDir, filename);
    return filepath;
  }

  #decodeJsonString(value) {
    try {
      return JSON.parse(
        `"${String(value).replace(/"/g, '\\"')}"`
      );
    } catch {
      return String(value);
    }
  }

  #sanitizeFileName(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();
  }

  #generateVideoId() {
    return (
      "douyin_" +
      Date.now().toString(36) +
      Math.random().toString(36).substring(2, 7)
    );
  }
}
