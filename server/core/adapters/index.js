// 基础类
import { BaseAdapter } from "./base-adapter.js";
import { AdapterRegistry } from "./adapter-registry.js";
import { DouyinAdapter } from "./douyin-adapter.js";
import { BilibiliAdapter } from "./bilibili-adapter.js";
import { GenericUrlAdapter } from "./generic-url-adapter.js";
import { LocalVideoAdapter } from "./local-video-adapter.js";
import { WebpageAdapter } from "./webpage-adapter.js";
import { YoutubeAdapter } from "./youtube-adapter.js";
import { XiaohongshuAdapter } from "./xiaohongshu-adapter.js";
import { PdfAdapter } from "./pdf-adapter.js";

export { BaseAdapter, AdapterRegistry, DouyinAdapter, BilibiliAdapter, GenericUrlAdapter, LocalVideoAdapter, WebpageAdapter, YoutubeAdapter, XiaohongshuAdapter, PdfAdapter };

export function createAdapterRegistry(options = {}) {
  const { workDir = ".data" } = options;
  const registry = new AdapterRegistry();
  registry.register(new DouyinAdapter(workDir), { priority: 10 });
  registry.register(new BilibiliAdapter(), { priority: 10 });
  registry.register(new YoutubeAdapter(), { priority: 20 });
  registry.register(new XiaohongshuAdapter(), { priority: 20 });
  registry.register(new LocalVideoAdapter(), { priority: 50 });
  registry.register(new PdfAdapter(), { priority: 60 });
  registry.register(new WebpageAdapter(), { priority: 80 });
  registry.register(new GenericUrlAdapter(), { priority: 100 });
  return registry;
}
