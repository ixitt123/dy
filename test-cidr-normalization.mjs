import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assertSafeUrl, safeFetch } from "./server/core/ssrf-guard.mjs";

const repoRoot = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const lockText = fs.readFileSync(path.join(repoRoot, "pnpm-lock.yaml"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertRejects(action, pattern, label) {
  try {
    await action();
  } catch (error) {
    if (!pattern.test(error.message)) throw new Error(`${label}: unexpected error: ${error.message}`);
    return;
  }
  throw new Error(`${label}: expected rejection`);
}

function loadInstalledIpAddress() {
  const virtualStore = path.join(repoRoot, "node_modules", ".pnpm");
  const rateLimitDirectory = fs.readdirSync(virtualStore)
    .find((entry) => entry.startsWith("express-rate-limit@8.5.2"));
  assert(rateLimitDirectory, "installed express-rate-limit@8.5.2 virtual-store entry is missing");
  const rateLimitPackage = path.join(
    virtualStore,
    rateLimitDirectory,
    "node_modules",
    "express-rate-limit",
    "package.json",
  );
  const rateLimitRequire = createRequire(rateLimitPackage);
  const ipAddressEntry = rateLimitRequire.resolve("ip-address");
  const ipAddressRequire = createRequire(ipAddressEntry);
  const metadata = ipAddressRequire("ip-address/package.json");
  return { ...ipAddressRequire("ip-address"), version: metadata.version, entry: ipAddressEntry };
}

assert(packageJson.pnpm?.overrides?.["ip-address"] === "10.3.1", "package override must pin ip-address@10.3.1");
assert(/^\s+ip-address:\s+10\.3\.1\s*$/m.test(lockText), "lockfile override must pin ip-address@10.3.1");
assert(lockText.includes("ip-address@10.3.1:"), "lockfile package snapshot must contain ip-address@10.3.1");

const { Address4, Address6, version, entry } = loadInstalledIpAddress();
assert(version === "10.3.1", `installed ip-address must be 10.3.1, got ${version} at ${entry}`);

const advisoryCases = [
  ["127.0.0.1/0", Address4, "isLoopback"],
  ["10.0.0.5/7", Address4, "isPrivate"],
  ["172.16.5.5/0", Address4, "isPrivate"],
  ["192.168.1.1/0", Address4, "isPrivate"],
  ["169.254.169.254/0", Address4, "isLinkLocal"],
  ["100.64.0.1/0", Address4, "isCGNAT"],
  ["0.0.0.0/0", Address4, "isUnspecified"],
  ["255.255.255.255/0", Address4, "isBroadcast"],
  ["::1/0", Address6, "isLoopback"],
  ["fc00::1/0", Address6, "isULA"],
  ["ff02::1/0", Address6, "isMulticast"],
];

for (const [input, AddressClass, classifier] of advisoryCases) {
  const parsed = new AddressClass(input);
  assert(parsed[classifier]() === true, `${input} must remain ${classifier} with its CIDR suffix`);
}

const publicAddress = new Address4("93.184.216.34/0");
assert([
  "isPrivate",
  "isLoopback",
  "isLinkLocal",
  "isCGNAT",
  "isMulticast",
  "isUnspecified",
  "isBroadcast",
].every((classifier) => publicAddress[classifier]() === false), "public IPv4 must not be misclassified after CIDR normalization");

for (const url of [
  "http://127.0.0.1/0",
  "http://10.0.0.5/7",
  "http://169.254.169.254/0",
  "http://[::1]/0",
  "http://[fc00::1]/0",
]) {
  await assertRejects(() => assertSafeUrl(url), /SSRF|私网|禁止/u, url);
}

const publicUrl = await assertSafeUrl("https://93.184.216.34/0");
assert(publicUrl.hostname === "93.184.216.34" && publicUrl.pathname === "/0", "public /0 URL path must not be mistaken for a CIDR host suffix");

for (const invalidDnsAddress of ["127.0.0.1/0", "::1/0"]) {
  let requestCount = 0;
  await assertRejects(
    () => safeFetch("https://public.test/cidr", {
      lookup: async () => [{ address: invalidDnsAddress, family: invalidDnsAddress.includes(":") ? 6 : 4 }],
      requestImpl: async () => {
        requestCount += 1;
        return new Response("unexpected", { status: 200 });
      },
    }),
    /DNS 返回无效 IP 地址/u,
    `DNS ${invalidDnsAddress}`,
  );
  assert(requestCount === 0, `DNS ${invalidDnsAddress} must be rejected before the request layer`);
}

console.log("CIDR suffix classification, URL normalization and DNS rejection: OK");
