export const SEEK_LOCK_MS = 1200;
export const SEEK_END_EPSILON_SECONDS = 0.08;
export const MEDIA_SEEK_TOLERANCE_SECONDS = 0.18;

export function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampTime(value, duration = 0) {
  const total = Math.max(0, finiteNumber(duration));
  return Math.max(0, Math.min(total, finiteNumber(value)));
}

export function seekValueToPreviewTime(sliderValue, sliderMaximum, duration) {
  const total = Math.max(0, finiteNumber(duration));
  const max = Math.max(1, finiteNumber(sliderMaximum, 1000));
  return clampTime((finiteNumber(sliderValue) / max) * total, total);
}

export function playablePreviewTime(time, duration) {
  const total = Math.max(0, finiteNumber(duration));
  const target = clampTime(time, total);
  if (total <= 0) return 0;
  if (target < total - 0.005) return target;
  return Math.max(0, total - Math.min(SEEK_END_EPSILON_SECONDS, total / 4));
}

export function shouldUseAnchoredClock({
  now,
  lockUntil = 0,
  pendingSeekTime = null,
  pendingSeekUntil = 0,
  mediaTime = null,
  tolerance = MEDIA_SEEK_TOLERANCE_SECONDS,
} = {}) {
  const currentNow = finiteNumber(now);
  if (lockUntil && currentNow < lockUntil) return true;
  if (pendingSeekTime === null || pendingSeekTime === undefined) return false;
  if (pendingSeekUntil && currentNow >= pendingSeekUntil) return false;
  const currentMediaTime = Number(mediaTime);
  if (!Number.isFinite(currentMediaTime)) return true;
  return Math.abs(currentMediaTime - Number(pendingSeekTime)) > Math.max(0.01, Number(tolerance || 0));
}
