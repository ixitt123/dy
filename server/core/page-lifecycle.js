export function createPageLifecycle({
  enabled = true,
  graceMs = 30_000,
  heartbeatStaleMs = 12_000,
  onShutdown = () => {},
  now = () => Date.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
} = {}) {
  const sessions = new Map();
  let shutdownTimer = null;
  let disconnectedAt = null;
  let hasConnected = false;

  function cancelShutdown() {
    if (shutdownTimer !== null) clearTimer(shutdownTimer);
    shutdownTimer = null;
  }

  function scheduleIfDisconnected(disconnectedAtValue = now()) {
    if (!enabled || !hasConnected || sessions.size > 0) {
      if (sessions.size > 0) {
        disconnectedAt = null;
        cancelShutdown();
      }
      return;
    }
    if (disconnectedAt === null) disconnectedAt = disconnectedAtValue;
    if (shutdownTimer !== null) return;
    const delay = Math.max(0, graceMs - Math.max(0, now() - disconnectedAt));
    shutdownTimer = setTimer(() => {
      shutdownTimer = null;
      if (enabled && sessions.size === 0) onShutdown();
    }, delay);
    shutdownTimer?.unref?.();
  }

  function touch(id) {
    const sessionId = String(id || "").trim();
    if (!sessionId) return;
    hasConnected = true;
    sessions.set(sessionId, now());
    disconnectedAt = null;
    cancelShutdown();
  }

  function close(id, { isReload = false } = {}) {
    const sessionId = String(id || "").trim();
    if (isReload) return;
    if (sessionId) sessions.delete(sessionId);
    if (sessions.size === 0) scheduleIfDisconnected(now());
  }

  function sweep() {
    if (!enabled || !hasConnected) return;
    const currentTime = now();
    let latestExpiredHeartbeat = null;
    for (const [id, lastSeen] of sessions) {
      if (currentTime - lastSeen <= heartbeatStaleMs) continue;
      sessions.delete(id);
      latestExpiredHeartbeat = Math.max(latestExpiredHeartbeat ?? lastSeen, lastSeen);
    }
    if (sessions.size === 0 && latestExpiredHeartbeat !== null) {
      scheduleIfDisconnected(latestExpiredHeartbeat);
    }
  }

  function status() {
    const remainingMs = disconnectedAt !== null && sessions.size === 0
      ? Math.max(0, graceMs - Math.max(0, now() - disconnectedAt))
      : 0;
    return {
      enabled,
      activePages: sessions.size,
      graceSeconds: Math.round(graceMs / 1000),
      shutdownPending: shutdownTimer !== null,
      shutdownInSeconds: shutdownTimer !== null ? Math.ceil(remainingMs / 1000) : 0,
    };
  }

  return {
    touch,
    close,
    sweep,
    scheduleIfDisconnected,
    cancelShutdown,
    status,
  };
}
