import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";

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
  { id: "wechat", label: "公众号配图" },
  { id: "knowledge", label: "知识观点配图" },
  { id: "workflow", label: "方法流程配图" },
  { id: "cover-reference", label: "封面参考图" },
];

const MAX_TEXT_LENGTH = 5000;

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

export function createIanXiaoheiRoutes({ baseDir, sendJson, imageService }) {
  const outputRoot = path.join(baseDir, "image-assets", "ian-xiaohei");
  fs.mkdirSync(outputRoot, { recursive: true });

  return async function handleIanXiaoheiRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/ian-xiaohei/")) return false;
    const route = url.pathname.replace("/api/ian-xiaohei/", "");

    if (req.method === "GET" && route === "config") {
      sendJson(res, 200, {
        ok: true,
        outputDir: outputRoot,
        purposes: PURPOSES,
        structureTypes: STRUCTURE_TYPES,
      });
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

    if (req.method === "POST" && route === "plan") {
      try {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        const plan = buildXiaoheiPlan(body);
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
        if (!batchId) throw new Error("缺少输出批次 ID。");
        if (!shot.prompt) throw new Error("缺少当前配图提示词。");

        const batchDir = path.join(outputRoot, batchId);
        fs.mkdirSync(batchDir, { recursive: true });
        if (plan) savePlanFiles(batchDir, plan);

        const generated = await imageService.generateImage({
          prompt: shot.prompt,
          aspectRatio: "16:9",
          count: 1,
          sourceType: "ian-xiaohei",
          sourceId: `${batchId}:${shot.index}`,
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

    if (req.method === "POST" && route === "generate") {
      try {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        const plan = buildXiaoheiPlan(body);
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
              aspectRatio: "16:9",
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
    }

    sendJson(res, 404, { ok: false, message: "Unknown Ian Xiaohei API" });
    return true;
  };
}

function buildXiaoheiPlan(input = {}) {
  const text = normalizeText(input.text);
  if (!text) throw new Error("请先输入文案。");
  const count = clamp(Number(input.count) || 1, 1, 9);
  const purpose = PURPOSES.some((item) => item.id === input.purpose) ? input.purpose : "article";
  const batchId = `${dateSlug()}-ian-xiaohei-${randomUUID().slice(0, 8)}`;
  const title = inferTitle(text, input.title);
  const segments = splitIntoSegments(text, count);
  const roles = rolesForCount(count);
  const shots = segments.map((segment, index) => buildShot({
    index: index + 1,
    total: count,
    title,
    text,
    segment,
    purpose,
    preferredStructure: input.structureType,
    roleDef: roles[index],
  }));
  return {
    batchId,
    title,
    sourceText: text,
    aspectRatio: "16:9",
    purpose,
    purposeLabel: PURPOSES.find((item) => item.id === purpose)?.label || "文章正文配图",
    shots,
  };
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

function updateResultFile(batchDir, { image = null, error = null } = {}) {
  const resultPath = path.join(batchDir, "result.json");
  let result = { images: [], errors: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    result = {
      images: Array.isArray(parsed.images) ? parsed.images : [],
      errors: Array.isArray(parsed.errors) ? parsed.errors : [],
    };
  } catch {
    result = { images: [], errors: [] };
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
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
}

function buildShot({ index, total, title, segment, purpose, preferredStructure, roleDef }) {
  const shotRole = roleDef || SHOT_ROLE_DEFS[(index - 1) % SHOT_ROLE_DEFS.length];
  const structureType = STRUCTURE_TYPES.includes(preferredStructure)
    ? preferredStructure
    : inferStructureType(segment, index, shotRole);
  const topic = inferTopic(segment, title, index);
  const coreIdea = inferCoreIdea(segment);
  const metaphor = buildMetaphor(segment, structureType, { index, total, title, shotRole });
  const labels = inferLabels(segment, purpose, shotRole);
  const prompt = buildPrompt({
    topic,
    seriesRole: `${index}/${total} ${shotRole.label}`,
    structureType,
    coreIdea,
    composition: metaphor.composition,
    elements: metaphor.elements,
    labels,
  });
  return {
    index,
    topic,
    purpose: shotPurposeLabel(purpose, index),
    role: shotRole.label,
    structureType,
    coreIdea,
    composition: metaphor.composition,
    elements: metaphor.elements,
    labels,
    prompt,
  };
}

function buildPrompt({ topic, seriesRole, structureType, coreIdea, composition, elements, labels }) {
  return [
    "Generate one standalone 16:9 horizontal Chinese article illustration.",
    "",
    "Visual DNA:",
    "Pure white background. Minimalist black hand-drawn line art. Slightly wobbly pen lines. Lots of empty white space. Sparse red/orange/blue handwritten Chinese annotations. Clean absurd product-sketch feeling. No gradients, no shadows, no paper texture, no complex background, no commercial vector style, no PPT infographic look, no cute mascot poster, no children's illustration, no realistic UI.",
    "",
    "Recurring IP character required:",
    "小黑, a small solid-black absurd creature with white dot eyes, tiny thin legs, blank serious expression, slightly uneven hand-drawn body shape. 小黑 must perform the core conceptual action, not decorate the scene. Make 小黑 serious, deadpan, and slightly bizarre, not cute.",
    "",
    `Theme: ${topic}`,
    `Series role: ${seriesRole}. This image belongs to a multi-image set, so it must use a clearly different metaphor, object set, and composition from the other images in the same set.`,
    `Structure type: ${structureType}`,
    `Core idea: ${coreIdea}`,
    `Composition: ${composition}`,
    `Suggested elements: ${elements.join(" / ")}`,
    `Chinese handwritten labels: ${labels.join(" / ")}`,
    "",
    "Color use:",
    "Black for main line art and 小黑. Orange for main flow/path/arrows. Red only for key warnings/problems/results. Blue only for secondary notes or feedback/system state.",
    "",
    "Constraints:",
    "One image explains only one core structure. Keep the main subject around 40%-60% of the canvas. Preserve at least 35% blank white space. Use at most 5-8 short handwritten Chinese labels. Do not write a title in the top-left corner. Do not write the structure type on the image. Do not make it a formal diagram, course slide, or dense explainer. Do not repeat the same machine, route, door, funnel, card, or character pose across the image set. Do not copy prior examples or reuse known case compositions unless explicitly requested; invent a fresh visual metaphor for this specific article. It should be clear but not instructional, interesting but not childish, strange but clean.",
  ].join("\n");
}

function buildMetaphor(segment, structureType, { index, total, title, shotRole }) {
  const domain = inferDomainLayer(`${title} ${segment}`);
  const base = shotRole?.composition || fallbackCompositionFor(structureType);
  const composition = `${base} 内容主题只取当前段落，不把全文都塞进同一张图；相关物件使用${domain.elements.join("、")}，并保持第 ${index}/${total} 张与其他张的主物件和小黑动作不同。`;
  return {
    composition,
    elements: uniqueList([...(shotRole?.elements || []), ...domain.elements]).slice(0, 6),
  };
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

function splitIntoSegments(text, count) {
  const sentences = text.split(/(?<=[。！？!?；;])|\n+/).map((item) => item.trim()).filter(Boolean);
  if (sentences.length <= count) return padSegments(sentences, count, text);
  const buckets = Array.from({ length: count }, () => []);
  sentences.forEach((sentence, index) => {
    const bucketIndex = Math.min(count - 1, Math.floor(index * count / sentences.length));
    buckets[bucketIndex].push(sentence);
  });
  return buckets.map((bucket) => bucket.join("")).filter(Boolean);
}

function padSegments(segments, count, fallback) {
  const output = [...segments];
  while (output.length < count) output.push(output[output.length - 1] || fallback);
  return output.slice(0, count);
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
      `结构：${shot.structureType}`,
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
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folderPath = path.join(outputRoot, entry.name);
      const files = fs.readdirSync(folderPath, { withFileTypes: true })
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
      const stats = fs.statSync(folderPath);
      return {
        id: entry.name,
        folderPath,
        updatedAt: stats.mtime.toISOString(),
        files,
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 40);
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
