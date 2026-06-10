import { DeepSeekProvider } from "./deepseek.js";
import { OpenAIProvider } from "./openai.js";
import { ClaudeProvider } from "./claude.js";
import { GeminiProvider } from "./gemini.js";
import { QwenProvider } from "./qwen.js";
import { MiniMaxProvider } from "./minimax.js";
import { FishAudioProvider } from "./fish-audio.js";
import { ElevenLabsProvider } from "./elevenlabs.js";
import { SiliconFlowProvider } from "./siliconflow.js";
import { AliBailianProvider } from "./ali-bailian.js";
import { VolcengineProvider } from "./volcengine.js";

/**
 * Provider 注册表 — 所有支持的模型提供者
 */
export const PROVIDER_REGISTRY = {
  deepseek: { label: "DeepSeek", Provider: DeepSeekProvider, type: "text" },
  openai: { label: "OpenAI", Provider: OpenAIProvider, type: "text" },
  claude: { label: "Claude (Anthropic)", Provider: ClaudeProvider, type: "text" },
  gemini: { label: "Gemini (Google)", Provider: GeminiProvider, type: "text" },
  qwen: { label: "通义千问 (Qwen)", Provider: QwenProvider, type: "text" },
  minimax: { label: "MiniMax", Provider: MiniMaxProvider, type: "text" },
  "fish-audio": { label: "Fish Audio", Provider: FishAudioProvider, type: "tts" },
  elevenlabs: { label: "ElevenLabs", Provider: ElevenLabsProvider, type: "tts" },
  siliconflow: { label: "硅基流动 (SiliconFlow)", Provider: SiliconFlowProvider, type: "text" },
  "ali-bailian": { label: "阿里百炼", Provider: AliBailianProvider, type: "text" },
  volcengine: { label: "火山方舟", Provider: VolcengineProvider, type: "text" },
};

/**
 * 创建 Provider 实例
 * @param {string} providerId - 提供者 ID
 * @param {object} config - {apiKey, baseUrl, model, ...}
 * @returns {BaseProvider|null}
 */
export function createProvider(providerId, config = {}) {
  const entry = PROVIDER_REGISTRY[providerId];
  if (!entry) return null;
  return new entry.Provider(config);
}

/**
 * 获取所有 Provider 标签（用于 UI 显示）
 */
export function getProviderLabels() {
  return Object.fromEntries(
    Object.entries(PROVIDER_REGISTRY).map(([id, entry]) => [id, entry.label]),
  );
}

/**
 * 获取指定类型的 Provider ID 列表
 */
export function getProviderIdsByType(type) {
  return Object.entries(PROVIDER_REGISTRY)
    .filter(([, entry]) => entry.type === type)
    .map(([id]) => id);
}
