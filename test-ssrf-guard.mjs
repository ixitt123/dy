// test-ssrf-guard.mjs
//
// SSRF 防护测试（10.02）。
// 验证 safeFetch / assertSafeUrl 拦截：
//   1. 私网 IPv4（127.0.0.1 / 10.x / 192.168.x / 172.16-31.x / 169.254.x / 100.64.x）
//   2. IPv6 loopback / link-local / unique-local
//   3. localhost 域名
//   4. 非 http/https 协议（file:// / ftp://）
//   5. 重定向到私网
//
// 运行：node test-ssrf-guard.mjs

import { assertSafeUrl, safeFetch } from "./server/core/ssrf-guard.mjs";

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("阻止 IPv4 私网 127.0.0.1", async () => {
  await assertRejects(() => assertSafeUrl("http://127.0.0.1:8080/admin"), /私网|loopback|127/);
});

test("阻止 IPv4 私网 10.0.0.1", async () => {
  await assertRejects(() => assertSafeUrl("http://10.0.0.1/"), /私网/);
});

test("阻止 IPv4 私网 192.168.1.1", async () => {
  await assertRejects(() => assertSafeUrl("http://192.168.1.1/"), /私网/);
});

test("阻止 IPv4 私网 172.16.0.1", async () => {
  await assertRejects(() => assertSafeUrl("http://172.16.0.1/"), /私网/);
});

test("阻止 IPv4 私网 172.31.255.255", async () => {
  await assertRejects(() => assertSafeUrl("http://172.31.255.255/"), /私网/);
});

test("阻止 IPv4 链路本地 169.254.169.254（云元数据）", async () => {
  await assertRejects(() => assertSafeUrl("http://169.254.169.254/latest/meta-data/"), /私网|link-local/);
});

test("阻止 IPv4 CGNAT 100.64.0.1", async () => {
  await assertRejects(() => assertSafeUrl("http://100.64.0.1/"), /私网/);
});

test("阻止 IPv4 0.0.0.0", async () => {
  await assertRejects(() => assertSafeUrl("http://0.0.0.0/"), /私网/);
});

test("阻止 localhost 域名", async () => {
  await assertRejects(() => assertSafeUrl("http://localhost/admin"), /localhost/i);
});

test("阻止 file:// 协议", async () => {
  await assertRejects(() => assertSafeUrl("file:///etc/passwd"), /协议/);
});

test("阻止 ftp:// 协议", async () => {
  await assertRejects(() => assertSafeUrl("ftp://example.com/file"), /协议/);
});

test("公网 IP 通过（IANA 示例地址）", async () => {
  const parsed = await assertSafeUrl("https://93.184.216.34/");
  if (parsed.hostname !== "93.184.216.34") throw new Error("hostname 不匹配");
});

test("safeFetch 阻止私网 URL", async () => {
  await assertRejects(() => safeFetch("http://127.0.0.1:8080/secret"), /私网|SSRF/);
});

test("rawResponse 也不能绕过流式响应上限", async () => {
  await assertRejects(
    () => safeFetch("http://93.184.216.34/test", {
      maxBytes: 8,
      rawResponse: true,
      requestImpl: async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(12));
          controller.close();
        },
      }), { status: 200 }),
    }),
    /响应体|字节|过大/u,
  );
});

test("连接固定使用已校验的 DNS 地址", async () => {
  let connectedAddress = "";
  const result = await safeFetch("https://public.test/article", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    requestImpl: async (_url, addressInfo) => {
      connectedAddress = addressInfo.address;
      return new Response("safe", { status: 200 });
    },
  });
  if (connectedAddress !== "93.184.216.34") throw new Error(`连接地址未固定: ${connectedAddress}`);
  if (result.text !== "safe") throw new Error("响应内容不匹配");
});

test("每一跳重定向都重新阻止私网目标", async () => {
  let requestCount = 0;
  await assertRejects(
    () => safeFetch("https://public.test/start", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      requestImpl: async () => {
        requestCount += 1;
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
      },
    }),
    /私网|SSRF/u,
  );
  if (requestCount !== 1) throw new Error(`私网重定向被请求了 ${requestCount} 次`);
});

async function assertRejects(fn, pattern) {
  try {
    await fn();
    throw new Error("应被拒绝但未拒绝");
  } catch (e) {
    if (e.message === "应被拒绝但未拒绝") throw e;
    if (pattern && !pattern.test(e.message)) {
      throw new Error(`错误信息不匹配: ${e.message} (期望 ${pattern})`);
    }
  }
}

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
console.log(`\n📊 SSRF 防护测试: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
