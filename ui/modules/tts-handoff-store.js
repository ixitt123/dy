(function exposeTtsHandoffStore(global) {
  const TARGETS = new Set(["cs1-video", "xiaohei-video", "money-printer", "kinetic-text"]);
  const KEY_PREFIX = "dy:tts:handoff:v2:";

  function storage() {
    try {
      return global.localStorage || null;
    } catch {
      return null;
    }
  }

  function keyFor(target) {
    return `${KEY_PREFIX}${target}`;
  }

  function normalizedTargets(targets = []) {
    return Array.from(new Set(
      (Array.isArray(targets) ? targets : [targets])
        .map(String)
        .filter((target) => TARGETS.has(target)),
    ));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function save(payload = {}, targets = []) {
    if (!payload?.id) return null;
    const targetList = normalizedTargets(targets);
    const targetStorage = storage();
    if (!targetStorage || !targetList.length) return null;
    const storedAt = payload.sent_at || payload.sentAt || new Date().toISOString();
    const baseRecord = {
      ...clone(payload),
      handoff_job_id: String(payload.id),
      handoff_revision: String(payload.handoff_revision || ""),
      stored_at: storedAt,
    };
    for (const target of targetList) {
      targetStorage.setItem(keyFor(target), JSON.stringify({ ...baseRecord, handoff_target: target }));
    }
    return baseRecord;
  }

  function read(target) {
    const normalizedTarget = String(target || "");
    if (!TARGETS.has(normalizedTarget)) return null;
    const targetStorage = storage();
    if (!targetStorage) return null;
    try {
      const record = JSON.parse(targetStorage.getItem(keyFor(normalizedTarget)) || "null");
      if (!record?.id || String(record.handoff_target || "") !== normalizedTarget) return null;
      return record;
    } catch {
      return null;
    }
  }

  function acknowledge(target) {
    const normalizedTarget = String(target || "");
    if (!TARGETS.has(normalizedTarget)) return null;
    const targetStorage = storage();
    if (!targetStorage) return null;
    const record = read(normalizedTarget);
    if (!record) return null;
    const acknowledged = {
      ...record,
      acknowledged_at: new Date().toISOString(),
    };
    targetStorage.setItem(keyFor(normalizedTarget), JSON.stringify(acknowledged));
    return acknowledged;
  }

  function isPending(target) {
    const record = read(target);
    return Boolean(record?.id && !record.acknowledged_at);
  }

  function clear(target) {
    const normalizedTarget = String(target || "");
    if (!TARGETS.has(normalizedTarget)) return;
    storage()?.removeItem(keyFor(normalizedTarget));
  }

  global.ttsHandoffStore = {
    targets: [...TARGETS],
    keyFor,
    save,
    read,
    acknowledge,
    isPending,
    clear,
  };
}(globalThis));
