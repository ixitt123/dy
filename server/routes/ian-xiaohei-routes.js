import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";
import { createTtsProvider } from "../tts/providers/index.js";
import { MINIMAX_PRESET_VOICE_IDS } from "../tts/providers/minimax.js";
import { MINIMAX_MUSIC_MODEL, MINIMAX_MUSIC_PRESETS as MUSIC_PRESETS } from "../tts/minimax-music-presets.js";
import { normalizeXiaoheiTransitionMode, renderXiaoheiVideo } from "../xiaohei-video-renderer.js";

const STRUCTURE_TYPES = [
  "Workflow",
  "系统局部",
  "前后对比",
  "角色状态",
  "概念隐喻",
  "方法分层",
  "地图路线",
  "小漫画分镜",
];

const PURPOSES = [
  { id: "article", label: "文章正文配图" },
  { id: "xiaohei-scenes", label: "小黑实物场景" },
  { id: "visual-ip", label: "视觉 IP 配图" },
  { id: "littlebox", label: "小盒结构配图" },
  { id: "stick-figure", label: "火柴人分镜" },
  { id: "handdrawn-tech", label: "手绘技术页面" },
  { id: "ian-handdrawn-ppt", label: "Ian 手绘 PPT" },
  { id: "capybara", label: "松弛水豚配图" },
  { id: "wechat", label: "公众号配图" },
  { id: "knowledge", label: "知识观点配图" },
  { id: "workflow", label: "方法流程配图" },
  { id: "cover-reference", label: "封面参考图" },
];

const DEFAULT_VISUAL_DNA = "Pure white background. Minimalist black hand-drawn line art. Slightly wobbly pen lines. Lots of empty white space. Sparse red/orange/blue handwritten Chinese annotations. Clean absurd product-sketch feeling. No gradients, no shadows, no paper texture, no complex background, no commercial vector style, no PPT infographic look, no cute mascot poster, no children's illustration, no realistic UI.";
const DEFAULT_CHARACTER_RULE = "小黑, one small solid-black absurd creature with exactly two white dot eyes, exactly two tiny thin legs, at most two thin arms, no duplicated face or limbs, blank serious expression, slightly uneven hand-drawn body shape. 小黑 must perform the core conceptual action, not decorate the scene. Make 小黑 serious, deadpan, and slightly bizarre, not cute. Never draw extra eyes, extra legs, extra arms, layered faces, smiling, confident, excited, or expressive facial features.";
const SKILL_PROFILE_VERSION = 2;

export const PURPOSE_STYLE_PROFILES = {
  article: {
    name: "小黑 Skill · 纯白手绘解释图",
    intent: "Use the classic Ian Xiaohei whiteboard explainer style for precise paragraph-level reasoning.",
    actorName: "小黑",
    visualDna: DEFAULT_VISUAL_DNA,
    characterRule: DEFAULT_CHARACTER_RULE,
    compositionRule: "A flat pure-white hand-drawn explainer sheet with one low-tech metaphor, one clear Xiaohei action, sparse props, and large blank space.",
    colorRule: "Black main line art and Xiaohei; orange for the main path; red for warnings; blue for secondary notes.",
    avoid: "No photography, 3D diorama, colored-pencil storybook, slide layout, polished vector art, or mascot poster.",
  },
  "xiaohei-scenes": {
    name: "helloianneo/ian-xiaohei-scenes · 小黑实物场景",
    intent: "Turn the paragraph into a physical tabletop scene. Use concrete props, tiny devices, paper parts, switches, strings, doors, boxes, and hand-operated mechanisms. Keep Xiaohei as the operator.",
    actorName: "实物小黑",
    visualDna: "High-key white studio photography of a tactile miniature tabletop diorama. Real paper cards, wood, plastic switches, tiny doors, strings and hand-built mechanisms. Soft grounded shadows and believable material texture; no drawn whiteboard scene.",
    characterRule: "Use one small matte-black felt, clay or flocked Xiaohei figure with exactly two white oval eyes and simple thin limbs. It physically operates the props in the miniature set.",
    compositionRule: "Build one photographed physical scene on a white tabletop. Props must have depth, contact shadows and real construction; the metaphor must work as a tangible device or staged action.",
    colorRule: "White studio base, matte black Xiaohei, restrained red, blue, yellow or pink paper labels and one vivid physical tool accent.",
    avoid: "No flat hand-drawn explainer, no black ink whiteboard illustration, no PPT, no infographic, no floating UI and no generic article illustration.",
  },
  "visual-ip": {
    name: "yangchuansheng/visual-ip-illustrations · 视觉 IP",
    intent: "Make the image feel like a consistent visual-IP series: one recurring simple character, recognizable gesture language, strong silhouette, and one memorable central object per shot.",
    actorName: "统一视觉 IP 角色",
    visualDna: "Pure white background, clean hand-drawn black contours, one recurring bold black rounded IP character, one memorable oversized object and a consistent visual grammar across the set. Sparse accents and strong silhouette readability.",
    characterRule: "Use one simple black recurring IP operator with two white dot eyes, thin limbs, deadpan expression, and no outfit. It can be Xiaohei-like, but must stay consistent across the set and perform the paragraph's key action.",
    compositionRule: "Center the recurring IP character and one iconic object; keep gestures and proportions consistent between shots while changing the metaphor and action.",
    colorRule: "Black and white dominate; use only one bright accent color plus an optional tiny secondary annotation color.",
    avoid: "No anonymous changing protagonists, no crowded whiteboard explanation, no physical 3D diorama, no realistic human and no decorative mascot pose.",
  },
  littlebox: {
    name: "okooo5km/5km-littlebox-illustrations · 小盒",
    intent: "Build the metaphor inside small box-like compartments. Use modular frames, small cutaway rooms, stacked boxes, or one open box that contains the paragraph's system.",
    actorName: "小盒",
    visualDna: "Pure white background with rough black marker line art. The recurring hero is an anthropomorphic cardboard cube with two dot eyes, tiny limbs and one orange packing-tape stripe. Speech bubbles and sound marks may be used sparingly.",
    characterRule: "Use exactly one small box character with stable cube proportions, two dot eyes, thin arms and legs, and orange tape. The box performs the core action with a physical prop.",
    compositionRule: "Explain the idea through one box, stacked compartments, an open package or a cutaway box system. Keep the box geometry central and readable.",
    colorRule: "Black marker lines on white, orange tape as the identity color, and at most one red emphasis mark.",
    avoid: "No Xiaohei blob, no stick figure, no realistic package photo, no dense flowchart, no glossy vector icon and no generic whiteboard scene.",
  },
  "stick-figure": {
    name: "ZekerTop/stick-figure-Illustrations · 火柴人",
    intent: "Use a sparse stick-figure storyboard style. Emphasize motion, arrows, conflict, and comic timing with very few objects.",
    actorName: "火柴人",
    visualDna: "Pure white background. Minimal black stick-figure line art with slightly uneven hand-drawn strokes. Very sparse red/orange/blue marks only for actions and warnings. No gradients, no shadows, no polished vector style, no PPT look, no cute poster.",
    characterRule: "Use one tiny stick-figure operator with a simple round head, two dot eyes, thin arms and legs, and a blank expression. The figure must perform the exact conceptual action.",
    compositionRule: "Use a tiny number of lines and props, clear body movement, directional arrows and comic timing; action must be understandable from silhouette alone.",
    colorRule: "Black line art only, with one light-blue motion accent and optionally one red warning mark.",
    avoid: "No solid-black Xiaohei body, no box mascot, no detailed scenery, no textured illustration, no 3D and no slide layout.",
  },
  "handdrawn-tech": {
    name: "ningzimy/handdrawn-tech-illustrations · 手绘技术页面",
    intent: "Use a hand-drawn technical-page layout: rough UI panels, callout wires, input-output blocks, tiny annotations, and one central mechanism. Keep it sketchy, not a real app screenshot.",
    actorName: "手绘技术人物",
    visualDna: "Warm off-white textured paper, energetic colored-pencil and graphite sketching, rough technical annotations, callout wires, input-output blocks and one forceful central mechanism. Visible pencil grain and imperfect construction lines.",
    characterRule: "Use a hand-drawn human user or engineer only when the source needs an actor. Keep natural human proportions and a focused expression; never replace the person with Xiaohei.",
    compositionRule: "Create a technical explainer page with one dominant mechanism, rough callouts and a few supporting objects. Hierarchy comes from scale and pencil color, not UI chrome.",
    colorRule: "Graphite black with muted blue, ochre, sage and violet colored-pencil fills; annotations use restrained blue or purple outlines.",
    avoid: "No pure-black mascot, no flat whiteboard icon set, no real app screenshot, no polished vector UI and no clean corporate PPT.",
  },
  "ian-handdrawn-ppt": {
    name: "helloianneo/ian-handdrawn-ppt · 手绘技术页面",
    intent: "Use a hand-drawn slide/page composition. Make one strong technical diagram with a clear hierarchy, a large central sketch, and small supporting notes.",
    actorName: "手绘演示人物",
    visualDna: "Airy presentation-slide composition on a pale white canvas, delicate gray pencil lines, very light watercolor washes, editorial spacing and a clear left-to-right or before-to-after narrative. Refined hand-drawn presentation, not a rough whiteboard doodle.",
    characterRule: "Use a consistent lightly sketched human protagonist when needed. Keep understated facial detail and natural clothing; no Xiaohei or mascot substitution.",
    compositionRule: "Lay out one clear slide story with a strong title-sized visual anchor, broad whitespace, a visible progression and only a few supporting notes.",
    colorRule: "Soft graphite gray with pale blue, sage and warm beige washes; no saturated poster palette.",
    avoid: "No black blob mascot, no dense technical page, no rough marker doodle, no 3D scene, no commercial vector deck and no UI screenshot.",
  },
  capybara: {
    name: "ZekerTop/capybara-illustrations · 松弛水豚",
    intent: "Use a relaxed capybara-like hand-drawn character to carry the metaphor. The tone is calm and lightly absurd, but still explains the exact source paragraph.",
    actorName: "松弛水豚",
    visualDna: "Pure white background. Minimal hand-drawn line art with a calm rounded capybara-like operator, sparse props, open white space, and small red/orange/blue handwritten marks. No gradients, no shadows, no children's book scene, no cute mascot poster, no polished vector style.",
    characterRule: "Use one calm capybara-like hand-drawn operator with a simple rounded body, tiny dot eyes, blank expression, and minimal limbs. It must perform the paragraph's key action, not sit as decoration.",
    compositionRule: "Center one relaxed capybara and one simple prop or speech bubble. The humor comes from calm behavior facing a serious problem, with generous whitespace.",
    colorRule: "Warm brown capybara, black outline, white background and one pale-blue or light-orange accent.",
    avoid: "No Xiaohei, no stick figure, no busy children's-book scenery, no plush 3D render, no infographic and no marketing poster.",
  },
  wechat: {
    name: "公众号配图 · 图文叙事",
    intent: "Make it suitable for a public-account article: more breathing room, editorial pacing, one clear metaphor, and restrained handwritten labels.",
    actorName: "文章主体人物或物件",
    visualDna: "Editorial Chinese article illustration with generous whitespace, restrained ink-and-pencil drawing, subtle paper warmth, one narrative moment and elegant horizontal pacing. Quiet, literary and low-interference.",
    characterRule: "Use a natural human figure or the source paragraph's central object only when necessary. Do not force any recurring mascot and do not add Xiaohei by default.",
    compositionRule: "Build one calm editorial scene with a clear focal point and surrounding breathing room; the image should sit naturally between article paragraphs.",
    colorRule: "Muted ink gray, warm paper white and one restrained desaturated accent such as sage, blue-gray or ochre.",
    avoid: "No Xiaohei default, no loud short-video poster, no dense diagram, no neon, no large slogan and no cartoon mascot.",
  },
  knowledge: {
    name: "知识观点 · 认知锚点",
    intent: "Highlight judgment, contrast, misconception, and conclusion. The visual should make the viewpoint easy to remember at a glance.",
    actorName: "核心观点主体",
    visualDna: "Modern knowledge-creator visual with a single strong cognitive anchor, bold scale contrast, clean black typography-like shapes and one sharp accent color. Minimal, memorable and concept-first.",
    characterRule: "Use the source concept, object or a restrained human silhouette as the subject. A mascot is optional and Xiaohei must not appear unless explicitly present in the source.",
    compositionRule: "Use one dominant contrast or misconception-versus-truth arrangement. The viewer should understand the judgment in one glance.",
    colorRule: "Black and white with one decisive accent color; use a second color only for the opposing state.",
    avoid: "No default Xiaohei whiteboard, no decorative doodle crowd, no long text, no 3D tabletop and no generic course slide.",
  },
  workflow: {
    name: "方法流程 · 系统装置",
    intent: "Emphasize input, processing, output, loop, and path. Use one low-tech system device rather than a formal flowchart.",
    actorName: "流程操作者",
    visualDna: "Hand-built systems illustration focused on one low-tech machine, visible input, processing path, output and feedback loop. Mechanical clarity, tactile parts and deterministic arrows; no mascot-led whiteboard storytelling.",
    characterRule: "Use only a small neutral operator hand or simple human figure when needed to demonstrate the mechanism. Do not force Xiaohei or another mascot.",
    compositionRule: "The process must be spatially traceable from input to output through one device, with at most five stages and a clearly visible loop when relevant.",
    colorRule: "Dark line work, orange process path, blue system state and red only for failure or warning.",
    avoid: "No default Xiaohei, no formal corporate flowchart, no floating generic icons, no dense UI and no unrelated narrative scene.",
  },
  "cover-reference": {
    name: "封面参考 · 强钩子画面",
    intent: "Create a stronger first-frame conflict: one large central object, clear tension, high readability, and fewer supporting labels.",
    actorName: "封面主角",
    visualDna: "High-impact modern short-video cover reference with one oversized hero object or protagonist, dramatic scale, strong negative space and immediate conflict. Crisp silhouette and thumbnail readability.",
    characterRule: "Choose the most recognizable subject from the source as the hero. Do not insert Xiaohei or any mascot unless that character is explicitly selected by the source or template.",
    compositionRule: "Use one dominant object occupying roughly half the canvas, one visible tension or contradiction and no more than one short hook label.",
    colorRule: "High-contrast black and white with one saturated hook color; preserve clean negative space around the hero.",
    avoid: "No default article illustration, no multi-step explainer, no dense annotations, no tiny mascot, no PPT and no generic collage.",
  },
};

const MAX_TEXT_LENGTH = 5000;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const EMOTION_OPTIONS = ["自然", "亲切", "专业", "热情", "沉稳", "激励", "严肃", "温柔"];
const SPEED_OPTIONS = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5];
const XIAOHEI_ALIYUN_PRESET_IDS = new Set([
  "longshu_v2",
  "longshuo_v2",
  "longxiaochun_v2",
  "longxiaoxia_v2",
  "longanpei",
  "Cherry",
  "Ethan",
  "Maia",
  "Kai",
  "Elias",
]);
const ASPECT_RATIO_OPTIONS = [
  { id: "16:9", label: "16:9 横版（默认）" },
  { id: "9:16", label: "9:16 竖版" },
  { id: "1:1", label: "1:1 正方形" },
];
const IMAGE_MIME_EXTENSIONS = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
};
const AUDIO_MIME_EXTENSIONS = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
};
const REFERENCE_MEDIA_MIME_EXTENSIONS = {
  ...AUDIO_MIME_EXTENSIONS,
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-m4v": ".m4v",
};

const SHOT_ROLE_DEFS = [
  {
    id: "hook",
    label: "钩子判断",
    structure: "概念隐喻",
    composition: "白纸中央是一台很旧的手摇广播机，小黑把核心判断纸条从广播机嘴里拉出来，红色小标注只提示最刺痛的那句话；画面像一张白纸草图，不像封面海报。",
    elements: ["手摇广播机", "核心纸条", "红色提醒", "大留白"],
  },
  {
    id: "problem",
    label: "问题暴露",
    structure: "角色状态",
    composition: "小黑站在一堆散落标签中间，用细线把真正的问题从杂乱词条里拎出来；左侧保留混乱纸片，右侧只留下一个干净问题框。",
    elements: ["散落标签", "问题线", "干净问题框", "黑色墨点"],
  },
  {
    id: "switch",
    label: "身份切换",
    structure: "前后对比",
    composition: "画面左侧是旧身份衣架，右侧是新角色工具门，小黑把旧纸牌挂回衣架，再推开右侧小门；橙色箭头表达角色切换。",
    elements: ["旧身份衣架", "新角色门", "身份纸牌", "橙色箭头"],
  },
  {
    id: "method",
    label: "方法动作",
    structure: "Workflow",
    composition: "小黑坐在低科技工具台前，把输入纸片塞进一个怪打孔器，右侧吐出可执行动作；每个部件都手绘得很松，不做正式流程图。",
    elements: ["低科技工具台", "怪打孔器", "输入纸片", "动作出口"],
  },
  {
    id: "path",
    label: "路径推进",
    structure: "地图路线",
    composition: "一条弯曲橙色路线穿过 3 个小节点，小黑背着线轴往前走，路径尽头是一个很小但清楚的结果门；节点少，不画复杂地图。",
    elements: ["橙色路线", "线轴", "小节点", "结果门"],
  },
  {
    id: "warning",
    label: "误区提醒",
    structure: "系统局部",
    composition: "小黑蹲在一个歪斜警示井边，把错误纸团从井口捞出来，红色批注只标最容易误解的一点，蓝色批注标修正方向。",
    elements: ["警示井", "错误纸团", "红色批注", "蓝色修正"],
  },
  {
    id: "layer",
    label: "方法分层",
    structure: "方法分层",
    composition: "三层不规则纸盒从下到上搭起，小黑在底层搬一块黑色小砖，上层只放一个结果便签；层级松散、有手绘感，不像金字塔图。",
    elements: ["不规则纸盒", "黑色小砖", "结果便签", "短标注"],
  },
  {
    id: "loop",
    label: "闭环反馈",
    structure: "系统局部",
    composition: "小黑在一台小回流机器旁边接住从出口绕回来的橙色线，左侧是输入，右侧是反馈便签，表达动作之后会形成闭环。",
    elements: ["回流机器", "橙色回路线", "反馈便签", "输入纸片"],
  },
  {
    id: "cta",
    label: "结尾行动",
    structure: "小漫画分镜",
    composition: "画面分成 3 个很松的小格：犹豫、动手、落点。小黑从第一格走到第三格，把最后一个黑点按在纸面上；不写大标题。",
    elements: ["三格小漫画", "落点黑点", "行动纸面", "少量脚印"],
  },
];

export function createIanXiaoheiRoutes({
  baseDir,
  sendJson,
  imageService,
  modelRouter = null,
  ttsService = null,
  voiceAssetService = null,
  taskStore = null,
  getSettings = () => ({}),
  ffmpegPath = "",
  ffprobePath = "",
  transcribeLocalMedia = null,
  downloadsDir = "",
}) {
  const outputRoot = path.join(baseDir, "image-assets", "ian-xiaohei");
  const uploadRoot = path.join(outputRoot, "_uploaded-audio");
  const videoAudioRoot = path.join(outputRoot, "_video-audio");
  const voicePreviewRoot = path.join(baseDir, "ui", "assets", "voice-previews");
  const musicOutputRoot = path.join(baseDir, ".data", "music", "minimax");
  const localMusicRoot = path.join(baseDir, "assets", "bgm");
  const referenceAudioRoot = path.join(baseDir, ".data", "audio-reference", "ian-xiaohei");
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(uploadRoot, { recursive: true });
  fs.mkdirSync(videoAudioRoot, { recursive: true });
  fs.mkdirSync(voicePreviewRoot, { recursive: true });
  fs.mkdirSync(musicOutputRoot, { recursive: true });
  fs.mkdirSync(localMusicRoot, { recursive: true });
  fs.mkdirSync(referenceAudioRoot, { recursive: true });

  // 统一下载目录：与 MoneyPrinter 共用同一下载地址体系
  const resolvedDownloadsDir = path.resolve(downloadsDir || baseDir);
  const xiaoheiRenderedFiles = new Map();

  function copyToDownloadsDir(srcPath, title) {
    if (!fs.existsSync(srcPath) || !resolvedDownloadsDir || resolvedDownloadsDir === path.resolve(baseDir)) return null;
    try {
      fs.mkdirSync(resolvedDownloadsDir, { recursive: true });
      const base = (title || "小黑视频").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").trim().slice(0, 100) || "小黑视频";
      let dest = path.join(resolvedDownloadsDir, `${base}.mp4`);
      let counter = 1;
      while (fs.existsSync(dest)) {
        dest = path.join(resolvedDownloadsDir, `${base}_${counter}.mp4`);
        counter++;
      }
      fs.copyFileSync(srcPath, dest);
      return dest;
    } catch (_) {
      return null;
    }
  }

  function registerXiaoheiFile(filePath, downloadName) {
    const id = `xiaohei-${Date.now()}-${randomUUID().slice(0, 6)}`;
    xiaoheiRenderedFiles.set(id, { filePath, createdAt: new Date().toISOString(), downloadName });
    return id;
  }

  return async function handleIanXiaoheiRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/ian-xiaohei/")) return false;
    const route = url.pathname.replace("/api/ian-xiaohei/", "");

    if (req.method === "GET" && route === "video-file") {
      const batchDir = resolveBatchDir(outputRoot, url.searchParams.get("batch_id"));
      const videoPath = batchDir ? path.join(batchDir, "final.mp4") : "";
      if (!videoPath || !fs.existsSync(videoPath)) sendJson(res, 404, { ok: false, message: "成片 MP4 不存在，请先生成视频。" });
      else {
        const manifest = readJsonFile(path.join(batchDir, "project_manifest.json"), {});
        sendXiaoheiFile(res, videoPath, {
          download: url.searchParams.get("download") === "1",
          downloadName: xiaoheiVideoDownloadName(manifest.title),
        });
      }
      return true;
    }

    // 统一下载文件服务（与 MoneyPrinter /api/money-printer/file?id= 同模式）
    if (req.method === "GET" && route === "file") {
      const id = String(url.searchParams.get("id") || "").trim();
      const record = id ? xiaoheiRenderedFiles.get(id) : null;
      if (!record?.filePath || !fs.existsSync(record.filePath)) {
        sendJson(res, 404, { ok: false, message: "小黑输出文件不存在。" });
      } else {
        sendXiaoheiFile(res, record.filePath, {
          download: url.searchParams.get("download") === "1",
          downloadName: record.downloadName || "小黑视频.mp4",
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "upload-video-bgm") {
      try {
        const body = await readJsonBody(req, { maxBytes: 42 * 1024 * 1024 });
        const projectId = safeBatchId(body.project_id);
        if (!projectId) throw new Error("缺少当前项目 ID。");
        const uploaded = decodeUploadedAudio(body.audio_data, body.audio_mime);
        const projectAudioDir = path.join(videoAudioRoot, projectId);
        fs.mkdirSync(projectAudioDir, { recursive: true });
        const audioPath = path.join(projectAudioDir, `background-${randomUUID().slice(0, 8)}${uploaded.extension}`);
        fs.writeFileSync(audioPath, uploaded.buffer);
        sendJson(res, 200, { ok: true, audio: { path: audioPath, name: path.basename(String(body.file_name || "背景音乐")), mimeType: uploaded.mimeType } });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }

    if (req.method === "GET" && route === "config") {
      const settings = getSettings() || {};
      const presetProviders = configuredTtsPresetProviders(settings);
      const configuredProviderIds = new Set(presetProviders.map((provider) => provider.id));
      const defaultProvider = configuredProviderIds.has(String(settings.tts?.default_provider || ""))
        ? String(settings.tts.default_provider)
        : (presetProviders[0]?.id || "minimax");
      const presetVoices = [];
      for (const providerInfo of presetProviders) {
        const voices = ttsService?.listVoices?.(providerInfo.id) || [];
        for (const voice of voices) {
          if (!xiaoheiPresetVoiceAllowed(providerInfo.id, voice.id)) continue;
          presetVoices.push({
            ...voice,
            provider: providerInfo.id,
            providerLabel: providerInfo.label,
          });
        }
      }
      const voiceAssets = voiceAssetService?.listAssets?.()
        ?.filter((asset) => (
          !asset.archived
          && asset.status === "active"
          && (
            asset.voice_type === "clone"
            || (
              asset.voice_type === "preset"
              && configuredProviderIds.has(asset.provider)
              && xiaoheiPresetVoiceAllowed(asset.provider, asset.voice_id)
            )
          )
        )) || [];
      const activePresetIds = new Set(
        voiceAssets.filter((asset) => asset.voice_type === "preset")
          .map((asset) => `${asset.provider}:${asset.voice_id}`),
      );
      sendJson(res, 200, {
        ok: true,
        outputDir: outputRoot,
        savedApis: savedApiSummaries(settings),
        integrations: {
          jianyingDraftDir: String(settings.jianyingDraftDir || settings.jianying?.draftDir || ""),
          outputDir: outputRoot,
        },
        purposes: PURPOSES,
        structureTypes: STRUCTURE_TYPES,
        aspectRatios: ASPECT_RATIO_OPTIONS,
        tts: {
          defaultProvider,
          recommendedProvider: "minimax",
          recommendedModel: "speech-2.6-hd",
          minimaxConfigured: Boolean(settings.tts?.minimax?.api_key),
          minimaxBaseUrl: String(settings.tts?.minimax?.base_url || "https://api.minimaxi.com"),
          minimaxModel: String(settings.tts?.minimax?.model || "speech-2.6-hd"),
          defaultSpeed: Number(settings.tts?.default_speed || 1),
          defaultVoice: voiceAssetService?.getDefault?.() || null,
          voices: presetVoices.filter((voice) => activePresetIds.has(`${voice.provider}:${voice.id}`)),
          voiceAssets: voiceAssets.filter((asset) => (
            asset.voice_type === "clone" || activePresetIds.has(`${asset.provider}:${asset.voice_id}`)
          )).map((asset) => {
            const providerInfo = presetProviders.find((provider) => provider.id === asset.provider) || null;
            if (asset.voice_type !== "preset") {
              return {
                ...asset,
                provider_label: providerInfo?.label || asset.provider,
              };
            }
            const preview = staticVoicePreview(voicePreviewRoot, asset.provider, asset.voice_id);
            return {
              ...asset,
              provider_label: providerInfo?.label || asset.provider,
              preview_url: fs.existsSync(preview.path) ? preview.url : "",
              preview_ready: fs.existsSync(preview.path),
            };
          }),
          emotions: EMOTION_OPTIONS,
          speeds: SPEED_OPTIONS,
        },
        music: {
          provider: "minimax",
          configured: Boolean(settings.tts?.minimax?.api_key),
          model: MINIMAX_MUSIC_MODEL,
          outputDir: musicOutputRoot,
          presets: MUSIC_PRESETS,
          localAssets: listLocalMusicAssets(localMusicRoot),
        },
        referenceAudio: {
          outputDir: referenceAudioRoot,
          defaultTargetBpm: 120,
          defaultTargetLufs: -14,
          supported: Boolean(ffmpegPath && fs.existsSync(ffmpegPath) && ffprobePath && fs.existsSync(ffprobePath)),
          stylePresets: voiceAssetService?.listStylePresets?.() || [],
        },
      });
      return true;
    }

    if (req.method === "GET" && route === "reference-audio-file") {
      const fileName = safeMusicFileName(url.searchParams.get("file"));
      const filePath = fileName ? path.join(referenceAudioRoot, fileName) : "";
      if (!filePath || !fs.existsSync(filePath)) {
        sendJson(res, 404, { ok: false, message: "参考音频结果不存在。" });
        return true;
      }
      sendAudioFile(res, filePath);
      return true;
    }

    if (req.method === "GET" && route === "music-audio") {
      const fileName = safeMusicFileName(url.searchParams.get("file"));
      const filePath = fileName ? path.join(musicOutputRoot, fileName) : "";
      if (!filePath || !fs.existsSync(filePath)) {
        sendJson(res, 404, { ok: false, message: "音乐文件不存在。" });
        return true;
      }
      sendAudioFile(res, filePath);
      return true;
    }

    if (req.method === "GET" && route === "local-music-audio") {
      const fileName = safeMusicFileName(url.searchParams.get("file"));
      const filePath = fileName ? path.join(localMusicRoot, fileName) : "";
      if (!filePath || !isPathWithin(localMusicRoot, filePath) || !fs.existsSync(filePath)) {
        sendJson(res, 404, { ok: false, message: "本地预制音频不存在。" });
        return true;
      }
      sendAudioFile(res, filePath);
      return true;
    }

    if (req.method === "POST" && route === "reference-audio/analyze") {
      try {
        if (!ffmpegPath || !fs.existsSync(ffmpegPath) || !ffprobePath || !fs.existsSync(ffprobePath)) {
          throw new Error("FFmpeg / FFprobe 不可用，无法分析参考音频。");
        }
        const body = await readJsonBody(req, { maxBytes: 48 * 1024 * 1024 });
        const uploaded = decodeUploadedReferenceMedia(body.media_data, body.media_mime);
        const fileName = `${dateSlug()}-reference-${randomUUID().slice(0, 8)}${uploaded.extension}`;
        const filePath = path.join(referenceAudioRoot, fileName);
        fs.writeFileSync(filePath, uploaded.buffer);
        const profile = await analyzeReferenceAudio({
          ffmpegPath,
          ffprobePath,
          filePath,
          sourceName: String(body.file_name || ""),
        });
        fs.writeFileSync(
          path.join(referenceAudioRoot, `${path.basename(fileName, uploaded.extension)}-profile.json`),
          JSON.stringify(profile, null, 2),
          "utf8",
        );
        sendJson(res, 200, { ok: true, profile });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "GET" && route === "reference-audio/clone-draft-preview") {
      const filePath = voiceAssetService?.resolveCloneDraftPreviewPath?.(url.searchParams.get("id"));
      if (!filePath) {
        sendJson(res, 404, { ok: false, message: "克隆试听不存在或已失效。" });
        return true;
      }
      sendAudioFile(res, filePath);
      return true;
    }

    if (req.method === "POST" && route === "reference-audio/clone-draft") {
      try {
        if (!ffmpegPath || !fs.existsSync(ffmpegPath) || !ffprobePath || !fs.existsSync(ffprobePath)) {
          throw new Error("FFmpeg / FFprobe 不可用，无法提取克隆人声样本。");
        }
        if (!voiceAssetService?.createCloneDraft) throw new Error("声音资产服务未初始化。");
        const body = await readJsonBody(req, { maxBytes: 128 * 1024 });
        if (body.consent_confirmed !== true) throw new Error("请先确认拥有该声音的长期克隆与生成授权。");
        const sourcePath = resolveReferenceSourcePath(referenceAudioRoot, body.profile?.source_path);
        if (!sourcePath) throw new Error("参考音频已失效，请重新选择并分析文件。" );
        const segment = pickCloneSampleSegment(body.profile || {});
        const samplePath = path.join(referenceAudioRoot, `${dateSlug()}-clone-sample-${randomUUID().slice(0, 8)}.wav`);
        await extractCloneSample({
          ffmpegPath,
          sourcePath,
          outputPath: samplePath,
          start: segment.start,
          duration: segment.duration,
        });
        const result = await voiceAssetService.createCloneDraft({
          provider: "minimax",
          voice_name: body.voice_name,
          preferred_name: body.preferred_name,
          sample_path: samplePath,
          sample_mime: "audio/wav",
          sample_transcript: "自动从授权参考音频中提取的人声片段",
          consent_confirmed: true,
          target_model: "speech-2.6-hd",
          style_profile: body.profile || {},
        });
        fs.rmSync(samplePath, { force: true });
        if (result.error) throw new Error(result.error);
        sendJson(res, 201, {
          ok: true,
          draft: {
            id: result.draft.id,
            provider: result.draft.provider,
            voice_name: result.draft.voice_name,
            source_sample: segment,
            preview_url: `/api/ian-xiaohei/reference-audio/clone-draft-preview?id=${encodeURIComponent(result.draft.id)}`,
          },
        });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "reference-audio/clone-confirm") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const result = await voiceAssetService?.confirmCloneDraft?.(body.draft_id, {
          set_default: body.set_default === true,
          save_style: body.save_style !== false,
          description: body.description,
          tags: body.tags,
        });
        if (result?.error) throw new Error(result.error);
        sendJson(res, 201, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "reference-audio/clone-discard") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const result = await voiceAssetService?.discardCloneDraft?.(body.draft_id);
        if (result?.error) throw new Error(result.error);
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "reference-audio/style-default") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const result = voiceAssetService?.setDefaultStylePreset?.(body.id);
        if (result?.error) throw new Error(result.error);
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "reference-audio/style-delete") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const result = voiceAssetService?.deleteStylePreset?.(body.id);
        if (result?.error) throw new Error(result.error);
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "reference-audio/generate-mix") {
      try {
        if (!ffmpegPath || !fs.existsSync(ffmpegPath) || !ffprobePath || !fs.existsSync(ffprobePath)) {
          throw new Error("FFmpeg / FFprobe 不可用，无法生成参考风格混音。");
        }
        const body = await readJsonBody(req, { maxBytes: 512 * 1024 });
        const profile = body.profile && typeof body.profile === "object" ? body.profile : {};
        const result = await generateReferenceAudioMix({
          settings: getSettings() || {},
          outputRoot: referenceAudioRoot,
          ffmpegPath,
          ffprobePath,
          profile,
          text: body.text,
          title: body.title,
          voiceAssetId: body.voice_asset_id,
          voiceAssetService,
          emotion: body.emotion,
          speed: body.speed,
          bgmMode: body.bgm_mode,
        });
        sendJson(res, 201, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "test-minimax") {
      try {
        const settings = getSettings() || {};
        const provider = createTtsProvider("minimax", {
          config: settings.tts?.minimax || {},
        });
        const result = await provider.healthCheck();
        const ok = result.status === "online";
        sendJson(res, ok ? 200 : 400, {
          ok,
          status: result.status,
          message: result.message || (ok ? "MiniMax 连接正常。" : "MiniMax 连接失败。"),
        });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "music") {
      try {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        const settings = getSettings() || {};
        const stylePreset = body.style_preset_id
          ? voiceAssetService?.getStylePreset?.(body.style_preset_id)
          : null;
        const result = await generateMinimaxMusic({
          settings,
          outputRoot: musicOutputRoot,
          presetId: body.preset_id,
          lyrics: body.lyrics || body.text || "",
          promptExtra: body.prompt_extra || "",
          title: body.title || "",
          styleProfile: stylePreset?.profile || null,
        });
        sendJson(res, 201, { ok: true, ...result, style_preset: stylePreset || null });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "GET" && route === "audio-jobs") {
      const projectId = String(url.searchParams.get("project_id") || "").trim();
      sendJson(res, 200, {
        ok: true,
        jobs: ttsService?.listProjectJobs?.(projectId, 100) || [],
        selected: ttsService?.getSelectedProjectJob?.(projectId) || null,
      });
      return true;
    }

    if (req.method === "POST" && route === "audio-select") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const result = ttsService?.selectProjectJob?.(body.project_id, body.job_id);
        if (result?.error) throw new Error(result.error);
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "audio-delete") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const projectId = String(body.project_id || "").trim();
        const job = ttsService?.getJob?.(Number(body.job_id || 0));
        if (!job) throw new Error("音频记录不存在。");
        const wasSelected = Boolean(job.metadata?.selected_for_project);
        const result = ttsService.removeJob(job.id, { deleteFile: true });
        let selected = null;
        if (wasSelected) {
          const fallback = (ttsService?.listProjectJobs?.(projectId, 100) || [])
            .find((item) => item.status === "completed" && item.audio_path);
          if (fallback) {
            const selectedResult = ttsService.selectProjectJob(projectId, fallback.id);
            selected = selectedResult.job || null;
          }
        }
        sendJson(res, 200, { ok: true, ...result, selected });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "voice-preview") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const asset = Number(body.voice_asset_id || 0) > 0
          ? voiceAssetService?.getAsset?.(Number(body.voice_asset_id))
          : null;
        if (asset?.preview_url) {
          sendJson(res, 200, { ok: true, preview_url: asset.preview_url, cached: true });
          return true;
        }
        const provider = String(asset?.provider || body.provider || "minimax");
        const voiceId = String(asset?.voice_id || body.voice_id || "").trim();
        const voiceName = String(asset?.voice_name || body.voice_name || "").trim();
        if (!voiceId) throw new Error("缺少需要试听的音色。");
        const preview = staticVoicePreview(voicePreviewRoot, provider, voiceId);
        if (fs.existsSync(preview.path)) {
          sendJson(res, 200, { ok: true, preview_url: preview.url, cached: true });
          return true;
        }
        const previewText = String(asset?.metadata?.previewText || body.text || "").trim();
        const generated = await ttsService.generateStaticPreview({
          provider,
          voice_id: voiceId,
          voice_name: voiceName,
          model: String(asset?.metadata?.target_model || asset?.metadata?.model || body.model || ""),
          ...(previewText ? { text: previewText } : {}),
          outputPath: preview.path,
        });
        if (generated.error) {
          fs.rmSync(preview.path, { force: true });
          throw new Error([generated.error, generated.detail].filter(Boolean).join(" "));
        }
        sendJson(res, 201, {
          ok: true,
          preview_url: preview.url,
          cached: false,
          message: "试听音频已生成一次并保存到源码，后续直接复用。",
        });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "voice-default") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const result = voiceAssetService?.setDefault?.(Number(body.id || 0));
        if (result?.error) throw new Error(result.error);
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "voice-delete") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const result = await voiceAssetService?.deletePermanent?.(Number(body.id || 0));
        if (result?.error) throw new Error(result.error);
        sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "GET" && route === "tts-job") {
      const job = ttsService?.getJob?.(Number(url.searchParams.get("id") || 0));
      if (!job) {
        sendJson(res, 404, { ok: false, message: "没有找到这条 TTS 任务。" });
      } else {
        sendJson(res, 200, { ok: true, job });
      }
      return true;
    }

    if (req.method === "GET" && route === "outputs") {
      sendJson(res, 200, {
        ok: true,
        outputDir: outputRoot,
        batches: listOutputBatches(outputRoot),
      });
      return true;
    }

    if (req.method === "POST" && route === "open-output") {
      openFolder(outputRoot);
      sendJson(res, 200, { ok: true, outputDir: outputRoot });
      return true;
    }

    if (req.method === "POST" && route === "output-open") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const batchDir = resolveBatchDir(outputRoot, body.id);
        if (!batchDir || !fs.existsSync(batchDir)) throw new Error("历史输出目录不存在。");
        openFolder(batchDir);
        sendJson(res, 200, { ok: true, outputDir: batchDir });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "output-delete") {
      try {
        const body = await readJsonBody(req, { maxBytes: 64 * 1024 });
        const batchDir = resolveBatchDir(outputRoot, body.id);
        if (!batchDir || !fs.existsSync(batchDir)) throw new Error("历史输出目录不存在。");
        fs.rmSync(batchDir, { recursive: true, force: true });
        sendJson(res, 200, {
          ok: true,
          id: safeBatchId(body.id),
          deleted: true,
        });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "tts") {
      try {
        if (!ttsService?.enqueue) throw new Error("TTS 服务不可用。");
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        const text = normalizeText(body.text);
        if (!text) throw new Error("请先输入文案。");
        const projectId = String(body.project_id || "").trim();
        if (!projectId) throw new Error("缺少当前项目 ID。");
        const asset = Number(body.voice_asset_id || 0) > 0
          ? voiceAssetService?.getAsset?.(Number(body.voice_asset_id))
          : null;
        if (asset && (asset.supports_emotion === false || asset.supports_speed === false)) {
          throw new Error("该音色不同时支持情感与语速，不能用于当前流程。");
        }
        const result = ttsService.enqueue({
          text,
          provider: String(asset?.provider || body.provider || ""),
          voice_id: String(asset?.voice_id || body.voice_id || ""),
          voice_name: String(asset?.voice_name || body.voice_name || ""),
          voice_asset_id: Number(asset?.id || 0),
          model: String(asset?.metadata?.target_model || asset?.metadata?.model || body.model || ""),
          speed: SPEED_OPTIONS.includes(Number(body.speed)) ? Number(body.speed) : 1,
          emotion: EMOTION_OPTIONS.includes(String(body.emotion)) ? String(body.emotion) : "自然",
          format: "mp3",
          project_id: projectId,
          source: "ian_xiaohei",
          workflow_auto_director: false,
        });
        if (result.error) throw new Error(result.error);
        sendJson(res, 202, { ok: true, job: result.job });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "upload-audio") {
      try {
        if (!taskStore || typeof transcribeLocalMedia !== "function") throw new Error("本地音频校验服务不可用。");
        const body = await readJsonBody(req, { maxBytes: 42 * 1024 * 1024 });
        const text = normalizeText(body.text);
        if (!text) throw new Error("请先输入与音频对应的文案。");
        const projectId = String(body.project_id || "").trim();
        if (!projectId) throw new Error("缺少当前项目 ID。");
        const uploaded = decodeUploadedAudio(body.audio_data, body.audio_mime);
        const fileName = `${dateSlug()}-${randomUUID().slice(0, 8)}${uploaded.extension}`;
        const audioPath = path.join(uploadRoot, fileName);
        fs.writeFileSync(audioPath, uploaded.buffer);
        try {
          const apiKey = resolveAsrApiKey(getSettings());
          if (!apiKey) throw new Error("未配置可用的语音识别 API Key，无法检查本地音频与文案是否一致。");
          const transcript = await transcribeLocalMedia(apiKey, audioPath);
          const similarity = textSimilarity(text, transcript);
          if (similarity < 0.82) {
            throw new Error(`音频与输入文案不一致（匹配度 ${Math.round(similarity * 100)}%），请更换音频或文案。`);
          }
          const duration = await probeAudioDuration(ffprobePath, audioPath);
          const job = taskStore.createTtsJob({
            provider: "local_upload",
            voice_id: "local-upload",
            voice_name: "本地上传",
            text,
            emotion: "自然",
            speed: 1,
            volume: 50,
            pitch: 1,
            format: uploaded.extension === ".wav" ? "wav" : "mp3",
            audio_path: audioPath,
            status: "completed",
            completed_at: new Date().toISOString(),
            metadata_json: JSON.stringify({
              source: "ian_xiaohei_local_upload",
              project_id: projectId,
              selected_for_project: false,
              transcript,
              text_similarity: similarity,
              audio_duration: duration,
            }),
          });
          sendJson(res, 201, {
            ok: true,
            job: {
              ...job,
              audio_url: `/api/tts/audio?id=${job.id}`,
              metadata: { transcript, text_similarity: similarity, audio_duration: duration },
            },
          });
        } catch (error) {
          fs.rmSync(audioPath, { force: true });
          throw error;
        }
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "timeline-plan") {
      try {
        const body = await readJsonBody(req, { maxBytes: 512 * 1024 });
        const projectId = String(body.project_id || "").trim();
        const job = ttsService?.getJob?.(Number(body.tts_job_id || 0))
          || taskStore?.getTtsJob?.(Number(body.tts_job_id || 0));
        if (!job || job.status !== "completed" || !job.audio_path || !fs.existsSync(job.audio_path)) {
          throw new Error("TTS 音频尚未生成完成。");
        }
        if (String(job.alignment_status || job.metadata?.alignment_status || "") !== "confirmed") {
          throw new Error("请先在 TTS 页面检查并确认最终识别文案和字幕时间轴。");
        }
        const confirmedText = normalizeText(job.final_text || job.metadata?.final_text || job.text);
        const text = normalizeText(body.text || confirmedText);
        if (normalizeComparableText(text) !== normalizeComparableText(confirmedText)) {
          throw new Error("当前文案与已确认的最终语音文案不一致，请重新校准字幕。");
        }
        const selectedJob = ttsService?.getSelectedProjectJob?.(projectId);
        if (!selectedJob || Number(selectedJob.id) !== Number(job.id)) {
          throw new Error("请先试听并点击“确定本视频使用”，再生成分镜图片。");
        }
        const audioDuration = await probeAudioDuration(ffprobePath, job.audio_path);
        if (!(audioDuration > 0)) throw new Error("无法读取 TTS 音频时长。");
        const subtitleSegments = extractTtsSubtitleSegments(job, text, audioDuration);
        const plan = await buildTimedXiaoheiPlan({
          text,
          title: body.title,
          purpose: body.purpose,
          preferredStructure: body.structureType,
          aspectRatio: normalizeAspectRatio(body.aspectRatio),
          audioDuration,
          ttsJobId: job.id,
          projectId,
          subtitleSegments,
          modelRouter,
        });
        const director = createDirectorProjectForPlan(taskStore, plan, job);
        plan.directorProjectId = director.id;
        const batchDir = path.join(outputRoot, plan.batchId);
        fs.mkdirSync(batchDir, { recursive: true });
        savePlanFiles(batchDir, plan);
        fs.copyFileSync(job.audio_path, path.join(batchDir, `voice${path.extname(job.audio_path) || ".mp3"}`));
        sendJson(res, 200, { ok: true, ...plan });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "export-draft") {
      try {
        const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
        const plan = body.plan && typeof body.plan === "object" ? body.plan : null;
        const images = Array.isArray(body.images) ? body.images : [];
        if (!plan?.directorProjectId || !plan?.ttsJobId) throw new Error("缺少导演稿或 TTS 绑定信息。");
        const projectId = String(body.project_id || plan.projectId || "").trim();
        if (!projectId) throw new Error("缺少当前小黑项目 ID。");
        if (String(plan.projectId || "") && String(plan.projectId) !== projectId) {
          throw new Error("当前分镜计划不属于这个项目，请重新按音频分析分镜。");
        }
        const selectedJob = ttsService?.getSelectedProjectJob?.(projectId);
        if (!selectedJob || Number(selectedJob.id) !== Number(plan.ttsJobId)) {
          throw new Error("当前确认音频与分镜计划不一致，请先重新确认音频并生成分镜。");
        }
        const audioJob = ttsService?.getJob?.(Number(plan.ttsJobId))
          || taskStore?.getTtsJob?.(Number(plan.ttsJobId));
        if (!audioJob || audioJob.status !== "completed" || !audioJob.audio_path || !fs.existsSync(audioJob.audio_path)) {
          throw new Error("确认音频文件不存在或尚未生成完成。");
        }
        if (String(audioJob.alignment_status || audioJob.metadata?.alignment_status || "") !== "confirmed") {
          throw new Error("当前音频的最终文案和字幕时间轴尚未确认，不能导出素材包。");
        }
        const missing = (plan.shots || []).filter((shot) => !images.some((image) => Number(image.index) === Number(shot.index) && image.assetId));
        if (missing.length) throw new Error(`缺少配图：${missing.map((shot) => `#${shot.index}`).join("、")}。`);
        validateImageBindings({ plan, images, imageService });
        const packageDir = writeXiaoheiMaterialPackage(outputRoot, plan, images, audioJob);
        const project = {
          id: plan.batchId,
          status: "completed",
          progress: 100,
          current_step: "小黑素材包已生成",
          output_dir: packageDir,
          draft_path: "",
          completed_at: new Date().toISOString(),
        };
        updateResultFile(packageDir, {
          output: {
            package_dir: packageDir,
            status: "completed",
            created_at: new Date().toISOString(),
          },
        });
        sendJson(res, 200, { ok: true, project, packageDir });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "render-video") {
      try {
        const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
        const plan = body.plan && typeof body.plan === "object" ? body.plan : null;
        const images = Array.isArray(body.images) ? body.images : [];
        const projectId = String(body.project_id || plan?.projectId || "").trim();
        if (!plan?.ttsJobId || !plan?.batchId || !projectId) throw new Error("缺少当前分镜计划或 TTS 绑定信息。");
        if (String(plan.projectId || "") && String(plan.projectId) !== projectId) {
          throw new Error("当前分镜计划不属于这个项目，请重新按音频分析分镜。");
        }
        const selectedJob = ttsService?.getSelectedProjectJob?.(projectId);
        if (!selectedJob || Number(selectedJob.id) !== Number(plan.ttsJobId)) {
          throw new Error("当前确认音频与分镜计划不一致，请重新发送 TTS 资产。");
        }
        const audioJob = ttsService?.getJob?.(Number(plan.ttsJobId)) || taskStore?.getTtsJob?.(Number(plan.ttsJobId));
        if (!audioJob || audioJob.status !== "completed" || !audioJob.audio_path || !fs.existsSync(audioJob.audio_path)) {
          throw new Error("已确认的 TTS 音频文件不存在。");
        }
        if (String(audioJob.alignment_status || audioJob.metadata?.alignment_status || "") !== "confirmed") {
          throw new Error("字幕时间轴尚未确认，不能生成视频。");
        }
        const missing = (plan.shots || []).filter((shot) => !images.some((image) => Number(image.index) === Number(shot.index) && image.assetId));
        if (missing.length) throw new Error(`缺少配图：${missing.map((shot) => `#${shot.index}`).join("、")}。`);
        validateImageBindings({ plan, images, imageService });
        const packageDir = writeXiaoheiMaterialPackage(outputRoot, plan, images, audioJob);
        const scenes = buildXiaoheiScenes(plan, images);
        const outputPath = path.join(packageDir, "final.mp4");
        const transitionMode = normalizeXiaoheiTransitionMode(body.transition_mode);
        const compose = normalizeXiaoheiCompose(body.compose);
        const backgroundAudioPath = body.background_audio?.path
          ? resolveFileWithin(videoAudioRoot, body.background_audio.path)
          : "";
        const rendered = await renderXiaoheiVideo({
          ffmpegPath,
          scenes,
          audioPath: audioJob.audio_path,
          backgroundAudioPath,
          outputPath,
          aspectRatio: plan.aspectRatio,
          transitionMode,
          fps: compose.fps,
          compose,
        });
        updateResultFile(packageDir, {
          output: {
            package_dir: packageDir,
            final_video_path: outputPath,
            transition_mode: transitionMode,
            compose,
            status: "completed",
            created_at: new Date().toISOString(),
          },
        });
        // 复制到统一下载目录，与 MoneyPrinter 保持一致
        const downloadName = xiaoheiVideoDownloadName(plan.title);
        const unifiedPath = copyToDownloadsDir(outputPath, plan.title) || outputPath;
        const fileId = registerXiaoheiFile(unifiedPath, downloadName);
        sendJson(res, 200, {
          ok: true,
          batchId: plan.batchId,
          videoPath: outputPath,
          videoUrl: `/api/ian-xiaohei/video-file?batch_id=${encodeURIComponent(plan.batchId)}`,
          downloadUrl: `/api/ian-xiaohei/file?id=${encodeURIComponent(fileId)}&download=1`,
          downloadName,
          unifiedOutputPath: unifiedPath !== outputPath ? unifiedPath : "",
          transitionMode,
          width: rendered.width,
          height: rendered.height,
          fps: rendered.fps,
          compose,
        });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "plan") {
      try {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        const plan = await buildXiaoheiPlan(body, modelRouter);
        sendJson(res, 200, { ok: true, ...plan });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "generate-shot") {
      try {
        const body = await readJsonBody(req, { maxBytes: 512 * 1024 });
        const plan = body.plan && typeof body.plan === "object" ? body.plan : null;
        const shot = normalizeShotInput(body.shot);
        const batchId = safeBatchId(body.batchId || plan?.batchId);
        if (!batchId || !plan) throw new Error("缺少当前提示词计划。");
        if (!shot.index || !(plan.shots || []).some((item) => Number(item.index) === Number(shot.index))) {
          throw new Error("当前图片没有对应的分镜。");
        }
        if (!shot.prompt) throw new Error("缺少当前配图提示词。");

        const batchDir = path.join(outputRoot, batchId);
        fs.mkdirSync(batchDir, { recursive: true });
        savePlanFiles(batchDir, plan);
        const aspectRatio = normalizeAspectRatio(body.aspectRatio || plan.aspectRatio);

        const generated = await imageService.generateImage({
          prompt: shot.prompt,
          aspectRatio,
          count: 1,
          sourceType: "ian-xiaohei",
          sourceId: plan?.directorProjectId
            ? `${plan.directorProjectId}:${shot.index}`
            : `${batchId}:${shot.index}`,
          provider: String(body.provider || ""),
          folderName: batchId,
          folderPath: batchDir,
        });
        const first = generated.results.find((item) => item.success);
        if (!first) {
          const message = generated.results.find((item) => item.error)?.error || "图片生成失败。";
          updateResultFile(batchDir, { error: { index: shot.index, topic: shot.topic, message } });
          throw new Error(message);
        }
        const image = {
          index: shot.index,
          topic: shot.topic,
          purpose: shot.purpose,
          prompt: shot.prompt,
          imagePath: first.imagePath,
          imageUrl: `/api/image/file?path=${encodeURIComponent(first.imagePath)}`,
          thumbnailUrl: first.thumbnailUrl,
          assetId: first.assetId,
          provider: first.provider,
          model: first.model,
          source: "ai_generated",
          aspectRatio,
          confirmed: true,
        };
        updateResultFile(batchDir, { image });
        sendJson(res, 200, { ok: true, batchId, outputDir: batchDir, image });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "upload-shot-image") {
      try {
        const body = await readJsonBody(req, { maxBytes: 28 * 1024 * 1024 });
        const plan = body.plan && typeof body.plan === "object" ? body.plan : null;
        const shot = normalizeShotInput(body.shot);
        const batchId = safeBatchId(body.batchId || plan?.batchId);
        if (!batchId || !plan) throw new Error("缺少当前提示词计划。");
        if (!shot.index || !(plan.shots || []).some((item) => Number(item.index) === Number(shot.index))) {
          throw new Error("当前图片没有对应的分镜。");
        }
        const uploaded = decodeUploadedImage(body.image_data, body.image_mime);
        const aspectRatio = normalizeAspectRatio(body.aspectRatio || plan.aspectRatio);
        const batchDir = path.join(outputRoot, batchId);
        const sourceDir = path.join(batchDir, "_manual-source");
        fs.mkdirSync(sourceDir, { recursive: true });
        const sourcePath = path.join(
          sourceDir,
          `scene-${String(shot.index).padStart(2, "0")}-${randomUUID().slice(0, 8)}${uploaded.extension}`,
        );
        fs.writeFileSync(sourcePath, uploaded.buffer);
        let asset;
        try {
          asset = await imageService.addLocalImageAsset({
            filePath: sourcePath,
            prompt: shot.prompt,
            aspectRatio,
            sourceId: plan?.directorProjectId
              ? `${plan.directorProjectId}:${shot.index}`
              : `${batchId}:${shot.index}`,
            sourceType: "ian-xiaohei-local",
            directorProjectId: Number(plan?.directorProjectId || 0),
            sceneIndex: Number(shot.index),
            assetOrder: Number(shot.index),
          });
        } finally {
          fs.rmSync(sourcePath, { force: true });
        }
        const replaceAssetId = String(body.replace_asset_id || "").trim();
        if (replaceAssetId && replaceAssetId !== String(asset.id)) {
          imageService.deleteAsset(replaceAssetId);
        }
        const image = {
          index: shot.index,
          topic: shot.topic,
          purpose: shot.purpose,
          prompt: shot.prompt,
          imagePath: asset.file_path,
          imageUrl: `/api/image/file?path=${encodeURIComponent(asset.file_path)}`,
          thumbnailUrl: asset.thumbnail_url,
          assetId: asset.id,
          provider: "local",
          model: "local-file",
          source: "local_upload",
          aspectRatio,
          confirmed: true,
        };
        updateResultFile(batchDir, { image });
        sendJson(res, 201, { ok: true, batchId, outputDir: batchDir, image });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    if (req.method === "POST" && route === "generate") {
      sendJson(res, 410, { ok: false, message: "小黑页面已移除 AI 生图，请上传本地图片素材。" });
      return true;
      /*
      try {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        const plan = await buildXiaoheiPlan(body, modelRouter);
        const batchDir = path.join(outputRoot, plan.batchId);
        fs.mkdirSync(batchDir, { recursive: true });
        fs.writeFileSync(path.join(batchDir, "plan.json"), JSON.stringify(plan, null, 2), "utf8");
        fs.writeFileSync(path.join(batchDir, "prompts.md"), promptsMarkdown(plan), "utf8");

        const images = [];
        const errors = [];
        for (const shot of plan.shots) {
          try {
            const generated = await imageService.generateImage({
              prompt: shot.prompt,
              aspectRatio: normalizeAspectRatio(plan.aspectRatio),
              count: 1,
              sourceType: "ian-xiaohei",
              sourceId: `${plan.batchId}:${shot.index}`,
              provider: String(body.provider || ""),
              folderName: plan.batchId,
              folderPath: batchDir,
            });
            const first = generated.results.find((item) => item.success);
            if (!first) {
              const message = generated.results.find((item) => item.error)?.error || "图片生成失败。";
              errors.push({ index: shot.index, topic: shot.topic, message });
              continue;
            }
            images.push({
              index: shot.index,
              topic: shot.topic,
              purpose: shot.purpose,
              prompt: shot.prompt,
              imagePath: first.imagePath,
              imageUrl: `/api/image/file?path=${encodeURIComponent(first.imagePath)}`,
              thumbnailUrl: first.thumbnailUrl,
              assetId: first.assetId,
              provider: first.provider,
              model: first.model,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            errors.push({ index: shot.index, topic: shot.topic, message });
            if (message.includes("API") || message.includes("Provider") || message.includes("配置")) break;
          }
        }

        fs.writeFileSync(path.join(batchDir, "result.json"), JSON.stringify({ plan, images, errors }, null, 2), "utf8");
        const ok = images.length > 0;
        sendJson(res, ok ? 200 : 400, {
          ok,
          message: ok ? "生成完成" : "图片生成失败，已保留可复制提示词。",
          batchId: plan.batchId,
          outputDir: batchDir,
          plan,
          images,
          errors,
        });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
      */
    }

    sendJson(res, 404, { ok: false, message: "Unknown Ian Xiaohei API" });
    return true;
  };
}

async function buildXiaoheiPlan(input = {}, modelRouter = null) {
  const text = normalizeText(input.text);
  if (!text) throw new Error("请先输入文案。");
  const maxCount = clamp(Number(input.count) || 1, 1, 9);
  const purpose = PURPOSES.some((item) => item.id === input.purpose) ? input.purpose : "article";
  const aspectRatio = normalizeAspectRatio(input.aspectRatio);
  const batchId = `${dateSlug()}-ian-xiaohei-${randomUUID().slice(0, 8)}`;
  const title = inferTitle(text, input.title);
  const aiAnchors = input.semanticAnalysis === false
    ? null
    : await analyzeSemanticAnchorsWithModel({ text, title, maxCount, purpose, modelRouter });
  const anchors = aiAnchors?.length
    ? aiAnchors
    : selectSemanticAnchors(text, maxCount);
  const semanticUnitCount = segmentTextIntoSemanticUnits(text).length;
  const shots = anchors.map((anchor, index) => buildShot({
    index: index + 1,
    total: anchors.length,
    title,
    anchor,
    purpose,
    aspectRatio,
    preferredStructure: input.structureType,
  }));
  return {
    batchId,
    title,
    sourceText: text,
    aspectRatio,
    purpose,
    purposeLabel: PURPOSES.find((item) => item.id === purpose)?.label || "文章正文配图",
    skillId: purpose,
    skillName: getPurposeStyleProfile(purpose).name,
    skillProfileVersion: SKILL_PROFILE_VERSION,
    requestedCount: maxCount,
    semanticUnitCount,
    analysisMode: aiAnchors?.length ? "ai_semantic" : "local_semantic",
    analysisNote: aiAnchors?.length
      ? `已使用当前系统文本模型理解全文，从 ${semanticUnitCount} 个语义段中选择 ${anchors.length} 个认知锚点；纯过渡句不会强行配图。`
      : `当前文本模型不可用，已用本地规则从 ${semanticUnitCount} 个完整语义段中选择 ${anchors.length} 个认知锚点；没有按字数硬切。`,
    shots,
  };
}

async function buildTimedXiaoheiPlan({
  text,
  title: explicitTitle = "",
  purpose: requestedPurpose = "article",
  preferredStructure = "",
  aspectRatio: requestedAspectRatio = "16:9",
  audioDuration,
  ttsJobId,
  projectId = "",
  subtitleSegments = null,
  modelRouter,
}) {
  const normalizedText = normalizeText(text);
  const purpose = PURPOSES.some((item) => item.id === requestedPurpose) ? requestedPurpose : "article";
  const aspectRatio = normalizeAspectRatio(requestedAspectRatio);
  const title = inferTitle(normalizedText, explicitTitle);
  const batchId = `${dateSlug()}-ian-xiaohei-video-${randomUUID().slice(0, 8)}`;
  const timedSegments = Array.isArray(subtitleSegments) && subtitleSegments.length
    ? subtitleSegments
    : buildAudioTimedSegments(normalizedText, audioDuration);
  const aiAnchors = await enrichTimedSegmentsWithModel({
    title,
    segments: timedSegments.map((segment) => segment.text),
    purpose,
    modelRouter,
  });
  const anchors = timedSegments.map((segment, index) => {
    const ai = aiAnchors?.[index];
    const local = buildLocalAnchor(segment.text, index, timedSegments.length);
    return {
      ...local,
      ...(ai || {}),
      sourceText: segment.text,
      sourceIndex: index,
    };
  });
  const shots = anchors.map((anchor, index) => ({
    ...buildShot({
      index: index + 1,
      total: anchors.length,
      title,
      anchor,
      purpose,
      aspectRatio,
      preferredStructure,
    }),
    segmentId: `seg-${String(index + 1).padStart(3, "0")}`,
    startTime: timedSegments[index].start,
    endTime: timedSegments[index].end,
    duration: timedSegments[index].duration,
    subtitleText: timedSegments[index].text,
  }));
  return {
    batchId,
    projectId: String(projectId || ""),
    title,
    sourceText: normalizedText,
    aspectRatio,
    purpose,
    purposeLabel: PURPOSES.find((item) => item.id === purpose)?.label || "文章正文配图",
    skillId: purpose,
    skillName: getPurposeStyleProfile(purpose).name,
    skillProfileVersion: SKILL_PROFILE_VERSION,
    requestedCount: "auto",
    semanticUnitCount: shots.length,
    analysisMode: aiAnchors?.length === timedSegments.length ? "ai_timed_semantic" : "local_timed_semantic",
    analysisNote: subtitleSegments?.length
      ? `已按 TTS 返回的字幕时间轴和 ${Number(audioDuration).toFixed(2)} 秒音频生成 ${shots.length} 个连续语义镜头。`
      : `已按 ${Number(audioDuration).toFixed(2)} 秒真实音频生成 ${shots.length} 个连续语义镜头，每段约 3-5 秒。`,
    timingSource: subtitleSegments?.length ? "tts_confirmed_alignment_timeline" : "tts_audio_duration_weighted",
    audioDuration: Number(audioDuration.toFixed(3)),
    ttsJobId: Number(ttsJobId),
    shots,
  };
}

async function enrichTimedSegmentsWithModel({ title, segments, purpose = "article", modelRouter }) {
  if (!modelRouter || typeof modelRouter.generate !== "function" || !segments.length) return null;
  const styleProfile = getPurposeStyleProfile(purpose);
  try {
    const result = await modelRouter.generate({
      taskType: "rewrite",
      messages: [
        {
          role: "system",
          content: [
            `你是“${styleProfile.name}”视频配图导演。当前必须使用 SKILL_ID=${purpose}，不得替换成文章正文配图或其他模板。`,
            `风格目标：${styleProfile.intent}`,
            `主体规则：${styleProfile.characterRule}`,
            `构图规则：${styleProfile.compositionRule}`,
            `禁止项：${styleProfile.avoid}`,
            "用户已经按 TTS 音频节奏拆好了全部文案段落。",
            "不得删除、合并、重排或新增段落。必须为每个输入段落返回一条视觉设计，数量和 source_index 完全一致。",
            `每条只解释该段原文：提炼主体、动作、转折和结果，并严格转译为“${styleProfile.name}”的视觉语言。`,
            `${styleProfile.actorName}必须遵守上述主体规则；没有强制角色的模板不得擅自加入小黑。`,
            "禁止通用英语学习图、通用职场图和大段可读文字。",
            "只返回 JSON，不要 markdown。",
            '{"anchors":[{"source_index":0,"role_id":"hook|problem|switch|method|path|warning|layer|loop|cta","visual_title":"","core_idea":"","visual_subject":"","subject_action":"","visual_metaphor":"","structure_type":"Workflow|系统局部|前后对比|角色状态|概念隐喻|方法分层|地图路线|小漫画分镜","labels":[""],"elements":[""]}]}',
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            title,
            segments: segments.map((sourceText, sourceIndex) => ({
              source_index: sourceIndex,
              source_text: sourceText,
            })),
          }, null, 2),
        },
      ],
      options: { temperature: 0.25 },
    });
    const parsed = parseJsonObject(result?.content);
    const source = Array.isArray(parsed?.anchors) ? parsed.anchors : [];
    const byIndex = new Map();
    for (const value of source) {
      const index = Number(value?.source_index);
      if (!Number.isInteger(index) || index < 0 || index >= segments.length || byIndex.has(index)) continue;
      const anchor = normalizeAiAnchor({ ...value, source_text: segments[index] }, segments);
      if (anchor) byIndex.set(index, anchor);
    }
    if (byIndex.size !== segments.length) return null;
    return segments.map((_, index) => byIndex.get(index));
  } catch {
    return null;
  }
}

function buildAudioTimedSegments(text, audioDuration) {
  const duration = Math.max(1, Number(audioDuration || 0));
  const targetCount = clamp(Math.ceil(duration / 4), 1, 30);
  let units = segmentTextIntoSemanticUnits(text);
  if (!units.length) units = [normalizeText(text)];

  while (units.length < targetCount) {
    let bestIndex = -1;
    let bestSplit = null;
    for (let index = 0; index < units.length; index += 1) {
      const split = splitUnitAtSemanticBoundary(units[index]);
      if (!split || split.length !== 2) continue;
      if (bestIndex < 0 || units[index].length > units[bestIndex].length) {
        bestIndex = index;
        bestSplit = split;
      }
    }
    if (bestIndex < 0) break;
    units.splice(bestIndex, 1, ...bestSplit);
  }

  while (units.length > targetCount) {
    let mergeIndex = 0;
    let mergeWeight = Number.POSITIVE_INFINITY;
    for (let index = 0; index < units.length - 1; index += 1) {
      const weight = speechWeight(units[index]) + speechWeight(units[index + 1]);
      if (weight < mergeWeight) {
        mergeWeight = weight;
        mergeIndex = index;
      }
    }
    units.splice(mergeIndex, 2, `${units[mergeIndex]}${units[mergeIndex + 1]}`);
  }

  const weights = units.map(speechWeight);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || units.length;
  let cursor = 0;
  return units.map((unit, index) => {
    const isLast = index === units.length - 1;
    const rawDuration = duration * (weights[index] / totalWeight);
    const end = isLast ? duration : Math.min(duration, cursor + rawDuration);
    const segment = {
      text: unit,
      start: Number(cursor.toFixed(3)),
      end: Number(end.toFixed(3)),
      duration: Number(Math.max(0.1, end - cursor).toFixed(3)),
    };
    cursor = end;
    return segment;
  });
}

function extractTtsSubtitleSegments(job, fallbackText, audioDuration) {
  const metadata = job?.metadata && typeof job.metadata === "object"
    ? job.metadata
    : parseStoredJsonObject(job?.metadata_json, {});
  const sentenceTimeline = job?.sentence_timeline
    || job?.subtitle_timeline
    || metadata.sentence_timeline
    || metadata.subtitle_timeline
    || [];
  const confirmedSentences = normalizeSubtitleTokens(sentenceTimeline, audioDuration)
    .map((segment) => ({
      text: normalizeText(segment.text),
      start: Number(Math.max(0, segment.start).toFixed(3)),
      end: Number(Math.min(Number(audioDuration || segment.end), Math.max(segment.end, segment.start + 0.1)).toFixed(3)),
      timing_source: String(segment.timing_source || "confirmed_alignment"),
      estimated: Boolean(segment.estimated),
    }))
    .filter((segment) => segment.text && segment.end > segment.start)
    .map((segment) => ({
      ...segment,
      duration: Number((segment.end - segment.start).toFixed(3)),
    }));
  if (confirmedSentences.length) return confirmedSentences;

  const raw = job?.word_timeline
    || metadata.word_timeline
    || metadata.subtitles
    || metadata.subtitle
    || metadata.words
    || metadata.word_timestamps
    || [];
  const tokens = normalizeSubtitleTokens(raw, audioDuration);
  if (!tokens.length) return null;
  const targetCount = clamp(Math.ceil(Math.max(1, Number(audioDuration || 0)) / 4), 1, 30);
  const chunks = [];
  let current = null;
  for (const token of tokens) {
    const text = String(token.text || "").trim();
    if (!text) continue;
    if (!current) current = { text: "", start: token.start, end: token.end };
    current.text += text;
    current.end = Math.max(current.end, token.end);
    const elapsed = current.end - current.start;
    const canBreakOnPunctuation = elapsed >= 2.4 && /[。！？!?；;，,、]$/u.test(current.text);
    const mustBreak = elapsed >= 4.8;
    if ((canBreakOnPunctuation || mustBreak) && current.text.trim().length >= 4) {
      chunks.push(current);
      current = null;
    }
  }
  if (current?.text?.trim()) chunks.push(current);
  while (chunks.length > targetCount) {
    let mergeIndex = 0;
    let shortest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < chunks.length - 1; index += 1) {
      const duration = Math.max(0, chunks[index + 1].end - chunks[index].start);
      if (duration < shortest) {
        shortest = duration;
        mergeIndex = index;
      }
    }
    chunks.splice(mergeIndex, 2, {
      text: `${chunks[mergeIndex].text}${chunks[mergeIndex + 1].text}`,
      start: chunks[mergeIndex].start,
      end: chunks[mergeIndex + 1].end,
    });
  }
  const segments = chunks
    .map((chunk) => ({
      text: normalizeText(chunk.text),
      start: Number(Math.max(0, chunk.start).toFixed(3)),
      end: Number(Math.min(Number(audioDuration || chunk.end), Math.max(chunk.end, chunk.start + 0.1)).toFixed(3)),
    }))
    .filter((chunk) => chunk.text && chunk.end > chunk.start)
    .map((chunk) => ({
      ...chunk,
      duration: Number((chunk.end - chunk.start).toFixed(3)),
    }));
  return segments.length ? segments : buildAudioTimedSegments(fallbackText, audioDuration);
}

function normalizeSubtitleTokens(rawValue, audioDuration) {
  const raw = parseMaybeJson(rawValue);
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.words)
      ? raw.words
      : Array.isArray(raw?.segments)
        ? raw.segments
        : Array.isArray(raw?.subtitles)
          ? raw.subtitles
          : [];
  return source
    .map((item) => {
      const value = item && typeof item === "object" ? item : { text: item };
      const text = String(
        value.text
        || value.word
        || value.subtitle
        || value.content
        || value.char
        || "",
      ).trim();
      const start = normalizeSubtitleTime(
        value.start_time ?? value.startTime ?? value.start ?? value.begin_time ?? value.begin ?? value.offset_start,
        audioDuration,
      );
      const end = normalizeSubtitleTime(
        value.end_time ?? value.endTime ?? value.end ?? value.finish_time ?? value.finish ?? value.offset_end,
        audioDuration,
      );
      return {
        text,
        start,
        end,
        timing_source: String(value.timing_source || value.timingSource || ""),
        estimated: Boolean(value.estimated || value.is_estimated),
      };
    })
    .filter((item) => item.text && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => a.start - b.start);
}

function normalizeSubtitleTime(value, audioDuration) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  if (numeric > Math.max(1, Number(audioDuration || 0)) + 1) return numeric / 1000;
  return numeric;
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) return [];
  if (!/^[\[{]/.test(text)) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

function parseStoredJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function splitUnitAtSemanticBoundary(value) {
  const text = String(value || "").trim();
  if (text.length < 28) return null;
  const boundaries = [];
  for (let index = 8; index < text.length - 8; index += 1) {
    if (/[，,；;：:]/u.test(text[index])) boundaries.push(index + 1);
  }
  const connectorPattern = /(但是|然而|所以|因此|同时|接下来|从今天开始|换句话说|也就是说)/gu;
  let match;
  while ((match = connectorPattern.exec(text))) {
    if (match.index >= 8 && match.index <= text.length - 8) boundaries.push(match.index);
  }
  if (!boundaries.length) return null;
  const midpoint = text.length / 2;
  const splitAt = boundaries.sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint))[0];
  const left = text.slice(0, splitAt).trim();
  const right = text.slice(splitAt).trim();
  return left.length >= 6 && right.length >= 6 ? [left, right] : null;
}

function speechWeight(text) {
  const value = String(text || "");
  const readable = (value.match(/[\u4e00-\u9fa5A-Za-z0-9]/g) || []).length;
  const pauses = (value.match(/[，,。！？!?；;：:]/g) || []).length;
  return Math.max(1, readable + pauses * 2.5);
}

function createDirectorProjectForPlan(taskStore, plan, audioJob) {
  if (!taskStore?.createDirectorProject || !taskStore?.replaceDirectorScenes) {
    throw new Error("导演项目存储不可用。");
  }
  const project = taskStore.createDirectorProject({
    task_id: Number(audioJob?.task_id || 0),
    rewrite_id: Number(audioJob?.rewrite_id || 0),
    title: plan.title,
    source_text: plan.sourceText,
    video_type: "knowledge",
    visual_style: plan.skillId || plan.purpose || "article",
    platform: platformForAspectRatio(plan.aspectRatio),
    pace: "audio_synced",
    estimated_duration: Number(plan.audioDuration || 0),
    status: "completed",
    score: 90,
    metadata_json: JSON.stringify({
      source_type: "ian_xiaohei_tts_timeline",
      source_key: `tts:${audioJob.id}`,
      project_id: plan.projectId || "",
      tts_job_id: Number(audioJob.id),
      scene_count: plan.shots.length,
      total_duration: plan.audioDuration,
      ratio: normalizeAspectRatio(plan.aspectRatio),
      timing_source: plan.timingSource,
      batch_id: plan.batchId,
      skill_id: plan.skillId || plan.purpose || "article",
      skill_name: plan.skillName || getPurposeStyleProfile(plan.purpose).name,
      skill_profile_version: plan.skillProfileVersion || SKILL_PROFILE_VERSION,
    }),
  });
  taskStore.replaceDirectorScenes(project.id, plan.shots.map((shot) => ({
    scene_index: shot.index,
    duration: shot.duration,
    purpose: shot.visualSubject || shot.topic,
    emotion: "自然",
    voice_text: shot.sourceText,
    subtitle: shot.subtitleText || shot.sourceText,
    visual_style: shot.skillName || plan.skillName || getPurposeStyleProfile(plan.purpose).name,
    camera: "slow_push_in",
    composition: shot.composition,
    image_prompt: shot.prompt,
    motion_prompt: "slow_push_in",
    bgm: "",
    sfx: "",
    transition: shot.index === plan.shots.length ? "fade" : "straight_cut",
    asset_type: "image",
    metadata_json: JSON.stringify({
      segment_id: shot.segmentId,
      start_time: shot.startTime,
      end_time: shot.endTime,
      caption_keywords: shot.labels,
      source_text: shot.sourceText,
      subtitle_text: shot.subtitleText || shot.sourceText,
      visual_subject: shot.visualSubject,
      xiaohei_action: shot.xiaoheiAction,
      subject_action: shot.xiaoheiAction,
      skill_id: shot.skillId || plan.skillId || plan.purpose,
      skill_name: shot.skillName || plan.skillName,
    }),
  })));
  return taskStore.getDirectorProject(project.id);
}

function decodeUploadedAudio(dataUrl, mimeHint = "") {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  const mimeType = String(match?.[1] || mimeHint || "").toLowerCase();
  const extension = AUDIO_MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("本地 TTS 只支持 MP3、WAV 或 M4A。");
  const buffer = Buffer.from(match?.[2] || "", "base64");
  if (!buffer.length) throw new Error("上传的音频为空。");
  if (buffer.length > MAX_AUDIO_BYTES) throw new Error("上传的音频不能超过 30MB。");
  return { buffer, mimeType, extension };
}

function decodeUploadedReferenceMedia(dataUrl, mimeHint = "") {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  const mimeType = String(match?.[1] || mimeHint || "").toLowerCase();
  const extension = REFERENCE_MEDIA_MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("参考音频只支持 MP3、WAV、M4A、MP4、MOV。");
  const buffer = Buffer.from(match?.[2] || "", "base64");
  if (!buffer.length) throw new Error("上传的参考文件为空。");
  if (buffer.length > 48 * 1024 * 1024) throw new Error("参考文件不能超过 48MB。");
  return { buffer, mimeType, extension };
}

function resolveReferenceSourcePath(referenceAudioRoot, sourcePath) {
  const root = path.resolve(referenceAudioRoot);
  const resolved = path.resolve(String(sourcePath || ""));
  if (!resolved || resolved === root || !resolved.startsWith(`${root}${path.sep}`)) return "";
  return fs.existsSync(resolved) ? resolved : "";
}

function pickCloneSampleSegment(profile = {}) {
  const duration = Number(profile.duration || 0);
  if (!Number.isFinite(duration) || duration < 30) {
    throw new Error("参考音频中可用人声不足 30 秒，请上传更清晰、单人说话且时长更长的授权样本。" );
  }
  const sampleDuration = Math.min(45, Math.max(30, duration - 1));
  const maxStart = Math.max(0, duration - sampleDuration - 0.5);
  const silences = Array.isArray(profile.silences) ? profile.silences : [];
  const candidates = [];
  for (let start = Math.min(3, maxStart); start <= maxStart; start += 5) candidates.push(start);
  if (!candidates.length) candidates.push(0);
  const scored = candidates.map((start) => {
    const end = start + sampleDuration;
    const silenceSeconds = silences.reduce((total, silence) => {
      const silenceStart = Number(silence.start || 0);
      const silenceEnd = silenceStart + Number(silence.duration || 0);
      return total + Math.max(0, Math.min(end, silenceEnd) - Math.max(start, silenceStart));
    }, 0);
    return { start, duration: sampleDuration, silenceSeconds };
  }).sort((left, right) => left.silenceSeconds - right.silenceSeconds || left.start - right.start);
  const winner = scored[0];
  return {
    start: Number(winner.start.toFixed(2)),
    duration: Number(winner.duration.toFixed(2)),
    silence_seconds: Number(winner.silenceSeconds.toFixed(2)),
  };
}

async function extractCloneSample({ ffmpegPath, sourcePath, outputPath, start, duration }) {
  await runProcessCapture(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(Math.max(0, Number(start || 0)).toFixed(2)),
    "-t", String(Math.max(1, Number(duration || 30)).toFixed(2)),
    "-i", sourcePath,
    "-map", "0:a:0",
    "-vn",
    "-ac", "1",
    "-ar", "24000",
    "-af", "highpass=f=80,lowpass=f=10000,loudnorm=I=-16:TP=-1.5:LRA=8",
    "-c:a", "pcm_s16le",
    outputPath,
  ], { timeoutMs: 180000 });
}

function decodeUploadedImage(dataUrl, mimeHint = "") {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  const mimeType = String(match?.[1] || mimeHint || "").toLowerCase();
  const extension = IMAGE_MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("本地分镜图片只支持 PNG、JPG 或 WEBP。");
  const buffer = Buffer.from(match?.[2] || "", "base64");
  if (!buffer.length) throw new Error("上传的图片为空。");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("上传的图片不能超过 20MB。");
  return { buffer, mimeType, extension };
}

function normalizeAspectRatio(value) {
  const ratio = String(value || "16:9").trim();
  return ASPECT_RATIO_OPTIONS.some((item) => item.id === ratio) ? ratio : "16:9";
}

function platformForAspectRatio(value) {
  const ratio = normalizeAspectRatio(value);
  if (ratio === "9:16") return "douyin";
  if (ratio === "1:1") return "square";
  return "landscape";
}

function staticVoicePreview(root, provider, voiceId) {
  const safeProvider = String(provider || "unknown").replace(/[^a-z0-9_-]+/gi, "_") || "unknown";
  const key = createHash("sha1").update(`${safeProvider}:${voiceId}`).digest("hex").slice(0, 20);
  return {
    path: path.join(root, safeProvider, `${key}.mp3`),
    url: `/assets/voice-previews/${encodeURIComponent(safeProvider)}/${key}.mp3`,
  };
}

function ttsProviderConfigured(settings = {}, providerId = "") {
  const tts = settings.tts || {};
  const config = tts[providerId] || {};
  if (providerId === "aliyun_bailian") return Boolean(config.api_key);
  if (providerId === "minimax") return Boolean(config.api_key);
  if (providerId === "fish_audio") return Boolean(config.api_key && (config.voice || config.reference_id));
  if (providerId === "custom_tts") return Boolean(config.base_url);
  if (providerId === "tencent_tts") return Boolean(config.secret_id && config.secret_key);
  if (providerId === "volcengine_doubao") return Boolean(config.api_key || (config.access_key_id && config.secret_access_key));
  if (providerId === "elevenlabs") return Boolean(config.api_key);
  return false;
}

function configuredTtsPresetProviders(settings = {}) {
  const tts = settings.tts || {};
  const labels = {
    aliyun_bailian: "阿里云百炼 CosyVoice / Qwen-TTS",
    minimax: "MiniMax",
  };
  const ordered = [
    String(tts.default_provider || ""),
    "aliyun_bailian",
    "minimax",
  ].filter(Boolean);
  const unique = [...new Set(ordered)];
  return unique
    .filter((id) => ["aliyun_bailian", "minimax"].includes(id))
    .filter((id) => ttsProviderConfigured(settings, id))
    .map((id) => ({ id, label: labels[id] || id }));
}

function xiaoheiPresetVoiceAllowed(providerId, voiceId) {
  if (providerId === "minimax") return MINIMAX_PRESET_VOICE_IDS.has(String(voiceId || ""));
  if (providerId === "aliyun_bailian") return XIAOHEI_ALIYUN_PRESET_IDS.has(String(voiceId || ""));
  return false;
}

function savedApiSummaries(settings = {}) {
  const output = [];
  const push = (item) => {
    if (!item?.configured) return;
    output.push({
      id: String(item.id || ""),
      label: String(item.label || item.id || ""),
      group: String(item.group || ""),
      feature: String(item.feature || ""),
      model: String(item.model || ""),
      baseUrl: String(item.baseUrl || ""),
      apiKeyMask: maskSecret(item.apiKey || ""),
      activeDefault: Boolean(item.activeDefault),
      testable: Boolean(item.testable),
    });
  };

  const rewriteProviders = settings.rewriteProviders || {};
  const rewriteDefault = String(settings.rewrite?.defaultProvider || "");
  for (const [id, provider] of Object.entries(rewriteProviders)) {
    push({
      id,
      label: provider?.label || id,
      group: "文本模型",
      feature: "文案、分析、导演、提示词",
      configured: Boolean(provider?.apiKey),
      apiKey: provider?.apiKey,
      model: provider?.model,
      baseUrl: provider?.baseUrl,
      activeDefault: rewriteDefault === id,
      testable: true,
    });
  }

  const tts = settings.tts || {};
  const ttsDefs = [
    ["aliyun_bailian", "阿里云百炼 CosyVoice / Qwen-TTS", tts.aliyun_bailian, "api_key", "default_model"],
    ["volcengine_doubao", "火山引擎豆包语音", tts.volcengine_doubao, "api_key", "default_model"],
    ["tencent_tts", "腾讯云 TTS", tts.tencent_tts, "secret_id", "default_model"],
    ["custom_tts", "自定义 Provider", tts.custom_tts, "api_key", "model"],
    ["minimax", "MiniMax", tts.minimax, "api_key", "model"],
    ["fish_audio", "Fish Audio", tts.fish_audio, "api_key", "model"],
    ["elevenlabs", "ElevenLabs", tts.elevenlabs, "api_key", "model"],
  ];
  for (const [id, label, config, secretField, modelField] of ttsDefs) {
    const configured = id === "custom_tts"
      ? Boolean(config?.base_url || config?.api_key)
      : Boolean(config?.[secretField] || (id === "volcengine_doubao" && config?.secret_access_key));
    push({
      id,
      label,
      group: "TTS 语音",
      feature: "配音、声音克隆、试听",
      configured,
      apiKey: config?.[secretField] || config?.secret_access_key || "",
      model: config?.[modelField] || config?.voice || "",
      baseUrl: config?.base_url || "",
      activeDefault: String(tts.default_provider || "") === id,
      testable: true,
    });
  }

  const bgmProviders = settings.bgmProviders || {};
  for (const [id, provider] of Object.entries(bgmProviders)) {
    push({
      id,
      label: provider?.label || id,
      group: "BGM 音乐",
      feature: "背景音乐搜索/匹配",
      configured: Boolean(provider?.api_key || provider?.apiKey),
      apiKey: provider?.api_key || provider?.apiKey,
      model: provider?.model || "",
      baseUrl: provider?.base_url || provider?.baseUrl || "",
      activeDefault: false,
      testable: false,
    });
  }

  return output.sort((a, b) => {
    if (a.activeDefault !== b.activeDefault) return a.activeDefault ? -1 : 1;
    return `${a.group}${a.label}`.localeCompare(`${b.group}${b.label}`, "zh-Hans-CN");
  });
}

function maskSecret(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 8) return "已保存";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function resolveAsrApiKey(settings = {}) {
  return String(
    settings.asr?.api_key
    || settings.speechRecognition?.apiKey
    || settings.tts?.aliyun_bailian?.api_key
    || settings.rewriteProviders?.dashscope?.apiKey
    || "",
  ).trim();
}

function normalizeComparableText(value) {
  return String(value || "").toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, "");
}

function textSimilarity(left, right) {
  const a = normalizeComparableText(left);
  const b = normalizeComparableText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (value) => {
    const output = [];
    for (let index = 0; index < value.length - 1; index += 1) output.push(value.slice(index, index + 2));
    return output.length ? output : [value];
  };
  const aPairs = bigrams(a);
  const counts = new Map();
  for (const pair of bigrams(b)) counts.set(pair, (counts.get(pair) || 0) + 1);
  let overlap = 0;
  for (const pair of aPairs) {
    const count = counts.get(pair) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * overlap) / (aPairs.length + bigrams(b).length);
}

function estimateMinimumSpeechDuration(text) {
  const normalized = String(text || "").replace(/\s+/g, "");
  if (!normalized) return 1;
  const cjkCount = (normalized.match(/[\u4e00-\u9fff]/g) || []).length;
  const asciiWordCount = (normalized.match(/[a-z0-9]+/gi) || []).length;
  const estimatedSeconds = Math.max(
    (cjkCount / 6.5) + (asciiWordCount / 2.4),
    normalized.length / 10,
  );
  return clampFloat(estimatedSeconds * 0.55, 0.8, 20, 1);
}

function probeAudioDuration(ffprobePath, filePath) {
  if (!ffprobePath || !fs.existsSync(ffprobePath)) return Promise.resolve(0);
  return new Promise((resolve) => {
    const child = spawn(ffprobePath, [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", () => resolve(0));
    child.on("close", (code) => {
      const duration = Number(stdout.trim());
      resolve(code === 0 && Number.isFinite(duration) ? duration : 0);
    });
  });
}

function writeXiaoheiMaterialPackage(outputRoot, plan, images, audioJob) {
  const batchId = safeBatchId(plan.batchId);
  if (!batchId) throw new Error("缺少小黑素材批次 ID。");
  const batchDir = path.join(outputRoot, batchId);
  fs.mkdirSync(batchDir, { recursive: true });
  const scenes = buildXiaoheiScenes(plan, images);
  fs.writeFileSync(path.join(batchDir, "timeline.json"), JSON.stringify({
    title: plan.title,
    duration: Number(plan.audioDuration || 0),
    timing_source: plan.timingSource,
    audio_path: audioJob?.audio_path || "",
    scenes,
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(batchDir, "segment-image-map.json"), JSON.stringify(scenes.map((scene) => ({
    segment_id: scene.segment_id,
    scene_index: scene.scene_index,
    text: scene.text,
    start_time: scene.start_time,
    end_time: scene.end_time,
    image_asset_id: scene.image_asset_id,
    image_path: scene.image_path,
  })), null, 2), "utf8");
  fs.writeFileSync(path.join(batchDir, "subtitles.srt"), scenes.map((scene, index) => [
    index + 1,
    `${srtTime(scene.start_time)} --> ${srtTime(scene.end_time)}`,
    scene.subtitle,
    "",
  ].join("\n")).join("\n"), "utf8");
  fs.writeFileSync(path.join(batchDir, "project_manifest.json"), JSON.stringify({
    version: 1,
    type: "ian_xiaohei_video_material_package",
    batch_id: batchId,
    project_id: plan.projectId || "",
    title: plan.title,
    source_text: plan.sourceText,
    tts_job_id: Number(plan.ttsJobId || 0),
    director_project_id: Number(plan.directorProjectId || 0),
    audio_duration: Number(plan.audioDuration || 0),
    scene_count: scenes.length,
    files: {
      audio: audioJob?.audio_path || "",
      timeline: "timeline.json",
      mapping: "segment-image-map.json",
      subtitles: "subtitles.srt",
      prompts: "prompts.md",
      images: scenes.map((scene) => scene.image_path),
    },
    created_at: new Date().toISOString(),
  }, null, 2), "utf8");
  return batchDir;
}

function buildXiaoheiScenes(plan, images) {
  const imageByIndex = new Map(images.map((image) => [Number(image.index), image]));
  const shots = plan.shots || [];
  const audioDuration = Number(plan.audioDuration || shots[shots.length - 1]?.endTime || 0);
  return shots.map((shot, index) => {
    const image = imageByIndex.get(Number(shot.index)) || {};
    const visualStart = index === 0 ? 0 : Number(shot.startTime || 0);
    const visualEnd = index < shots.length - 1
      ? Number(shots[index + 1].startTime || shot.endTime || visualStart)
      : Math.max(audioDuration, Number(shot.endTime || visualStart));
    return {
      segment_id: shot.segmentId || `seg-${String(shot.index).padStart(3, "0")}`,
      scene_index: Number(shot.index),
      start_time: Number(shot.startTime || 0),
      end_time: Number(shot.endTime || 0),
      duration: Number(shot.duration || 0),
      visual_duration: Math.max(0.12, visualEnd - visualStart),
      text: shot.sourceText || "",
      subtitle: shot.subtitleText || shot.sourceText || "",
      keywords: [...new Set([...(shot.keywords || []), ...(shot.labels || [])]
        .map((item) => String(item || "").trim())
        .filter((item) => item.length >= 2 && item.length <= 6 && String(shot.subtitleText || shot.sourceText || "").includes(item)))]
        .slice(0, 2),
      image_asset_id: image.assetId || "",
      image_path: image.imagePath || "",
      visual_subject: shot.visualSubject || "",
      xiaohei_action: shot.xiaoheiAction || "",
      visual_metaphor: shot.visualMetaphor || "",
    };
  });
}

function validateImageBindings({ plan, images, imageService }) {
  const imageByIndex = new Map(images.map((image) => [Number(image.index), image]));
  const assetIds = new Set(images.map((image) => String(image.assetId || "")).filter(Boolean));
  const knownAssets = new Map(
    (imageService?.getAssets?.({ limit: 2000 }) || [])
      .filter((asset) => assetIds.has(String(asset.id)))
      .map((asset) => [String(asset.id), asset]),
  );
  for (const shot of plan.shots || []) {
    const image = imageByIndex.get(Number(shot.index));
    if (!image?.assetId) throw new Error(`#${shot.index} 缺少确认图片。`);
    const asset = knownAssets.get(String(image.assetId));
    if (!asset) throw new Error(`#${shot.index} 图片资产不存在，请重新上传本地图片。`);
    if (Number(asset.scene_index || 0) !== Number(shot.index)) {
      throw new Error(`#${shot.index} 图片 scene_index 不匹配，请重新上传本地图片。`);
    }
    const expectedSourceIds = new Set([
      `${plan.directorProjectId}:${shot.index}`,
      `${plan.batchId}:${shot.index}`,
    ]);
    if (asset.source_id && !expectedSourceIds.has(String(asset.source_id))) {
      throw new Error(`#${shot.index} 图片不属于当前分镜计划，请重新上传本地图片。`);
    }
    const filePath = String(asset.file_path || asset.original_path || image.imagePath || "");
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`#${shot.index} 图片文件不存在，请重新上传本地图片。`);
    }
  }
}

function srtTime(value) {
  const totalMs = Math.max(0, Math.round(Number(value || 0) * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;
  const pad = (number, length = 2) => String(number).padStart(length, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

function normalizeShotInput(value) {
  const shot = value && typeof value === "object" ? value : {};
  return {
    index: clamp(Number(shot.index) || 1, 1, 99),
    topic: trimText(shot.topic || `小黑配图 ${shot.index || 1}`, 64),
    purpose: trimText(shot.purpose || "正文配图", 64),
    prompt: String(shot.prompt || "").trim(),
  };
}

function safeBatchId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

function savePlanFiles(batchDir, plan) {
  const planPath = path.join(batchDir, "plan.json");
  const promptsPath = path.join(batchDir, "prompts.md");
  if (!fs.existsSync(planPath)) fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), "utf8");
  if (!fs.existsSync(promptsPath)) fs.writeFileSync(promptsPath, promptsMarkdown(plan), "utf8");
}

function updateResultFile(batchDir, { image = null, error = null, output = null } = {}) {
  const resultPath = path.join(batchDir, "result.json");
  let result = { images: [], errors: [], output: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    result = {
      images: Array.isArray(parsed.images) ? parsed.images : [],
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      output: parsed.output && typeof parsed.output === "object" ? parsed.output : {},
    };
  } catch {
    result = { images: [], errors: [], output: {} };
  }
  if (image) {
    result.images = result.images.filter((item) => Number(item.index) !== Number(image.index));
    result.images.push(image);
    result.images.sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  }
  if (error) {
    result.errors = result.errors.filter((item) => Number(item.index) !== Number(error.index));
    result.errors.push(error);
    result.errors.sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  }
  if (output) result.output = { ...result.output, ...output };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
}

function buildShot({ index, total, title, anchor, purpose, aspectRatio = "16:9", preferredStructure }) {
  const styleProfile = getPurposeStyleProfile(purpose);
  const segment = anchor.sourceText;
  const shotRole = getRoleDefinition(anchor.roleId) || inferRoleDefinition(segment, index, total);
  const structureType = STRUCTURE_TYPES.includes(preferredStructure)
    ? preferredStructure
    : (STRUCTURE_TYPES.includes(anchor.structureType)
      ? anchor.structureType
      : inferStructureType(segment, index, shotRole));
  const topic = anchor.visualTitle || inferTopic(segment, title, index);
  const coreIdea = anchor.coreIdea || inferCoreIdea(segment);
  const metaphor = buildMetaphor(segment, structureType, {
    index,
    total,
    title,
    shotRole,
    anchor,
    purpose,
  });
  const labels = Array.isArray(anchor.labels) && anchor.labels.length
    ? anchor.labels.slice(0, 6)
    : inferLabels(segment, purpose, shotRole);
  const prompt = buildPrompt({
    purpose,
    topic,
    seriesRole: `${index}/${total} ${shotRole.label}`,
    structureType,
    coreIdea,
    sourceText: segment,
    visualSubject: anchor.visualSubject,
    xiaoheiAction: anchor.xiaoheiAction,
    visualMetaphor: anchor.visualMetaphor,
    composition: metaphor.composition,
    elements: metaphor.elements,
    labels,
    aspectRatio,
  });
  return {
    index,
    skillId: purpose,
    skillName: styleProfile.name,
    skillProfileVersion: SKILL_PROFILE_VERSION,
    topic,
    purpose: shotPurposeLabel(purpose, index),
    role: shotRole.label,
    roleId: shotRole.id,
    sourceText: segment,
    sourceIndex: Number.isFinite(anchor.sourceIndex) ? anchor.sourceIndex : index - 1,
    visualSubject: anchor.visualSubject || "",
    xiaoheiAction: anchor.xiaoheiAction || "",
    visualMetaphor: anchor.visualMetaphor || "",
    structureType,
    coreIdea,
    composition: metaphor.composition,
    elements: metaphor.elements,
    labels,
    prompt,
  };
}

export function buildPrompt({
  purpose = "article",
  topic,
  seriesRole,
  structureType,
  coreIdea,
  sourceText,
  visualSubject,
  xiaoheiAction,
  visualMetaphor,
  composition,
  elements,
  labels,
  aspectRatio = "16:9",
}) {
  const styleProfile = getPurposeStyleProfile(purpose);
  const formatDescription = aspectRatio === "9:16"
    ? "9:16 vertical Chinese short-video illustration"
    : aspectRatio === "1:1"
      ? "1:1 square Chinese social-media illustration"
      : "16:9 horizontal Chinese article illustration";
  return [
    "请直接生成一张图片素材。",
    "不要解释，不要分析，不要复述提示词，不要给优化建议，直接出图。",
    "只生成一张图，不要拼图，不要多宫格，不要组图，不要缩略图合集，不要把多个分镜画在同一张画布里。",
    `画幅：${formatDescription}.`,
    "",
    "项目：小黑视频风格生成",
    "统一要求：每个 Scene 必须只生成一张独立图片素材，主体明确，可直接用于短视频剪辑。",
    "画面文字规则：保留当前 Skill 允许的少量中文手写标注；不要把整段原文、标题、编号、结构类型或说明文字写进画面。",
    "",
    "锁定模板 / Skill（不要替换成其他风格）：",
    `SKILL_ID: ${purpose}`,
    `${styleProfile.name}. ${styleProfile.intent}`,
    "",
    "统一视觉 DNA：",
    styleProfile.visualDna || DEFAULT_VISUAL_DNA,
    "",
    "主体 / 角色规则：",
    styleProfile.characterRule || DEFAULT_CHARACTER_RULE,
    "",
    "构图规则：",
    styleProfile.compositionRule,
    "",
    `分镜任务：${topic}`,
    `本镜头角色：${seriesRole}. 这是单张独立图片任务，只画当前 Scene，不画其他 Scene，不画预览合集。`,
    `对应原文：${sourceText}`,
    `结构类型（只作为理解，不写进画面）：${structureType}`,
    `核心意思：${coreIdea}`,
    `画面主体：${visualSubject || coreIdea}`,
    `${styleProfile.actorName}动作：${xiaoheiAction || `${styleProfile.actorName}执行当前段落最关键的动作`}`,
    `本镜头视觉隐喻：${visualMetaphor || "从当前段落重新发明一个低科技物理隐喻"}`,
    `构图：${composition}`,
    `建议元素：${elements.join(" / ")}`,
    `中文手写标注：${labels.join(" / ")}`,
    "",
    "颜色规则：",
    styleProfile.colorRule,
    "",
    "当前 Skill 禁止项：",
    styleProfile.avoid,
    "",
    "硬性约束：",
    "当前提示词就是一个独立生图任务，只输出这一张图片。禁止合并多个编号，禁止一张图里出现多个分镜框，禁止 collage，禁止 contact sheet，禁止九宫格，禁止组图。",
    `Skill 锁定：所有视觉决策必须匹配 SKILL_ID=${purpose}（${styleProfile.name}）。除非 SKILL_ID=article，否则不要退回默认小黑正文配图风格。`,
    "画面必须解释上方这一段原文，而不是泛化成整篇文章主题。保留原文里的主体、动作、方向、对比和结果。不要替换成通用学习、职场、AI、商业场景。一张图只解释一个核心结构。主体约占画面 40%-60%。最多使用 5-8 个短中文手写标注，标注必须来自当前原文语义。不要在图里写结构类型。不要复制旧案例构图；必须围绕当前段落发明新的视觉隐喻，并严格遵守所选 Skill。",
  ].join("\n");
}

function getPurposeStyleProfile(purpose) {
  return PURPOSE_STYLE_PROFILES[purpose] || PURPOSE_STYLE_PROFILES.article;
}

function buildMetaphor(segment, structureType, { index, total, title, shotRole, anchor = {}, purpose = "article" }) {
  const styleProfile = getPurposeStyleProfile(purpose);
  const domain = inferDomainLayer(`${title} ${segment}`);
  const semanticBase = anchor.visualMetaphor && anchor.xiaoheiAction
    ? `核心隐喻是“${anchor.visualMetaphor}”。${styleProfile.actorName}正在${anchor.xiaoheiAction}。`
    : adaptCompositionToProfile(shotRole?.composition || fallbackCompositionFor(structureType), styleProfile);
  const composition = `${styleProfile.compositionRule} ${semanticBase} 画面只翻译当前原文“${trimText(segment, 80)}”，不扩写成全文主题；围绕“${anchor.visualSubject || inferTopic(segment, title, index)}”选择具体物件，可参考${domain.elements.join("、")}，但不允许用通用图标替代原文动作。保持第 ${index}/${total} 张与其他张的主物件和主体动作不同。`;
  return {
    composition,
    elements: uniqueList([
      ...(Array.isArray(anchor.elements) ? anchor.elements : []),
      ...(shotRole?.elements || []),
      ...domain.elements,
    ]).slice(0, 6),
  };
}

function resolveFileWithin(rootDir, filePath) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(String(filePath || ""));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("背景音乐路径无效。");
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error("背景音乐文件不存在，请重新选择。");
  return resolved;
}

function normalizeXiaoheiCompose(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const bookend = (item, fallback = "") => ({
    enabled: item?.enabled === true && Boolean(String(item?.text || fallback).trim()),
    text: String(item?.text || fallback).trim().slice(0, 80),
  });
  return {
    fps: Number(source.fps) === 60 ? 60 : 30,
    imageFit: source.imageFit === "contain" ? "contain" : "cover",
    ttsVolume: clamp(Number(source.ttsVolume ?? 100), 0, 200),
    bgmVolume: clamp(Number(source.bgmVolume ?? 18), 0, 100),
    showSubtitles: source.showSubtitles !== false,
    subtitleSize: clamp(Number(source.subtitleSize ?? 48), 28, 96),
    subtitleColor: /^#[0-9a-f]{6}$/i.test(String(source.subtitleColor || "")) ? String(source.subtitleColor) : "#ffffff",
    keywordColor: /^#[0-9a-f]{6}$/i.test(String(source.keywordColor || "")) ? String(source.keywordColor) : "#b7ff5a",
    maxLines: clamp(Math.round(Number(source.maxLines ?? 2)), 1, 3),
    animationSpeed: clamp(Number(source.animationSpeed ?? 1), 0.6, 1.6),
    outline: source.outline !== false,
    shadow: source.shadow !== false,
    intro: bookend(source.intro),
    outro: bookend(source.outro, "关注我，下期继续"),
  };
}

function adaptCompositionToProfile(composition, styleProfile) {
  return String(composition || "")
    .replaceAll("小黑", styleProfile.actorName)
    .replaceAll("白纸", styleProfile.actorName === "小黑" ? "白纸" : "画面");
}

function fallbackCompositionFor(structureType) {
  if (structureType === "前后对比") return "左侧是散乱状态，右侧是收束结果，小黑在中间完成一次具体切换动作。";
  if (structureType === "方法分层") return "几层松散纸盒表达方法层级，小黑只在其中一层执行核心动作。";
  if (structureType === "地图路线") return "一条手绘弯曲路径穿过少量节点，小黑沿路线推进。";
  return "白纸中央是一台奇怪的低科技手绘装置，小黑正在操作其中一个关键部件。";
}

function inferStructureType(segment, index, roleDef = null) {
  if (roleDef?.structure) return roleDef.structure;
  if (segment.includes("不是") || segment.includes("忘掉") || segment.includes("当做")) return "前后对比";
  if (segment.includes("开始") || segment.includes("今天") || segment.includes("行动")) return "地图路线";
  if (segment.includes("能力") || segment.includes("步骤") || segment.includes("方法")) return "方法分层";
  if (index === 1) return "概念隐喻";
  return "Workflow";
}

function inferTopic(segment, title, index) {
  const cleaned = segment.replace(/[。！？!?；;]/g, " ").trim();
  const first = cleaned.split(/\s+/)[0] || title || `配图 ${index}`;
  return trimText(first, 32);
}

function inferTitle(text, explicitTitle = "") {
  const title = String(explicitTitle || "").trim();
  if (title) return trimText(title, 36);
  const first = text.split(/[。！？!?；;\n]/).map((item) => item.trim()).find(Boolean) || text;
  return trimText(first, 28);
}

function inferCoreIdea(segment) {
  return trimText(segment.replace(/\s+/g, " "), 90);
}

function inferLabels(segment, purpose, roleDef = null) {
  const candidates = roleDef?.label ? [roleDef.label] : [];
  if (segment.includes("英文")) candidates.push("别当学生", "当使用者", "开口", "今天开始");
  if (segment.includes("行动")) candidates.push("行动篇", "现在", "别等", "第一步");
  if (segment.includes("管理")) candidates.push("判断", "沟通", "节奏", "别乱");
  if (segment.includes("忘掉")) candidates.push("旧身份", "新角色", "切换");
  if (purpose === "workflow") candidates.push("输入", "处理", "输出");
  const words = segment.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  for (const word of words) {
    if (candidates.length >= 6) break;
    if (!candidates.includes(word) && word.length <= 6) candidates.push(word);
  }
  return candidates.slice(0, 6).length ? candidates.slice(0, 6) : ["输入", "判断", "输出"];
}

function getRoleDefinition(roleId) {
  return SHOT_ROLE_DEFS.find((item) => item.id === roleId) || null;
}

function inferRoleDefinition(segment, index, total) {
  const text = String(segment || "");
  if (/(不是|而是|忘掉|当做|身份|从.+变成)/u.test(text)) return getRoleDefinition("switch");
  if (/(误区|错误|不要|不能|别再|避坑|警惕)/u.test(text)) return getRoleDefinition("warning");
  if (/(问题|卡住|困难|焦虑|混乱|失败|为什么)/u.test(text)) return getRoleDefinition("problem");
  if (/(反馈|复盘|循环|闭环|回来|回流)/u.test(text)) return getRoleDefinition("loop");
  if (/(层|阶段|第一|第二|第三|能力|框架)/u.test(text)) return getRoleDefinition("layer");
  if (/(方法|步骤|通过|使用|练习|做法|先.+再)/u.test(text)) return getRoleDefinition("method");
  if (/(今天|现在|开始|行动|接下来|然后|走向)/u.test(text)) return getRoleDefinition(index === total ? "cta" : "path");
  if (index === 1) return getRoleDefinition("hook");
  if (index === total && /(去做|马上|立刻|试试|记住)/u.test(text)) return getRoleDefinition("cta");
  return getRoleDefinition("method");
}

async function analyzeSemanticAnchorsWithModel({ text, title, maxCount, purpose = "article", modelRouter }) {
  if (!modelRouter || typeof modelRouter.generate !== "function") return null;
  const styleProfile = getPurposeStyleProfile(purpose);
  try {
    const result = await modelRouter.generate({
      taskType: "rewrite",
      messages: [
        {
          role: "system",
          content: [
            `你是“${styleProfile.name}”的语义导演。当前必须使用 SKILL_ID=${purpose}，不得替换成文章正文配图或其他模板。`,
            `风格目标：${styleProfile.intent}`,
            `主体规则：${styleProfile.characterRule}`,
            `构图规则：${styleProfile.compositionRule}`,
            `禁止项：${styleProfile.avoid}`,
            "你只负责理解文章和选择真正需要配图的认知锚点。",
            "不要平均切字，不要为了凑数量重复段落，不要按固定的开头/问题/方法/结尾模板强套原文。",
            "优先选择：核心判断、认知转折、断点、输入输出闭环、前后对比、角色变化、方法动作、常见误区。",
            "每张图只能绑定一段语义完整的原文，source_text 必须逐字摘自用户原文。",
            `${styleProfile.actorName}必须执行该段的核心物理动作，不能只站在旁边；没有强制角色的模板不得擅自加入小黑。`,
            "core_idea、visual_subject、subject_action、visual_metaphor 只能解释各自 source_text，禁止混入相邻句或全文其他内容。",
            "不要把原文或标题写进画面，只允许 2-6 字的少量短批注。",
            `最多输出 ${maxCount} 个锚点；短文可以少于 ${maxCount} 个。按原文出现顺序返回。`,
            "只返回 JSON，不要 markdown。格式：",
            '{"anchors":[{"source_text":"","role_id":"hook|problem|switch|method|path|warning|layer|loop|cta","visual_title":"","core_idea":"","visual_subject":"","subject_action":"","visual_metaphor":"","structure_type":"Workflow|系统局部|前后对比|角色状态|概念隐喻|方法分层|地图路线|小漫画分镜","labels":[""],"elements":[""]}]}',
            "visual_subject 只写当前段落的核心对象或变化，最多 12 个中文，不要写完整构图。",
            "labels 只能使用当前 source_text 中已有或直接概括出的 2-6 字短词，最多 6 个。",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({ title, text, max_images: maxCount }, null, 2),
        },
      ],
      options: { temperature: 0.2 },
    });
    const parsed = parseJsonObject(result?.content);
    const units = segmentTextIntoSemanticUnits(text);
    const anchors = Array.isArray(parsed?.anchors)
      ? parsed.anchors.map((item) => normalizeAiAnchor(item, units)).filter(Boolean)
      : [];
    return dedupeAnchors(anchors)
      .sort((a, b) => Number(a.sourceIndex || 0) - Number(b.sourceIndex || 0))
      .slice(0, maxCount);
  } catch {
    return null;
  }
}

function normalizeAiAnchor(value, units) {
  if (!value || typeof value !== "object") return null;
  const sourceText = resolveSourceExcerpt(value.source_text, units);
  if (!sourceText) return null;
  const inferredRole = inferRoleDefinition(sourceText, 1, 1);
  const roleId = inferExplicitRoleId(sourceText) || getRoleDefinition(value.role_id)?.id || inferredRole.id;
  const fallbackAction = defaultActionForRole(roleId, sourceText);
  const proposedAction = trimText(value.subject_action || value.xiaohei_action || "", 48);
  const proposedSubject = trimText(value.visual_subject || "", 32);
  const specializedSubject = specializedSubjectForText(sourceText);
  return {
    sourceText,
    sourceIndex: units.indexOf(sourceText),
    roleId,
    visualTitle: trimText(value.visual_title || inferTopic(sourceText, "", 1), 32),
    coreIdea: trimText(value.core_idea || inferCoreIdea(sourceText), 100),
    visualSubject: specializedSubject || (isValidVisualSubject(proposedSubject) ? proposedSubject : extractVisualSubject(sourceText)),
    xiaoheiAction: isValidXiaoheiAction(proposedAction) ? proposedAction : fallbackAction,
    visualMetaphor: trimText(value.visual_metaphor || defaultMetaphorForRole(roleId, sourceText), 80),
    structureType: STRUCTURE_TYPES.includes(value.structure_type)
      ? value.structure_type
      : getRoleDefinition(roleId)?.structure,
    labels: uniqueList(Array.isArray(value.labels) ? value.labels : []).map((item) => trimText(item, 8)).slice(0, 6),
    elements: uniqueList(Array.isArray(value.elements) ? value.elements : []).map((item) => trimText(item, 16)).slice(0, 5),
  };
}

function parseJsonObject(value) {
  const text = String(value || "").trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function resolveSourceExcerpt(value, units) {
  const candidate = normalizeText(value);
  if (!candidate) return "";
  const exact = units.find((unit) => unit === candidate);
  if (exact) return exact;
  const containing = units.find((unit) => unit.includes(candidate) || candidate.includes(unit));
  if (containing) return containing;
  const candidateTerms = new Set(candidate.match(/[\u4e00-\u9fa5]{2,6}/g) || []);
  let best = "";
  let bestScore = 0;
  for (const unit of units) {
    const terms = unit.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    const score = terms.reduce((sum, term) => sum + (candidateTerms.has(term) ? term.length : 0), 0);
    if (score > bestScore) {
      best = unit;
      bestScore = score;
    }
  }
  return bestScore >= 4 ? best : "";
}

function selectSemanticAnchors(text, maxCount) {
  const units = segmentTextIntoSemanticUnits(text);
  if (!units.length) return [];
  const selected = units.length <= maxCount
    ? units
    : selectDistributedAnchors(units, maxCount);
  return selected.map((sourceText, index) => buildLocalAnchor(sourceText, index, selected.length));
}

function buildLocalAnchor(sourceText, index, total) {
  const role = inferRoleDefinition(sourceText, index + 1, total);
  return {
    sourceText,
    sourceIndex: index,
    roleId: role.id,
    visualTitle: inferTopic(sourceText, "", index + 1),
    coreIdea: inferCoreIdea(sourceText),
    visualSubject: extractVisualSubject(sourceText),
    xiaoheiAction: defaultActionForRole(role.id, sourceText),
    visualMetaphor: defaultMetaphorForRole(role.id, sourceText),
    structureType: role.structure,
    labels: inferLabels(sourceText, "article", role),
    elements: [],
  };
}

function segmentTextIntoSemanticUnits(text) {
  const paragraphs = normalizeText(text).split(/\n{2,}|\n/u).map((item) => item.trim()).filter(Boolean);
  const units = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph
      .split(/(?<=[。！？!?；;])/u)
      .map((item) => item.trim())
      .filter(Boolean);
    for (const sentence of sentences.length ? sentences : [paragraph]) {
      units.push(...splitLongSemanticUnit(sentence));
    }
  }
  return dedupeText(units);
}

function splitLongSemanticUnit(value) {
  const text = String(value || "").trim();
  if (text.length <= 100) return text ? [text] : [];
  const clauses = text.split(/(?<=[，,：:])|(?=(?:但是|然而|所以|因此|从今天|请你|也就是说|换句话说))/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (clauses.length <= 1) return [text];
  const output = [];
  let current = "";
  for (const clause of clauses) {
    if (current && current.length + clause.length > 90) {
      output.push(current);
      current = clause;
    } else {
      current += clause;
    }
  }
  if (current) output.push(current);
  return output;
}

function selectDistributedAnchors(units, maxCount) {
  const selected = [];
  for (let index = 0; index < maxCount; index += 1) {
    const start = Math.floor(index * units.length / maxCount);
    const end = Math.max(start + 1, Math.floor((index + 1) * units.length / maxCount));
    const window = units.slice(start, end);
    let bestOffset = 0;
    let bestScore = -Infinity;
    window.forEach((unit, offset) => {
      const score = semanticAnchorScore(unit, start + offset, units.length);
      if (score > bestScore) {
        bestScore = score;
        bestOffset = offset;
      }
    });
    selected.push(units[start + bestOffset]);
  }
  return dedupeText(selected);
}

function semanticAnchorScore(text, index, total) {
  let score = Math.min(String(text || "").length, 90) / 15;
  if (/(不是|而是|忘掉|当做|意味着|本质|核心)/u.test(text)) score += 7;
  if (/(问题|误区|不要|不能|但是|然而|却)/u.test(text)) score += 5;
  if (/(方法|步骤|通过|行动|开始|第一|第二|第三)/u.test(text)) score += 4;
  if (index === 0) score += 2;
  if (index === total - 1) score += 1;
  return score;
}

function extractVisualSubject(text) {
  const specialized = specializedSubjectForText(text);
  if (specialized) return specialized;
  const clean = String(text || "").replace(/[。！？!?；;，,：:]/g, " ");
  const phrases = clean.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,12}/g) || [];
  const stop = /^(所以|但是|然而|然后|好了|今天|开始|从今天开始|请你|这个|一个|自己|可以|就是|作为|几乎所有人)$/u;
  const candidate = phrases
    .map((item) => item.replace(/^(所以|但是|然而|然后|好了|请你)/u, ""))
    .find((item) => item.length >= 2 && !stop.test(item));
  return trimText(candidate || clean, 24);
}

function specializedSubjectForText(text) {
  const matched = [
    { pattern: /(半年内?.{0,8}(?:流利|说).{0,6}(?:英文|英语)|(?:流利|说).{0,6}(?:英文|英语))/u, label: "半年说流利英文" },
    { pattern: /(英文学生.{0,12}(?:语言|英文).{0,6}使用者|忘掉.{0,8}学生.{0,12}使用者)/u, label: "学生到语言使用者" },
    { pattern: /(忘掉|放下|不再).{0,10}(英文|英语)?.{0,6}学生.{0,6}(身份)?/u, label: "放下英文学生身份" },
    { pattern: /(当做|成为|变成).{0,10}(语言|英文|英语).{0,6}使用者/u, label: "成为语言使用者" },
    { pattern: /(行动篇|从今天开始|现在开始|立即行动)/u, label: "行动正式开始" },
    { pattern: /(管理岗|管理者|领导力)/u, label: "管理角色" },
    { pattern: /(背景音乐|BGM|音乐节拍)/iu, label: "背景音乐节拍" },
  ].find((item) => item.pattern.test(String(text || "")));
  return matched?.label || "";
}

function isValidXiaoheiAction(value) {
  if (!value) return false;
  return !/(微笑|大笑|可爱|自信|兴奋|露出.{0,6}表情|穿上|脱下|T恤|衣服|服装|徽章|学生证|握拳|写着|标有|举起.{0,8}(?:大字|旗帜|牌子)|复杂表情)/iu.test(value);
}

function isValidVisualSubject(value) {
  if (!value || value.length > 20) return false;
  return !/(小黑|一个|一扇|一台|画面|显示|旁边|同时|面前|写着|标有)/u.test(value);
}

function inferExplicitRoleId(text) {
  const value = String(text || "");
  if (/(不是|而是|忘掉|当做|身份|从.+(?:变成|转为|成为))/u.test(value)) return "switch";
  if (/(误区|错误|不要|不能|别再|避坑|警惕)/u.test(value)) return "warning";
  if (/(反馈|复盘|循环|闭环|回流)/u.test(value)) return "loop";
  if (/(今天|现在|开始|行动|接下来)/u.test(value)) return "path";
  return "";
}

function defaultActionForRole(roleId, text) {
  const subject = extractVisualSubject(text);
  const actions = {
    hook: `从一台怪测量仪里拉出“${subject}”的判断纸条`,
    problem: `从杂乱纸团中拎出真正卡住“${subject}”的那一根线`,
    switch: `摘下旧身份纸牌，并把“${subject}”推入新的使用场景`,
    method: `把“${subject}”放进低科技工具台并亲手完成关键动作`,
    path: `牵着代表“${subject}”的橙色线走过必要节点`,
    warning: `从错误装置里捞出与“${subject}”有关的误区纸团`,
    layer: `把“${subject}”拆成少量层级并搬动最关键的一层`,
    loop: `接住“${subject}”从结果端返回的反馈线`,
    cta: `把“${subject}”的最后一个行动黑点按到纸面上`,
  };
  return actions[roleId] || actions.method;
}

function defaultMetaphorForRole(roleId, text) {
  const subject = extractVisualSubject(text);
  const metaphors = {
    hook: `一台只吐出一个结论的旧测量仪，测量对象是“${subject}”`,
    problem: `一堆互相缠住的纸线中只有一根连接“${subject}”`,
    switch: `旧身份衣架与“${subject}”实际使用门之间的一次换牌`,
    method: `把“${subject}”从抽象名词压成可执行动作的怪工具台`,
    path: `一条由当前动作推动、通向“${subject}”结果的小路`,
    warning: `会吞掉“${subject}”正确动作的歪斜警示井`,
    layer: `承托“${subject}”的几层不规则纸盒`,
    loop: `让“${subject}”动作与反馈重新接上的手摇回流机`,
    cta: `从犹豫走到执行“${subject}”的三格行动纸`,
  };
  return metaphors[roleId] || metaphors.method;
}

function dedupeAnchors(anchors) {
  const seen = new Set();
  return anchors.filter((anchor) => {
    const key = String(anchor?.sourceText || "").replace(/\s+/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeText(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const clean = String(value || "").trim();
    const key = clean.replace(/\s+/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function inferDomainLayer(text) {
  const value = String(text || "").toLowerCase();
  if (text.includes("英文") || value.includes("english") || text.includes("语言")) {
    return { elements: ["单词纸片", "对话门", "开口按钮", "身份标签"] };
  }
  if (text.includes("管理") || text.includes("领导") || text.includes("职场")) {
    return { elements: ["任务纸团", "沟通线", "判断按钮", "协作便签"] };
  }
  if (text.includes("招生") || text.includes("课程") || text.includes("学习")) {
    return { elements: ["课程卡片", "学习路径", "提醒便签", "目标门"] };
  }
  if (text.includes("AI") || text.includes("模型") || text.includes("自动")) {
    return { elements: ["输入纸片", "黑盒按钮", "反馈便签", "输出抽屉"] };
  }
  if (text.includes("行动") || text.includes("开始") || text.includes("今天")) {
    return { elements: ["今天节点", "行动线轴", "第一步便签", "落点黑点"] };
  }
  return { elements: ["输入纸片", "判断便签", "输出纸条", "橙色路径"] };
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function trimText(value, max) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function uniqueList(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const clean = String(value || "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }
  return output;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function dateSlug() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function shotPurposeLabel(purpose, index) {
  const purposeLabel = PURPOSES.find((item) => item.id === purpose)?.label || "正文配图";
  return `${purposeLabel} #${index}`;
}

function promptsMarkdown(plan) {
  return [
    `# ${plan.title}`,
    "",
    `输出批次：${plan.batchId}`,
    `画幅：${plan.aspectRatio}`,
    "",
    ...plan.shots.flatMap((shot) => [
      `## ${shot.index}. ${shot.topic}`,
      "",
      `用途：${shot.purpose}`,
      `角色：${shot.role || ""}`,
      `结构：${shot.structureType}`,
      `对应原文：${shot.sourceText || ""}`,
      `核心意思：${shot.coreIdea || ""}`,
      `主体动作：${shot.xiaoheiAction || ""}`,
      `视觉隐喻：${shot.visualMetaphor || ""}`,
      "",
      "```text",
      shot.prompt,
      "```",
      "",
    ]),
  ].join("\n");
}

function listOutputBatches(outputRoot) {
  if (!fs.existsSync(outputRoot)) return [];
  return fs.readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => {
      const folderPath = path.join(outputRoot, entry.name);
      const result = readJsonFile(path.join(folderPath, "result.json"), {});
      const manifest = readJsonFile(path.join(folderPath, "project_manifest.json"), {});
      const resultImages = Array.isArray(result.images) ? result.images : [];
      const boundImages = resultImages.map((image) => ({
        index: Number(image.index || 0),
        topic: String(image.topic || ""),
        purpose: String(image.purpose || ""),
        imagePath: String(image.imagePath || ""),
        imageUrl: image.imageUrl || (image.imagePath ? `/api/image/file?path=${encodeURIComponent(image.imagePath)}` : ""),
        thumbnailUrl: String(image.thumbnailUrl || ""),
        assetId: String(image.assetId || ""),
        provider: String(image.provider || "local"),
        model: String(image.model || "local-file"),
        source: String(image.source || "local_upload"),
        aspectRatio: String(image.aspectRatio || ""),
        confirmed: image.confirmed !== false,
      })).filter((image) => image.index > 0 && (image.imagePath || image.assetId));
      const directFiles = fs.readdirSync(folderPath, { withFileTypes: true })
        .filter((file) => file.isFile() && /\.(png|jpe?g|webp)$/i.test(file.name))
        .map((file) => {
          const filePath = path.join(folderPath, file.name);
          const stats = fs.statSync(filePath);
          return {
            name: file.name,
            path: filePath,
            imageUrl: `/api/image/file?path=${encodeURIComponent(filePath)}`,
            size: stats.size,
            updatedAt: stats.mtime.toISOString(),
          };
        });
      const files = resultImages.length
        ? resultImages.map((image) => ({
          name: `scene_${String(image.index || "").padStart(2, "0")}`,
          path: image.imagePath || "",
          imageUrl: image.imageUrl || (image.imagePath ? `/api/image/file?path=${encodeURIComponent(image.imagePath)}` : ""),
          updatedAt: "",
        }))
        : directFiles;
      const stats = fs.statSync(folderPath);
      const finalVideoPath = String(result.output?.final_video_path || "");
      const hasFinalMp4 = finalVideoPath && fs.existsSync(finalVideoPath);
      // 历史批次也注册到统一下载体系，保证下载地址一致
      let unifiedDownloadUrl = "";
      let unifiedDownloadId = "";
      if (hasFinalMp4 && resolvedDownloadsDir) {
        // 查找是否已注册（避免重复注册）
        let existingId = null;
        for (const [fid, frec] of xiaoheiRenderedFiles.entries()) {
          if (frec.filePath === finalVideoPath || frec.filePath === path.resolve(finalVideoPath)) {
            existingId = fid;
            break;
          }
        }
        if (!existingId) {
          const dName = xiaoheiVideoDownloadName(manifest.title);
          existingId = registerXiaoheiFile(finalVideoPath, dName);
        }
        unifiedDownloadUrl = `/api/ian-xiaohei/file?id=${encodeURIComponent(existingId)}&download=1`;
        unifiedDownloadId = existingId;
      }
      return {
        id: entry.name,
        title: manifest.title || "",
        folderPath,
        timelineProjectId: 0,
        draftPath: result.output?.draft_path || manifest.draft_path || "",
        finalVideoPath: hasFinalMp4 ? finalVideoPath : "",
        videoUrl: hasFinalMp4
          ? `/api/ian-xiaohei/video-file?batch_id=${encodeURIComponent(entry.name)}`
          : "",
        downloadUrl: unifiedDownloadUrl || (hasFinalMp4
          ? `/api/ian-xiaohei/video-file?batch_id=${encodeURIComponent(entry.name)}&download=1`
          : ""),
        downloadName: xiaoheiVideoDownloadName(manifest.title),
        transitionMode: result.output?.transition_mode || "",
        updatedAt: stats.mtime.toISOString(),
        files,
        boundImages,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 40);
}

function resolveBatchDir(outputRoot, id) {
  const safeId = safeBatchId(id);
  if (!safeId) return "";
  if (safeId.startsWith("_")) return "";
  const root = path.resolve(outputRoot);
  const target = path.resolve(root, safeId);
  if (target !== root && target.startsWith(`${root}${path.sep}`)) return target;
  return "";
}

function sendXiaoheiFile(res, filePath, { download = false, downloadName = "" } = {}) {
  const stat = fs.statSync(filePath);
  const fileName = download ? xiaoheiVideoDownloadName(downloadName) : path.basename(filePath);
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Length": stat.size,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

export function xiaoheiVideoDownloadName(value, fallback = "小黑视频") {
  const raw = String(value || "").replace(/\.mp4$/i, "").trim();
  const clean = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 100)
    .trim();
  return `${clean || fallback}.mp4`;
}

function isPathWithin(rootDir, targetPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  return target !== root && target.startsWith(`${root}${path.sep}`);
}

function readJsonFile(filePath, fallback = {}) {
  try {
    return parseStoredJsonObject(fs.readFileSync(filePath, "utf8"), fallback);
  } catch {
    return fallback;
  }
}

function sendAudioFile(res, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = extension === ".wav" ? "audio/wav" : extension === ".m4a" ? "audio/mp4" : "audio/mpeg";
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

async function analyzeReferenceAudio({ ffmpegPath, ffprobePath, filePath, sourceName = "" }) {
  const media = await probeReferenceMedia(ffprobePath, filePath);
  const volume = await detectReferenceVolume(ffmpegPath, filePath);
  const loudness = await measureReferenceLoudness(ffmpegPath, filePath);
  const silences = await detectReferenceSilences(ffmpegPath, filePath);
  const bpm = await estimateReferenceBpm(ffmpegPath, filePath);
  const duration = Number(media.duration || 0);
  const endingSilenceSeconds = silences
    .filter((item) => Number(item.start || 0) >= Math.max(0, duration - 6))
    .reduce((sum, item) => sum + Number(item.duration || 0), 0);
  const estimatedBpm = clampFloat(Number(bpm || 120), 80, 180, 120);
  const targetBpm = clampFloat(Math.max(120, estimatedBpm), 120, 150, 120);
  const targetLufs = clampFloat(Number(loudness.input_i || -14), -18, -12, -14);
  return {
    id: `ref-audio-${dateSlug()}-${randomUUID().slice(0, 8)}`,
    source_name: sourceName,
    source_path: filePath,
    duration,
    codec: media.audioCodec,
    sample_rate: media.sampleRate,
    channels: media.channels,
    bitrate: media.bitRate,
    mean_volume_db: volume.mean_volume,
    max_volume_db: volume.max_volume,
    loudness,
    estimated_bpm: estimatedBpm,
    target_bpm: targetBpm,
    target_lufs: targetLufs,
    true_peak_db: -1.5,
    lra: Number(loudness.input_lra || 6.5),
    ending_fade_seconds: clampFloat(Math.max(2.2, Math.min(3.5, endingSilenceSeconds || 2.5)), 1.5, 4, 2.5),
    bgm_ducking: true,
    voice_priority: true,
    bpm_range: [120, 150],
    silences: silences.slice(0, 40),
    summary: [
      `${duration ? `${duration.toFixed(1)}s` : "未知时长"}`,
      `${Math.round(targetBpm)} BPM`,
      `${targetLufs.toFixed(1)} LUFS`,
      `峰值 ${Number(volume.max_volume || -1.5).toFixed(1)} dB`,
    ].join(" · "),
    created_at: new Date().toISOString(),
  };
}

async function generateReferenceAudioMix({
  settings = {},
  outputRoot,
  ffmpegPath,
  ffprobePath,
  profile = {},
  text = "",
  title = "",
  voiceAssetId = 0,
  voiceAssetService = null,
  emotion = "自然",
  speed = 1,
  bgmMode = "auto",
}) {
  const cleanText = normalizeText(text);
  if (!cleanText) throw new Error("请先输入需要生成音频的文案。");
  const asset = Number(voiceAssetId || 0) > 0
    ? voiceAssetService?.getAsset?.(Number(voiceAssetId))
    : voiceAssetService?.getDefault?.();
  if (!asset) throw new Error("请先选择一个可用配音音色。");
  const provider = createTtsProvider(asset.provider, {
    config: settings.tts?.[asset.provider] || {},
    ffmpegPath,
  });
  if (!provider) throw new Error(`未知 TTS Provider：${asset.provider}`);

  const slug = `${dateSlug()}-reference-style-${randomUUID().slice(0, 8)}`;
  const voicePath = path.join(outputRoot, `${slug}-voice.mp3`);
  const finalPath = path.join(outputRoot, `${slug}-final_audio_mix.m4a`);
  const targetBpm = clampFloat(Number(profile.target_bpm || profile.estimated_bpm || 120), 80, 180, 120);
  const targetLufs = clampFloat(Number(profile.target_lufs || -14), -18, -12, -14);
  const endingFade = clampFloat(Number(profile.ending_fade_seconds || 2.5), 1.5, 4, 2.5);
  fs.mkdirSync(outputRoot, { recursive: true });

  const voiceResult = await provider.generateSpeech({
    text: cleanText,
    voiceId: asset.voice_id,
    voiceName: asset.voice_name,
    model: String(asset.metadata?.target_model || asset.metadata?.model || settings.tts?.[asset.provider]?.model || ""),
    emotion: String(emotion || "自然"),
    speed: SPEED_OPTIONS.includes(Number(speed)) ? Number(speed) : 1,
    volume: 50,
    pitch: 1,
    format: "mp3",
    outputPath: voicePath,
  });
  if (!voiceResult?.success || !fs.existsSync(voicePath)) {
    throw new Error([voiceResult?.error || "TTS 生成失败。", voiceResult?.detail || ""].filter(Boolean).join(" "));
  }

  const voiceDuration = await probeAudioDuration(ffprobePath, voicePath);
  const expectedVoiceMin = estimateMinimumSpeechDuration(cleanText);
  if (!Number.isFinite(voiceDuration) || voiceDuration < expectedVoiceMin) {
    throw new Error(`TTS 音频生成异常：当前音频只有 ${Number(voiceDuration || 0).toFixed(2)} 秒，按文案长度至少应约 ${expectedVoiceMin.toFixed(1)} 秒。请更换音色或检查 ${asset.provider} API 配置后重试。`);
  }
  let bgm = null;
  const warnings = [];
  if (String(bgmMode || "auto") !== "none") {
    try {
      if (String(bgmMode || "auto") !== "local" && settings.tts?.minimax?.api_key) {
        bgm = await generateMinimaxMusic({
          settings,
          outputRoot,
          presetId: "clean_education_bgm",
          lyrics: "",
          title,
          promptExtra: [
            `参考音频目标节拍 ${Math.round(targetBpm)} BPM`,
            "人声优先，BGM 不抢口播",
            "适合中文知识口播和小黑配图视频",
            `总时长约 ${Math.round(voiceDuration + endingFade)} 秒，结尾自然收束`,
          ].join("，"),
        });
      }
    } catch (error) {
      warnings.push(`MiniMax BGM 生成失败，已改用本地基础氛围底：${error instanceof Error ? error.message : String(error)}`);
    }
    if (!bgm?.audio_path || !fs.existsSync(bgm.audio_path)) {
      const localBgmPath = path.join(outputRoot, `${slug}-local_bgm.mp3`);
      await createLocalReferenceBgm({
        ffmpegPath,
        outputPath: localBgmPath,
        duration: Math.max(12, voiceDuration + endingFade),
        targetBpm,
        endingFade,
      });
      bgm = {
        preset_id: "local_reference_bgm",
        preset_label: "本地基础氛围底",
        audio_path: localBgmPath,
        audio_url: `/api/ian-xiaohei/reference-audio-file?file=${encodeURIComponent(path.basename(localBgmPath))}`,
        source: "local_generated",
      };
    }
  }

  if (bgm?.audio_path && fs.existsSync(bgm.audio_path)) {
    await mixVoiceAndBgm({
      ffmpegPath,
      voicePath,
      bgmPath: bgm.audio_path,
      outputPath: finalPath,
      voiceDuration,
      targetLufs,
      endingFade,
    });
  } else {
    await normalizeVoiceOnly({
      ffmpegPath,
      voicePath,
      outputPath: finalPath,
      targetLufs,
    });
  }

  const report = {
    title,
    text: cleanText,
    profile,
    voice: {
      provider: asset.provider,
      voice_id: asset.voice_id,
      voice_name: asset.voice_name,
      path: voicePath,
      duration: voiceDuration,
    },
    bgm,
    final_audio_path: finalPath,
    target_bpm: targetBpm,
    target_lufs: targetLufs,
    ending_fade_seconds: endingFade,
    warnings,
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputRoot, `${slug}-audio_report.json`), JSON.stringify(report, null, 2), "utf8");
  return {
    title,
    audio_path: finalPath,
    audio_url: `/api/ian-xiaohei/reference-audio-file?file=${encodeURIComponent(path.basename(finalPath))}`,
    voice_path: voicePath,
    bgm_path: bgm?.audio_path || "",
    bgm_source: bgm?.source || bgm?.preset_id || "none",
    target_bpm: targetBpm,
    target_lufs: targetLufs,
    duration: voiceDuration + (bgm ? endingFade : 0),
    warnings,
    report,
    message: "参考音频风格混音已生成，可试听后作为本视频音频素材。",
  };
}

async function generateMinimaxMusic({
  settings = {},
  outputRoot,
  presetId,
  lyrics = "",
  promptExtra = "",
  title = "",
  styleProfile = null,
}) {
  const config = settings.tts?.minimax || {};
  const apiKey = String(config.api_key || "").trim();
  if (!apiKey) throw new Error("MiniMax：未配置 API Key，无法生成唱歌或音乐。");
  const preset = MUSIC_PRESETS.find((item) => item.id === String(presetId || "")) || MUSIC_PRESETS[0];
  const baseUrl = String(config.base_url || "https://api.minimaxi.com").trim();
  const text = normalizeText(lyrics).slice(0, 3200);
  if (!preset.instrumental && !text) {
    throw new Error("请先输入歌词或口号；纯音乐请改选“清爽教育BGM”。");
  }
  const prompt = [
    preset.prompt,
    styleProfile ? [
      `参考配乐风格：${Math.round(Number(styleProfile.target_bpm || styleProfile.estimated_bpm || 120))} BPM`,
      `响度目标 ${Number(styleProfile.target_lufs || -14).toFixed(1)} LUFS`,
      `结尾 ${Number(styleProfile.ending_fade_seconds || 2.5).toFixed(1)} 秒自然淡出`,
      "人声优先，BGM 不抢口播",
    ].join("，") : "",
    String(promptExtra || "").trim(),
    title ? `视频标题：${String(title).trim().slice(0, 80)}` : "",
  ].filter(Boolean).join("，");
  const body = {
    model: preset.model || MINIMAX_MUSIC_MODEL,
    prompt,
    stream: false,
    output_format: "hex",
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: "mp3",
    },
    aigc_watermark: false,
    lyrics_optimizer: false,
    is_instrumental: Boolean(preset.instrumental),
  };
  if (!preset.instrumental) body.lyrics = formatMusicLyrics(text, preset);

  const response = await fetch(minimaxEndpoint(baseUrl, "/v1/music_generation"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  const data = parseStoredJsonObject(raw, {});
  const statusCode = Number(data?.base_resp?.status_code || 0);
  if (!response.ok || statusCode !== 0) {
    throw new Error(redactMiniMaxSecret(minimaxMusicError(response.status, data, raw), apiKey));
  }

  let buffer = null;
  const audioHex = String(data?.data?.audio || "").trim();
  if (audioHex) buffer = Buffer.from(audioHex, "hex");
  const remoteUrl = String(data?.data?.audio_url || data?.data?.url || "").trim();
  if (!buffer?.length && remoteUrl) buffer = await downloadAudioUrl(remoteUrl);
  if (!buffer?.length) {
    throw new Error(`MiniMax Music 没有返回可用音频，状态：${String(data?.data?.status || "unknown")}`);
  }

  const fileName = `${dateSlug()}-${preset.id}-${randomUUID().slice(0, 8)}.mp3`;
  const outputPath = path.join(outputRoot, fileName);
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  return {
    preset_id: preset.id,
    preset_label: preset.label,
    model: body.model,
    prompt,
    lyrics: text,
    formatted_lyrics: body.lyrics || "",
    lyrics_source: "minimax_music_input",
    instrumental: Boolean(preset.instrumental),
    audio_path: outputPath,
    audio_url: `/api/ian-xiaohei/music-audio?file=${encodeURIComponent(fileName)}`,
    duration_ms: Number(data?.extra_info?.music_duration || 0),
    bytes: buffer.length,
    trace_id: String(data?.trace_id || ""),
    message: preset.instrumental ? "纯音乐已生成，可作为 BGM 素材试听。" : "唱歌/搞怪音乐已生成，可试听后作为视频素材。",
  };
}

function minimaxEndpoint(baseUrl, pathname) {
  const base = String(baseUrl || "https://api.minimaxi.com").replace(/\/+$/, "");
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return base.endsWith("/v1") ? `${base}${suffix.replace(/^\/v1(?=\/|$)/, "")}` : `${base}${suffix}`;
}

function formatMusicLyrics(text, preset = {}) {
  const clean = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (/^\s*\[(Intro|Verse|Pre Chorus|Chorus|Interlude|Bridge|Outro|Post Chorus|Transition|Break|Hook|Build Up|Inst|Solo)\]/im.test(clean)) {
    return clean.slice(0, 3500);
  }
  const lines = clean
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((item) => item.replace(/[。！？!?；;]+$/u, "").trim())
    .filter(Boolean)
    .slice(0, 16);
  if (!lines.length) return "";
  const hook = lines[0].length <= 26 ? lines[0] : `${lines[0].slice(0, 24)}…`;
  const midpoint = Math.max(1, Math.ceil(lines.length / 2));
  return [
    "[Intro]",
    hook,
    "[Verse]",
    ...lines.slice(0, midpoint),
    "[Chorus]",
    ...(lines.slice(midpoint).length ? lines.slice(midpoint) : [hook]),
    "[Outro]",
    preset.outro || hook,
  ].join("\n").slice(0, 3500);
}

async function downloadAudioUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载 MiniMax 音频失败：${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function minimaxMusicError(status, data, raw) {
  const code = Number(data?.base_resp?.status_code || data?.status_code || 0);
  const message = String(
    data?.base_resp?.status_msg
      || data?.message
      || data?.error?.message
      || raw
      || "",
  ).trim();
  if (status === 401 || status === 403 || /unauthorized|invalid.*key|鉴权|密钥|api key/i.test(message)) {
    return "MiniMax：API Key 无效或未授权音乐生成。";
  }
  if (status === 402 || /balance|quota|insufficient|余额|额度/i.test(message)) {
    return "MiniMax：余额不足或音乐生成额度不可用。";
  }
  if (/model/i.test(message)) return `MiniMax Music：模型不可用。${message ? ` ${message}` : ""}`;
  return message
    ? `MiniMax Music 请求失败（${status || code}）：${message}`
    : `MiniMax Music 请求失败（${status || code || "未知"}）。`;
}

function redactMiniMaxSecret(value, apiKey) {
  const key = String(apiKey || "");
  return key ? String(value || "").replaceAll(key, "[REDACTED]") : String(value || "");
}

function safeMusicFileName(value) {
  const fileName = path.basename(String(value || "").replace(/\0/g, ""));
  const extension = path.extname(fileName).toLowerCase();
  return [".mp3", ".wav", ".m4a"].includes(extension) ? fileName : "";
}

function listLocalMusicAssets(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fileName = safeMusicFileName(entry.name);
      if (!fileName) return null;
      const filePath = path.join(rootDir, fileName);
      if (!isPathWithin(rootDir, filePath) || !fs.existsSync(filePath)) return null;
      const stats = fs.statSync(filePath);
      const title = path.basename(fileName, path.extname(fileName))
        .replace(/^bgm_local_\d+_?/, "")
        .replace(/[_-]+/g, " ")
        .trim() || fileName;
      return {
        id: `local_bgm:${fileName}`,
        source: "local_bgm",
        label: title,
        fileName,
        description: "项目 assets/bgm 里的本地预制音频，可直接试听并作为后续视频素材使用。",
        audio_url: `/api/ian-xiaohei/local-music-audio?file=${encodeURIComponent(fileName)}`,
        instrumental: /bgm|纯音乐|instrumental|background/i.test(fileName),
        size: stats.size,
        updated_at: stats.mtime.toISOString(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.label).localeCompare(String(b.label), "zh-CN"));
}

async function probeReferenceMedia(ffprobePath, filePath) {
  const result = await runProcessCapture(ffprobePath, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);
  const data = parseStoredJsonObject(result.stdout, {});
  const audio = (data.streams || []).find((stream) => stream.codec_type === "audio") || {};
  return {
    duration: Number(data.format?.duration || audio.duration || 0),
    audioCodec: String(audio.codec_name || ""),
    sampleRate: Number(audio.sample_rate || 0),
    channels: Number(audio.channels || 0),
    bitRate: Number(audio.bit_rate || data.format?.bit_rate || 0),
  };
}

async function detectReferenceVolume(ffmpegPath, filePath) {
  const result = await runProcessCapture(ffmpegPath, [
    "-hide_banner",
    "-nostats",
    "-i", filePath,
    "-af", "volumedetect",
    "-vn", "-sn", "-dn",
    "-f", "null",
    nullDevice(),
  ], { allowFailure: true, timeoutMs: 120000 });
  const text = `${result.stdout}\n${result.stderr}`;
  return {
    mean_volume: parseFfmpegNumber(text, /mean_volume:\s*([-\d.]+)\s*dB/i, -17),
    max_volume: parseFfmpegNumber(text, /max_volume:\s*([-\d.]+)\s*dB/i, -2),
  };
}

async function measureReferenceLoudness(ffmpegPath, filePath) {
  const result = await runProcessCapture(ffmpegPath, [
    "-hide_banner",
    "-nostats",
    "-i", filePath,
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
    "-vn", "-sn", "-dn",
    "-f", "null",
    nullDevice(),
  ], { allowFailure: true, timeoutMs: 120000 });
  const text = `${result.stdout}\n${result.stderr}`;
  const match = text.match(/\{\s*"input_i"[\s\S]*?\}/);
  const data = parseStoredJsonObject(match?.[0] || "", {});
  return {
    input_i: Number(data.input_i || -14),
    input_tp: Number(data.input_tp || -1.5),
    input_lra: Number(data.input_lra || 6.5),
    input_thresh: Number(data.input_thresh || -24),
    output_i: Number(data.output_i || 0),
    target_offset: Number(data.target_offset || 0),
  };
}

async function detectReferenceSilences(ffmpegPath, filePath) {
  const result = await runProcessCapture(ffmpegPath, [
    "-hide_banner",
    "-nostats",
    "-i", filePath,
    "-af", "silencedetect=n=-35dB:d=0.25",
    "-vn", "-sn", "-dn",
    "-f", "null",
    nullDevice(),
  ], { allowFailure: true, timeoutMs: 120000 });
  const text = `${result.stdout}\n${result.stderr}`;
  const events = [];
  const startPattern = /silence_start:\s*([\d.]+)/g;
  const endPattern = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;
  let startMatch;
  while ((startMatch = startPattern.exec(text))) events.push({ type: "start", at: Number(startMatch[1]) });
  let endMatch;
  const ends = [];
  while ((endMatch = endPattern.exec(text))) ends.push({ end: Number(endMatch[1]), duration: Number(endMatch[2]) });
  return ends.map((item, index) => ({
    start: Number(events[index]?.at || Math.max(0, item.end - item.duration)),
    end: item.end,
    duration: item.duration,
  }));
}

async function estimateReferenceBpm(ffmpegPath, filePath) {
  const result = await runProcessCapture(ffmpegPath, [
    "-hide_banner",
    "-loglevel", "error",
    "-t", "180",
    "-i", filePath,
    "-vn",
    "-ac", "1",
    "-ar", "22050",
    "-f", "s16le",
    "-acodec", "pcm_s16le",
    "-",
  ], { binaryStdout: true, timeoutMs: 120000 });
  const pcm = result.stdoutBuffer;
  if (!pcm?.length) return 120;
  const samples = Math.floor(pcm.length / 2);
  const hop = 512;
  const win = 1024;
  const envelope = [];
  for (let offset = 0; offset + win < samples; offset += hop) {
    let sum = 0;
    for (let j = 0; j < win; j += 1) {
      const sample = pcm.readInt16LE((offset + j) * 2);
      sum += sample * sample;
    }
    envelope.push(Math.sqrt(sum / win));
  }
  if (envelope.length < 20) return 120;
  const onset = [0];
  for (let index = 1; index < envelope.length; index += 1) {
    onset.push(Math.max(0, envelope[index] - envelope[index - 1]));
  }
  const mean = onset.reduce((sum, value) => sum + value, 0) / onset.length;
  const cleaned = onset.map((value) => Math.max(0, value - mean * 0.5));
  const fps = 22050 / hop;
  let bestBpm = 120;
  let bestScore = -Infinity;
  for (let bpm = 80; bpm <= 180; bpm += 1) {
    const lag = Math.round((60 / bpm) * fps);
    if (lag <= 0 || lag >= cleaned.length) continue;
    let score = 0;
    let count = 0;
    for (let index = lag; index < cleaned.length; index += 1) {
      score += cleaned[index] * cleaned[index - lag];
      count += 1;
    }
    const normalized = count ? score / count : 0;
    if (normalized > bestScore) {
      bestScore = normalized;
      bestBpm = bpm;
    }
  }
  return bestBpm;
}

async function createLocalReferenceBgm({ ffmpegPath, outputPath, duration, targetBpm, endingFade }) {
  const safeDuration = clampFloat(Number(duration || 30), 5, 600, 30);
  const beatHz = clampFloat(Number(targetBpm || 120) / 60, 1.2, 2.8, 2);
  const fadeStart = Math.max(0, safeDuration - Number(endingFade || 2.5));
  await runProcessCapture(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-f", "lavfi",
    "-i", `aevalsrc=0.014*sin(2*PI*220*t)+0.01*sin(2*PI*330*t)+0.006*sin(2*PI*${beatHz}*t):s=44100:d=${safeDuration.toFixed(3)}`,
    "-filter:a", `afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeStart.toFixed(3)}:d=${Number(endingFade || 2.5).toFixed(3)},loudnorm=I=-24:TP=-3:LRA=8`,
    "-c:a", "libmp3lame",
    "-b:a", "160k",
    outputPath,
  ], { timeoutMs: 120000 });
}

async function mixVoiceAndBgm({ ffmpegPath, voicePath, bgmPath, outputPath, voiceDuration, targetLufs, endingFade }) {
  const voiceSeconds = Math.max(1, Number(voiceDuration || 1));
  const tail = clampFloat(Number(endingFade || 2.5), 1.5, 4, 2.5);
  const mixDuration = voiceSeconds + tail;
  const fadeStart = Math.max(0, mixDuration - tail);
  const target = clampFloat(Number(targetLufs || -14), -18, -12, -14);
  const filter = [
    `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.0,apad=pad_dur=${tail.toFixed(3)},aresample=44100,asplit=2[voice_mix][voice_sc]`,
    `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.24,atrim=0:${mixDuration.toFixed(3)},asetpts=N/SR/TB,aresample=44100[bgm0]`,
    "[bgm0][voice_sc]sidechaincompress=threshold=0.025:ratio=10:attack=20:release=500[ducked]",
    `[voice_mix][ducked]amix=inputs=2:duration=first:dropout_transition=0,volume=${target <= -15 ? "0.92" : "1.0"},alimiter=limit=0.92,afade=t=out:st=${fadeStart.toFixed(3)}:d=${tail.toFixed(3)}[a]`,
  ].join(";");
  await runProcessCapture(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", voicePath,
    "-stream_loop", "-1",
    "-i", bgmPath,
    "-filter_complex", filter,
    "-map", "[a]",
    "-t", mixDuration.toFixed(3),
    "-c:a", "aac",
    "-b:a", "192k",
    outputPath,
  ], { timeoutMs: 180000 });
}

async function normalizeVoiceOnly({ ffmpegPath, voicePath, outputPath, targetLufs }) {
  const target = clampFloat(Number(targetLufs || -14), -18, -12, -14);
  await runProcessCapture(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", voicePath,
    "-af", `loudnorm=I=${target}:TP=-1.5:LRA=7`,
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    outputPath,
  ], { timeoutMs: 120000 });
}

function runProcessCapture(command, args, {
  timeoutMs = 60000,
  allowFailure = false,
  binaryStdout = false,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const stdoutChunks = [];
    const stderrChunks = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`命令超时：${path.basename(command)}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      const result = {
        code,
        stdoutBuffer,
        stdout: binaryStdout ? "" : stdoutBuffer.toString("utf8"),
        stderr: stderrBuffer.toString("utf8"),
      };
      if (code !== 0 && !allowFailure) {
        reject(new Error(result.stderr || result.stdout || `命令执行失败：${code}`));
        return;
      }
      resolve(result);
    });
  });
}

function parseFfmpegNumber(text, pattern, fallback) {
  const match = String(text || "").match(pattern);
  const value = Number(match?.[1]);
  return Number.isFinite(value) ? value : fallback;
}

function nullDevice() {
  return process.platform === "win32" ? "NUL" : "/dev/null";
}

function clampFloat(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function openFolder(folderPath) {
  fs.mkdirSync(folderPath, { recursive: true });
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "", folderPath], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [folderPath], { detached: true, stdio: "ignore" }).unref();
}
