// 统一设置中心
import fs from "node:fs";
import path from "node:path";

const DEFAULT_MODEL_MAPPING = {
  analyze: { provider: "deepseek", model: "deepseek-chat" },
  rewrite: { provider: "deepseek", model: "deepseek-chat" },
  director: { provider: "deepseek", model: "deepseek-chat" },
  storyboard: { provider: "deepseek", model: "deepseek-chat" },
  image_prompt: { provider: "deepseek", model: "deepseek-chat" },
  image: { provider: "volcengine_ark", model: "doubao-seedream-5.0-lite" },
  video: { provider: "kling", model: "kling" },
  tts: { provider: "aliyun_bailian", model: "cosyvoice-v2" },
};

export function createSettingsCenter(baseDir, settingsPath) {
  const settingsPathResolved = settingsPath || path.join(baseDir, "settings.json");

  function read() {
    try { return JSON.parse(fs.readFileSync(settingsPathResolved, "utf8") || "{}"); }
    catch { return {}; }
  }

  function write(data) {
    fs.writeFileSync(settingsPathResolved, JSON.stringify(data, null, 2), "utf8");
  }

  function getModelMapping() {
    const settings = read();
    const mapping = settings.modelMap || settings.modelMapping || {};
    return Object.keys(mapping).length > 0 ? { ...DEFAULT_MODEL_MAPPING, ...mapping } : DEFAULT_MODEL_MAPPING;
  }

  function setModelMapping(mapping) {
    const settings = read();
    settings.modelMap = { ...DEFAULT_MODEL_MAPPING, ...(mapping || {}) };
    settings.modelMapping = settings.modelMap;
    write(settings);
  }

  function getProviderConfig(providerId) {
    const settings = read();
    return settings.providers?.[providerId] || {};
  }

  function setProviderConfig(providerId, config) {
    const settings = read();
    if (!settings.providers) settings.providers = {};
    settings.providers[providerId] = { ...settings.providers[providerId], ...config };
    write(settings);
  }

  function testProviderConnection(providerId) {
    const config = getProviderConfig(providerId);
    if (!config.apiKey) {
      return { ok: false, error: "未配置 API Key" };
    }
    return { ok: true, status: "已配置" };
  }

  function getAllProviders() {
    const settings = read();
    return Object.keys(settings.providers || {}).map(id => ({
      id,
      ...(settings.providers[id] || {}),
      configured: !!settings.providers[id]?.apiKey,
    }));
  }

  function getTtsVoices() {
    const settings = read();
    return settings.ttsVoices || [];
  }

  function setTtsVoices(voices) {
    const settings = read();
    settings.ttsVoices = voices;
    write(settings);
  }

  return {
    read, write,
    getModelMapping, setModelMapping,
    getProviderConfig, setProviderConfig,
    testProviderConnection, getAllProviders,
    getTtsVoices, setTtsVoices,
  };
}
