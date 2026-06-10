/**
 * LocalVideoAdapter — 本地文件适配器
 * 
 * 处理本地视频/音频/图片文件，提取文件元信息。
 * 支持通过文件路径或包含 filePath 字段的对象输入。
 * 
 * 支持的输入格式：
 *   - 绝对路径: "C:\\videos\\test.mp4"
 *   - 相对路径: "./data/input.mp4"
 *   - 对象: { filePath: "/path/to/video.mp4" }
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { BaseAdapter } from "./base-adapter.js";

const VIDEO_EXT = new Set([
  ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts",
]);
const AUDIO_EXT = new Set([
  ".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".opus",
]);
const IMAGE_EXT = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".ico", ".tiff",
]);

export class LocalVideoAdapter extends BaseAdapter {
  static name = "LocalVideoAdapter";

  /**
   * 判断输入是否为本地文件路径
   * @param {string|Object} input
   * @returns {boolean}
   */
  canHandle(input) {
    const filePath = this.#resolvePath(input);
    if (!filePath) return false;

    // 排除 URL
    if (/^https?:\/\//i.test(filePath)) return false;

    // 检查文件是否存在
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }

  /**
   * 提取本地文件内容信息
   * @param {string|Object} input
   * @returns {Promise<import("./base-adapter.js").RawContentAsset>}
   */
  async extract(input) {
    const filePath = this.#resolvePath(input);
    if (!filePath) {
      throw new Error("LocalVideoAdapter: 无法解析文件路径");
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath, ext);
    const absPath = path.resolve(filePath);

    // 判断媒体类型
    let mediaType = "text";
    if (VIDEO_EXT.has(ext)) {
      mediaType = "video";
    } else if (AUDIO_EXT.has(ext)) {
      mediaType = "audio";
    } else if (IMAGE_EXT.has(ext)) {
      mediaType = "image";
    }

    return {
      id: this.generateId("local"),
      source: {
        platform: "local",
        url: `file://${absPath.replace(/\\/g, "/")}`,
        adapter: "LocalVideoAdapter",
        author: null,
        authorId: null,
        publishTime: stat.birthtime?.toISOString() || stat.mtime.toISOString(),
      },
      media: {
        type: mediaType,
        localVideoPath: mediaType === "video" ? absPath : null,
        localAudioPath: mediaType === "audio" ? absPath : null,
        coverPath: null,
        imagePaths: mediaType === "image" ? [absPath] : [],
        duration: null, // 可用 ffprobe 获取，暂不实现
      },
      text: {
        title: basename,
        description: `本地${mediaType === "video" ? "视频" : mediaType === "audio" ? "音频" : mediaType === "image" ? "图片" : "文件"}: ${filePath}`,
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
      raw: {
        filePath: absPath,
        size: stat.size,
        ext,
        createdAt: stat.birthtime?.toISOString() || stat.mtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      },
    };
  }

  /**
   * 从输入中解析文件路径
   * @private
   */
  #resolvePath(input) {
    if (typeof input === "string") {
      // 排除纯 URL
      if (/^https?:\/\//i.test(input)) return null;
      return input;
    }
    if (input && typeof input === "object") {
      const candidate =
        input.filePath || input.path || input.localPath || input.file || "";
      if (candidate && !/^https?:\/\//i.test(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}
