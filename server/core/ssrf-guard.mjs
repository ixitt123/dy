// server/core/ssrf-guard.mjs
//
// SSRF 防护工具（10.02）。
// 阻止服务端请求私网地址、localhost、链路本地地址和 CGNAT 地址；
// 防止 DNS 重绑定（解析域名后校验所有 IP）；
// 提供安全 fetch：手动跟随重定向（每跳校验）+ 限制响应体大小 + 超时。
//
// 用途：WebpageAdapter 等抓取用户可控 URL 的适配器必须在 fetch 前调用 assertSafeUrl 或 safeFetch。

import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";

const PRIVATE_IPV4_RANGES = [
  { start: "0.0.0.0", end: "0.255.255.255" }, // 0.0.0.0/8
  { start: "10.0.0.0", end: "10.255.255.255" }, // 10.0.0.0/8
  { start: "100.64.0.0", end: "100.127.255.255" }, // 100.64.0.0/10 CGNAT
  { start: "127.0.0.0", end: "127.255.255.255" }, // 127.0.0.0/8 loopback
  { start: "169.254.0.0", end: "169.254.255.255" }, // 169.254.0.0/16 link-local
  { start: "172.16.0.0", end: "172.31.255.255" }, // 172.16.0.0/12
  { start: "192.0.0.0", end: "192.0.0.255" }, // 192.0.0.0/24
  { start: "192.168.0.0", end: "192.168.255.255" }, // 192.168.0.0/16
  { start: "198.18.0.0", end: "198.19.255.255" }, // 198.18.0.0/15 benchmark
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost", "ip6-localhost", "ip6-loopback",
  "metadata.google.internal", // 云元数据服务
]);

function ipv4ToInt(ip) {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return null;
  return parts.reduce((acc, p) => (acc << 8) + p, 0) >>> 0;
}

function isPrivateIPv4(ip) {
  const val = ipv4ToInt(ip);
  if (val === null) return false;
  return PRIVATE_IPV4_RANGES.some((r) => {
    const s = ipv4ToInt(r.start);
    const e = ipv4ToInt(r.end);
    return val >= s && val <= e;
  });
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6
    const v4 = lower.replace("::ffff:", "");
    if (v4.includes(".")) return isPrivateIPv4(v4);
  }
  return false;
}

function isPrivateIP(ip) {
  if (ip.includes(":")) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

function isIPLiteral(hostname) {
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  // IPv6 (含 [::1] 形式)
  const v6 = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (/^[0-9a-fA-F:]+$/.test(v6) && v6.includes(":")) return true;
  return false;
}

// 校验单个 URL 是否安全（不指向私网/localhost）
export async function assertSafeUrl(rawUrl) {
  const { parsed } = await resolveSafeUrl(rawUrl);
  return parsed;
}

async function resolveSafeUrl(rawUrl, lookup = dns.lookup) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("SSRF 防护：URL 格式无效");
  }
  const proto = parsed.protocol;
  if (proto !== "http:" && proto !== "https:") {
    throw new Error(`SSRF 防护：不允许的协议 ${proto}`);
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // 去掉 IPv6 方括号

  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new Error(`SSRF 防护：禁止访问 ${hostname}`);
  }

  if (isIPLiteral(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error(`SSRF 防护：禁止访问私网地址 ${hostname}`);
    }
    return {
      parsed,
      addresses: [{ address: hostname, family: net.isIP(hostname) }],
    };
  }

  // 域名：DNS 解析后校验所有 IP（防 DNS 重绑定）
  let addrs;
  try {
    const result = await lookup(hostname, { all: true, verbatim: true });
    addrs = result.map((row) => ({ address: row.address, family: row.family || net.isIP(row.address) }));
  } catch {
    throw new Error(`SSRF 防护：无法解析域名 ${hostname}`);
  }
  if (!addrs.length) {
    throw new Error(`SSRF 防护：域名 ${hostname} 无解析结果`);
  }
  for (const row of addrs) {
    if (isPrivateIP(row.address)) {
      throw new Error(`SSRF 防护：域名 ${hostname} 解析到私网地址 ${row.address}`);
    }
  }
  return { parsed, addresses: addrs };
}

function requestPinned(parsed, addressInfo, options) {
  return new Promise((resolve, reject) => {
    const client = parsed.protocol === "https:" ? https : http;
    const headers = new Headers(options.headers || {});
    if (!headers.has("accept-encoding")) headers.set("accept-encoding", "identity");
    const request = client.request(parsed, {
      method: options.method || "GET",
      headers: Object.fromEntries(headers.entries()),
      lookup(_hostname, _lookupOptions, callback) {
        callback(null, addressInfo.address, addressInfo.family);
      },
      signal: options.signal,
    }, (incoming) => {
      const status = incoming.statusCode || 500;
      const hasBody = ![101, 204, 205, 304].includes(status);
      const response = new Response(hasBody ? Readable.toWeb(incoming) : null, {
        status,
        statusText: incoming.statusMessage || "",
        headers: incoming.headers,
      });
      resolve(response);
    });
    request.once("error", reject);
    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error(`SSRF 防护：请求超时 ${options.timeoutMs}ms`));
    });
    const body = options.body;
    if (body === undefined || body === null) {
      request.end();
    } else if (typeof body === "string" || Buffer.isBuffer(body) || body instanceof Uint8Array) {
      request.end(body);
    } else {
      request.destroy(new Error("SSRF 防护：不支持的请求体类型"));
    }
  });
}

async function readBoundedResponse(response, maxBytes) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`SSRF 防护：响应体过大 ${contentLength} > ${maxBytes}`);
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let received = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`SSRF 防护：响应体超过 ${maxBytes} 字节`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// 安全 fetch：校验 URL + 手动跟随重定向（每跳校验）+ 限制响应体 + 超时
export async function safeFetch(rawUrl, options = {}) {
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024; // 默认 5MB
  const timeoutMs = options.timeoutMs ?? 15000;
  const headers = options.headers || {};

  let currentUrl = rawUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    const { parsed, addresses } = await resolveSafeUrl(currentUrl, options.lookup || dns.lookup);
    const addressInfo = addresses[0];
    const response = options.requestImpl
      ? await options.requestImpl(parsed, addressInfo, {
        method: options.method || "GET",
        headers,
        body: options.body,
        timeoutMs,
        signal: options.signal,
      })
      : await requestPinned(parsed, addressInfo, {
      method: options.method || "GET",
      headers,
      body: options.body,
        timeoutMs,
        signal: options.signal,
      });
    if (!(response instanceof Response)) throw new Error("SSRF 防护：请求实现返回了无效响应");

    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("SSRF 防护：重定向缺少 Location 头");
      await response.body?.cancel().catch(() => {});
      currentUrl = new URL(location, currentUrl).href; // 处理相对重定向
      continue;
    }

    const bytes = await readBoundedResponse(response, maxBytes);
    const boundedResponse = new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    if (options.rawResponse) return boundedResponse;
    const text = new TextDecoder().decode(bytes);
    return { text, response: boundedResponse };
  }
  throw new Error(`SSRF 防护：重定向次数超过 ${maxRedirects}`);
}
