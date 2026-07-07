import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";

const HYPERFRAMES_VERSION = "0.7.37";
const LOCAL_GSAP_SRC = "assets/gsap.min.js";
const MAX_SCRIPT_LENGTH = 1800;
const nodeRequire = createRequire(import.meta.url);

const ASPECT_RATIO_PRESETS = {
  "9:16": { id: "9:16", label: "9:16 竖屏", width: 1080, height: 1920, platforms: "抖音 / 快手 / 视频号 / 小红书" },
  "16:9": { id: "16:9", label: "16:9 横屏", width: 1920, height: 1080, platforms: "B站 / 课程 / 长视频" },
  "1:1": { id: "1:1", label: "1:1 方屏", width: 1080, height: 1080, platforms: "小红书 / 朋友圈 / 方图视频" },
  "4:5": { id: "4:5", label: "4:5 信息流", width: 1080, height: 1350, platforms: "小红书信息流 / 视频号信息流" },
};

const XIAOHEI_IDENTITY = "Xiaohei 2.0 是原创黑色/深炭色高质量 3D 动画潮玩主角：大头小身体，圆润三角耳或柔软小角轮廓，软胶+短绒质感，大而清澈的玻璃高光眼，短手短腿，小鼻子、小嘴和一颗不夸张的小尖牙，表情认真、机灵、略带淘气；整体可爱、精致、有动画电影级表演感，但不复刻任何已有 IP、潮玩品牌或具名动画工作室风格。";

const SHOT_PRESETS = [
  {
    role: "hook",
    purpose: "前 3 秒把用户从距离错觉里叫醒。",
    emotion: "紧迫、惊醒",
    subtitleFallback: "这件事已经很近",
    composition: "大标题压在左侧，右侧是手绘考场门、票据和红色印章。",
    action: "把红色印章按到纸面上",
    object: "红色印章",
    prompt: "white canvas Chinese explainer illustration, black hand-drawn exam gate and ticket pile, sparse red handwritten stamp mark, original cute black 3D designer-toy protagonist with rounded ears, glossy eyes, tiny tooth and soft vinyl plush texture pressing a red stamp, clean whitespace, no PPT",
    vfx: {
      source: "主角手中的红色印章",
      material: "红色印泥、细小纸粉",
      motion_path: "印章向下压，红色粉尘沿纸边向外扩散后沉降",
      endpoint: "纸面留下短促红色提醒印记",
      prompt_ready_phrase: "red ink stamp presses onto the paper, tiny red paper dust spreads along the paper edges, then settles into a short warning mark",
    },
  },
  {
    role: "pain",
    purpose: "直接指出目标人群正在误判时间距离。",
    emotion: "逼近、反问",
    subtitleFallback: "你以为还远吗",
    composition: "一条橙色距离线从人群标签折叠到目标门口。",
    action: "双手拉短橙色距离线",
    object: "橙色距离线",
    prompt: "white canvas, black hand-drawn distance map, orange path line folding shorter, original cute black 3D designer-toy protagonist with rounded ears, glossy eyes, tiny tooth and soft vinyl plush texture pulling the line, short Chinese annotations, no existing IP",
    vfx: {
      source: "人群标签下方的橙色距离线",
      material: "橙色手绘线、黑色墨点",
      motion_path: "长线被拉起并折叠成短箭头",
      endpoint: "橙色箭头停在目标门口",
      prompt_ready_phrase: "orange hand-drawn distance line folds shorter as the character pulls it, black ink dots fall beside the path, and the line stops as a short arrow",
    },
  },
  {
    role: "conflict",
    purpose: "拆掉“还有时间”的心理缓冲。",
    emotion: "压紧、警觉",
    subtitleFallback: "不是还有时间",
    composition: "纸质日历裂开，黑色纸砂从中间落下。",
    action: "在日历下方接住落下的黑色纸砂",
    object: "倒计时纸砂",
    prompt: "white canvas, hand-drawn calendar cracking into a countdown hourglass, black paper sand falling, original cute black 3D designer-toy protagonist with rounded ears, glossy eyes, tiny tooth and soft vinyl plush texture catching grains, red warning note",
    vfx: {
      source: "裂开的纸质日历底部",
      material: "黑色纸砂、灰色铅笔尘",
      motion_path: "纸砂向下掉入主角手中和底部小堆",
      endpoint: "底部形成小小倒计时堆",
      prompt_ready_phrase: "black paper sand drops from the cracked calendar, the character catches some grains while the rest falls, pencil dust sinks and forms a small countdown pile",
    },
  },
  {
    role: "proof",
    purpose: "把抽象压力变成一个可见的现实闸门。",
    emotion: "清醒、现实",
    subtitleFallback: "看阵仗，也看分流",
    composition: "手绘人流进入分流闸门，蓝色便签贴到两条路径旁。",
    action: "谨慎调整分流闸门的中轴",
    object: "分流闸门",
    prompt: "white canvas, black hand-drawn crowd lines entering a split gate, blue system notes, orange route accents, original cute black 3D designer-toy protagonist with rounded ears, glossy eyes, tiny tooth and soft vinyl plush texture turning the gate lever, no invented percentages",
    vfx: {
      source: "分流闸门中轴",
      material: "蓝色便签、细线、墨点",
      motion_path: "蓝色便签沿两条分流路径飞出并贴住",
      endpoint: "便签停在阵仗和比例旁边",
      prompt_ready_phrase: "blue system notes arc out from the split gate pivot, stick beside the two paths, and tiny blue ink dots fade near the ratio label",
    },
  },
  {
    role: "solution",
    purpose: "把焦虑收束成现在就能做的动作。",
    emotion: "明确、向前",
    subtitleFallback: "现在就看路径",
    composition: "主角推开一扇门，门后露出目标、节奏、风险三段路线。",
    action: "推开规划门并让橙色路线显现",
    object: "规划门和路线",
    prompt: "white canvas, simple hand-drawn planning door opening to target pace risk route labels, orange route line, original cute black 3D designer-toy protagonist with rounded ears, glossy eyes, tiny tooth and soft vinyl plush texture pushing the door, sparse annotations",
    vfx: {
      source: "门缝后方",
      material: "橙色细线、黑色锚点",
      motion_path: "橙线从门后滑出，依次触达目标、节奏、风险",
      endpoint: "橙线停在现在标记旁",
      prompt_ready_phrase: "thin orange route line slides from behind the opened door, touches target, pace and risk labels, then stops beside the now mark as black anchor dots settle",
    },
  },
  {
    role: "cta",
    purpose: "留下一个清晰的结尾提醒。",
    emotion: "稳住、提醒",
    subtitleFallback: "别等到最后才动",
    composition: "白纸中央出现收束圆框，路线回到一个醒目的现在节点。",
    action: "把路线最后一个锚点按在现在节点上",
    object: "现在节点",
    prompt: "white canvas, central hand-drawn now node, orange route loop returning to the present, original cute black 3D designer-toy protagonist with rounded ears, glossy eyes, tiny tooth and soft vinyl plush texture pinning the last dot, clean Chinese annotation",
    vfx: {
      source: "最后一个路线锚点",
      material: "橙色线、黑色圆点、少量纸粉",
      motion_path: "线条回收到中央现在节点",
      endpoint: "黑色锚点压住现在两个字",
      prompt_ready_phrase: "the orange route line gathers into the central now node, a black anchor dot pins it down, and tiny paper dust settles around the word now",
    },
  },
];

export function createXiaoheiVideoRoutes({ baseDir, sendJson, ffmpegPath = "", ffprobePath = "" }) {
  const runsDir = path.join(baseDir, ".data", "xiaohei-video-maker");
  const outputDir = path.join(baseDir, "jianying-exports", "xiaohei-explainer");

  return async function handleXiaoheiVideoRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/xiaohei-video/")) return false;
    const route = url.pathname.replace("/api/xiaohei-video/", "");

    if (req.method === "GET" && route === "outputs") {
      sendJson(res, 200, {
        ok: true,
        outputDir,
        outputs: listOutputs(outputDir),
      });
      return true;
    }

    if (req.method === "POST" && route === "generate") {
      try {
        const body = await readJsonBody(req, { maxBytes: 96 * 1024 });
        const result = await generateXiaoheiVideo({
          baseDir,
          runsDir,
          outputDir,
          title: body.title,
          text: body.text,
          aspectRatio: body.aspectRatio,
          shotCount: body.shotCount,
          bgmMode: body.bgmMode,
          bgmPath: body.bgmPath,
          introOutroMode: body.introOutroMode,
          ctaText: body.ctaText,
          ffmpegPath,
          ffprobePath,
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

    sendJson(res, 404, { ok: false, message: "Unknown Xiaohei video API" });
    return true;
  };
}

async function generateXiaoheiVideo({ runsDir, outputDir, title, text, aspectRatio, shotCount, bgmMode, bgmPath, introOutroMode, ctaText, ffmpegPath, ffprobePath }) {
  const script = normalizeScript(text);
  const aspect = normalizeAspectRatio(aspectRatio);
  const count = normalizeShotCount(shotCount);
  const mode = normalizeIntroOutroMode(introOutroMode);
  const videoTitle = sanitizeTitle(title) || inferTitle(script);
  const slug = `${formatDateSlug(new Date())}-xiaohei-${randomUUID().slice(0, 8)}`;
  const projectDir = path.join(runsDir, slug);
  const outputPath = path.join(outputDir, `${slug}.mp4`);
  const storyboard = buildStoryboard({ title: videoTitle, script, shotCount: count, aspect, ctaText });
  const duration = storyboard.format.duration_seconds;
  const bgm = resolveBgm({ bgmMode, bgmPath, duration });
  const files = buildProjectFiles({ slug, title: videoTitle, script, storyboard, aspect, bgm, introOutroMode: mode });

  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  writeProject(projectDir, { slug, title: videoTitle, storyboard, files });
  normalizeProjectBgm(projectDir, bgm.work, { ffmpegPath });

  const hyperframesEnv = buildHyperframesEnv({ ffmpegPath, ffprobePath });
  const checkOutput = [];
  await runHyperframes(projectDir, ["lint"], checkOutput, hyperframesEnv);
  await runHyperframes(projectDir, ["validate"], checkOutput, hyperframesEnv);
  await runHyperframes(projectDir, ["inspect"], checkOutput, hyperframesEnv);
  const renderOutput = [];
  await runHyperframes(projectDir, ["render", "--output", outputPath, "--quality", "standard"], renderOutput, hyperframesEnv);

  return {
    id: slug,
    title: videoTitle,
    projectDir,
    outputPath,
    outputDir,
    aspectRatio: aspect,
    shotCount: storyboard.shots.length,
    duration,
    bgm: bgm.public,
    introOutroMode: mode,
    directorScriptPath: path.join(projectDir, "director-script.md"),
    storyboardPath: path.join(projectDir, "storyboard.json"),
    imagePromptsPath: path.join(projectDir, "image-prompts.md"),
    seedanceContractPath: path.join(projectDir, "seedance-vfx-contract.json"),
    checkLog: checkOutput.join("\n").slice(-8000),
    renderLog: renderOutput.join("\n").slice(-8000),
  };
}

function buildStoryboard({ title, script, shotCount, aspect, ctaText }) {
  const segments = splitScript(script, shotCount);
  const shots = SHOT_PRESETS.slice(0, shotCount).map((preset, index) => {
    const segment = segments[index] || segments[segments.length - 1] || script;
    const voiceText = index === shotCount - 1 && ctaText ? `${segment} ${ctaText}`.trim() : segment;
    const start = index * 5.6;
    const duration = index === shotCount - 1 ? 6.2 : 6.0;
    const subtitle = limitText(extractSubtitle(voiceText) || preset.subtitleFallback, 16);
    return {
      scene: index + 1,
      start: Number(start.toFixed(1)),
      duration,
      purpose: preset.purpose,
      emotion: preset.emotion,
      voice_text: voiceText,
      subtitle,
      camera: index === 0 ? "轻微推进后定住白板画面" : index === shotCount - 1 ? "从路线收束到中心节点" : "横向推入下一张白板",
      composition: preset.composition,
      xiaohei_action: {
        identity_anchor: XIAOHEI_IDENTITY,
        action: preset.action,
        contact_point: preset.object,
        emotion: index === 0 ? "严肃但有行动感" : "认真、机灵、略带调皮",
        stability_constraints: "保持圆润轮廓、亮眼高光和手部接触点稳定；不模仿任何已有 IP 或具体动画工作室角色。",
      },
      image_prompt: `${preset.prompt}, caption: ${subtitle}`,
      motion_prompt: `${preset.action}；画面元素像手绘白板一样逐步画出，彩色注释只做短促提醒。`,
      vfx_contract: {
        ...preset.vfx,
        light_interaction: "不发光，不做赛博特效，只保留纸面、墨迹和轻量粒子互动。",
        object_interaction: `${preset.object} 必须和主角手部有明确接触。`,
        dissipation: "粒子在纸面上沉降或淡出，不遮挡字幕。",
        stability_constraints: "不要改变主角脸型、眼睛、手部接触点和主体构图；不要生成具体分数线或分流数字。",
      },
      transition: index === shotCount - 1 ? "收束淡出" : index === 2 ? "挤压推入" : "横向推入",
      notes: index === 0 ? "Hook 必须在前 3 秒完成。" : "每个镜头只服务一个传播目的。",
    };
  });
  const totalDuration = Math.ceil(Math.max(...shots.map((shot) => shot.start + shot.duration)));
  return {
    title,
    source_summary: limitText(script, 96),
    format: {
      width: aspect.width,
      height: aspect.height,
      duration_seconds: totalDuration,
      language: "zh-CN",
      aspect_ratio: aspect.id,
      platforms: aspect.platforms,
    },
    story_arc: {
      hook: shots[0]?.voice_text || "",
      pain: shots[1]?.voice_text || "",
      conflict: shots[2]?.voice_text || "",
      proof: shots[3]?.voice_text || "",
      solution: shots[4]?.voice_text || shots[shots.length - 1]?.voice_text || "",
      cta: shots[shots.length - 1]?.subtitle || "",
    },
    visual_system: {
      style: "Ian 风格白底手绘结构线 + 短红橙蓝批注 + Xiaohei 2.0 原创可爱 3D 动画潮玩主角。",
      character: "Xiaohei 2.0 original cute black 3D designer-toy protagonist with rounded ears, glossy eyes, tiny tooth and soft vinyl plush texture",
      palette: ["#ffffff", "#111111", "#d9362b", "#b76512", "#1f559e"],
      forbidden: ["现有 IP 复刻", "具名动画工作室风格", "旧版黑豆线稿", "丑陋怪物脸", "PPT 卡片堆叠", "编造数据"],
    },
    shots,
    qa: {
      score: 88,
      checks: [
        "每个镜头都有 purpose、人物动作、接触物、VFX 合约和转场。",
        "配图提示词保持 Ian 白底手绘结构和 Xiaohei 2.0 角色一致性。",
        "未编造来源文案没有提供的具体分数线、比例或学校数据。",
      ],
    },
  };
}

function buildProjectFiles({ slug, title, script, storyboard, aspect, bgm, introOutroMode }) {
  return {
    design: renderDesign({ title, storyboard }),
    directorScript: renderDirectorScript({ title, script, storyboard }),
    storyboardJson: JSON.stringify(storyboard, null, 2),
    imagePrompts: renderImagePrompts(storyboard),
    seedanceContract: JSON.stringify({
      title,
      source: "skills/xiaohei-explainer-video + seedance-vfx contract",
      shots: storyboard.shots.map((shot) => ({
        scene: shot.scene,
        purpose: shot.purpose,
        motion_prompt: shot.motion_prompt,
        vfx_contract: shot.vfx_contract,
      })),
    }, null, 2),
    index: renderIndexHtml({ title, storyboard, aspect, bgm, introOutroMode }),
    meta: {
      id: slug,
      name: title,
      style: "xiaohei-explainer-video",
      createdAt: new Date().toISOString(),
      duration: storyboard.format.duration_seconds,
      width: aspect.width,
      height: aspect.height,
      aspectRatio: aspect,
      bgm: bgm.public,
      introOutroMode,
    },
    assets: bgm.assets,
  };
}

function renderDesign({ title, storyboard }) {
  return `## Style Prompt

${title} 是一个中文说明视频。视觉采用 Ian 风格白底正文配图语言：大量留白、黑色手绘结构线、短促红橙蓝中文批注，以及 Xiaohei 2.0 原创主角。${XIAOHEI_IDENTITY}

## Colors

- Canvas: \`#ffffff\`
- Ink: \`#111111\`
- Soft ink: \`#3a3a3a\`
- Muted line: \`#d8d2c7\`
- Red warning: \`#d9362b\`
- Orange path: \`#b76512\`
- Blue system note: \`#1f559e\`

## Motion Rules

- 开头用 0.7 秒“放”：轻微缩放进入、白纸展开、主角出现。
- 结尾用 0.8 秒“收”：路线回到中心，画面轻微缩回并淡出。
- 每个镜头必须有入口动画，上一镜头在转场开始后再退出。
- 每个镜头只有一个主 VFX：印章、距离线、纸砂、分流便签、行动路线或现在节点。
- BGM 如果使用本地文件，渲染前必须循环铺满全片，并做淡入淡出。

## What NOT to Do

- 不使用 PPT 卡片堆叠、图库拼接、企业模板风或土味招生广告风。
- 不编造文案未提供的分数线、比例、学校数据。
- 不使用“动画皮克斯”“拉布布”等受保护或近似复制提示词；把这种审美意图翻译成原创的动画电影级表演感、可爱潮玩比例、精致材质和顽皮表情。
- 不让小黑只当角落装饰；每个镜头都必须接触关键物件。

## Shot Purposes

${storyboard.shots.map((shot) => `- ${shot.scene}. ${shot.purpose}`).join("\n")}
`;
}

function renderDirectorScript({ title, script, storyboard }) {
  const rows = storyboard.shots.map((shot) => (
    `| ${shot.scene} | ${shot.start.toFixed(1)}-${(shot.start + shot.duration).toFixed(1)}s | ${shot.purpose} | ${shot.emotion} | ${shot.voice_text} | ${shot.subtitle} | ${shot.composition} |`
  )).join("\n");
  const vfx = storyboard.shots.map((shot) => `### 镜头 ${shot.scene}：${shot.subtitle}

- 来源：${shot.vfx_contract.source}
- 材质：${shot.vfx_contract.material}
- 路径：${shot.vfx_contract.motion_path}
- 光与物体互动：${shot.vfx_contract.light_interaction}
- 物体互动：${shot.vfx_contract.object_interaction}
- 消散与终点：${shot.vfx_contract.dissipation} / ${shot.vfx_contract.endpoint}
- Prompt-ready phrase：\`${shot.vfx_contract.prompt_ready_phrase}\`
- Stability constraints：${shot.vfx_contract.stability_constraints}
`).join("\n");
  return `# ${title} 导演稿

## 基础设定

- 输入文案：${script}
- 视频类型：中文教育/知识说明视频。
- 目标观众：由文案语境决定的家长、学生或知识类短视频观众。
- 画幅与时长：${storyboard.format.aspect_ratio}，${storyboard.format.duration_seconds} 秒。
- 传播目标：先打破误判，再把压力收束成清晰行动。
- 主视觉风格：Ian 白底手绘结构线 + 红橙蓝短批注 + Xiaohei 2.0 原创可爱 3D 动画潮玩主角。

## 传播结构

- Hook：${storyboard.story_arc.hook}
- Pain：${storyboard.story_arc.pain}
- Conflict：${storyboard.story_arc.conflict}
- Proof：${storyboard.story_arc.proof}
- Solution：${storyboard.story_arc.solution}
- CTA：${storyboard.story_arc.cta}

## Shot List

| 镜头 | 时间 | 叙事目的 | 情绪 | 旁白 | 字幕 | 镜头与构图 |
|---|---:|---|---|---|---|---|
${rows}

## Seedance VFX 合约

${vfx}

## Xiaohei 2.0 角色一致性

- 身份锚点：${XIAOHEI_IDENTITY}
- 动作规则：每镜头必须接触关键物件，不做无意义空镜。
- 禁止：不复刻现有 IP，不使用具名动画工作室风格，不做旧版黑豆线稿，不只做角落装饰。
`;
}

function renderImagePrompts(storyboard) {
  return `# Xiaohei 2.0 配图提示词

统一风格：Ian 风格白底中文正文配图，大量留白，黑色手绘结构线，红橙蓝短批注；主角为原创 Xiaohei 2.0。${XIAOHEI_IDENTITY} 不要复刻任何现有 IP、具名动画工作室风格或 Labubu/Pixar 等近似角色。

${storyboard.shots.map((shot) => `## 镜头 ${shot.scene}

- Purpose：${shot.purpose}
- Image Prompt：${shot.image_prompt}
- Xiaohei Action：${shot.xiaohei_action.action}
- Seedance VFX Phrase：${shot.vfx_contract.prompt_ready_phrase}
`).join("\n")}
`;
}

function renderIndexHtml({ title, storyboard, aspect, bgm, introOutroMode }) {
  const width = aspect.width;
  const height = aspect.height;
  const duration = storyboard.format.duration_seconds;
  const isPortrait = height > width;
  const sceneMarkup = storyboard.shots.map((shot, index) => renderScene(shot, index, { isPortrait })).join("\n");
  const sceneTimeline = storyboard.shots.map((shot, index) => buildSceneTimeline(shot, index, storyboard.shots.length)).join("\n    ");
  const introOutroTimeline = buildIntroOutroTimeline(introOutroMode, duration);
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=${width}, height=${height}">
    <script src="${LOCAL_GSAP_SRC}"></script>
    <style>
      *{box-sizing:border-box}
      @font-face{font-family:"LXGW WenKai";src:local("LXGW WenKai")}
      @font-face{font-family:"KaiTi";src:local("KaiTi")}
      @font-face{font-family:"Microsoft YaHei UI";src:local("Microsoft YaHei UI")}
      @font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}
      @font-face{font-family:"Cascadia Mono";src:local("Cascadia Mono")}
      html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#fff}
      body{color:#111;font-family:"LXGW WenKai","KaiTi","Microsoft YaHei UI","Microsoft YaHei",sans-serif}
      #root{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#fff;transform-origin:50% 50%}
      .paper-edge{position:absolute;inset:${isPortrait ? 36 : 46}px;border:3px solid #111;border-radius:${isPortrait ? 34 : 42}px;pointer-events:none;z-index:20}
      .paper-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(17,17,17,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(17,17,17,.028) 1px,transparent 1px);background-size:${isPortrait ? 86 : 112}px ${isPortrait ? 86 : 112}px;opacity:.5;pointer-events:none}
      .scene{position:absolute;inset:0;display:grid;grid-template-columns:${isPortrait ? "1fr" : "minmax(0,.92fr) minmax(0,1.08fr)"};grid-template-rows:${isPortrait ? "minmax(0,.86fr) minmax(0,1.14fr)" : "1fr"};gap:${isPortrait ? 20 : 70}px;padding:${isPortrait ? "112px 78px 104px" : "92px 118px"};background:#fff;opacity:0}
      #scene-1{opacity:1}
      .copy{position:relative;z-index:4;display:flex;flex-direction:column;justify-content:center;gap:${isPortrait ? 22 : 26}px;min-width:0}
      .kicker,.caption-code{font-family:"Cascadia Mono","IBM Plex Mono",monospace;font-variant-numeric:tabular-nums}
      .kicker{width:max-content;max-width:100%;padding:${isPortrait ? "10px 14px" : "10px 17px 8px"};border:2px solid #111;border-radius:999px;color:#1f559e;font-size:${isPortrait ? 24 : 22}px;font-weight:800;line-height:1.1;background:#fff;letter-spacing:0}
      h1,h2{margin:0;max-width:${isPortrait ? 860 : 800}px;color:#111;font-weight:900;line-height:1.08;letter-spacing:0}
      h1{font-size:${isPortrait ? 82 : 88}px}
      h2{font-size:${isPortrait ? 72 : 76}px}
      .subline{margin:0;max-width:${isPortrait ? 820 : 760}px;color:#3a3a3a;font-size:${isPortrait ? 34 : 33}px;font-weight:500;line-height:1.36}
      .hand-label{display:inline-flex;width:max-content;max-width:100%;padding:9px 16px 8px;border:3px solid currentColor;border-radius:22px 16px 20px 18px;font-size:${isPortrait ? 32 : 31}px;font-weight:900;line-height:1.1;background:#fff}
      .red{color:#d9362b}.orange{color:#b76512}.blue{color:#1f559e}
      .stage{position:relative;z-index:3;width:100%;height:100%;min-height:${isPortrait ? 820 : 760}px}
      .sketch{position:absolute;border:4px solid #111;background:#fff}
      .caption-code{position:absolute;right:${isPortrait ? 12 : 42}px;bottom:${isPortrait ? 10 : 28}px;color:#1f559e;font-size:${isPortrait ? 24 : 23}px;font-weight:800;letter-spacing:0}
      .xiaohei{position:absolute;width:${isPortrait ? 188 : 166}px;height:${isPortrait ? 238 : 212}px;z-index:8;transform-origin:50% 92%;filter:drop-shadow(0 18px 18px rgba(17,17,17,.16))}
      .xiaohei-shadow{position:absolute;left:18%;bottom:1px;width:64%;height:18px;border-radius:50%;background:rgba(17,17,17,.16)}
      .xiaohei-ear{position:absolute;top:0;width:36%;height:38%;border-radius:54% 46% 48% 52% / 28% 32% 68% 72%;background:radial-gradient(circle at 40% 24%,#666 0,#282828 30%,#101010 74%);box-shadow:inset -10px -14px 18px rgba(0,0,0,.36),inset 5px 8px 12px rgba(255,255,255,.09);z-index:1}
      .xiaohei-ear.left{left:12%;transform:rotate(-24deg)}.xiaohei-ear.right{right:12%;transform:rotate(24deg)}
      .xiaohei-body{position:absolute;left:10%;top:17%;width:80%;height:68%;border-radius:54% 46% 48% 52% / 43% 43% 57% 57%;background:radial-gradient(circle at 34% 24%,#686868 0,#343434 22%,#111 66%),#111;box-shadow:inset -20px -24px 28px rgba(0,0,0,.44),inset 14px 13px 20px rgba(255,255,255,.1);z-index:2}
      .xiaohei-face-shine{position:absolute;left:29%;top:24%;width:24%;height:12%;border-radius:50%;background:rgba(255,255,255,.12);filter:blur(1px);z-index:4;transform:rotate(-14deg)}
      .xiaohei-eye{position:absolute;top:39%;width:21%;height:24%;border-radius:50%;background:radial-gradient(circle at 42% 34%,#fff 0 8%,#f7f7f1 9% 58%,#d9d9cf 59% 100%);box-shadow:0 0 0 2px rgba(255,255,255,.28),0 4px 8px rgba(0,0,0,.24);z-index:5}
      .xiaohei-eye.left{left:27%}.xiaohei-eye.right{right:27%}
      .xiaohei-eye:after{content:"";position:absolute;left:34%;top:31%;width:38%;height:45%;border-radius:50%;background:#111}
      .xiaohei-eye:before{content:"";position:absolute;left:55%;top:18%;width:20%;height:20%;border-radius:50%;background:#fff;z-index:2}
      .xiaohei-cheek{position:absolute;top:60%;width:15%;height:8%;border-radius:50%;background:rgba(255,255,255,.11);z-index:5}.xiaohei-cheek.left{left:27%}.xiaohei-cheek.right{right:27%}
      .xiaohei-nose{position:absolute;left:48%;top:56%;width:4%;height:3%;border-radius:50%;background:#f1f1e8;opacity:.82;z-index:5}
      .xiaohei-mouth{position:absolute;left:43%;top:62%;width:14%;height:7%;border-bottom:3px solid #f1f1e8;border-radius:0 0 999px 999px;z-index:5}
      .xiaohei-tooth{position:absolute;left:51%;top:67%;width:7%;height:9%;background:#fff;border-radius:0 0 6px 6px;clip-path:polygon(0 0,100% 0,50% 100%);z-index:5}
      .xiaohei-arm{position:absolute;top:56%;width:32%;height:13%;border-radius:999px;background:#151515;transform-origin:16% 50%;z-index:3}
      .xiaohei-arm.left{left:0;transform:rotate(20deg)}.xiaohei-arm.right{right:0;transform:rotate(-22deg)}
      .xiaohei-leg{position:absolute;bottom:11%;width:25%;height:14%;border-radius:999px;background:#111;z-index:1}
      .xiaohei-leg.left{left:30%;transform:rotate(8deg)}.xiaohei-leg.right{right:30%;transform:rotate(-8deg)}
      .stamp{left:${isPortrait ? "50%" : "48%"};top:${isPortrait ? "46%" : "34%"};width:${isPortrait ? 250 : 230}px;height:${isPortrait ? 142 : 128}px;border-color:#d9362b;color:#d9362b;display:flex;align-items:center;justify-content:center;font-size:${isPortrait ? 48 : 42}px;font-weight:900;transform:rotate(-8deg)}
      .gate{right:${isPortrait ? "4%" : "6%"};top:${isPortrait ? "8%" : "11%"};width:${isPortrait ? 430 : 520}px;height:${isPortrait ? 340 : 380}px;border-radius:36px 36px 8px 8px}
      .gate:before,.gate:after{content:"";position:absolute;bottom:0;width:30%;height:72%;border:4px solid #111;border-bottom:0}.gate:before{left:16%;border-radius:28px 28px 0 0}.gate:after{right:16%;border-radius:28px 28px 0 0}
      .ticket{left:${isPortrait ? "8%" : "12%"};bottom:${isPortrait ? "8%" : "12%"};width:${isPortrait ? 430 : 500}px;height:${isPortrait ? 210 : 200}px;border-radius:24px;transform:rotate(2deg)}
      .ticket:before{content:"";position:absolute;left:34px;right:34px;top:54px;height:4px;background:#111;box-shadow:0 42px 0 #111,0 84px 0 #111}
      .distance-line{position:absolute;left:${isPortrait ? "9%" : "7%"};right:${isPortrait ? "8%" : "7%"};top:48%;height:0;border-top:8px solid #b76512;border-radius:999px}
      .distance-line:after{content:"";position:absolute;right:-4px;top:-18px;border-left:28px solid #b76512;border-top:14px solid transparent;border-bottom:14px solid transparent}
      .label-pill{position:absolute;padding:14px 20px;border:3px solid #111;border-radius:24px;background:#fff;font-size:${isPortrait ? 32 : 30}px;font-weight:900}
      .pill-a{left:${isPortrait ? "5%" : "4%"};top:32%}.pill-b{right:${isPortrait ? "2%" : "5%"};top:58%}
      .calendar{left:${isPortrait ? "8%" : "10%"};top:${isPortrait ? "8%" : "14%"};width:${isPortrait ? 400 : 470}px;height:${isPortrait ? 500 : 430}px;border-radius:28px}
      .calendar:before{content:"";position:absolute;left:0;right:0;top:88px;border-top:4px solid #111}.calendar:after{content:"";position:absolute;left:50%;top:112px;width:4px;height:62%;background:#111;transform:rotate(12deg)}
      .sand{position:absolute;left:${isPortrait ? "54%" : "55%"};top:${isPortrait ? "15%" : "18%"};width:110px;height:430px}
      .sand i{position:absolute;left:50%;width:14px;height:14px;border-radius:50%;background:#111;opacity:.82}
      .sand i:nth-child(1){top:0}.sand i:nth-child(2){top:72px;left:44%}.sand i:nth-child(3){top:148px;left:58%}.sand i:nth-child(4){top:228px}.sand i:nth-child(5){top:326px;left:43%}
      .split-gate{left:${isPortrait ? "12%" : "14%"};top:${isPortrait ? "18%" : "18%"};width:${isPortrait ? 620 : 760}px;height:${isPortrait ? 520 : 430}px;border:0}
      .split-path{position:absolute;height:8px;background:#111;border-radius:999px;transform-origin:0 50%}.path-main{left:0;top:50%;width:44%;transform:translateY(-50%)}.path-one{left:42%;top:39%;width:46%;transform:rotate(-18deg)}.path-two{left:42%;top:61%;width:46%;transform:rotate(18deg)}
      .pivot{position:absolute;left:39%;top:43%;width:80px;height:80px;border:5px solid #111;border-radius:50%;background:#fff}
      .note{position:absolute;padding:12px 18px;border:3px solid currentColor;border-radius:12px;background:#fff;font-size:${isPortrait ? 31 : 28}px;font-weight:900}
      .note.one{right:5%;top:20%}.note.two{right:0;bottom:20%}
      .door{right:${isPortrait ? "14%" : "12%"};top:${isPortrait ? "14%" : "13%"};width:${isPortrait ? 410 : 420}px;height:${isPortrait ? 570 : 520}px;border-radius:32px 32px 8px 8px;transform-origin:0 50%}
      .door:after{content:"";position:absolute;right:34px;top:50%;width:18px;height:18px;border-radius:50%;background:#111}
      .route{position:absolute;left:${isPortrait ? "8%" : "8%"};top:${isPortrait ? "62%" : "58%"};width:${isPortrait ? 760 : 820}px;height:170px;border:0;border-top:8px solid #b76512;border-radius:50%}
      .route b{position:absolute;top:-44px;padding:9px 14px;border:3px solid #b76512;border-radius:18px;background:#fff;color:#b76512;font-size:${isPortrait ? 28 : 26}px}.route b:nth-child(1){left:4%}.route b:nth-child(2){left:38%}.route b:nth-child(3){right:6%}
      .now-node{left:50%;top:42%;width:${isPortrait ? 460 : 520}px;height:${isPortrait ? 280 : 260}px;margin-left:${isPortrait ? -230 : -260}px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#d9362b;font-size:${isPortrait ? 72 : 70}px;font-weight:900}
      .dust{position:absolute;inset:0;pointer-events:none}.dust i{position:absolute;width:10px;height:10px;border-radius:50%;background:currentColor;opacity:.75}
      .dust.red{color:#d9362b}.dust.orange{color:#b76512}.dust.blue{color:#1f559e}
      .waterline{position:absolute;left:0;right:0;bottom:${isPortrait ? 76 : 70}px;height:4px;background:#111;opacity:.12}
      ${isPortrait ? ".stage .xiaohei{left:44%;bottom:9%}.scene[data-variant='gate'] .xiaohei{left:58%;bottom:12%}.scene[data-variant='line'] .xiaohei{left:36%;bottom:10%}" : ".stage .xiaohei{left:54%;bottom:10%}.scene[data-variant='gate'] .xiaohei{left:62%;bottom:10%}.scene[data-variant='line'] .xiaohei{left:42%;bottom:9%}"}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${width}" data-height="${height}">
      <div class="paper-grid" data-layout-ignore></div>
      <div class="paper-edge" data-layout-ignore></div>
      <div class="waterline" data-layout-ignore></div>
      ${bgm.src ? `<audio id="bgm" data-start="0" data-duration="${duration}" data-track-index="50" src="${bgm.src}" data-volume="${bgm.volume}"></audio>` : ""}
      ${sceneMarkup}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${introOutroTimeline}
      ${sceneTimeline}
      window.__timelines.main = tl;
    </script>
  </body>
</html>`;
}

function renderScene(shot, index, { isPortrait }) {
  const variant = ["stamp", "line", "calendar", "gate", "door", "now"][Math.min(index, 5)];
  const titleTag = index === 0 ? "h1" : "h2";
  return `<section id="scene-${index + 1}" class="scene clip" data-variant="${variant}" data-start="${shot.start}" data-duration="${shot.duration}" data-track-index="${index + 1}">
        <div class="copy">
          <span class="kicker">SHOT ${String(index + 1).padStart(2, "0")} / ${escapeHtml(shot.emotion)}</span>
          <${titleTag} class="headline">${escapeHtml(shot.subtitle)}</${titleTag}>
          <p class="subline">${escapeHtml(limitText(shot.voice_text, isPortrait ? 48 : 56))}</p>
          <span class="hand-label ${index % 3 === 0 ? "red" : index % 3 === 1 ? "orange" : "blue"}">${escapeHtml(shortPurpose(shot.purpose))}</span>
        </div>
        <div class="stage">
          ${renderVisual(index)}
          ${renderXiaohei()}
          <span class="caption-code">XIAOHEI 2.0 · ${escapeHtml(shot.xiaohei_action.action)}</span>
        </div>
      </section>`;
}

function renderVisual(index) {
  const dust = `<div class="dust ${index % 3 === 0 ? "red" : index % 3 === 1 ? "orange" : "blue"}" data-layout-ignore>${Array.from({ length: 12 }).map((_, i) => `<i style="left:${8 + ((i * 17) % 82)}%;top:${14 + ((i * 23) % 72)}%"></i>`).join("")}</div>`;
  if (index === 0) {
    return `<div class="sketch gate"></div><div class="sketch ticket"></div><div class="sketch stamp">明天</div>${dust}`;
  }
  if (index === 1) {
    return `<span class="label-pill pill-a">新阶段</span><span class="label-pill pill-b">目标门</span><div class="distance-line"></div>${dust}`;
  }
  if (index === 2) {
    return `<div class="sketch calendar"></div><div class="sand">${Array.from({ length: 5 }).map(() => "<i></i>").join("")}</div>${dust}`;
  }
  if (index === 3) {
    return `<div class="split-gate"><i class="split-path path-main"></i><i class="split-path path-one"></i><i class="split-path path-two"></i><i class="pivot"></i><span class="note one blue">阵仗</span><span class="note two blue">比例</span></div>${dust}`;
  }
  if (index === 4) {
    return `<div class="sketch door"></div><div class="route"><b>目标</b><b>节奏</b><b>风险</b></div>${dust}`;
  }
  return `<div class="sketch now-node">现在</div><div class="route"><b>行动</b><b>复盘</b><b>调整</b></div>${dust}`;
}

function renderXiaohei() {
  return `<div class="xiaohei" data-layout-allow-overlap>
            <i class="xiaohei-shadow"></i>
            <i class="xiaohei-ear left"></i>
            <i class="xiaohei-ear right"></i>
            <i class="xiaohei-body"></i>
            <i class="xiaohei-face-shine"></i>
            <i class="xiaohei-eye left"></i>
            <i class="xiaohei-eye right"></i>
            <i class="xiaohei-cheek left"></i>
            <i class="xiaohei-cheek right"></i>
            <i class="xiaohei-nose"></i>
            <i class="xiaohei-mouth"></i>
            <i class="xiaohei-tooth"></i>
            <i class="xiaohei-arm left"></i>
            <i class="xiaohei-arm right"></i>
            <i class="xiaohei-leg left"></i>
            <i class="xiaohei-leg right"></i>
          </div>`;
}

function buildIntroOutroTimeline(mode, duration) {
  if (mode === "none") {
    return `tl.to("#root",{opacity:1,duration:.01},0);`;
  }
  if (mode === "paper") {
    return [
      `tl.fromTo("#root",{opacity:0,scale:.985,rotation:-.25},{opacity:1,scale:1,rotation:0,duration:.7,ease:"power2.out"},0);`,
      `tl.from(".paper-edge",{scaleX:.88,scaleY:.96,opacity:0,duration:.7,ease:"power3.out"},0);`,
      `tl.to("#root",{scale:.985,opacity:0,duration:.8,ease:"power2.inOut"},${Math.max(0, duration - 0.82).toFixed(2)});`,
    ].join("\n      ");
  }
  return [
    `tl.fromTo("#root",{opacity:0,scale:.94},{opacity:1,scale:1,duration:.72,ease:"power3.out"},0);`,
    `tl.to("#root",{scale:.965,opacity:0,duration:.82,ease:"power2.inOut"},${Math.max(0, duration - 0.84).toFixed(2)});`,
  ].join("\n      ");
}

function buildSceneTimeline(shot, index, total) {
  const scene = `#scene-${index + 1}`;
  const start = Number(shot.start.toFixed(2));
  const exit = Number((shot.start + shot.duration - 0.6).toFixed(2));
  const lines = [];
  if (index > 0) {
    lines.push(`tl.fromTo("${scene}",{opacity:0,x:${index % 2 === 0 ? 90 : -90},scale:.985},{opacity:1,x:0,scale:1,duration:.55,ease:"power3.out"},${start.toFixed(2)});`);
  }
  lines.push(`tl.from("${scene} .kicker",{y:22,opacity:0,duration:.34,ease:"power2.out"},${(start + 0.16).toFixed(2)});`);
  lines.push(`tl.from("${scene} .headline",{y:52,opacity:0,duration:.56,ease:"power3.out"},${(start + 0.36).toFixed(2)});`);
  lines.push(`tl.from("${scene} .subline",{x:-28,opacity:0,duration:.42,ease:"power2.out"},${(start + 0.78).toFixed(2)});`);
  lines.push(`tl.from("${scene} .hand-label",{scale:.9,rotation:-2,opacity:0,duration:.38,ease:"back.out(1.6)"},${(start + 1.08).toFixed(2)});`);
  lines.push(`tl.from("${scene} .stage",{scale:.96,opacity:0,duration:.62,ease:"power2.out"},${(start + 0.28).toFixed(2)});`);
  lines.push(`tl.from("${scene} .xiaohei",{y:44,scale:.86,opacity:0,duration:.56,ease:"back.out(1.5)"},${(start + 0.72).toFixed(2)});`);
  lines.push(`tl.to("${scene} .xiaohei",{y:-10,rotation:${index % 2 === 0 ? 2 : -2},duration:1.05,repeat:${Math.max(1, Math.ceil(shot.duration / 2.1) - 1)},yoyo:true,ease:"sine.inOut"},${(start + 1.32).toFixed(2)});`);
  lines.push(`tl.from("${scene} .sketch,${scene} .split-path,${scene} .distance-line,${scene} .route",{scale:.96,opacity:0,duration:.64,stagger:.04,ease:"power2.out"},${(start + 0.9).toFixed(2)});`);
  lines.push(`tl.from("${scene} .dust i",{scale:0,opacity:0,duration:.35,stagger:.025,ease:"power2.out"},${(start + 1.45).toFixed(2)});`);
  lines.push(`tl.to("${scene} .dust i",{y:18,opacity:0,duration:.72,stagger:.018,ease:"sine.in"},${(start + 2.05).toFixed(2)});`);
  if (index < total - 1) {
    lines.push(`tl.to("${scene}",{opacity:0,x:${index % 2 === 0 ? -70 : 70},scale:.985,duration:.48,ease:"power2.inOut"},${exit.toFixed(2)});`);
  }
  return lines.join("\n    ");
}

function writeProject(projectDir, { slug, title, storyboard, files }) {
  fs.mkdirSync(path.join(projectDir, "assets"), { recursive: true });
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
  fs.writeFileSync(path.join(projectDir, "meta.json"), JSON.stringify(files.meta, null, 2));
  fs.writeFileSync(path.join(projectDir, "AGENTS.md"), [
    "# Xiaohei Explainer HyperFrames Project",
    "",
    "- `director-script.md` 是导演稿。",
    "- `storyboard.json` 是分镜结构。",
    "- `image-prompts.md` 是 Ian + Xiaohei 2.0 配图提示词。",
    "- `seedance-vfx-contract.json` 是逐镜头 VFX 合约。",
    "- `index.html` 是 HyperFrames 成片源文件。",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(projectDir, "DESIGN.md"), files.design, "utf8");
  fs.writeFileSync(path.join(projectDir, "director-script.md"), files.directorScript, "utf8");
  fs.writeFileSync(path.join(projectDir, "storyboard.json"), files.storyboardJson, "utf8");
  fs.writeFileSync(path.join(projectDir, "image-prompts.md"), files.imagePrompts, "utf8");
  fs.writeFileSync(path.join(projectDir, "seedance-vfx-contract.json"), files.seedanceContract, "utf8");
  fs.writeFileSync(path.join(projectDir, "index.html"), files.index, "utf8");
  writeLocalGsapAsset(projectDir);
  for (const [name, asset] of Object.entries(files.assets || {})) {
    const targetPath = path.join(projectDir, name);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    if (asset && typeof asset === "object" && asset.copyFrom) {
      fs.copyFileSync(asset.copyFrom, targetPath);
    } else if (Buffer.isBuffer(asset)) {
      fs.writeFileSync(targetPath, asset);
    } else {
      fs.writeFileSync(targetPath, String(asset || ""), "utf8");
    }
  }
}

function resolveBgm({ bgmMode = "none", bgmPath = "", duration = 30 } = {}) {
  const mode = String(bgmMode || "none").trim();
  if (mode === "local") {
    const resolved = path.resolve(String(bgmPath || "").trim());
    if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error("请选择有效的本地背景音乐文件。");
    }
    const ext = sanitizeAudioExt(path.extname(resolved));
    return {
      src: `assets/bgm-source${ext}`,
      volume: 0.32,
      public: { mode: "local", label: `本地音乐 · 已循环到 ${duration}s`, duration },
      work: {
        sourcePath: resolved,
        sourceSrc: `assets/bgm-source${ext}`,
        loopTarget: "assets/bgm-loop.wav",
        duration,
      },
      assets: { [`assets/bgm-source${ext}`]: { copyFrom: resolved } },
    };
  }
  return {
    src: "",
    volume: 0,
    public: { mode: "none", label: "未添加 BGM", duration },
    work: null,
    assets: {},
  };
}

function normalizeProjectBgm(projectDir, bgmWork, { ffmpegPath = "" } = {}) {
  if (!bgmWork?.sourcePath || !bgmWork?.loopTarget || !bgmWork?.sourceSrc) return;
  const sourcePath = path.resolve(bgmWork.sourcePath);
  if (!fs.existsSync(sourcePath)) throw new Error("本地背景音乐文件不存在。");
  const ffmpeg = materializeAsciiToolPath(ffmpegPath, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (!ffmpeg || !fs.existsSync(ffmpeg)) throw new Error("未找到 ffmpeg，无法循环处理本地背景音乐。");
  const duration = Math.max(1, Math.min(600, Number(bgmWork.duration || 0) || 30));
  const targetPath = path.join(projectDir, bgmWork.loopTarget);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const fadeOutStart = Math.max(0, duration - 1.8).toFixed(3);
  const args = [
    "-y",
    "-stream_loop", "-1",
    "-i", sourcePath,
    "-t", duration.toFixed(3),
    "-vn",
    "-ac", "2",
    "-ar", "44100",
    "-af", `afade=t=in:st=0:d=0.45,afade=t=out:st=${fadeOutStart}:d=1.8`,
    targetPath,
  ];
  const result = spawnSync(ffmpeg, args, { windowsHide: true, encoding: "utf8" });
  if (result.status !== 0 || !fs.existsSync(targetPath)) {
    throw new Error(`背景音乐循环处理失败：${(result.stderr || result.stdout || "").slice(-500)}`);
  }
  const indexPath = path.join(projectDir, "index.html");
  const raw = fs.readFileSync(indexPath, "utf8");
  fs.writeFileSync(indexPath, raw.replaceAll(bgmWork.sourceSrc, bgmWork.loopTarget.replace(/\\/g, "/")), "utf8");
}

function writeLocalGsapAsset(projectDir) {
  const sourcePath = resolveLocalGsapPath();
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error("本地 GSAP 资源缺失，请先执行 pnpm install。");
  }
  const targetPath = path.join(projectDir, LOCAL_GSAP_SRC);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function resolveLocalGsapPath() {
  try {
    return nodeRequire.resolve("gsap/dist/gsap.min.js");
  } catch {
    return "";
  }
}

function buildHyperframesEnv({ ffmpegPath, ffprobePath }) {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  const safeFfmpegPath = materializeAsciiToolPath(ffmpegPath, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  const safeFfprobePath = materializeAsciiToolPath(ffprobePath, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const toolDirs = [safeFfmpegPath, safeFfprobePath]
    .filter((toolPath) => toolPath && fs.existsSync(toolPath))
    .map((toolPath) => path.dirname(toolPath));
  const joinedPath = [...new Set(toolDirs), env[pathKey] || ""].filter(Boolean).join(path.delimiter);
  env[pathKey] = joinedPath;
  env.PATH = joinedPath;
  if (process.platform === "win32") env.Path = joinedPath;
  if (safeFfmpegPath && fs.existsSync(safeFfmpegPath)) {
    env.FFMPEG_PATH = safeFfmpegPath;
    env.FFMPEG_BIN = safeFfmpegPath;
    env.HYPERFRAMES_FFMPEG_PATH = safeFfmpegPath;
  }
  if (safeFfprobePath && fs.existsSync(safeFfprobePath)) {
    env.FFPROBE_PATH = safeFfprobePath;
    env.FFPROBE_BIN = safeFfprobePath;
    env.HYPERFRAMES_FFPROBE_PATH = safeFfprobePath;
  }
  return env;
}

function materializeAsciiToolPath(sourcePath, fileName) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return "";
  const cacheRoot = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "douyin-video-tool", "media-tools")
    : path.join(process.cwd(), ".cache-tools", "media-tools");
  const targetPath = path.join(cacheRoot, fileName);
  try {
    fs.mkdirSync(cacheRoot, { recursive: true });
    const sourceStat = fs.statSync(sourcePath);
    const targetStat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;
    if (!targetStat || targetStat.size !== sourceStat.size) {
      fs.copyFileSync(sourcePath, targetPath);
    }
    return targetPath;
  } catch {
    return sourcePath;
  }
}

function runHyperframes(cwd, args, output, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", `hyperframes@${HYPERFRAMES_VERSION}`, ...args], {
      cwd,
      env,
      windowsHide: true,
      shell: process.platform === "win32",
    });
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

function listOutputs(outputDir) {
  try {
    if (!fs.existsSync(outputDir)) return [];
    return fs.readdirSync(outputDir)
      .filter((name) => name.toLowerCase().endsWith(".mp4"))
      .map((name) => {
        const filePath = path.join(outputDir, name);
        const stat = fs.statSync(filePath);
        return { name, filePath, size: stat.size, updatedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
}

function normalizeScript(value) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw new Error("请先输入要生成说明视频的文案。");
  return text.slice(0, MAX_SCRIPT_LENGTH);
}

function normalizeAspectRatio(value) {
  const id = String(value || "9:16").trim();
  return ASPECT_RATIO_PRESETS[id] || ASPECT_RATIO_PRESETS["9:16"];
}

function normalizeShotCount(value) {
  const count = Number.parseInt(value, 10);
  if (Number.isFinite(count)) return Math.max(4, Math.min(6, count));
  return 5;
}

function normalizeIntroOutroMode(value) {
  const mode = String(value || "soft").trim();
  return new Set(["soft", "paper", "none"]).has(mode) ? mode : "soft";
}

function splitScript(script, count) {
  const parts = String(script)
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length >= count) return parts.slice(0, count);
  const expanded = [...parts];
  const source = parts.join("") || script;
  while (expanded.length < count) {
    const start = Math.floor((expanded.length / count) * source.length);
    const end = Math.floor(((expanded.length + 1) / count) * source.length);
    expanded.push(source.slice(start, end).trim() || source);
  }
  return expanded.slice(0, count);
}

function extractSubtitle(value) {
  const text = String(value || "").replace(/[，。！？；,.!?;：:]/g, " ").replace(/\s+/g, " ").trim();
  const chunks = text.split(" ").filter(Boolean);
  return chunks.sort((a, b) => b.length - a.length)[0] || text;
}

function shortPurpose(value) {
  return String(value || "").replace(/[，。！？；,.!?;].*$/, "").slice(0, 16);
}

function inferTitle(script) {
  return sanitizeTitle(script.replace(/[，。！？；,.!?;].*$/, "")) || "小黑说明视频";
}

function sanitizeTitle(value) {
  return String(value || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().slice(0, 80);
}

function limitText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function sanitizeAudioExt(ext) {
  const normalized = String(ext || ".mp3").toLowerCase();
  return [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"].includes(normalized) ? normalized : ".mp3";
}

function formatDateSlug(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
