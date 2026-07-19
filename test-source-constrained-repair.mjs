import assert from "node:assert/strict";
import { mergeSourceConstrainedRows, repairSourceConstrainedRows } from "./server/tts/source-constrained-repair.js";

const sourceText = "你学习慢，是不是从头翻到尾。很多时候不是孩子不努力，是方法没对。";
const asrRows = [
  { index: 1, start: 0, end: 2.4, text: "你学习吗？是不是从头翻到尾" },
  { index: 2, start: 2.4, end: 4.2, text: "很多时候不是孩子不努力" },
  { index: 3, start: 4.2, end: 5.6, text: "是方法没队。" },
];

const repaired = repairSourceConstrainedRows({ sourceText, asrRows });

assert.equal(repaired.rows.length, asrRows.length, "repair must keep subtitle row count");
assert.deepEqual(
  repaired.rows.map(({ start, end }) => [start, end]),
  asrRows.map(({ start, end }) => [start, end]),
  "repair must not change timestamps",
);
assert.equal(repaired.rows[0].text, "你学习慢？是不是从头翻到尾");
assert.equal(repaired.rows[2].text, "是方法没对。");
assert.equal(repaired.fallbackCount, 0, "repair must not fall back to original ASR text");

const merged = mergeSourceConstrainedRows({
  sourceText,
  asrRows,
  modelRows: [
    { index: 1, text: "你学习吗是不是从头翻到尾" },
    { index: 2, text: "" },
    { index: 3, text: "是方法没队" },
  ],
});

assert.equal(merged.rows[0].text, "你学习慢？是不是从头翻到尾");
assert.equal(merged.rows[2].text, "是方法没对。");
assert.equal(merged.partial, false);

console.log("Source-constrained subtitle repair: OK");
