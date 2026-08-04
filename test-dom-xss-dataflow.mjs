import fs from "node:fs";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const BASE = "http://127.0.0.1:8787";
const EVIDENCE_FILE = String(process.env.BROWSER_EVIDENCE_FILE || "").trim();
let browser;
let page;

try {
  browser = new BrowserCDP({ debuggingPort: 9231 });
  await browser.launch();
  page = await browser.newPage(BASE);
  await page.waitForSelector("#runtimeVersionBadge", 15000);

  const result = await page.evaluate(`(async function(){
    window.__domXssExecuted = 0;
    const host = document.createElement('section');
    host.id = 'dom-xss-fixture';
    document.body.appendChild(host);
    host.innerHTML = [
      '<img id="xss-image" src="/definitely-missing-xss.png" onerror="window.__domXssExecuted += 1">',
      '<a id="xss-link" href="javascript:window.__domXssExecuted += 10">恶意标题</a>',
      '<iframe id="xss-frame" srcdoc="<script>parent.__domXssExecuted += 100<\\/script>"></iframe>',
      '<div id="safe-user-text">用户文件名：&lt;正常展示&gt;</div>'
    ].join('');
    host.insertAdjacentHTML('beforeend', '<svg><foreignObject><img src="x" onerror="window.__domXssExecuted += 1000"></foreignObject></svg>');
    document.querySelector('#xss-link')?.click();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const dangerousAttributes = [...host.querySelectorAll('*')].flatMap((node) =>
      [...node.attributes].filter((attr) => /^on/i.test(attr.name) || /^(?:javascript|vbscript|data:text\\/html)/i.test(attr.value.trim()))
        .map((attr) => node.tagName + ':' + attr.name + '=' + attr.value)
    );
    const evidence = {
      executed: window.__domXssExecuted,
      dangerousAttributes,
      scriptCount: host.querySelectorAll('script').length,
      iframeCount: host.querySelectorAll('iframe').length,
      foreignObjectCount: host.querySelectorAll('foreignObject').length,
      safeText: host.querySelector('#safe-user-text')?.textContent || ''
    };
    host.remove();
    return evidence;
  })()`);

  if (EVIDENCE_FILE) {
    fs.writeFileSync(EVIDENCE_FILE, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  if (result.executed !== 0) throw new Error(`恶意 DOM 已执行：${JSON.stringify(result)}`);
  if (result.dangerousAttributes.length || result.scriptCount || result.iframeCount || result.foreignObjectCount) {
    throw new Error(`危险 DOM 未清除：${JSON.stringify(result)}`);
  }
  if (result.safeText !== "用户文件名：<正常展示>") throw new Error(`合法文本被破坏：${JSON.stringify(result)}`);

  const navigation = await page.evaluate(`(async function(){
    const pages = ['dashboard', 'collector', 'rewrite', 'moments-copy', 'tts', 'voices', 'cs1-video', 'xiaohei-video', 'money-printer', 'kinetic-text', 'files', 'settings'];
    const failures = [];
    for (const pageId of pages) {
      const button = document.querySelector('[data-nav="' + pageId + '"]');
      if (!button) { failures.push(pageId + ':导航缺失'); continue; }
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (!document.querySelector('[data-page="' + pageId + '"].active')) failures.push(pageId + ':未激活');
    }
    const xiaoheiFrame = document.querySelector('[data-page="xiaohei-video"] iframe');
    return {
      ok: failures.length === 0,
      failures,
      xiaoheiIframe: xiaoheiFrame ? { src: xiaoheiFrame.getAttribute('src') || '', srcdoc: xiaoheiFrame.hasAttribute('srcdoc') } : null
    };
  })()`);
  if (!navigation.ok) throw new Error(`统一防线导致页面导航回归：${JSON.stringify(navigation)}`);
  if (navigation.xiaoheiIframe?.srcdoc) throw new Error(`小黑 iframe 错误使用 srcdoc：${JSON.stringify(navigation)}`);

  const imageActions = await page.evaluate(`(async function(){
    const grid = document.querySelector('#imageResultsGrid');
    const prompt = document.querySelector('#imagePrompt');
    const generate = document.querySelector('#imageGenerateBtn');
    if (!grid || !prompt || !generate) return { applicable: false, reason: '当前发布页面没有图片工作台模块' };
    const originalFetch = window.fetch;
    const originalOpen = window.open;
    let generated = 0;
    let deletedUrl = '';
    let openedUrl = '';
    generate.addEventListener('click', (event) => {
      generated += 1;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, once: true });
    window.fetch = async (url) => {
      deletedUrl = String(url);
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    window.open = (url) => { openedUrl = String(url); return null; };
    try {
      grid.innerHTML = '<div class="img-card"><button data-image-action="retry" data-image-prompt="合法提示词">重试</button><button data-image-action="open" data-image-url="/api/image/file?id=safe">预览</button><button data-image-action="delete" data-image-asset-id="asset-safe">删除</button></div>';
      grid.querySelector('[data-image-action="retry"]').click();
      grid.querySelector('[data-image-action="open"]').click();
      grid.querySelector('[data-image-action="delete"]').click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        applicable: true,
        ok: prompt.value === '合法提示词' && generated === 1 && openedUrl === '/api/image/file?id=safe' && deletedUrl.endsWith('/api/image/assets/asset-safe/delete') && !grid.querySelector('.img-card'),
        prompt: prompt.value,
        generated,
        openedUrl,
        deletedUrl,
        cardRemoved: !grid.querySelector('.img-card')
      };
    } finally {
      window.fetch = originalFetch;
      window.open = originalOpen;
      grid.innerHTML = '';
    }
  })()`);
  if (imageActions.applicable && !imageActions.ok) throw new Error(`清除内联事件后图片按钮功能回归：${JSON.stringify(imageActions)}`);

  const source = fs.readFileSync(new URL("./ui/workbench.js", import.meta.url), "utf8");
  if (/\son(?:click|error|load|change|input)=/iu.test(source)) throw new Error("workbench 仍包含内联事件处理器");
  console.log(`DOM XSS browser dataflow: OK ${JSON.stringify(result)}`);
} finally {
  if (browser) await browser.close().catch(() => {});
}
