/**
 * Server Core Adapters — 统一导出
 * 
 * 适配器系统提供统一的跨平台内容提取接口。
 * 
 * 使用方式：
 *   import { createAdapterRegistry, AdapterRegistry } from "./adapters/index.js";
 *   const registry = createAdapterRegistry({ workDir: ".data" });
 *   const asset = await registry.extract("https://v.douyin.com/xxxxx");
 * 
 * 设计模式：
 *   - yt-dlp 风格：注册 → 解析 → 提取
 *   - 所有适配器输出统一的 RawContentAsset
 *   - 按注册顺序匹配，先到先得
 */

// 基础类
import { BaseAdapter } from "./base-adapter.js";

// 注册中心
import { AdapterRegistry } from "./adapter-registry.js";

// 平台适配器
import { DouyinAdapter } from "./douyin-adapter.js";
import { BilibiliAdapter } from "./bilibili-adapter.js";
import { GenericUrlAdapter } from "./generic-url-adapter.js";
import { LocalVideoAdapter } from "./local-video-adapter.js";
import { WebpageAdapter } from "./webpage-adapter.js";

// 统一导出
export { BaseAdapter };
export { AdapterRegistry };
export { DouyinAdapter };
export { BilibiliAdapter };
export { GenericUrlAdapter };
export { LocalVideoAdapter };
export { WebpageAdapter };

/**
 * 创建预配置的适配器注册中心
 * 
 * 适配器按优先级注册：
 *   1. DouyinAdapter (priority: 10)  — 抖音专用
 *   2. BilibiliAdapter (priority: 10) — B站专用（桩）
 *   3. LocalVideoAdapter (priority: 50) — 本地文件
 *   4. WebpageAdapter (priority: 80) — 网页文本提取
 *   5. GenericUrlAdapter (priority: 100) — 兜底 URL
 * 
 * @param {Object} [options]
 * @param {string} [options.workDir=".data"] - 抖音下载文件的存储目录
 * @returns {AdapterRegistry}
 */
export function createAdapterRegistry(options = {}) {
  const { workDir = ".data" } = options;

  const registry = new AdapterRegistry();

  // 按优先级从高到低注册
  registry.register(new DouyinAdapter(workDir), { priority: 10 });
  registry.register(new BilibiliAdapter(), { priority: 10 });
  registry.register(new LocalVideoAdapter(), { priority: 50 });
  registry.register(new WebpageAdapter(), { priority: 80 });
  registry.register(new GenericUrlAdapter(), { priority: 100 });

  return registry;
}
