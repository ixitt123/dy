// test-media-verifier.mjs
//
// 媒体验证器测试（01.03）。
// 用真实音频文件验证 media-verifier.mjs 的六项检查：
//   流 / 时长 / 可解码 / 响度 / 峰值 / BGM 特征频段。
//
// 测试文件来自仓库冻结 fixture，不依赖 .data 历史媒体或开发机残留：
//   - fixtures/money-printer/feature-bgm.wav（5.5 秒）
//   - fixtures/kinetic/bgm-110.wav（4.7 秒）
// 注：本文件只验证媒体检测器的流、时长、解码、响度和频段输出；
//     四条生产线真实混音仍由独立生产媒体门验收。
//
// 运行：node test-media-verifier.mjs

import {
  probe, verifyStreams, verifyDuration, verifyDecodable,
  measureLoudness, detectFrequencyBands, verifyMedia,
} from "./scripts/media-verifier.mjs";
import path from "node:path";

const BGM = path.join("fixtures", "money-printer", "feature-bgm.wav");
const MIX = path.join("fixtures", "kinetic", "bgm-110.wav");
const FILES = [BGM, MIX];

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("probe 真实音频文件", async () => {
  for (const f of FILES) {
    const data = probe(f);
    if (!data.streams || !data.format) throw new Error(`probe 失败: ${f}`);
  }
});

test("verifyStreams: 文件均含音频流且有 codec", async () => {
  for (const f of FILES) {
    const s = verifyStreams(f);
    if (!s.hasAudio) throw new Error(`${f} 无音频流`);
    if (s.audioCodecs.length === 0) throw new Error(`${f} 无音频 codec`);
  }
});

test("verifyDuration: 时长均为正数且 > 3 秒", async () => {
  for (const f of FILES) {
    const d = verifyDuration(f);
    if (d.duration < 3) throw new Error(`${f} 时长 ${d.duration} < 3 秒`);
  }
});

test("verifyDecodable: 文件均可解码", async () => {
  for (const f of FILES) {
    const d = verifyDecodable(f);
    if (!d.decodable) throw new Error(`${f} 不可解码`);
  }
});

test("measureLoudness: 返回 LUFS / LRA / dBFS", async () => {
  for (const f of FILES) {
    const l = measureLoudness(f);
    if (l.integratedLufs === null) throw new Error(`${f} 响度 I 为 null`);
    if (l.truePeakDbfs === null) throw new Error(`${f} 峰值 TP 为 null`);
    if (l.loudnessRange === null) throw new Error(`${f} LRA 为 null`);
  }
});

test("detectFrequencyBands: 返回低/中/高频 RMS", async () => {
  for (const f of FILES) {
    const b = detectFrequencyBands(f);
    if (b.bands.low.rmsDb === null) throw new Error(`${f} 低频 RMS 为 null`);
    if (b.bands.mid.rmsDb === null) throw new Error(`${f} 中频 RMS 为 null`);
    if (b.bands.high.rmsDb === null) throw new Error(`${f} 高频 RMS 为 null`);
    if (b.lowMidDiff === null) throw new Error(`${f} lowMidDiff 为 null`);
  }
});

test("verifyMedia 综合验证: BGM 文件 ok", async () => {
  const r = verifyMedia(BGM, { expectAudio: true, expectVideo: false, minDuration: 3 });
  if (!r.ok) throw new Error(`BGM 综合验证失败: ${r.errors.join("; ")}`);
  if (!r.duration || !r.loudness || !r.frequencyBands || !r.streams || !r.decodable) {
    throw new Error("综合验证缺少必要字段");
  }
});

// Run all
let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log(`✅ ${t.name}`);
  } catch (e) {
    failed++;
    console.error(`❌ ${t.name}: ${e.message}`);
  }
}
console.log(`\n📊 媒体验证器测试: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
