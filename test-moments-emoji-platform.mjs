import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.resolve(process.env.MOMENTS_EMOJI_PLATFORM_DIR || path.join(ROOT, ".data", "repair-evidence", "03.06", "manual"));
const fixturePath = path.join(ROOT, "fixtures", "moments-emoji-audit", "input.json");
const serverPath = path.join(ROOT, "ui-server.mjs");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const serverSource = fs.readFileSync(serverPath, "utf8");
const start = serverSource.indexOf("function stripMomentsEmoji");
const end = serverSource.indexOf("function momentsCopyPasteReady", start);
if (start < 0 || end < 0) throw new Error("未找到朋友圈静态表情实现代码块");

const context = vm.createContext({ Intl });
vm.runInContext(`${serverSource.slice(start, end)}\n;globalThis.platformApi = { MOMENTS_CROSS_PLATFORM_EMOJIS, applyPresetMomentsEmojis };`, context);
const api = context.platformApi;
const staticLibrary = [...api.MOMENTS_CROSS_PLATFORM_EMOJIS];
const sample = api.applyPresetMomentsEmojis(fixture.cases[1].paragraphs.join("\n\n"), "professional", "auto");
const replacementPattern = /\uFFFD/u;
const privateUsePattern = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;

if (staticLibrary.length < 40) throw new Error(`跨平台静态表情数量异常：${staticLibrary.length}`);
for (const emoji of staticLibrary) {
  const codePoints = [...emoji].map((character) => character.codePointAt(0));
  if (replacementPattern.test(emoji)) throw new Error(`静态表情含替换字符：${emoji}`);
  if (privateUsePattern.test(emoji)) throw new Error(`静态表情含私用区字符：${emoji}`);
  if (emoji.includes("\u200D")) throw new Error(`静态表情含 ZWJ：${emoji}`);
  if (codePoints.some((value) => value >= 0x1f1e6 && value <= 0x1f1ff)) throw new Error(`静态表情含旗帜区域指示符：${emoji}`);
}

const jsonText = JSON.stringify({ sample, staticLibrary });
const utf8Bytes = Buffer.from(jsonText, "utf8");
const fatalDecoded = new TextDecoder("utf-8", { fatal: true }).decode(utf8Bytes);
if (fatalDecoded !== jsonText || JSON.stringify(JSON.parse(fatalDecoded)) !== jsonText) {
  throw new Error("表情在 UTF-8/JSON 往返后发生变化");
}

const windowsEmojiFont = "C:\\Windows\\Fonts\\seguiemj.ttf";
if (process.platform === "win32" && !fs.existsSync(windowsEmojiFont)) throw new Error("Windows 缺少 Segoe UI Emoji 字体");
const fontInfo = process.platform === "win32"
  ? {
      path: windowsEmojiFont,
      size: fs.statSync(windowsEmojiFont).size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(windowsEmojiFont)).digest("hex").toUpperCase(),
    }
  : null;

const browserCandidates = [
  { name: "chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", port: 9225 },
  { name: "edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", port: 9226 },
].filter((entry) => fs.existsSync(entry.path));
if (!browserCandidates.length) throw new Error("未找到可用于跨平台验证的 Chrome/Edge");

async function chord(page, key, code, virtualKey) {
  await page._send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    modifiers: 2,
    key,
    code,
    windowsVirtualKeyCode: virtualKey,
    nativeVirtualKeyCode: virtualKey,
  });
  await page._send("Input.dispatchKeyEvent", {
    type: "keyUp",
    modifiers: 2,
    key,
    code,
    windowsVirtualKeyCode: virtualKey,
    nativeVirtualKeyCode: virtualKey,
  });
}

async function auditBrowser(candidate) {
  let browser;
  try {
    console.log(`[platform-audit] ${candidate.name}: launch`);
    browser = new BrowserCDP({ executablePath: candidate.path, debuggingPort: candidate.port });
    await browser.launch();
    const version = await (await fetch(`http://127.0.0.1:${candidate.port}/json/version`)).json();
    const page = await browser.newPage("http://127.0.0.1:8787/#moments-copy");
    await page.waitForSelector("#runtimeVersionBadge", 15000);
    await page.waitForFunction("document.readyState === 'complete' && typeof navigateWorkbench === 'function'", 15000);
    await page.click('[data-nav="moments-copy"]');
    await page.waitForFunction('!!document.querySelector(\'[data-page="moments-copy"].active\')', 10000);
    console.log(`[platform-audit] ${candidate.name}: moments page ready`);

    const desktop = await page.evaluate(`(function(){
      const sample = ${JSON.stringify(sample)};
      const library = ${JSON.stringify(staticLibrary)};
      const output = document.querySelector('#momentsPostOutput');
      output.value = sample;
      output.dispatchEvent(new Event('input', { bubbles: true }));
      let source = document.querySelector('#wechatCompatSource');
      let target = document.querySelector('#wechatCompatTarget');
      if (!source) {
        const probe = document.createElement('section');
        probe.id = 'wechatCompatProbe';
        probe.style.cssText = 'position:fixed;z-index:99999;left:16px;right:16px;bottom:16px;padding:12px;background:#101722;border:1px solid #6f5cff;border-radius:10px';
        probe.innerHTML = '<strong style="display:block;color:white;margin-bottom:6px">微信兼容复制验证</strong><textarea id="wechatCompatSource" rows="3" style="width:48%;margin-right:2%"></textarea><textarea id="wechatCompatTarget" rows="3" style="width:48%"></textarea>';
        document.body.appendChild(probe);
        source = probe.querySelector('#wechatCompatSource');
        target = probe.querySelector('#wechatCompatTarget');
      }
      source.value = sample;
      target.value = '';
      const fontFamily = getComputedStyle(output).fontFamily;
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 80;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      function raster(value) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '48px ' + fontFamily;
        ctx.textBaseline = 'top';
        ctx.fillText(value, 4, 4);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let visiblePixels = 0;
        let hash = 2166136261;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3] > 0) visiblePixels += 1;
          hash ^= data[index]; hash = Math.imul(hash, 16777619);
          hash ^= data[index + 1]; hash = Math.imul(hash, 16777619);
          hash ^= data[index + 2]; hash = Math.imul(hash, 16777619);
          hash ^= data[index + 3]; hash = Math.imul(hash, 16777619);
        }
        return { visiblePixels, hash: hash >>> 0 };
      }
      const replacement = raster('�');
      const glyphs = library.map((emoji) => ({ emoji, ...raster(emoji) }));
      return {
        outputExact: output.value === sample,
        fontFamily,
        fontChecks: {
          segoe: document.fonts.check('21px "Segoe UI Emoji"', sample),
          apple: document.fonts.check('21px "Apple Color Emoji"', sample),
          noto: document.fonts.check('21px "Noto Color Emoji"', sample),
        },
        replacement,
        glyphs,
        hasReplacementCharacter: document.body.innerText.includes('�'),
        metaCharset: document.characterSet,
      };
    })()`);

    await page.click("#wechatCompatSource");
    await chord(page, "a", "KeyA", 65);
    await chord(page, "c", "KeyC", 67);
    await page.click("#wechatCompatTarget");
    await chord(page, "v", "KeyV", 86);
    await page.waitForFunction(`document.querySelector('#wechatCompatTarget')?.value === ${JSON.stringify(sample)}`, 5000);
    desktop.copyPasteExact = await page.evaluate(`document.querySelector('#wechatCompatTarget')?.value === ${JSON.stringify(sample)}`);
    fs.mkdirSync(path.join(evidenceDir, "browser"), { recursive: true });
    await page.screenshot(path.join(evidenceDir, "browser", `${candidate.name}-desktop-copy.png`));

    await page._send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    });
    const mobile = await page.evaluate(`(function(){
      const output = document.querySelector('#momentsPostOutput');
      output.scrollIntoView({ block: 'center' });
      const rect = output.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        outputExact: output.value === ${JSON.stringify(sample)},
        fontFamily: getComputedStyle(output).fontFamily,
        rect: { left: rect.left, right: rect.right, width: rect.width },
        fitsViewport: rect.left >= -1 && rect.right <= innerWidth + 1,
        hasReplacementCharacter: output.value.includes('�'),
      };
    })()`);
    await page.screenshot(path.join(evidenceDir, "browser", `${candidate.name}-mobile-copy.png`));
    return { name: candidate.name, executable: candidate.path, version, desktop, mobile };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

const browsers = [];
for (const candidate of browserCandidates) browsers.push(await auditBrowser(candidate));

const result = {
  generatedAt: new Date().toISOString(),
  status: "captured-before-assertions",
  platform: { platform: process.platform, release: os.release(), arch: process.arch },
  fixturePath,
  fixtureSha256: crypto.createHash("sha256").update(fs.readFileSync(fixturePath)).digest("hex").toUpperCase(),
  staticLibrary: staticLibrary.map((emoji) => ({
    emoji,
    codePoints: [...emoji].map((character) => `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`),
  })),
  utf8: { byteLength: utf8Bytes.length, roundTripExact: true, containsReplacementCharacter: replacementPattern.test(fatalDecoded) },
  windowsEmojiFont: fontInfo,
  browsers,
};
fs.mkdirSync(path.join(evidenceDir, "tests"), { recursive: true });
const reportPath = path.join(evidenceDir, "tests", "moments-emoji-platform.json");
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

const requiredFontNames = ["Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"];
for (const browser of browsers) {
  for (const name of requiredFontNames) {
    if (!browser.desktop.fontFamily.includes(name)) throw new Error(`${browser.name} 最终文案框缺少跨平台字体：${name}`);
    if (!browser.mobile.fontFamily.includes(name)) throw new Error(`${browser.name} 移动视口最终文案框缺少跨平台字体：${name}`);
  }
  if (browser.desktop.metaCharset.toUpperCase() !== "UTF-8") throw new Error(`${browser.name} 页面不是 UTF-8`);
  if (!browser.desktop.outputExact || !browser.desktop.copyPasteExact) throw new Error(`${browser.name} 兼容输入框复制粘贴发生变化`);
  if (!browser.mobile.outputExact || browser.mobile.hasReplacementCharacter || !browser.mobile.fitsViewport) {
    throw new Error(`${browser.name} 移动视口显示验证失败：${JSON.stringify(browser.mobile)}`);
  }
  const missingGlyphs = browser.desktop.glyphs.filter((entry) => entry.visiblePixels === 0 || entry.hash === browser.desktop.replacement.hash);
  if (missingGlyphs.length) throw new Error(`${browser.name} 检测到缺字：${missingGlyphs.map((entry) => entry.emoji).join(" ")}`);
}

result.status = "passed";
fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`Moments emoji platform audit: OK (${staticLibrary.length} emoji x ${browsers.length} browsers)`);
console.log(`Evidence: ${reportPath}`);
