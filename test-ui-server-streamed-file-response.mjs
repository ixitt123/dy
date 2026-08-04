import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { Writable } from "node:stream";

const source = fs.readFileSync(new URL("./ui-server.mjs", import.meta.url), "utf8");
const start = source.indexOf("async function sendFileAttachment");
const end = source.indexOf("function localApiPort", start);
assert.ok(start >= 0 && end > start, "file response helper must be available");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "douyin-stream-response-"));
const filePath = path.join(tempDir, "preview.png");
fs.writeFileSync(filePath, Buffer.alloc(1024 * 1024, 7));
let headers = null;
let bytes = 0;
const response = new Writable({ write(chunk, encoding, callback) { bytes += chunk.length; callback(); } });
response.writeHead = (_status, value) => { headers = value; };

try {
  const context = vm.createContext({ fs, path, mimeTypes: new Map([[".png", "image/png"]]) });
  vm.runInContext(`${source.slice(start, end)}; globalThis.sendFileAttachment = sendFileAttachment;`, context);
  await context.sendFileAttachment(response, filePath, "preview.png", { attachment: false, contentType: "image/png" });
  await new Promise((resolve) => response.once("finish", resolve));
  assert.equal(headers["content-type"], "image/png");
  assert.equal(headers["content-disposition"], undefined, "inline preview must not be forced into attachment mode");
  assert.equal(bytes, 1024 * 1024);
  let downloadHeaders = null;
  let downloadBytes = 0;
  const downloadResponse = new Writable({ write(chunk, encoding, callback) { downloadBytes += chunk.length; callback(); } });
  downloadResponse.writeHead = (_status, value) => { downloadHeaders = value; };
  await context.sendFileAttachment(downloadResponse, filePath, "预览.png");
  await new Promise((resolve) => downloadResponse.once("finish", resolve));
  assert.match(downloadHeaders["content-disposition"], /^attachment;/);
  assert.match(downloadHeaders["content-disposition"], /%E9%A2%84%E8%A7%88\.png/);
  assert.equal(downloadBytes, 1024 * 1024);
  console.log("UI server streamed file response: OK");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
