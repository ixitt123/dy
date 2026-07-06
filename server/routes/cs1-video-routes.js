import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";

const HYPERFRAMES_VERSION = "0.7.37";
const MAX_SCRIPT_LENGTH = 1200;
const OFFICIAL_TEMPLATE_IDS = new Set([
  "warm-grain",
  "play-mode",
  "swiss-grid",
  "kinetic-type",
  "decision-tree",
  "product-promo",
  "nyt-graph",
  "vignelli",
  "blank",
]);

const CS1_VIDEO_STYLES = [
  { id: "cs1", name: "CS1 dark explainer", description: "Dark canvas, strong warning, three-beat explainer video.", source: "local" },
  { id: "warm-grain", name: "Warm Grain", description: "Official HyperFrames warm paper and grain example.", source: "hyperframes" },
  { id: "play-mode", name: "Play Mode", description: "Official HyperFrames energetic elastic social template.", source: "hyperframes" },
  { id: "swiss-grid", name: "Swiss Grid", description: "Official HyperFrames clean structured technical grid template.", source: "hyperframes" },
  { id: "kinetic-type", name: "Kinetic Type", description: "Official HyperFrames dramatic typography template.", source: "hyperframes" },
  { id: "decision-tree", name: "Decision Tree", description: "Official HyperFrames flowchart explainer template.", source: "hyperframes" },
  { id: "product-promo", name: "Product Promo", description: "Official HyperFrames multi-scene product showcase template.", source: "hyperframes" },
  { id: "nyt-graph", name: "NYT Graph", description: "Official HyperFrames editorial data-story template.", source: "hyperframes" },
  { id: "vignelli", name: "Vignelli", description: "Official HyperFrames bold portrait typography template.", source: "hyperframes" },
  { id: "blank", name: "Blank", description: "Official HyperFrames minimal scaffold for full custom control.", source: "hyperframes" },
];

export function createCs1VideoRoutes({ baseDir, sendJson, modelRouter }) {
  const runsDir = path.join(baseDir, ".data", "cs1-video-maker");
  const outputDir = path.join(baseDir, "jianying-exports", "hyperframes");

  return async function handleCs1VideoRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/cs1-video/")) return false;
    const route = url.pathname.replace("/api/cs1-video/", "");

    if (req.method === "GET" && route === "styles") {
      sendJson(res, 200, {
        ok: true,
        styles: CS1_VIDEO_STYLES,
      });
      return true;
    }

    if (req.method === "POST" && route === "generate") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const result = await generateVideo({
          baseDir,
          runsDir,
          outputDir,
          text: body.text,
          style: body.style,
          title: body.title,
          aiRefine: body.aiRefine === true,
          modelRouter,
        });
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    sendJson(res, 404, { ok: false, message: "Unknown CS1 video API" });
    return true;
  };
}

async function generateVideo({ runsDir, outputDir, text, style, title, aiRefine, modelRouter }) {
  const script = normalizeScript(text);
  const styleId = normalizeStyle(style);
  const slug = `${formatDateSlug(new Date())}-${styleId}-${randomUUID().slice(0, 8)}`;
  const projectDir = path.join(runsDir, slug);
  const videoTitle = sanitizeTitle(title) || inferTitle(script);
  const outputPath = path.join(outputDir, `${slug}.mp4`);

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const refined = aiRefine ? await refineStoryModel({ script, title: videoTitle, modelRouter }) : null;
  const model = refined || buildStoryModel(script, videoTitle);
  const files = styleId === "cs1"
    ? cs1Files(model)
    : styleId === "warm-grain"
      ? warmGrainFiles(model)
      : officialTemplateFiles(model, styleId);
  writeProject(projectDir, {
    slug,
    title: videoTitle,
    styleId,
    files,
  });

  const checkOutput = [];
  await runHyperframes(projectDir, ["lint"], checkOutput);
  await runHyperframes(projectDir, ["validate"], checkOutput);
  await runHyperframes(projectDir, ["inspect"], checkOutput);
  const renderOutput = [];
  await runHyperframes(projectDir, ["render", "--output", outputPath, "--quality", "standard"], renderOutput);

  return {
    id: slug,
    title: videoTitle,
    style: styleId,
    projectDir,
    outputPath,
    aiUsed: Boolean(refined),
    checkLog: checkOutput.join("\n").slice(-8000),
    renderLog: renderOutput.join("\n").slice(-8000),
  };
}

async function refineStoryModel({ script, title, modelRouter }) {
  if (!modelRouter || typeof modelRouter.generate !== "function") return null;
  try {
    const result = await modelRouter.generate({
      taskType: "rewrite",
      messages: [
        {
          role: "system",
          content: [
            "You turn Chinese short-video copy into a 10-second, 3-beat video structure.",
            "Return only JSON with keys: title, hook, question, action, caption1, caption2, caption3.",
            "Each value must be concise Chinese, suitable for large on-screen text.",
            "No markdown, no explanations.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({ title, script }),
        },
      ],
      options: { temperature: 0.4 },
    });
    const parsed = JSON.parse(String(result.content || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    return {
      title: sanitizeTitle(parsed.title) || title,
      hook: String(parsed.hook || "").trim().slice(0, 80) || title,
      question: String(parsed.question || "").trim().slice(0, 80) || "Is this still far away?",
      action: String(parsed.action || "").trim().slice(0, 100) || "Start now: find gaps, set rhythm, review daily.",
      caption1: String(parsed.caption1 || parsed.hook || "").trim().slice(0, 80) || title,
      caption2: String(parsed.caption2 || parsed.question || "").trim().slice(0, 80) || "The key question is already here.",
      caption3: String(parsed.caption3 || parsed.action || "").trim().slice(0, 100) || "Now is the starting line.",
    };
  } catch {
    return null;
  }
}

function writeProject(projectDir, { slug, title, styleId, files }) {
  const compositionDir = path.join(projectDir, "compositions");
  fs.mkdirSync(compositionDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "package.json"), JSON.stringify({
    name: slug,
    private: true,
    type: "module",
    scripts: {
      check: `npx --yes hyperframes@${HYPERFRAMES_VERSION} lint && npx --yes hyperframes@${HYPERFRAMES_VERSION} validate && npx --yes hyperframes@${HYPERFRAMES_VERSION} inspect`,
      render: `npx --yes hyperframes@${HYPERFRAMES_VERSION} render`,
    },
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, "hyperframes.json"), JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, "meta.json"), JSON.stringify({
    id: slug,
    name: title,
    style: styleId,
    createdAt: new Date().toISOString(),
    duration: 10,
    width: 1920,
    height: 1080,
  }, null, 2));
  fs.writeFileSync(path.join(projectDir, "DESIGN.md"), files.design);
  fs.writeFileSync(path.join(projectDir, "index.html"), files.index);
  for (const [name, content] of Object.entries(files.compositions || {})) {
    fs.writeFileSync(path.join(compositionDir, name), content);
  }
}

function runHyperframes(cwd, args, output) {
  const command = "npx";
  const finalArgs = ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...args];
  return new Promise((resolve, reject) => {
    const child = spawn(command, finalArgs, { cwd, windowsHide: true, shell: process.platform === "win32" });
    let combined = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      combined += text;
      output.push(text.trimEnd());
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      combined += text;
      output.push(text.trimEnd());
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`HyperFrames ${args[0]} failed:\n${combined.slice(-2500)}`));
    });
  });
}

function normalizeScript(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) throw new Error("Please enter text for video generation.");
  return text.slice(0, MAX_SCRIPT_LENGTH);
}

function normalizeStyle(value) {
  const style = String(value || "cs1").toLowerCase().trim();
  const normalized = style === "warmgrain" ? "warm-grain" : style;
  if (normalized === "cs1" || OFFICIAL_TEMPLATE_IDS.has(normalized)) return normalized;
  return "cs1";
}

function sanitizeTitle(value) {
  return String(value || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().slice(0, 80);
}

function inferTitle(script) {
  return sanitizeTitle(script.replace(/[，。！？；,.!?;].*$/, "")) || "CS1 Video";
}

function formatDateSlug(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function buildStoryModel(script, title) {
  const segments = splitScript(script);
  return {
    title,
    hook: segments[0] || title,
    question: segments[1] || "Is this still far away?",
    action: segments[2] || "Start now: find gaps, set rhythm, review daily.",
    caption1: segments[0] || title,
    caption2: segments[1] || "The key question is already here.",
    caption3: segments[2] || "Now is the starting line.",
  };
}

function splitScript(script) {
  const parts = script
    .split(/(?<=[。！？!?；;])|[|]/)
    .map((item) => item.replace(/[。！？!?；;]+$/g, "").trim())
    .filter(Boolean);
  if (parts.length >= 3) return parts.slice(0, 3);
  const chunks = [];
  const size = Math.ceil(script.length / 3);
  for (let i = 0; i < script.length; i += size) chunks.push(script.slice(i, i + size).trim());
  return chunks.filter(Boolean).slice(0, 3);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsString(value) {
  return JSON.stringify(String(value));
}

function cs1Files(model) {
  const title = escapeHtml(model.title);
  const hook = escapeHtml(model.hook);
  const question = escapeHtml(model.question);
  const action = escapeHtml(model.action);
  return {
    design: `## Style Prompt

Dark CS1 explainer video: cinematic black-brown canvas, exam-red warning blocks, large Chinese display type, deterministic three-beat motion.

## Colors

- Background: \`#12100d\`
- Panel: \`#241b16\`
- Paper: \`#f0e5ce\`
- Warning red: \`#c9362c\`
- Gold: \`#d39b45\`

## Typography

- \`"Microsoft YaHei UI", "Microsoft YaHei", sans-serif\`
- \`"IBM Plex Mono", "Cascadia Mono", monospace\`
`,
    index: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <style>
    *{box-sizing:border-box} @font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")} @font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")} @font-face{font-family:"Cascadia Mono";src:local("Cascadia Mono")}
    html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#12100d;color:#f0e5ce;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif}
    #root{position:relative;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(circle at 74% 18%,rgba(201,54,44,.22),rgba(201,54,44,0) 28%),radial-gradient(circle at 18% 78%,rgba(211,155,69,.18),rgba(211,155,69,0) 32%),#12100d}
    .texture,.lines{position:absolute;inset:0;pointer-events:none}.texture{z-index:8;opacity:.18;background-image:linear-gradient(rgba(240,229,206,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(240,229,206,.04) 1px,transparent 1px);background-size:72px 72px}.lines{z-index:1;opacity:.34;background:repeating-linear-gradient(0deg,rgba(240,229,206,.08) 0 2px,transparent 2px 54px),linear-gradient(90deg,rgba(201,54,44,.28),rgba(201,54,44,0) 18%)}
    .scene{position:absolute;inset:0;z-index:2;display:flex;width:100%;height:100%;padding:106px 132px;background:#12100d}.scene-content{position:relative;z-index:3;display:flex;flex-direction:column;justify-content:center;width:100%;height:100%;gap:34px}
    #scene-2,#scene-3{opacity:0}.label{width:max-content;padding:12px 18px;border:1px solid rgba(211,155,69,.46);color:#d39b45;background:rgba(36,27,22,.76);font:700 24px "Cascadia Mono",monospace;letter-spacing:.08em;text-transform:uppercase}
    h1,h2{margin:0;max-width:1340px;color:#f0e5ce;font-weight:900;line-height:1.08;letter-spacing:.01em}h1{font-size:116px}h2{font-size:104px}.red{color:#ff6258}.subline{margin:0;max-width:1040px;color:#c8b99d;font-size:39px;line-height:1.42}
    .stamp{position:absolute;right:140px;bottom:92px;width:300px;height:300px;display:flex;align-items:center;justify-content:center;border:12px solid #c9362c;border-radius:50%;color:#ff6258;font-size:52px;font-weight:900;transform:rotate(-12deg)}
    .action{padding:30px 38px;border-left:10px solid #c9362c;background:rgba(36,27,22,.82);color:#f0e5ce;font-size:48px;font-weight:900;max-width:1180px}
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="10" data-width="1920" data-height="1080">
    <div class="lines" data-layout-ignore></div><div class="texture" data-layout-ignore></div>
    <section id="scene-1" class="scene clip" data-start="0" data-duration="3.35" data-track-index="1"><div class="scene-content"><div class="label">CS1 HOOK</div><h1>${hook}</h1><p class="subline">${title}</p></div></section>
    <section id="scene-2" class="scene clip" data-start="3.05" data-duration="3.35" data-track-index="2"><div class="scene-content"><div class="label">QUESTION</div><h2>${question}</h2></div><div class="stamp" data-layout-ignore>NOW</div></section>
    <section id="scene-3" class="scene clip" data-start="6.15" data-duration="3.85" data-track-index="3"><div class="scene-content"><div class="label">START NOW</div><h2><span class="red">Start</span> today</h2><div class="action">${action}</div></div></section>
  </div>
  <script>
    window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});
    tl.from("#scene-1 .label",{y:32,opacity:0,duration:.38,ease:"power3.out"},.15).from("#scene-1 h1",{y:60,opacity:0,duration:.56,ease:"expo.out"},.36).from("#scene-1 .subline",{x:-44,opacity:0,duration:.44,ease:"power2.out"},.82);
    tl.fromTo("#scene-2",{x:170,opacity:0},{x:0,opacity:1,duration:.42,ease:"power2.inOut"},3.05).to("#scene-1",{x:-120,opacity:0,duration:.42,ease:"power2.inOut"},3.05).from("#scene-2 .label",{y:32,opacity:0,duration:.36,ease:"power3.out"},3.28).from("#scene-2 h2",{scale:.96,opacity:0,duration:.5,ease:"expo.out"},3.52).from("#scene-2 .stamp",{scale:1.45,rotation:8,opacity:0,duration:.34,ease:"power4.out"},4.25).to("#scene-2 .stamp",{scale:1.08,duration:.28,repeat:5,yoyo:true,ease:"sine.inOut"},4.7);
    tl.fromTo("#scene-3",{y:145,opacity:0},{y:0,opacity:1,duration:.48,ease:"power3.inOut"},6.15).to("#scene-2",{y:-115,opacity:0,duration:.48,ease:"power3.inOut"},6.15).from("#scene-3 .label",{y:30,opacity:0,duration:.36,ease:"power2.out"},6.42).from("#scene-3 h2",{y:58,opacity:0,duration:.5,ease:"expo.out"},6.84).from("#scene-3 .action",{x:62,opacity:0,duration:.38,ease:"power4.out"},7.28).to("#root",{opacity:0,duration:.42,ease:"sine.in"},9.55);
    window.__timelines.main=tl;
  </script>
</body>
</html>`,
  };
}

function warmGrainFiles(model) {
  const hook = escapeHtml(model.hook);
  const question = escapeHtml(model.question);
  const action = escapeHtml(model.action);
  return {
    design: `## Style Prompt

HyperFrames warm-grain template language: cream paper, grain texture, forest green, ochre, terracotta, and serious printed-notice pacing.
`,
    index: `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=1920, height=1080"/><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><style>
*{box-sizing:border-box}@font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#f5f0e0;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif}#main-composition{position:relative;width:1920px;height:1080px;overflow:hidden;background:radial-gradient(circle at 18% 20%,rgba(196,93,62,.2),rgba(196,93,62,0) 28%),radial-gradient(circle at 84% 80%,rgba(59,94,58,.18),rgba(59,94,58,0) 30%),#f5f0e0}.grain{position:absolute;inset:-50%;width:200%;height:200%;opacity:.8;background:repeating-linear-gradient(0deg,rgba(43,33,24,.045) 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,rgba(43,33,24,.032) 0 1px,transparent 1px 5px);z-index:100;pointer-events:none}.comp-layer{position:absolute;inset:0;pointer-events:none}.rule{position:absolute;left:0;right:0;height:2px;background:rgba(122,98,72,.28)}.top{top:155px}.bottom{bottom:140px}
</style></head><body><div id="main-composition" data-composition-id="main-video" data-width="1920" data-height="1080" data-start="0" data-duration="10"><div class="rule top" data-layout-ignore></div><div class="rule bottom" data-layout-ignore></div><div class="grain" data-layout-ignore></div><div id="intro-layer" class="comp-layer" data-composition-id="intro" data-composition-src="compositions/intro.html" data-start="0" data-duration="3.1" data-track-index="1"></div><div id="graphics-layer" class="comp-layer" data-composition-id="graphics" data-composition-src="compositions/graphics.html" data-start="0" data-duration="10" data-track-index="2"></div><div id="captions-layer" class="comp-layer" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="10" data-track-index="3"></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.to("#main-composition",{opacity:0,duration:.38,ease:"sine.in"},9.62);window.__timelines["main-video"]=tl;</script></div></body></html>`,
    compositions: {
      "intro.html": `<template id="intro-template"><div id="intro-root" data-composition-id="intro" data-width="1920" data-height="1080" data-duration="3.1"><div class="container"><div class="title-card"><p class="eyebrow">WARM GRAIN</p><h1>${hook}</h1><p>${escapeHtml(model.title)}</p></div></div><style>@font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}#intro-root .container{width:100%;height:100%;display:flex;align-items:center;padding:92px 120px;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif}#intro-root .title-card{width:980px;padding:48px 58px 54px;border-radius:28px;background:#3b5e3a;box-shadow:0 24px 70px rgba(43,33,24,.18);opacity:0}#intro-root .eyebrow{margin:0 0 22px;color:#f6d8a0;font-size:34px;font-weight:800;letter-spacing:.08em}#intro-root h1{margin:0;color:#f5f0e0;font-size:82px;font-weight:900;line-height:1.12}#intro-root p:last-child{margin:24px 0 0;color:#f6d8a0;font-size:36px;line-height:1.34}</style><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script>(()=>{const tl=gsap.timeline({paused:true});tl.fromTo("#intro-root .title-card",{opacity:0,xPercent:-120},{opacity:1,xPercent:0,duration:.72,ease:"power2.out"},.18).from("#intro-root .eyebrow",{y:24,opacity:0,duration:.36,ease:"power3.out"},.42).from("#intro-root h1",{y:42,opacity:0,duration:.48,ease:"expo.out"},.62).from("#intro-root p:last-child",{x:-28,opacity:0,duration:.38,ease:"sine.out"},1.08);window.__timelines=window.__timelines||{};window.__timelines.intro=tl;})();</script></div></template>`,
      "graphics.html": `<template id="graphics-template"><div id="graphics-root" data-layout-allow-overlap data-composition-id="graphics" data-width="1920" data-height="1080" data-duration="10"><div id="pill">${question}</div><div id="notice"><strong>Notice</strong><span>${action}</span></div><div id="final">Start now</div><style>@font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}#graphics-root{position:relative;width:1920px;height:1080px;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif;color:#2b2118}#pill{position:absolute;left:1060px;top:260px;width:650px;min-height:220px;border-radius:110px;background:#cc8832;display:flex;align-items:center;justify-content:center;text-align:center;padding:34px 56px;font-size:52px;font-weight:900;opacity:0}#notice{position:absolute;left:118px;top:320px;width:760px;display:grid;grid-template-columns:150px 1fr;gap:24px;padding:38px 44px;border-radius:28px;background:rgba(122,98,72,.14);border:2px solid rgba(122,98,72,.22);opacity:0}#notice strong{color:#8f2b20;font-size:44px}#notice span{font-size:35px;line-height:1.3;font-weight:800}#final{position:absolute;left:520px;top:710px;width:870px;height:190px;border-radius:38px;background:#cc8832;color:#2b2118;display:flex;align-items:center;justify-content:center;font-size:64px;font-weight:900;opacity:0}</style><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script>(()=>{const tl=gsap.timeline({paused:true});tl.fromTo("#pill",{opacity:0,y:-42,scale:.82},{opacity:1,y:0,scale:1,duration:.78,ease:"back.out(1.5)"},3.35).fromTo("#notice",{opacity:0,x:-46,scale:.96},{opacity:1,x:0,scale:1,duration:.62,ease:"power3.out"},3.65).to("#pill",{scale:1.06,duration:.3,repeat:4,yoyo:true,ease:"sine.inOut"},4.6).to("#pill",{opacity:0,scale:.86,duration:.32,ease:"power2.in"},6.25).to("#notice",{opacity:0,y:-24,duration:.32,ease:"power2.in"},6.25).fromTo("#final",{opacity:0,y:54,scale:.9},{opacity:1,y:0,scale:1,duration:.72,ease:"back.out(1.35)"},6.55);window.__timelines=window.__timelines||{};window.__timelines.graphics=tl;})();</script></div></template>`,
      "captions.html": `<template id="captions-template"><div id="captions-root" data-layout-allow-overlap data-composition-id="captions" data-width="1920" data-height="1080" data-duration="10"><div class="captions-container"><div id="caption-box"><span id="caption-text"></span></div></div><style>@font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}#captions-root .captions-container{width:100%;height:100%;display:flex;justify-content:center;align-items:flex-end;padding:0 130px 112px;pointer-events:none}#caption-box{max-width:1500px;padding:18px 42px;border-radius:28px;background:#7a6248;opacity:0;box-shadow:0 14px 32px rgba(43,33,24,.18)}#caption-text{display:block;color:#f5f0e0;font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif;font-size:42px;font-weight:800;text-align:center;line-height:1.22}</style><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><script>(()=>{const lines=[{text:${jsString(model.caption1)},start:.2,end:2.65},{text:${jsString(model.caption2)},start:3.15,end:6.25},{text:${jsString(model.caption3)},start:6.65,end:9.25}];const tl=gsap.timeline({paused:true});const box=document.querySelector("#caption-box");const textEl=document.querySelector("#caption-text");lines.forEach((line)=>{tl.to(box,{opacity:1,duration:.14,ease:"power2.out",overwrite:"auto",onStart:()=>{textEl.textContent=line.text}},line.start);tl.to(box,{opacity:0,duration:.14,ease:"power2.in",overwrite:"auto"},line.end)});window.__timelines=window.__timelines||{};window.__timelines.captions=tl;})();</script></div></template>`,
    },
  };
}

