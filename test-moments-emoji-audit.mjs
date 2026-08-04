import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(process.env.MOMENTS_EMOJI_AUDIT_DIR || path.join(ROOT, ".data", "repair-evidence", "03.01", "manual"));
const fixturePath = path.join(ROOT, "fixtures", "moments-emoji-audit", "input.json");
const serverPath = path.join(ROOT, "ui-server.mjs");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const serverSource = fs.readFileSync(serverPath, "utf8");
const start = serverSource.indexOf("function stripMomentsEmoji");
const end = serverSource.indexOf("function momentsCopyPasteReady", start);
if (start < 0 || end < 0) throw new Error("未找到朋友圈静态表情实现代码块");

const context = vm.createContext({ Intl });
vm.runInContext(`${serverSource.slice(start, end)}\n;globalThis.auditApi = { MOMENTS_EMOJI_STYLES, MOMENTS_EMOJI_COUNT_OPTIONS, MOMENTS_CROSS_PLATFORM_EMOJIS, normalizeMomentsEmojiCount, momentsEmojiTargetCount, applyPresetMomentsEmojis, countMomentsEmoji };`, context);
const api = context.auditApi;
const styles = Object.keys(api.MOMENTS_EMOJI_STYLES);
const countModes = Object.keys(api.MOMENTS_EMOJI_COUNT_OPTIONS);
if (countModes.length !== 1 || countModes[0] !== "auto") {
  throw new Error(`服务端仍暴露冲突数量模式：${countModes.join(",")}`);
}
for (const legacyMode of ["3-5", "5-10", "unexpected"]) {
  if (api.normalizeMomentsEmojiCount(legacyMode) !== "auto") throw new Error(`旧数量值 ${legacyMode} 未回退 auto`);
}
const staticLibrary = [...api.MOMENTS_CROSS_PLATFORM_EMOJIS].map((emoji) => ({
  emoji,
  codePoints: [...emoji].map((character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`),
}));
for (const entry of staticLibrary) {
  const codePoints = [...entry.emoji].map((character) => character.codePointAt(0));
  if (entry.emoji.includes("\u200D")) throw new Error(`静态表情含 ZWJ：${entry.emoji}`);
  if (codePoints.some((value) => value >= 0x1f1e6 && value <= 0x1f1ff)) throw new Error(`静态表情含旗帜区域指示符：${entry.emoji}`);
  if (codePoints.some((value) => value >= 0xe000 && value <= 0xf8ff || value >= 0xf0000 && value <= 0xffffd || value >= 0x100000 && value <= 0x10fffd)) {
    throw new Error(`静态表情含私用区字符：${entry.emoji}`);
  }
}
const staticResults = [];

for (const item of fixture.cases) {
  const input = item.paragraphs.join("\n\n");
  const target = api.momentsEmojiTargetCount(input, "auto");
  if (target !== item.expectedAutoCount) {
    throw new Error(`${item.id} 智能数量应为 ${item.expectedAutoCount}，实际 ${target}`);
  }
  const outputs = [];
  for (const style of styles) {
    const output = api.applyPresetMomentsEmojis(input, style, "auto");
    const count = api.countMomentsEmoji(output);
    if (count !== target) throw new Error(`${item.id}/${style} 表情数应为 ${target}，实际 ${count}`);
    const used = Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(output))
      .map(({ segment }) => segment)
      .filter((segment) => api.MOMENTS_CROSS_PLATFORM_EMOJIS.has(segment));
    if (used.some((emoji) => emoji.includes("\u200D"))) throw new Error(`${item.id}/${style} 含 ZWJ 组合`);
    const missingSignatures = api.MOMENTS_EMOJI_STYLES[style].signature.filter((emoji) => !used.includes(emoji));
    if (missingSignatures.length) throw new Error(`${item.id}/${style} 未优先使用风格签名：${missingSignatures.join(" ")}`);
    outputs.push({ style, count, used, output });
  }
  if (new Set(outputs.map((entry) => entry.used.join(" "))).size !== styles.length) {
    throw new Error(`${item.id} 的四种表情风格没有形成可验证差异`);
  }
  staticResults.push({ id: item.id, target, outputs });
}

let browser;
let page;
let browserState;
try {
  browser = new BrowserCDP({ debuggingPort: 9224 });
  await browser.launch();
  page = await browser.newPage("http://127.0.0.1:8787");
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.clickDom('[data-nav="moments-copy"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="moments-copy"].active\')', 10000);
  browserState = await page.evaluate(`(async function(){
    const mode = document.querySelector('#momentsEmojiMode');
    const style = document.querySelector('#momentsEmojiStyle');
    const count = document.querySelector('#momentsEmojiCount');
    const palette = document.querySelector('#momentsEmojiPalette');
    const initial = { mode: mode?.value, styleDisabled: style?.disabled, countDisabled: count?.disabled, paletteHidden: palette?.hidden };
    mode.value = 'yes';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const previews = {};
    for (const value of ['gentle', 'lively', 'professional', 'warm']) {
      style.value = value;
      style.dispatchEvent(new Event('change', { bubbles: true }));
      previews[value] = document.querySelector('#momentsEmojiPalettePreview')?.textContent || '';
    }
    count.value = 'auto';
    count.dispatchEvent(new Event('change', { bubbles: true }));
    const originalFetch = window.fetch.bind(window);
    const capturedPayloads = [];
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : String(input?.url || input || '');
      if (url === '/api/moments/generate') {
        const payload = JSON.parse(String(init.body || '{}'));
        capturedPayloads.push(payload);
        return new Response(JSON.stringify({ ok: true, result: { post: payload.text, image_count: 1, images: [{ title: '审计图', prompt: '审计占位提示词' }], add_emoji: true, emoji_style: payload.emojiStyle, emoji_count: payload.emojiCount } }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
    document.querySelector('#momentsCopyInput').value = '今天复盘学习计划，先把目标拆小，再认真完成每一步。';
    document.querySelector('#momentsImageCount').value = '1';
    const generateButton = document.querySelector('#generateOriginalMomentsPost');
    for (const value of ['gentle', 'lively', 'professional', 'warm']) {
      style.value = value;
      style.dispatchEvent(new Event('change', { bubbles: true }));
      generateButton.click();
      const deadline = Date.now() + 5000;
      while ((capturedPayloads.length < ['gentle', 'lively', 'professional', 'warm'].indexOf(value) + 1 || generateButton.disabled) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    window.fetch = originalFetch;
    const copyProbe = document.createElement('textarea');
    copyProbe.id = 'momentsEmojiCopyProbe';
    copyProbe.value = ${JSON.stringify(staticResults[1].outputs.find((entry) => entry.style === "professional").output)};
    document.querySelector('#momentsCopyPage').appendChild(copyProbe);
    return {
      initial,
      enabled: { styleDisabled: style.disabled, countDisabled: count.disabled, paletteHidden: palette.hidden },
      styles: Array.from(style.options).map((option) => option.value),
      counts: Array.from(count.options).map((option) => option.value),
      previews,
      capturedPayloads,
      copyProbeExact: copyProbe.value === ${JSON.stringify(staticResults[1].outputs.find((entry) => entry.style === "professional").output)},
    };
  })()`);
  if (browserState.initial.mode !== "no" || !browserState.initial.styleDisabled || !browserState.initial.countDisabled) throw new Error("表情控件默认状态不正确");
  if (browserState.enabled.styleDisabled || browserState.enabled.countDisabled || browserState.enabled.paletteHidden) throw new Error("启用表情后风格/数量控件未生效");
  if (browserState.counts.length !== 1 || browserState.counts[0] !== "auto") throw new Error(`页面仍暴露冲突数量模式：${browserState.counts.join(",")}`);
  if (new Set(Object.values(browserState.previews)).size !== 4) throw new Error("浏览器四种风格预览没有差异");
  for (const styleName of styles) {
    const preview = browserState.previews[styleName] || "";
    const missingSignatures = api.MOMENTS_EMOJI_STYLES[styleName].signature.filter((emoji) => !preview.includes(emoji));
    if (missingSignatures.length) throw new Error(`页面 ${styleName} 预览与服务端签名不一致：${missingSignatures.join(" ")}`);
  }
  if (browserState.capturedPayloads?.length !== styles.length) throw new Error(`页面只提交了 ${browserState.capturedPayloads?.length || 0}/${styles.length} 种风格`);
  for (let index = 0; index < styles.length; index += 1) {
    const payload = browserState.capturedPayloads[index];
    if (payload?.addEmoji !== "yes" || payload?.emojiStyle !== styles[index] || payload?.emojiCount !== "auto") {
      throw new Error(`第 ${index + 1} 次页面表情选择没有进入生成 payload：${JSON.stringify(payload)}`);
    }
  }
  if (!browserState.copyProbeExact) throw new Error("Unicode 表情复制到兼容输入框后内容变化");
  const originalMomentsDraft = await page.evaluate(`(function(){
    const key = 'video-factory:moments-draft-v1';
    const original = localStorage.getItem(key);
    localStorage.setItem(key, JSON.stringify({
      text: '旧草稿数量兼容验证',
      addEmoji: 'yes',
      emojiStyle: 'warm',
      emojiCount: '5-10',
      imageCount: '1'
    }));
    return original;
  })()`);
  await page.reload();
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  await page.clickDom('[data-nav="moments-copy"]');
  await page.waitForFunction('!!document.querySelector(\'[data-page="moments-copy"].active\')', 10000);
  browserState.legacyDraftFallback = await page.evaluate(`(function(){
    const count = document.querySelector('#momentsEmojiCount');
    return {
      mode: document.querySelector('#momentsEmojiMode')?.value || '',
      style: document.querySelector('#momentsEmojiStyle')?.value || '',
      count: count?.value || '',
      countOptions: Array.from(count?.options || []).map((option) => option.value),
      text: document.querySelector('#momentsCopyInput')?.value || '',
    };
  })()`);
  if (browserState.legacyDraftFallback.count !== "auto" || browserState.legacyDraftFallback.countOptions.join(",") !== "auto") {
    throw new Error(`旧草稿数量没有回退 auto：${JSON.stringify(browserState.legacyDraftFallback)}`);
  }
  fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
  await page.screenshot(path.join(evidenceDir, "browser", "moments-emoji-audit.png"));
  await page.evaluate(`(function(){
    const key = 'video-factory:moments-draft-v1';
    const original = ${JSON.stringify(originalMomentsDraft)};
    if (original === null) localStorage.removeItem(key);
    else localStorage.setItem(key, original);
    return true;
  })()`);
} finally {
  if (browser) await browser.close().catch(() => {});
}

const result = {
  fixturePath,
  serverPath,
  styles,
  countModes,
  staticLibrary,
  staticResults,
  browserState,
  observedConflict: "none",
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "tests", "moments-emoji-audit.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`Moments emoji audit: OK (${fixture.cases.length} lengths x ${styles.length} styles)`);
console.log(`Evidence: ${path.join(evidenceDir, "tests", "moments-emoji-audit.json")}`);
