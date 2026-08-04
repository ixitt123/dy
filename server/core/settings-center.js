// 统一设置中心
import path from "node:path";
import { normalizeModelMapping } from "../config/model-defaults.js";
import { readJsonWithRecovery, writeJsonAtomic } from "./atomic-write.mjs";

export function createSettingsCenter(baseDir, settingsPath) {
  const settingsPathResolved = settingsPath || path.join(baseDir, "settings.json");
  let updateQueue = Promise.resolve();

  function read() {
    return readJsonWithRecovery(settingsPathResolved, { fallback: {} });
  }

  function write(data) {
    // 09.04 原子写入：写临时文件 → fsync → rename，避免写入失败破坏旧设置
    writeJsonAtomic(settingsPathResolved, data);
  }

  function update(mutator) {
    if (typeof mutator !== "function") throw new TypeError("settings update 必须提供函数");
    const operation = updateQueue.then(async () => {
      const current = read();
      const draft = typeof structuredClone === "function"
        ? structuredClone(current)
        : JSON.parse(JSON.stringify(current));
      const returned = await mutator(draft);
      const next = returned && typeof returned === "object" ? returned : draft;
      write(next);
      return read();
    });
    updateQueue = operation.catch(() => {});
    return operation;
  }

  function getModelMapping() {
    const settings = read();
    const mapping = settings.modelMap || settings.modelMapping || {};
    return normalizeModelMapping(mapping);
  }

  function setModelMapping(mapping) {
    const settings = read();
    settings.modelMap = normalizeModelMapping(mapping);
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
    read, write, update,
    getModelMapping, setModelMapping,
    getProviderConfig, setProviderConfig,
    testProviderConnection, getAllProviders,
    getTtsVoices, setTtsVoices,
  };
}
