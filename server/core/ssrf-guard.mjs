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
  { start: "0.0.0.0", end: "0.255.255.255", prefix: 8 }, // 0.0.0.0/8
  { start: "10.0.0.0", end: "10.255.255.255", prefix: 8 }, // 10.0.0.0/8
  { start: "100.64.0.0", end: "100.127.255.255", prefix: 10 }, // 100.64.0.0/10 CGNAT
  { start: "127.0.0.0", end: "127.255.255.255", prefix: 8 }, // 127.0.0.0/8 loopback
  { start: "169.254.0.0", end: "169.254.255.255", prefix: 16 }, // 169.254.0.0/16 link-local
  { start: "172.16.0.0", end: "172.31.255.255", prefix: 12 }, // 172.16.0.0/12
  { start: "192.0.0.0", end: "192.0.0.255", prefix: 24 }, // 192.0.0.0/24
  { start: "192.168.0.0", end: "192.168.255.255", prefix: 16 }, // 192.168.0.0/16
  { start: "198.18.0.0", end: "198.19.255.255", prefix: 15 }, // 198.18.0.0/15 benchmark
  { start: "224.0.0.0", end: "255.255.255.255", prefix: 4 }, // multicast / reserved / broadcast
];

const BLOCKED_IPV6 = new net.BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fe80::", 10],
  ["fc00::", 7],
  ["ff00::", 8],
]) {
  BLOCKED_IPV6.addSubnet(network, prefix, "ipv6");
}
for (const range of PRIVATE_IPV4_RANGES) {
  const suffix = ipv4ToHexSuffix(range.start);
  BLOCKED_IPV6.addSubnet(`::ffff:${suffix}`, 96 + range.prefix, "ipv6");
  BLOCKED_IPV6.addSubnet(`64:ff9b::${suffix}`, 96 + range.prefix, "ipv6");
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost", "ip6-localhost", "ip6-loopback",
  "metadata.google.internal", // 云元数据服务
]);

function rawAuthorityHostname(rawUrl) {
  const match = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\/(?<authority>[^/?#]*)/.exec(String(rawUrl).trim());
  if (!match) return "";
  let authority = match.groups.authority;
  const userInfoEnd = authority.lastIndexOf("@");
  if (userInfoEnd >= 0) authority = authority.slice(userInfoEnd + 1);
  if (authority.startsWith("[")) return "";
  const portStart = authority.lastIndexOf(":");
  if (portStart >= 0) authority = authority.slice(0, portStart);
  try {
    return decodeURIComponent(authority).replace(/\.$/, "");
  } catch {
    return authority.replace(/\.$/, "");
  }
}

function assertUnambiguousIpv4Authority(rawUrl) {
  const hostname = rawAuthorityHostname(rawUrl);
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return;
  if (hostname.split(".").some((octet) => /^0\d/.test(octet))) {
    throw new Error(`SSRF 防护：拒绝含前导零的歧义 IPv4 主机 ${hostname}`);
  }
}

function ipv4ToInt(ip) {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(ip)) return null;
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return null;
  return parts.reduce((acc, p) => (acc << 8) + p, 0) >>> 0;
}

function ipv4ToHexSuffix(ip) {
  const value = ipv4ToInt(ip);
  if (value === null) throw new Error(`SSRF 防护：内部 IPv4 规则无效 ${ip}`);
  return `${((value >>> 16) & 0xffff).toString(16)}:${(value & 0xffff).toString(16)}`;
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
  return net.isIP(ip) === 6 && BLOCKED_IPV6.check(ip, "ipv6");
}

function isPrivateIP(ip) {
  const family = net.isIP(ip);
  if (family === 6) return isPrivateIPv6(ip);
  if (family === 4) return isPrivateIPv4(ip);
  return false;
}

function normalizeDeclaredFamily(value) {
  if (value === undefined || value === null || value === "") return 0;
  if (value === 4 || value === "4" || value === "IPv4") return 4;
  if (value === 6 || value === "6" || value === "IPv6") return 6;
  return -1;
}

function validatedAddressInfo(value, { source = "socket target", hostname = "" } = {}) {
  const address = String(value?.address || "");
  const family = net.isIP(address);
  if (!family) {
    const label = source === "DNS" ? "DNS 返回无效 IP 地址" : `${source} 无效 IP 地址`;
    throw new Error(`SSRF 防护：${label} ${address || "<empty>"}`);
  }
  const declaredFamily = normalizeDeclaredFamily(value?.family);
  if (declaredFamily === -1 || (declaredFamily && declaredFamily !== family)) {
    throw new Error(`SSRF 防护：${source} 地址族 family 不匹配 ${address}`);
  }
  if (isPrivateIP(address)) {
    if (source === "DNS") {
      throw new Error(`SSRF 防护：域名 ${hostname} 解析到私网地址 ${address}`);
    }
    throw new Error(`SSRF 防护：${source} 禁止访问私网地址 ${address}`);
  }
  return Object.freeze({ address, family });
}

export function assertSafeSocketTarget(addressInfo) {
  return validatedAddressInfo(addressInfo);
}

function isIPLiteral(hostname) {
  const unbracketed = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  return net.isIP(unbracketed) !== 0;
}

// 校验单个 URL 是否安全（不指向私网/localhost）
export async function assertSafeUrl(rawUrl) {
  const { parsed } = await resolveSafeUrl(rawUrl);
  return parsed;
}

async function resolveSafeUrl(rawUrl, lookup = dns.lookup) {
  assertUnambiguousIpv4Authority(rawUrl);
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
    const addressInfo = validatedAddressInfo(
      { address: hostname, family: net.isIP(hostname) },
      { source: "URL 字面量" },
    );
    return {
      parsed,
      addresses: [addressInfo],
    };
  }

  // 域名：DNS 解析后校验所有 IP（防 DNS 重绑定）
  let addrs;
  let result;
  try {
    result = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`SSRF 防护：无法解析域名 ${hostname}`);
  }
  addrs = result.map((row) => validatedAddressInfo(row, { source: "DNS", hostname }));
  if (!addrs.length) {
    throw new Error(`SSRF 防护：域名 ${hostname} 无解析结果`);
  }
  return { parsed, addresses: addrs };
}

function requestPinned(parsed, addressInfo, options) {
  const pinnedAddress = assertSafeSocketTarget(addressInfo);
  return new Promise((resolve, reject) => {
    const client = parsed.protocol === "https:" ? https : http;
    const headers = new Headers(options.headers || {});
    if (!headers.has("accept-encoding")) headers.set("accept-encoding", "identity");
    const request = client.request(parsed, {
      method: options.method || "GET",
      headers: Object.fromEntries(headers.entries()),
      lookup(_hostname, _lookupOptions, callback) {
        callback(null, pinnedAddress.address, pinnedAddress.family);
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
    const addressInfo = assertSafeSocketTarget(addresses[0]);
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
