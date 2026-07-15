import assert from "node:assert/strict";
import {
  clampTime,
  playablePreviewTime,
  seekValueToPreviewTime,
  shouldUseAnchoredClock,
} from "./ui/modules/kinetic-preview-clock.js";

assert.equal(seekValueToPreviewTime(0, 1000, 42), 0);
assert.equal(seekValueToPreviewTime(500, 1000, 42), 21);
assert.equal(seekValueToPreviewTime(1000, 1000, 42), 42);
assert.equal(clampTime(50, 42), 42);

const endStart = playablePreviewTime(42, 42);
assert.ok(endStart > 41.9 && endStart < 42, "max seek should stay at the last playable moment, not restart at zero");
assert.equal(playablePreviewTime(21, 42), 21);
assert.equal(playablePreviewTime(0, 42), 0);

assert.equal(shouldUseAnchoredClock({
  now: 100,
  lockUntil: 120,
  mediaTime: 0,
}), true);

assert.equal(shouldUseAnchoredClock({
  now: 130,
  lockUntil: 120,
  pendingSeekTime: 21,
  pendingSeekUntil: 900,
  mediaTime: 3,
}), true);

assert.equal(shouldUseAnchoredClock({
  now: 130,
  lockUntil: 120,
  pendingSeekTime: 21,
  pendingSeekUntil: 900,
  mediaTime: 21.05,
}), false);

assert.equal(shouldUseAnchoredClock({
  now: 1000,
  lockUntil: 120,
  pendingSeekTime: 21,
  pendingSeekUntil: 900,
  mediaTime: 3,
}), false);

console.log("Kinetic preview seek tests passed");
