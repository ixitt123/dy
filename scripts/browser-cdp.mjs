// scripts/browser-cdp.mjs
//
// 真实浏览器 CDP（Chrome DevTools Protocol）客户端封装。
// 直接启动系统 Chrome（headless），通过 CDP WebSocket 操控页面。
// 不依赖 puppeteer / playwright，避免在受限环境下载浏览器二进制。
//
// 用途（01.02 / 01.04）：
//   - 启动真实 Chrome 浏览器上下文；
//   - 操作页面（导航、点击、刷新、切换任务）；
//   - 等待异步恢复（waitForFunction / waitForSelector）；
//   - 检查播放器控件是否可见；
//   - 为 test-browser-*.mjs 提供底座。
//
// 这是“真实浏览器测试”的基础设施，不是模拟，不是源码字符串检查。

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const DEFAULT_CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function findBrowserPath() {
  for (const p of DEFAULT_CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("未找到 Chrome/Edge 可执行文件，请安装或手动指定 executablePath");
}

let _seq = 0;

export class BrowserCDP {
  constructor(options = {}) {
    this.executablePath = options.executablePath || findBrowserPath();
    this.debuggingPort = options.debuggingPort || 9223;
    this.headless = options.headless !== false ? "new" : false;
    this.additionalArgs = Array.isArray(options.additionalArgs) ? options.additionalArgs : [];
    this.userDataDir = options.userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), "cdp-profile-"));
    this.chromeProcess = null;
    this.ws = null;
    this.browserWsUrl = null;
    this.pageTargets = new Map();
    this.pending = new Map();
  }

  async launch() {
    const args = [
      this.headless ? `--headless=${this.headless}` : "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-features=Translate,InterestFeedContentSuggestions",
      `--remote-debugging-port=${this.debuggingPort}`,
      `--user-data-dir=${this.userDataDir}`,
      ...this.additionalArgs,
      "about:blank",
    ];
    this.chromeProcess = spawn(this.executablePath, args, {
      stdio: "ignore",
      windowsHide: true,
    });

    await this._waitForPort(this.debuggingPort, 15000);
    const versionInfo = await this._httpJson(`http://127.0.0.1:${this.debuggingPort}/json/version`);
    this.browserWsUrl = versionInfo.webSocketDebuggerUrl;
    if (!this.browserWsUrl) throw new Error("CDP: 未拿到 webSocketDebuggerUrl");

    this.ws = new WebSocket(this.browserWsUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => this._onMessage(raw));
    return this;
  }

  async _waitForPort(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`CDP: 端口 ${port} 在 ${timeoutMs}ms 内未就绪`);
  }

  async _httpJson(url) {
    const res = await fetch(url);
    return res.json();
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`CDP 错误: ${JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    }
  }

  async _send(method, params = {}, sessionId = null) {
    const id = ++_seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      this.ws.send(JSON.stringify(msg));
    });
  }

  async newPage(url) {
    const { targetId } = await this._send("Target.createTarget", { url });
    const targetInfo = await this._attachTarget(targetId);
    return new PageCDP(this, targetId, targetInfo.sessionId);
  }

  async _attachTarget(targetId) {
    const { sessionId } = await this._send("Target.attachToTarget", { targetId, flatten: true });
    return { sessionId };
  }

  async close() {
    try {
      if (this.ws) { this.ws.close(); }
    } catch {}
    try {
      if (this.chromeProcess) {
        this.chromeProcess.kill("SIGTERM");
        await Promise.race([
          new Promise((resolve) => this.chromeProcess.once("exit", resolve)),
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]);
        if (this.chromeProcess.exitCode === null) this.chromeProcess.kill("SIGKILL");
      }
    } catch {}
    const resolvedTemp = path.resolve(os.tmpdir());
    const resolvedProfile = path.resolve(this.userDataDir || "");
    if (path.dirname(resolvedProfile) === resolvedTemp && path.basename(resolvedProfile).startsWith("cdp-profile-")) {
      for (let attempt = 0; attempt < 5 && fs.existsSync(resolvedProfile); attempt += 1) {
        try { fs.rmSync(resolvedProfile, { recursive: true, force: true }); } catch {}
        if (fs.existsSync(resolvedProfile)) await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
}

export class PageCDP {
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  async _send(method, params = {}) {
    return this.browser._send(method, params, this.sessionId);
  }

  async navigate(url) {
    await this._send("Page.enable");
    await this._send("Page.navigate", { url });
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this._send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(`JS 异常: ${exceptionDetails.text} ${exceptionDetails.exception?.description || ""}`);
    }
    return result?.value;
  }

  async setFileInputFiles(elementExpression, files) {
    const { result, exceptionDetails } = await this._send("Runtime.evaluate", {
      expression: elementExpression,
      awaitPromise: true,
      returnByValue: false,
    });
    if (exceptionDetails || !result?.objectId) {
      throw new Error(`setFileInputFiles: 没有找到文件输入框 ${exceptionDetails?.text || ""}`);
    }
    try {
      await this._send("DOM.setFileInputFiles", {
        files: files.map((file) => path.resolve(file)),
        objectId: result.objectId,
      });
    } finally {
      await this._send("Runtime.releaseObject", { objectId: result.objectId }).catch(() => {});
    }
  }

  async waitForFunction(expression, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    let lastErr = null;
    while (Date.now() < deadline) {
      try {
        const ok = await this.evaluate(`(function(){ try { return Boolean(${expression}); } catch(e){ return false; } })()`);
        if (ok) return true;
      } catch (e) { lastErr = e; }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`waitForFunction 超时 (${timeoutMs}ms): ${expression} ${lastErr ? lastErr.message : ""}`);
  }

  async waitForSelector(selector, timeoutMs = 10000) {
    return this.waitForFunction(
      `!!document.querySelector(${JSON.stringify(selector)})`,
      timeoutMs
    );
  }

  async click(selector) {
    let point = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      point = await this.evaluate(`(async function(){
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        // A page-navigation smooth scroll may still be running when a test asks
        // for a click. Cancel it, wait for layout to settle, then verify that the
        // measured point still belongs to the requested element.
        el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rect = el.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const x = rect.left + Math.min(rect.width / 2, Math.max(1, rect.width - 1));
        const y = rect.top + Math.min(rect.height / 2, Math.max(1, rect.height - 1));
        const hit = document.elementFromPoint(x, y);
        return {
          x,
          y,
          hit: Boolean(hit && (hit === el || el.contains(hit))),
          target: { tag: el.tagName, id: el.id || '', className: String(el.className || ''), disabled: Boolean(el.disabled) },
          top: hit ? { tag: hit.tagName, id: hit.id || '', className: String(hit.className || '') } : null,
        };
      })()`);
      if (point?.hit) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!point?.hit) throw new Error(`click: 未找到、不可点击或点击坐标未命中元素 ${selector} ${JSON.stringify(point)}`);
    await this._send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await this._send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  }

  async clickInFrame(frameSelector, selector) {
    const point = await this.evaluate(`(async function(){
      const frame = document.querySelector(${JSON.stringify(frameSelector)});
      const el = frame?.contentDocument?.querySelector(${JSON.stringify(selector)});
      if (!frame || !el) return null;
      el.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const frameRect = frame.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return {
        x: frameRect.left + rect.left + Math.min(rect.width / 2, Math.max(1, rect.width - 1)),
        y: frameRect.top + rect.top + Math.min(rect.height / 2, Math.max(1, rect.height - 1)),
        visible: Boolean(rect.width && rect.height),
        disabled: Boolean(el.disabled),
      };
    })()`);
    if (!point?.visible || point.disabled) {
      throw new Error(`clickInFrame: 未找到、不可见或已禁用 ${frameSelector} -> ${selector} ${JSON.stringify(point)}`);
    }
    await this._send("Input.dispatchMouseEvent", {
      type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1,
    });
    await this._send("Input.dispatchMouseEvent", {
      type: "mouseReleased", x: point.x, y: point.y, button: "left", buttons: 0, clickCount: 1,
    });
  }

  // 仅用于没有原生媒体手势要求的导航测试。媒体和业务操作应使用 click()，
  // 以保留 Chrome 认可的真实用户手势。
  async clickDom(selector) {
    const ok = await this.evaluate(`(function(){
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`clickDom: 未找到元素 ${selector}`);
  }

  async reload() {
    await this._send("Page.reload", {});
  }

  async screenshot(filePath) {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    await this._send("Page.enable");
    const { data } = await this._send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    if (!data) throw new Error("CDP: 截图没有返回图像数据");
    fs.writeFileSync(resolved, Buffer.from(data, "base64"));
    return resolved;
  }

  async getVisibleText(selector) {
    return this.evaluate(`(function(){
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
      return el.textContent || '';
    })()`);
  }

  async isVisible(selector) {
    const v = await this.getVisibleText(selector);
    return v !== null;
  }

  async close() {
    try { await this.browser._send("Target.closeTarget", { targetId: this.targetId }); } catch {}
  }
}
