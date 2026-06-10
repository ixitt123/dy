/**
 * WebpageAdapter — 网页文本提取适配器
 * 
 * 从任意网页中提取文本内容（标题、正文、描述等）。
 * 使用 Node.js 内置 fetch + 轻量级 HTML 正则解析，
 * 无需外部依赖或 headless browser。
 * 
 * 适合提取文章、博客、新闻等文本密集型页面。
 */

import { BaseAdapter } from "./base-adapter.js";

export class WebpageAdapter extends BaseAdapter {
  static name = "WebpageAdapter";

  /**
   * 判断输入是否为网页 URL
   * @param {string|Object} input
   * @returns {boolean}
   */
  canHandle(input) {
    const url = typeof input === "string" ? input : input?.url || input?.webpageUrl || "";
    if (!url) return false;
    // 匹配 http/https URL
    return /^https?:\/\//i.test(url);
  }

  /**
   * 提取网页文本内容
   * @param {string|Object} input
   * @returns {Promise<import("./base-adapter.js").RawContentAsset>}
   */
  async extract(input) {
    const url = typeof input === "string" ? input : input?.url || input?.webpageUrl || "";

    let html = "";
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      html = await response.text();
    } catch (err) {
      throw new Error(`WebpageAdapter: 无法获取网页内容: ${err.message}`);
    }

    // 提取元信息
    const title = this.#extractTitle(html) || url;
    const description = this.#extractMeta(html, "description") || "";
    const author = this.#extractMeta(html, "author") || null;
    const publishTime =
      this.#extractMeta(html, "article:published_time") ||
      this.#extractMeta(html, "date") ||
      null;

    // 提取正文文本
    const bodyText = this.#extractBodyText(html);

    // 提取所有图片
    const images = this.#extractImages(html, url);

    return {
      id: this.generateId("webpage"),
      source: {
        platform: "webpage",
        url,
        adapter: "WebpageAdapter",
        author: author || undefined,
        authorId: null,
        publishTime: publishTime || undefined,
      },
      media: {
        type: "text",
        localVideoPath: null,
        localAudioPath: null,
        coverPath: images[0] || null,
        imagePaths: images,
        duration: null,
      },
      text: {
        title,
        description,
        transcript: null,
        subtitles: null,
        ocrText: null,
        fullText: bodyText,
      },
      metrics: {
        likes: null,
        comments: null,
        shares: null,
        views: null,
        favorites: null,
      },
      raw: {
        htmlLength: html.length,
        extractedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * 提取页面标题
   */
  #extractTitle(html) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      return this.#decodeEntities(titleMatch[1]).trim();
    }
    const ogTitleMatch = html.match(
      /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i
    );
    if (ogTitleMatch) return ogTitleMatch[1].trim();
    return "";
  }

  /**
   * 提取 meta 标签内容
   */
  #extractMeta(html, name) {
    const patterns = [
      new RegExp(
        `<meta[^>]+name="${name}"[^>]+content="([^"]+)"`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+property="${name}"[^>]+content="([^"]+)"`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content="([^"]+)"[^>]+name="${name}"`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content="([^"]+)"[^>]+property="${name}"`,
        "i"
      ),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return this.#decodeEntities(match[1]).trim();
    }
    return "";
  }

  /**
   * 提取正文文本（移除 HTML 标签和脚本/样式）
   */
  #extractBodyText(html) {
    // 移除 script 和 style 标签及其内容
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

    // 移除 HTML 标签
    text = text.replace(/<[^>]+>/g, " ");

    // 解码 HTML 实体
    text = this.#decodeEntities(text);

    // 合并空白
    text = text.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

    // 限制长度（避免超大页面）
    return text.slice(0, 50000);
  }

  /**
   * 提取页面中的图片 URL
   */
  #extractImages(html, baseUrl) {
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const images = [];
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      let src = match[1];
      // 转换为绝对 URL
      if (src.startsWith("//")) {
        const proto = baseUrl.startsWith("https") ? "https:" : "http:";
        src = proto + src;
      } else if (src.startsWith("/")) {
        try {
          const urlObj = new URL(baseUrl);
          src = `${urlObj.origin}${src}`;
        } catch {
          // 忽略无效 URL
        }
      } else if (!src.startsWith("http")) {
        try {
          const urlObj = new URL(baseUrl);
          src = `${urlObj.origin}/${src}`;
        } catch {
          // 忽略
        }
      }
      if (src && !images.includes(src)) {
        images.push(src);
      }
    }
    return images.slice(0, 20); // 最多提取 20 张图片
  }

  /**
   * 解码 HTML 实体
   */
  #decodeEntities(text) {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
  }
}
