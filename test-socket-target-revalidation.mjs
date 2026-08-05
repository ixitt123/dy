import assert from "node:assert/strict";

import { assertSafeUrl, safeFetch } from "./server/core/ssrf-guard.mjs";

const blockedLiterals = [
  "http://[::ffff:127.0.0.1]/",
  "http://[::ffff:7f00:1]/",
  "http://[::ffff:10.0.0.1]/",
  "http://[::ffff:a9fe:a9fe]/latest/meta-data/",
  "http://[64:ff9b::7f00:1]/",
  "http://[64:ff9b::a9fe:a9fe]/latest/meta-data/",
  "http://[fe80::1]/",
  "http://[fe90::1]/",
  "http://[fea0::1]/",
  "http://[febf::1]/",
];

for (const url of blockedLiterals) {
  await assert.rejects(
    () => assertSafeUrl(url),
    /SSRF|私网|禁止|地址/u,
    `special-use literal must be rejected: ${url}`,
  );
}

for (const url of [
  "http://[::ffff:93.184.216.34]/",
  "http://[64:ff9b::5db8:d822]/",
]) {
  const parsed = await assertSafeUrl(url);
  assert.equal(parsed.protocol, "http:", `embedded public IPv4 should remain usable: ${url}`);
}

for (const address of [
  "::ffff:7f00:1",
  "::ffff:a9fe:a9fe",
  "64:ff9b::7f00:1",
  "64:ff9b::a9fe:a9fe",
  "fe90::1",
]) {
  let requestCount = 0;
  await assert.rejects(
    () => safeFetch("https://public.test/resource", {
      lookup: async () => [{ address, family: 6 }],
      requestImpl: async () => {
        requestCount += 1;
        return new Response("unsafe", { status: 200 });
      },
    }),
    /SSRF|私网|禁止|地址/u,
    `DNS result must be rejected before a request: ${address}`,
  );
  assert.equal(requestCount, 0, `request implementation was called for blocked socket target ${address}`);
}

{
  let requestCount = 0;
  await assert.rejects(
    () => safeFetch("https://public.test/family-mismatch", {
      lookup: async () => [{ address: "93.184.216.34", family: 6 }],
      requestImpl: async () => {
        requestCount += 1;
        return new Response("unsafe", { status: 200 });
      },
    }),
    /family|地址族|SSRF/u,
    "declared DNS family must match the actual address family",
  );
  assert.equal(requestCount, 0, "family mismatch reached the request implementation");
}

{
  let selectedAddress = null;
  const result = await safeFetch("https://public.test/frozen-target", {
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    requestImpl: async (_url, addressInfo) => {
      assert.equal(Object.isFrozen(addressInfo), true, "socket target must be frozen after final validation");
      assert.throws(() => { addressInfo.address = "127.0.0.1"; }, TypeError);
      selectedAddress = { ...addressInfo };
      return new Response("safe", { status: 200 });
    },
  });
  assert.deepEqual(selectedAddress, { address: "93.184.216.34", family: 4 });
  assert.equal(result.text, "safe");
}

console.log("IPv4-mapped, NAT64, link-local and socket target revalidation: OK");
