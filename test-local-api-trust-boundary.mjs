import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [serverSource, imageServiceSource, workbenchSource] = await Promise.all([
  readFile(new URL("./ui-server.mjs", import.meta.url), "utf8"),
  readFile(new URL("./server/image/image-service.js", import.meta.url), "utf8"),
  readFile(new URL("./ui/workbench.js", import.meta.url), "utf8"),
]);

assert.match(serverSource, /const localApiSessionToken = randomBytes\(32\)\.toString\("base64url"\)/, "local API must use a per-start random session token");
assert.match(serverSource, /setLocalApiCookie\(headers = \{\}\)[\s\S]*HttpOnly; SameSite=Strict/, "HTML responses must set a strict HttpOnly local API cookie");
assert.match(serverSource, /if \(rejectHttpHost\(req, res\)\) return;/, "HTTP requests must validate local Host before routing");
assert.match(serverSource, /url\.pathname\.startsWith\("\/api\/"\) && rejectLocalApiRequest\(req, res\)/, "API requests must pass the local trust-boundary guard");
assert.match(serverSource, /function rejectLocalApiRequest\(req, res\)[\s\S]*Forbidden host[\s\S]*Forbidden origin[\s\S]*Missing or invalid origin[\s\S]*Missing or invalid local session token[\s\S]*Content-Type must be application\/json/, "API guard must cover Host, Origin, session token, and JSON write bodies");
assert.match(serverSource, /server\.on\("upgrade"[\s\S]*url\.pathname !== "\/ws\/progress"[\s\S]*!isAllowedLocalHostHeader[\s\S]*!isAllowedLocalOriginHeader[\s\S]*!hasValidLocalApiToken/, "WebSocket upgrades must validate path, Host, Origin, and session token");

assert.doesNotMatch(serverSource, /route === "all"[\s\S]{0,120}settings: readSettings\(\)/, "/api/settings/all must not return full settings");
assert.match(serverSource, /route === "all"[\s\S]{0,180}Settings dump is disabled/, "/api/settings/all must be disabled");

assert.match(serverSource, /function resolveSafeManagedImagePath\(filePath\)[\s\S]*localImageExtensions[\s\S]*isInsideManagedFilePath/, "image path resolver must enforce extension and managed roots");
assert.match(serverSource, /function resolveImageRequestPath\(url\)[\s\S]*assetId[\s\S]*imageService\.getAsset[\s\S]*resolveSafeManagedImagePath/, "image file APIs must support asset id resolution before path fallback");
assert.match(serverSource, /route === "file"[\s\S]*resolveImageRequestPath\(url\)/, "/api/image/file must use managed image path resolution");
assert.match(serverSource, /route === "thumbnail"[\s\S]*resolveImageRequestPath\(url\)/, "/api/image/thumbnail must use managed image path resolution");

assert.match(imageServiceSource, /thumbnail_url: `\/api\/image\/thumbnail\?id=\$\{encodeURIComponent\(row\.id \|\| ""\)\}`/, "stored image assets should expose id-based thumbnail URLs");
assert.match(imageServiceSource, /function getAsset\(assetId\)/, "image service must expose getAsset for id-based file resolution");
assert.match(workbenchSource, /\/api\/image\/file\?id=\$\{encodeURIComponent\(id\)\}/, "image preview should prefer id-based file URLs");
assert.match(workbenchSource, /\/api\/image\/thumbnail\?width=\$\{encodeURIComponent\(width\)\}&id=\$\{encodeURIComponent\(id\)\}/, "image preview should prefer id-based thumbnail URLs");

console.log("Local API trust boundary: OK");
