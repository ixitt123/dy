// 统一内容分析引擎 — 整合 Adapter + Normalizer + Analyzer
import { createAdapterRegistry } from "./adapters/index.js";
import { ContentNormalizer } from "./content/content-normalizer.js";
import { createContentAnalyzer } from "./content/content-analyzer.js";

export function createAnalysisEngine(baseDir) {
  const registry = createAdapterRegistry();
  const normalizer = new ContentNormalizer();
  const analyzer = createContentAnalyzer(baseDir);

  async function analyze(input) {
    // 1. 解析适配器
    const adapter = await registry.resolve(input);
    if (!adapter) throw new Error(`无法识别的内容源: ${JSON.stringify(input)}`);

    // 2. 提取原始内容
    const rawAsset = await adapter.extract(input);

    // 3. 标准化
    const normalized = await normalizer.normalize(rawAsset);

    // 4. 分析
    const analysis = await analyzer.analyze(normalized);

    return {
      adapter: adapter.name,
      rawAsset,
      normalized,
      analysis,
    };
  }

  async function analyzeUrl(url) {
    return analyze({ type: "url", value: url });
  }

  return { analyze, analyzeUrl, registry, normalizer, analyzer };
}
