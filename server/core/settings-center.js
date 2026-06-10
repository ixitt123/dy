// 统一设置中心
import fs from "node:fs";
import path from "node:path";

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
    const mapping = read().modelMapping || {};
    // 提供默认值
    return Object.keys(mapping).length > 0 ? mapping : {
      rewrite: { provider: "deepseek", model: "deepseek-chat" },
      director: { provider: "deepseek", model: "deepseek-chat" },
      storyboard: { provider: "deepseek", model: "deepseek-chat" },
      image: { provider: "jimeng", model: "" },
      video: { provider: "kling", model: "" },
      tts: { provider: "fish-audio", model: "fish-speech-1.5" },
    };
  }

  function setModelMapping(mapping) {
    const settings = read();
    settings.modelMapping = mapping;
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
