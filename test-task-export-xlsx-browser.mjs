import assert from "node:assert/strict";
import { BrowserCDP } from "./scripts/browser-cdp.mjs";

const browser = new BrowserCDP({ debuggingPort: 9234 });
let page;

try {
  await browser.launch();
  page = await browser.newPage("http://127.0.0.1:8787");
  await page.waitForSelector("#runtimeVersionBadge", 15000);
  const result = await page.evaluate(`(async () => {
    const response = await fetch('/api/tasks/export?format=xlsx');
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      contentDisposition: response.headers.get('content-disposition') || '',
      bytes: bytes.length,
      magic: String.fromCharCode(...bytes.slice(0, 2)),
    };
  })()`);
  assert.equal(result.status, 200);
  assert.match(result.contentType, /spreadsheetml/);
  assert.match(result.contentDisposition, /\.xlsx/i);
  assert.ok(result.bytes > 4, "export must not be empty");
  assert.equal(result.magic, "PK");
  console.log(`Browser XLSX task export: OK (${result.bytes} bytes)`);
} finally {
  await browser.close();
}
