import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { KINETIC_TEXT_EFFECTS, effectById } from "./server/kinetic-text/effects.js";
import { buildAss, createKineticTextService } from "./server/kinetic-text/kinetic-text-service.js";

assert.equal(KINETIC_TEXT_EFFECTS.length, 2, "正式注册表只保留两个滚动聚焦模板");
assert.equal(KINETIC_TEXT_EFFECTS.some((item) => item.id === "glitch-jitter"), false, "旧 24 字效不得继续注册");

const segments = [
  { id: "s1", start: 0, end: 1.2, text: "效率来自正确选择。", keywords: ["效率"], speaker: "主讲人" },
  { id: "s2", start: 1.2, end: 2.6, text: "每一步都更接近结果。", keywords: ["结果"], speaker: "嘉宾" },
];

const words = segments.flatMap((segment) => [...segment.text].map((text, index, list) => ({
  text,
  start: segment.start + (segment.end - segment.start) * index / list.length,
  end: segment.start + (segment.end - segment.start) * (index + 1) / list.length,
})));

const keywordProject = {
  id: "keyword-emphasis-test",
  effectId: "rolling-focus",
  aspectRatio: "16:9",
  duration: 2.6,
  text: segments.map((item) => item.text).join(""),
  wordTimeline: words,
  segments,
  showBottomSubtitles: true,
};
const keywordAss = buildAss(keywordProject);
const bottomKeywordEvents = keywordAss.split("\n").filter((line) => line.startsWith("Dialogue:") && line.includes(",Bottom,"));
const templateEvents = keywordAss.split("\n").filter((line) => line.startsWith("Dialogue:") && line.includes(",Modern,"));
for (const keyword of segments.flatMap((segment) => segment.keywords)) {
  const emphasisPattern = new RegExp(`\\{\\\\(?:1c|rKeyword)[^}]*\\}${keyword}`);
  assert.equal(bottomKeywordEvents.some((line) => emphasisPattern.test(line)), true, `bottom subtitle keyword "${keyword}" must be emphasized`);
  assert.equal(templateEvents.some((line) => emphasisPattern.test(line)), false, `template text keyword "${keyword}" must remain template-controlled`);
}
assert.match(keywordAss, /KeywordBox(?:Gold|Cyan|Lime|Violet)/u, "formal ASS must register keyword box styles");
assert.match(bottomKeywordEvents.join("\n"), /\\fscx116|\\u1|\\rKeywordBox|\\1c&H/u, "bottom keywords must use color, scale, box, or underline emphasis");
assert.equal(buildAss(keywordProject), keywordAss, "keyword styles must remain deterministic across renders");

const rollingFocusText = "，你真的，下定决心。要学英语了！那我就把英语，学习的唯一正确顺序告诉你。";
const rollingFocusWords = [...rollingFocusText].map((text, index, list) => ({
  text,
  start: 4 * index / list.length,
  end: 4 * (index + 1) / list.length,
}));
const rollingFocusAss = buildAss({
  id: "rolling-focus-split-test",
  effectId: "rolling-focus-subtitle",
  aspectRatio: "16:9",
  duration: 4,
  text: rollingFocusText,
  wordTimeline: rollingFocusWords,
  segments: [{ id: "focus", start: 0, end: 4, text: rollingFocusText, words: rollingFocusWords }],
});
const rollingFocusCurrentRows = rollingFocusAss.split("\n")
  .filter((line) => line.startsWith("Dialogue:") && line.includes("}"))
  .map((line) => line.slice(line.lastIndexOf("}") + 1).trim())
  .filter((line) => line && line !== "▶");
assert.equal(rollingFocusCurrentRows.length >= 3, true, "长句必须拆成多个口播节奏短句");
assert.equal(rollingFocusCurrentRows.every((line) => [...line].length <= 8), true, "每个滚动聚焦短句不得超过 8 个可见字符");
assert.equal(rollingFocusCurrentRows.every((line) => !/[，。！？；：、,.!?;:]/u.test(line)), true, "滚动聚焦画面不得显示标点符号");

const bookendAss = buildAss({
  id: "bookend-test",
  effectId: "rolling-focus-subtitle",
  aspectRatio: "16:9",
  duration: 6,
  title: "项目标题",
  segments: [{ id: "body", start: 1.2, end: 4.8, text: "正文内容", keywords: ["正文"] }],
  bookends: {
    intro: { enabled: true, preset: "custom", text: "片头标题" },
    outro: { enabled: true, preset: "custom", text: "记得关注" },
  },
});
assert.match(bookendAss, /片头标题/u, "开头留白足够时必须渲染片头文字");
assert.match(bookendAss, /记得关注/u, "结尾留白足够时必须渲染结尾话术");
assert.match(bookendAss, /\\fad\(/u, "片头片尾必须使用确定性的进入退出衔接");

const shortBlankAss = buildAss({
  id: "short-bookend-test",
  effectId: "rolling-focus-subtitle",
  aspectRatio: "16:9",
  duration: 3,
  segments: [{ id: "body", start: 0.2, end: 2.8, text: "正文内容" }],
  bookends: {
    intro: { enabled: true, preset: "custom", text: "不应出现的片头" },
    outro: { enabled: true, preset: "custom", text: "不应出现的片尾" },
  },
});
assert.doesNotMatch(shortBlankAss, /不应出现的片头|不应出现的片尾/u, "留白不足时不得挤占正文强行显示片头片尾");

const compactOutroAss = buildAss({
  id: "compact-outro-test",
  effectId: "rolling-focus-subtitle",
  aspectRatio: "16:9",
  duration: 3,
  segments: [{ id: "body", start: 0, end: 2.72, text: "正文内容" }],
  bookends: {
    outro: { enabled: true, preset: "custom", text: "关注我，下期继续" },
  },
});
assert.match(compactOutroAss, /关注我，下期继续/u, "结尾留白约 0.28 秒时必须启用短结尾模式");

for (const template of KINETIC_TEXT_EFFECTS) {
  for (const aspectRatio of ["9:16", "16:9"]) {
    const ass = buildAss({ id: "test", effectId: template.id, effectParams: template.defaultParams, aspectRatio, duration: 2.6, text: segments.map((item) => item.text).join(""), wordTimeline: words, segments, showBottomSubtitles: false });
    assert.match(ass, new RegExp(`PlayResX: ${aspectRatio === "9:16" ? 1080 : 1920}`));
    assert.match(ass, new RegExp(`PlayResY: ${aspectRatio === "9:16" ? 1920 : 1080}`));
    assert.match(ass, /Dialogue:/, `${template.id} 必须产生正式 ASS event`);
    assert.equal(/NaN|undefined/.test(ass), false, `${template.id} 不得产生无效数值`);
    if (template.id === "rolling-focus-subtitle") {
      assert.match(ass, /▶/u, "滚动聚焦大字字幕必须包含当前句三角标记");
      assert.match(ass, /\\an4/u, "滚动聚焦大字字幕必须使用左对齐锚点");
      assert.match(ass, /\\move\([^)]*,0,220\)/u, "滚动聚焦大字字幕默认切换时长必须为 220ms");
      assert.match(ass, /\\bord0\\shad0/u, "滚动聚焦大字字幕不得使用描边和阴影");
    }
  }

  const dir = path.join("subtitle-templates", template.id);
  for (const name of ["index.ts", "Template.tsx", "defaultConfig.ts", "metadata.ts", "preview.mp4", "preview.png", "preview-9x16.mp4", "preview-16x9.mp4", "SOURCE.md"]) {
    assert.equal(fs.existsSync(path.join(dir, name)), true, `${template.id} 缺少 ${name}`);
  }
  assert.equal(fs.statSync(path.join(dir, "preview.mp4")).size > 10_000, true, `${template.id} preview.mp4 无效`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "subtitle-template-test-"));
const service = createKineticTextService({ baseDir: tempRoot, downloadsDir: path.join(tempRoot, "downloads"), ffmpegPath, ffprobePath: ffprobeStatic.path, modelRouter: null });
const created = await service.create({
  aspectRatio: "9:16",
  effectId: "rolling-focus-subtitle",
  tts: {
    id: 20260715,
    alignment_status: "confirmed",
    final_text: segments.map((segment) => segment.text).join(""),
    duration: 2.6,
    sentence_timeline: segments.map(({ keywords, ...segment }) => segment),
    word_timeline: words,
  },
});
assert.equal(created.wordTimeline.length, words.length, "确认后的 TTS wordTimeline 必须原样进入字幕项目");
assert.equal(created.showBottomSubtitles, true, "new projects must enable bottom keyword subtitles by default");
assert.equal(created.segments.every((segment) => segment.words.length > 0), true, "逐词时间必须附着到对应句段");
assert.equal(created.segments.every((segment) => segment.keywords.length === 1), true, "十字以内的字幕必须只生成一个完整重点词");
assert.deepEqual(created.segments.map(({ start, end }) => [start, end]), segments.map(({ start, end }) => [start, end]), "自动识别重点词不得改变字幕时间戳");
assert.equal(created.bookends.intro.enabled, false, "旧项目默认不得擅自添加片头");
assert.equal(created.bookends.outro.enabled, false, "旧项目默认不得擅自添加片尾");
assert.equal(created.bookendWindows.basis, "video-visual-timeline", "片头片尾留白必须按视频画面正文字幕占位判断，不得按语音静音判断");
assert.equal(created.aspectRatio, "9:16");
assert.equal(effectById(created.effectId).id, "rolling-focus-subtitle");

const cleanedKeywords = await service.create({
  effectId: "rolling-focus",
  text: "那你听好，顺序搞反了，全白搭。",
  tts: {
    duration: 1.2,
    final_text: "那你听好，顺序搞反了，全白搭。",
    sentence_timeline: [{
      id: "clean-keywords",
      start: 0,
      end: 1.2,
      text: "那你听好，顺序搞反了，全白搭。",
      keywords: ["不存在", "顺序", "顺序搞反", "那你听好顺序搞反了全白搭"],
    }],
  },
});
assert.deepEqual(cleanedKeywords.segments[0].keywords, ["顺序"], "必须删除原文不存在、整句和相互重叠的错误关键词");
assert.deepEqual(
  cleanedKeywords.segments.map(({ start, end }) => [start, end]),
  [[0, 1.2]],
  "清洗关键词不得改变字幕时间戳",
);

const localKeywordProject = await service.create({
  effectId: "rolling-focus",
  duration: 4,
  text: "不学音标，单词背再多也念不准。那你听好——顺序搞反了，全白搭。第二，单词。单词再。",
  segments: [
    { id: "kw-1", start: 0, end: 1, text: "不学音标，单词背再多也念不准。" },
    { id: "kw-2", start: 1, end: 2, text: "那你听好——顺序搞反了，全白搭。" },
    { id: "kw-3", start: 2, end: 3, text: "第二，单词。" },
    { id: "kw-4", start: 3, end: 4, text: "单词再。" },
  ],
});
assert.deepEqual(localKeywordProject.segments.map((segment) => segment.keywords), [
  ["音标", "念不准"],
  ["顺序", "搞反"],
  ["单词"],
  ["单词"],
], "本地分词必须选择完整词和自然结果词组，不得机械拼字");
assert.equal(localKeywordProject.segments.flatMap((segment) => segment.keywords).includes("不学音标"), false, "不得把完整分句当关键词");
assert.equal(localKeywordProject.segments.flatMap((segment) => segment.keywords).includes("单词背再"), false, "不得生成非自然拼接词组");
const localReanalyzed = await service.analyze(localKeywordProject.id, "deepseek", { keywordsOnly: true });
assert.equal(localReanalyzed.aiUsed, false, "重新识别关键词不得调用付费 AI");
assert.equal(localReanalyzed.provider, "local-intl-segmenter", "关键词必须由本地中文分词器生成");
assert.deepEqual(localReanalyzed.project.segments.map((segment) => segment.keywords), localKeywordProject.segments.map((segment) => segment.keywords), "本地重识别结果必须稳定一致");

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log(`subtitle templates ok: ${KINETIC_TEXT_EFFECTS.length} templates, 2 aspect ratios, confirmed word timeline preserved`);
