import assert from "node:assert/strict";
import { buildFixedAsrRows, isMusic26FreeJob, mergeSourceConstrainedRows } from "./server/tts/source-constrained-repair.js";

const sourceText = [
  "觉得自己学什么都吃力？非得先搞明白来龙去脉才肯往下走。",
  "告诉你，这不是你笨，是掉进了“过度求原”的坑。",
  "想懂牛顿定律得先学微积分，学微积分又得搞懂极限，这链条没头。",
  "每次深挖只给自己15分钟。",
].join("");

const asrRows = [
  { index: 1, start: 0, end: 5, text: "告诉你这不是你本事，掉进了过度求源的坑。" },
  { index: 2, start: 5, end: 10, text: "向东有淡定律的鲜血味几分。" },
  { index: 3, start: 10, end: 13, text: "每次深挖只给自己五几分钟。" },
];

const repaired = mergeSourceConstrainedRows({
  sourceText,
  asrRows,
  modelRows: [
    { index: 1, text: "告诉你，这不是你笨，是掉进了“过度求原”的坑。" },
    { index: 2, text: "想懂牛顿定律得先学微积分。" },
    { index: 3, text: "每次深挖只给自己15分钟。" },
  ],
});

assert.equal(repaired.rows.length, asrRows.length);
assert.equal(repaired.rows[0].text, "告诉你，这不是你笨，是掉进了“过度求原”的坑。");
assert.equal(repaired.rows[1].text, "想懂牛顿定律得先学微积分。");
assert.equal(repaired.rows[2].text, "每次深挖只给自己15分钟。");
assert.equal(repaired.partial, false);
assert.ok(repaired.changedCharacters > 0);

const partial = mergeSourceConstrainedRows({
  sourceText,
  asrRows,
  modelRows: [
    { index: 1, text: "告诉你，这不是你笨，是掉进了“过度求原”的坑。" },
    { index: 2, text: "今天下雨了，完全是新内容。" },
  ],
});

assert.equal(partial.rows.length, asrRows.length);
assert.equal(partial.rows[1].text, asrRows[1].text);
assert.equal(partial.rows[2].text, asrRows[2].text);
assert.equal(partial.partial, true);
assert.equal(partial.fallbackCount, 2);
assert.equal(isMusic26FreeJob({ metadata: { model: "music-2.6-free" } }), true);
assert.equal(isMusic26FreeJob({ metadata: { model: "speech-2.6-hd" } }), false);

const splitRows = buildFixedAsrRows({
  fixedRows: [
    { start: 0, end: 2, text: "旧行一" },
    { start: 2, end: 4, text: "旧行二" },
    { start: 4, end: 6, text: "旧行三" },
  ],
  recognizedWords: [
    { start: 0.1, end: 1, text: "第一段" },
    { start: 2.1, end: 3, text: "第二段" },
    { start: 4.1, end: 5, text: "第三段" },
  ],
});
assert.deepEqual(splitRows.map((row) => row.text), ["第一段", "第二段", "第三段"]);
assert.deepEqual(splitRows.map((row) => [row.start, row.end]), [[0, 2], [2, 4], [4, 6]]);
assert.equal(new Set(splitRows.map((row) => row.text)).size, 3);

console.log("Source-constrained music ASR repair: OK");
