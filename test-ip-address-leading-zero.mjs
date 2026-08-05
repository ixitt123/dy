import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assertSafeUrl, safeFetch } from "./server/core/ssrf-guard.mjs";

const pnpmStore = path.resolve("node_modules", ".pnpm");
const lockfile = fs.readFileSync("pnpm-lock.yaml", "utf8");
assert.match(lockfile, /^\s{2}ip-address@10\.3\.1:$/m);
assert.doesNotMatch(lockfile, /^\s{2}ip-address@(?!10\.3\.1:)[^:]+:$/m);

const expressRateLimitEntries = fs.readdirSync(pnpmStore)
  .filter((name) => name.startsWith("express-rate-limit@8.5.2_"))
  .sort();
assert.equal(expressRateLimitEntries.length, 1, `expected one express-rate-limit installation, found ${expressRateLimitEntries.join(", ")}`);
const packageRoot = path.join(pnpmStore, expressRateLimitEntries[0], "node_modules", "ip-address");
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
assert.equal(packageJson.version, "10.3.1");

const requireFromPackage = createRequire(path.join(packageRoot, "package.json"));
const { Address4 } = requireFromPackage("ip-address");
for (const host of [
  "012.0.0.1",
  "012.012.012.012",
  "010.0.0.1",
  "127.000.000.001",
  "00.0.0.1",
  "0.0.0.01",
]) {
  assert.equal(Address4.isValid(host), false, `patched Address4 must reject ${host}`);
  assert.throws(() => new Address4(host), /leading zero/i, `patched Address4 constructor must reject ${host}`);
}

const ambiguousUrls = [
  "http://012.0.0.1/",
  "http://012.012.012.012/",
  "http://010.0.0.1/",
  "http://127.000.000.001/",
  "http://user:pass@012.0.0.1:8080/",
  "http://%30%31%32.0.0.1/",
];

for (const rawUrl of ambiguousUrls) {
  let lookupCount = 0;
  let requestCount = 0;
  await assert.rejects(
    () => safeFetch(rawUrl, {
      lookup: async () => {
        lookupCount += 1;
        return [{ address: "93.184.216.34", family: 4 }];
      },
      requestImpl: async () => {
        requestCount += 1;
        return new Response("unexpected", { status: 200 });
      },
    }),
    /SSRF.*(?:前导零|歧义)|leading zero/iu,
    `ambiguous URL must be rejected explicitly: ${rawUrl}`,
  );
  assert.equal(lookupCount, 0, `ambiguous URL must be rejected before DNS: ${rawUrl}`);
  assert.equal(requestCount, 0, `ambiguous URL must be rejected before request: ${rawUrl}`);
}

await assert.rejects(
  () => assertSafeUrl("http://010.0.0.1/"),
  /SSRF.*(?:前导零|歧义)|leading zero/iu,
  "a public-looking octal target must not be normalized and allowed",
);

let invalidDnsRequestCount = 0;
await assert.rejects(
  () => safeFetch("https://ambiguous-dns.example/", {
    lookup: async () => [{ address: "012.0.0.1", family: 4 }],
    requestImpl: async () => {
      invalidDnsRequestCount += 1;
      return new Response("unexpected", { status: 200 });
    },
  }),
  /DNS.*无效 IP|invalid IP/iu,
  "an ambiguous resolver result must be rejected instead of reaching the socket",
);
assert.equal(invalidDnsRequestCount, 0);

let connectedHost = "";
let connectedAddress = "";
const publicResult = await safeFetch("https://public.example/article", {
  lookup: async (hostname) => {
    assert.equal(hostname, "public.example");
    return [{ address: "93.184.216.34", family: 4 }];
  },
  requestImpl: async (parsed, addressInfo) => {
    connectedHost = parsed.hostname;
    connectedAddress = addressInfo.address;
    return new Response("consistent", { status: 200 });
  },
});

assert.equal(connectedHost, "public.example");
assert.equal(connectedAddress, "93.184.216.34");
assert.equal(publicResult.text, "consistent");

console.log("ip-address leading-zero rejection and SSRF target consistency: OK");
