import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { safeFetch } from "./server/core/ssrf-guard.mjs";

const patchedError = "URI authority must not contain a literal backslash.";
const lockfile = fs.readFileSync("pnpm-lock.yaml", "utf8");
const fastUriLockVersions = [...lockfile.matchAll(/^\s{2}fast-uri@([^:]+):$/gm)].map((match) => match[1]);
assert.deepEqual([...new Set(fastUriLockVersions)], ["3.1.5"], "lockfile must contain only fast-uri 3.1.5");

const pnpmStore = path.resolve("node_modules", ".pnpm");
const ajvEntries = fs.readdirSync(pnpmStore)
  .filter((name) => name === "ajv@8.20.0" || name.startsWith("ajv@8.20.0_"))
  .sort();
assert.equal(ajvEntries.length, 1, `expected one ajv installation, found ${ajvEntries.join(", ")}`);
const pnpmPackageRoot = fs.realpathSync(path.join(pnpmStore, ajvEntries[0], "node_modules", "fast-uri"));
const packageJsonPath = path.join(pnpmPackageRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
assert.equal(packageJson.version, "3.1.5", "installed fast-uri must be the patched 3.x release");
const requireFromFastUri = createRequire(packageJsonPath);
const fastUri = requireFromFastUri(pnpmPackageRoot);

const report = {
  node: process.version,
  fastUriVersion: packageJson.version,
  lockVersions: fastUriLockVersions,
  backslashAuthority: [],
  malformedIntroducer: [],
  percentEncodedAuthority: [],
  application: {},
};

const backslashCases = [
  { input: String.raw`http://evil.com\@allowed.com`, actualHost: "evil.com" },
  { input: String.raw`https://169.254.169.254\@trusted.example.com`, actualHost: "169.254.169.254" },
  { input: String.raw`http://127.0.0.1\@public.example.com`, actualHost: "127.0.0.1" },
  { input: String.raw`https://attacker.com\@api.internal`, actualHost: "attacker.com" },
  { input: String.raw`ws://evil.com\@allowed.com/chat`, actualHost: "evil.com" },
  { input: String.raw`wss://evil.com\@allowed.com/chat`, actualHost: "evil.com" },
  { input: String.raw`http://evil.com\%40allowed.com`, actualHost: "evil.com" },
];

for (const testCase of backslashCases) {
  const parsedByFastUri = fastUri.parse(testCase.input);
  const parsedByNode = new URL(testCase.input);
  assert.equal(parsedByFastUri.error, patchedError, `fast-uri must reject ${testCase.input}`);
  assert.equal(parsedByNode.hostname, testCase.actualHost, `WHATWG network host mismatch for ${testCase.input}`);
  report.backslashAuthority.push({
    input: testCase.input,
    fastUriHost: parsedByFastUri.host,
    fastUriError: parsedByFastUri.error,
    whatwgHost: parsedByNode.hostname,
    whatwgHref: parsedByNode.href,
  });
}

const malformedIntroducerCases = [
  { input: String.raw`http:\\evil.com/path`, expectedError: patchedError, actualHost: "evil.com" },
  { input: String.raw`http:/\evil.com/path`, expectedError: patchedError, actualHost: "evil.com" },
  { input: String.raw`http:\/evil.com/path`, expectedError: patchedError, actualHost: "evil.com" },
  { input: String.raw`ws:\\evil.com/chat`, expectedError: patchedError, actualHost: "evil.com" },
  { input: "https:/\t/evil.com/path", expectedError: "URI authority introducer must not contain whitespace.", actualHost: "evil.com" },
  { input: "https:/\n/evil.com/path", expectedError: "URI authority introducer must not contain whitespace.", actualHost: "evil.com" },
  { input: "https:/\r/evil.com/path", expectedError: "URI authority introducer must not contain whitespace.", actualHost: "evil.com" },
];

for (const testCase of malformedIntroducerCases) {
  const parsedByFastUri = fastUri.parse(testCase.input);
  const parsedByNode = new URL(testCase.input);
  assert.equal(parsedByFastUri.error, testCase.expectedError, `fast-uri must reject ${JSON.stringify(testCase.input)}`);
  assert.equal(parsedByNode.hostname, testCase.actualHost, `WHATWG authority host mismatch for ${JSON.stringify(testCase.input)}`);
  report.malformedIntroducer.push({
    input: testCase.input,
    fastUriError: parsedByFastUri.error,
    whatwgHost: parsedByNode.hostname,
    whatwgHref: parsedByNode.href,
  });
}

for (const relative of [
  String.raw`\\evil.com/path`,
  String.raw`/\evil.com/path`,
  String.raw`\/evil.com/path`,
  "/\t/evil.com/path",
]) {
  assert.throws(
    () => fastUri.resolve("https://allowed.com/", relative),
    /URI authority (?:must not contain a literal backslash|introducer must not contain whitespace)/u,
    `resolve must reject ${JSON.stringify(relative)}`,
  );
}

for (const input of [
  "http://evil.com%5C@allowed.com/",
  "http://trusted.com%3A443@evil.com/",
]) {
  const parsedByFastUri = fastUri.parse(input);
  const parsedByNode = new URL(input);
  assert.equal(parsedByFastUri.error, undefined, `encoded data must remain valid: ${input}`);
  assert.equal(parsedByFastUri.host, parsedByNode.hostname, `encoded authority host must stay consistent: ${input}`);
  report.percentEncodedAuthority.push({
    input,
    fastUriHost: parsedByFastUri.host,
    whatwgHost: parsedByNode.hostname,
  });
}

let privateLookupCount = 0;
let privateRequestCount = 0;
const privateConfusionUrl = String.raw`https://169.254.169.254\@trusted.example.com/latest/meta-data/`;
await assert.rejects(
  () => safeFetch(privateConfusionUrl, {
    lookup: async () => {
      privateLookupCount += 1;
      return [{ address: "93.184.216.34", family: 4 }];
    },
    requestImpl: async () => {
      privateRequestCount += 1;
      return new Response("unexpected", { status: 200 });
    },
  }),
  /SSRF.*私网/u,
  "WHATWG private host must be blocked before DNS and request",
);
assert.equal(privateLookupCount, 0);
assert.equal(privateRequestCount, 0);
report.application.privateAuthority = {
  input: privateConfusionUrl,
  whatwgHost: new URL(privateConfusionUrl).hostname,
  dnsCalls: privateLookupCount,
  requestCalls: privateRequestCount,
};

const publicConfusionUrl = String.raw`https://public.example\@trusted.example/start`;
const publicDnsHosts = [];
const publicConnections = [];
const publicResult = await safeFetch(publicConfusionUrl, {
  lookup: async (hostname) => {
    publicDnsHosts.push(hostname);
    return [{ address: "93.184.216.34", family: 4 }];
  },
  requestImpl: async (parsed, addressInfo) => {
    publicConnections.push({
      hostname: parsed.hostname,
      address: addressInfo.address,
      family: addressInfo.family,
      frozen: Object.isFrozen(addressInfo),
    });
    return new Response("consistent", { status: 200 });
  },
});
assert.deepEqual(publicDnsHosts, ["public.example"]);
assert.deepEqual(publicConnections, [{
  hostname: "public.example",
  address: "93.184.216.34",
  family: 4,
  frozen: true,
}]);
assert.equal(publicResult.text, "consistent");
report.application.publicAuthority = {
  input: publicConfusionUrl,
  whatwgHost: new URL(publicConfusionUrl).hostname,
  dnsHosts: publicDnsHosts,
  connections: publicConnections,
};

let redirectRequestCount = 0;
const redirectDnsHosts = [];
const redirectTarget = String.raw`http://127.0.0.1\@trusted.example/admin`;
await assert.rejects(
  () => safeFetch("https://redirect.example/start", {
    lookup: async (hostname) => {
      redirectDnsHosts.push(hostname);
      return [{ address: "93.184.216.34", family: 4 }];
    },
    requestImpl: async () => {
      redirectRequestCount += 1;
      return new Response(null, { status: 302, headers: { location: redirectTarget } });
    },
  }),
  /SSRF.*私网/u,
  "backslash redirect must be re-parsed and rejected before a second request",
);
assert.equal(redirectRequestCount, 1);
assert.deepEqual(redirectDnsHosts, ["redirect.example"]);
report.application.redirect = {
  location: redirectTarget,
  canonicalTarget: new URL(redirectTarget).href,
  whatwgHost: new URL(redirectTarget).hostname,
  dnsHosts: redirectDnsHosts,
  requestCalls: redirectRequestCount,
};

let mixedDnsRequestCount = 0;
await assert.rejects(
  () => safeFetch("https://mixed-dns.example/resource", {
    lookup: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ],
    requestImpl: async () => {
      mixedDnsRequestCount += 1;
      return new Response("unexpected", { status: 200 });
    },
  }),
  /SSRF.*(?:DNS|域名).*私网/u,
  "all DNS answers must be validated before connecting",
);
assert.equal(mixedDnsRequestCount, 0);
report.application.mixedDns = {
  addresses: ["93.184.216.34", "127.0.0.1"],
  requestCalls: mixedDnsRequestCount,
};

if (process.env.R2_EVIDENCE_DIR) {
  fs.mkdirSync(process.env.R2_EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(process.env.R2_EVIDENCE_DIR, "fast-uri-host-confusion-result.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
}

console.log(JSON.stringify({
  ok: true,
  fastUriVersion: packageJson.version,
  backslashCases: report.backslashAuthority.length,
  malformedIntroducerCases: report.malformedIntroducer.length,
  encodedCases: report.percentEncodedAuthority.length,
  redirectRequestCount,
  mixedDnsRequestCount,
  connectedHost: publicConnections[0].hostname,
  connectedAddress: publicConnections[0].address,
}));
