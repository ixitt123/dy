import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(new URL("./ui/modules/legacy-runtime.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./ui/index.html", import.meta.url), "utf8");
const cs1 = fs.readFileSync(new URL("./ui/modules/cs1-video.js", import.meta.url), "utf8");
const xiaohei = fs.readFileSync(new URL("./ui/modules/ian-xiaohei-app.js", import.meta.url), "utf8");
const xiaoheiParent = fs.readFileSync(new URL("./ui/modules/xiaohei-production.js", import.meta.url), "utf8");
const moneyPrinter = fs.readFileSync(new URL("./ui/modules/money-printer.js", import.meta.url), "utf8");
const kinetic = fs.readFileSync(new URL("./ui/modules/kinetic-text.js", import.meta.url), "utf8");

const values = new Map();
globalThis.localStorage = {
  getItem(key) {
    return values.has(String(key)) ? values.get(String(key)) : null;
  },
  setItem(key, value) {
    values.set(String(key), String(value));
  },
  removeItem(key) {
    values.delete(String(key));
  },
};

await import(`./ui/modules/tts-handoff-store.js?test=${Date.now()}`);
const store = globalThis.ttsHandoffStore;
assert.ok(store, "TTS handoff store should be available before runtime and target modules");

const oldPayload = {
  id: 101,
  alignment_revision: 1,
  alignment_status: "confirmed",
  text: "上一轮手工修改字幕",
  sentence_timeline: [{ start: 0, end: 1, text: "上一轮手工修改字幕" }],
};
const newPayload = {
  id: 102,
  alignment_revision: 1,
  alignment_status: "confirmed",
  text: "本轮正确字幕",
  sentence_timeline: [{ start: 0, end: 1, text: "本轮正确字幕" }],
};

store.save(oldPayload, ["kinetic-text"]);
store.save(newPayload, ["kinetic-text"]);
const latest = store.read("kinetic-text");
assert.equal(latest.id, 102);
assert.equal(latest.text, "本轮正确字幕");
assert.equal(latest.sentence_timeline[0].text, "本轮正确字幕");
assert.equal(store.read("cs1-video"), null, "unselected targets must not receive a handoff");
assert.equal(store.isPending("kinetic-text"), true, "a newly sent handoff should show an unread badge");
store.acknowledge("kinetic-text");
assert.equal(store.isPending("kinetic-text"), false, "opening the target page should acknowledge its badge");
assert.equal(store.read("kinetic-text").id, 102, "acknowledging the badge must keep the handoff payload");
store.save({ ...newPayload, id: 103 }, ["kinetic-text"]);
assert.equal(store.isPending("kinetic-text"), true, "a newer handoff should show the badge again");

assert.match(html, /modules\/tts-handoff-store\.js[\s\S]*modules\/legacy-runtime\.js/u);
assert.match(runtime, /data-tts-timeline-text="\$\{index\}"[^>]*data-no-draft-persist/u);
for (const [name, source] of Object.entries({ cs1, xiaohei, moneyPrinter, kinetic })) {
  assert.match(source, /data-no-draft-persist/u, `${name} timeline editors must opt out of generic draft restore`);
}

assert.doesNotMatch(runtime, /\nclearProductionTtsHandoffStorage\(\);\n/u);
assert.match(runtime, /ttsHandoffStore\?\.save\(sharedPayload,\s*targets\)/u);
assert.match(runtime, /scheduleTtsTargetDelivery/u);
assert.match(runtime, /function acknowledgeProductionTarget/u);
assert.match(runtime, /workbench:route[\s\S]*acknowledgeProductionTarget/u);
assert.match(
  runtime,
  /function productionTargetIsOpen[\s\S]*function markProductionTargetReceived[\s\S]*productionTargetIsOpen\(target\)[\s\S]*acknowledgeProductionTarget\(target\)/u,
  "an already open production page must acknowledge a received badge immediately",
);
assert.match(
  runtime,
  /document\.addEventListener\("click",[\s\S]*nav-item\[data-nav\][\s\S]*acknowledgeProductionTarget[\s\S]*,\s*true\);/u,
  "clicking an active production navigation item must still clear its badge",
);
assert.match(runtime, /字幕已保存并发送/u);
for (const [target, source] of Object.entries({
  "cs1-video": cs1,
  "xiaohei-video": xiaoheiParent,
  "money-printer": moneyPrinter,
  "kinetic-text": kinetic,
})) {
  assert.match(
    source,
    new RegExp(`ttsHandoffStore\\?\\.read\\("${target}"\\)`),
    `${target} must restore its latest task-specific handoff`,
  );
}

delete globalThis.ttsHandoffStore;
delete globalThis.localStorage;

console.log("TTS handoff isolation and deferred delivery: OK");
