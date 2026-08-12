(function exposeTtsHandoffStore(global) {
  const TARGETS = new Set(["cs1-video", "xiaohei-video", "money-printer", "kinetic-text"]);
  const KEY_PREFIX = "dy:tts:handoff:id:v1:";
  const LEGACY_KEY_PREFIX = "dy:tts:handoff:v2:";
  const cache = new Map();
  const acknowledged = new Set();

  function storage() {
    try { return global.localStorage || null; } catch { return null; }
  }

  function keyFor(target) { return `${KEY_PREFIX}${target}`; }
  function legacyKeyFor(target) { return `${LEGACY_KEY_PREFIX}${target}`; }

  function normalizedTargets(targets = []) {
    return [...new Set((Array.isArray(targets) ? targets : [targets]).map(String).filter((target) => TARGETS.has(target)))];
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function codedError(data, fallback) {
    const error = new Error(data?.message || fallback);
    error.code = data?.code || "UNKNOWN";
    error.category = data?.category || "unknown";
    error.retryable = Boolean(data?.retryable);
    error.retryAfterMs = Number(data?.retryAfterMs || 0);
    return error;
  }

  function latestId(target) {
    const normalizedTarget = String(target || "");
    if (!TARGETS.has(normalizedTarget)) return "";
    return String(storage()?.getItem(keyFor(normalizedTarget)) || "").trim();
  }

  async function save(payload = {}, targets = []) {
    if (!payload?.id || !payload?.handoff_id || !payload?.handoff_revision) return null;
    const targetList = normalizedTargets(targets);
    if (!targetList.length) return null;
    const response = await global.fetch("/api/tts/handoff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload, targets: targetList }),
    });
    const data = await response.json();
    if (!response.ok || !data?.handoff?.id) throw codedError(data, "服务端 handoff 保存失败。");
    const serverPayload = clone(data.handoff.payload || payload);
    for (const target of targetList) {
      const record = { ...serverPayload, handoff_target: target };
      cache.set(target, record);
      acknowledged.delete(target);
      storage()?.setItem(keyFor(target), String(data.handoff.id));
      storage()?.removeItem(legacyKeyFor(target));
    }
    return serverPayload;
  }

  function read(target) {
    const normalizedTarget = String(target || "");
    return TARGETS.has(normalizedTarget) ? clone(cache.get(normalizedTarget) || null) : null;
  }

  async function hydrate(target) {
    const normalizedTarget = String(target || "");
    if (!TARGETS.has(normalizedTarget)) return null;
    let handoffId = latestId(normalizedTarget);
    if (!handoffId) {
      try {
        const legacy = JSON.parse(storage()?.getItem(legacyKeyFor(normalizedTarget)) || "null");
        if (legacy?.id && legacy?.handoff_id && legacy?.handoff_revision) {
          const { handoff_target: _legacyTarget, stored_at: _legacyStoredAt, handoff_job_id: _legacyJobId, ...legacyPayload } = legacy;
          await save(legacyPayload, [normalizedTarget]);
          handoffId = latestId(normalizedTarget);
        }
      } catch {
        return null;
      }
    }
    if (!handoffId) return null;
    const cached = cache.get(normalizedTarget);
    if (cached?.handoff_id === handoffId) return clone(cached);
    const response = await global.fetch(`/api/tts/handoff?id=${encodeURIComponent(handoffId)}`);
    const data = await response.json();
    if (!response.ok || !data?.handoff?.payload) throw codedError(data, "服务端 handoff 恢复失败。");
    if (!Array.isArray(data.handoff.targets) || !data.handoff.targets.includes(normalizedTarget)) {
      throw new Error("服务端 handoff 不属于当前生产线。");
    }
    const record = { ...clone(data.handoff.payload), handoff_target: normalizedTarget };
    cache.set(normalizedTarget, record);
    return clone(record);
  }

  function acknowledge(target) {
    const normalizedTarget = String(target || "");
    if (!TARGETS.has(normalizedTarget)) return null;
    const record = read(normalizedTarget);
    if (!record) return null;
    acknowledged.add(normalizedTarget);
    return record;
  }

  function isPending(target) {
    const normalizedTarget = String(target || "");
    return Boolean(read(normalizedTarget)?.id && !acknowledged.has(normalizedTarget));
  }

  async function updateReceipt(target, state, options = {}) {
    const normalizedTarget = String(target || "");
    if (!TARGETS.has(normalizedTarget)) throw new Error("无效的生产线目标。");
    const record = read(normalizedTarget) || await hydrate(normalizedTarget);
    const handoffId = String(options.handoffId || record?.handoff_id || latestId(normalizedTarget) || "").trim();
    if (!handoffId) throw new Error("当前生产线没有可更新的 handoff ID。");
    const response = await global.fetch("/api/tts/handoff/receipt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handoffId, target: normalizedTarget, state, assetId: options.assetId || "" }),
    });
    const data = await response.json();
    if (!response.ok || !data?.receipt) throw codedError(data, "生产线 receipt 更新失败。");
    return data.receipt;
  }

  function clear(target) {
    const normalizedTarget = String(target || "");
    if (!TARGETS.has(normalizedTarget)) return;
    cache.delete(normalizedTarget);
    acknowledged.delete(normalizedTarget);
    storage()?.removeItem(keyFor(normalizedTarget));
    storage()?.removeItem(legacyKeyFor(normalizedTarget));
  }

  global.ttsHandoffStore = {
    targets: [...TARGETS], keyFor, latestId, save, read, hydrate, acknowledge, isPending, updateReceipt, clear,
  };
}(globalThis));
