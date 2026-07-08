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
  const count = clamp(Number(input.count) || 1, 1, 4);
  const purpose = PURPOSES.some((item) => item.id === input.purpose) ? input.purpose : "article";
  const batchId = `${dateSlug()}-ian-xiaohei-${randomUUID().slice(0, 8)}`;
  const title = inferTitle(text, input.title);
  const segments = splitIntoSegments(text, count);
  const shots = segments.map((segment, index) => buildShot({
    index: index + 1,
    title,
    text,
    segment,
    purpose,
    preferredStructure: input.structureType,
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

function buildShot({ index, title, segment, purpose, preferredStructure }) {
  const structureType = STRUCTURE_TYPES.includes(preferredStructure)
    ? preferredStructure
    : inferStructureType(segment, index);
  const topic = inferTopic(segment, title, index);
  const coreIdea = inferCoreIdea(segment);
  const metaphor = buildMetaphor(segment, structureType);
  const labels = inferLabels(segment, purpose);
  const prompt = buildPrompt({
    topic,
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
    structureType,
    coreIdea,
    composition: metaphor.composition,
    elements: metaphor.elements,
    labels,
    prompt,
  };
}

function buildPrompt({ topic, structureType, coreIdea, composition, elements, labels }) {
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
    "One image explains only one core structure. Keep the main subject around 40%-60% of the canvas. Preserve at least 35% blank white space. Use at most 5-8 short handwritten Chinese labels. Do not write a title in the top-left corner. Do not write the structure type on the image. Do not make it a formal diagram, course slide, or dense explainer. Do not copy prior examples or reuse known case compositions unless explicitly requested; invent a fresh visual metaphor for this specific article. It should be clear but not instructional, interesting but not childish, strange but clean.",
  ].join("\n");
}

function buildMetaphor(segment, structureType) {
  const lower = segment.toLowerCase();
  if (segment.includes("英文") || lower.includes("english") || segment.includes("语言")) {
    return {
      composition: "白纸中间是一台低科技语言工具台，小黑把写着“学生身份”的纸牌塞进抽屉，再从旧工具台里抽出橙色的“使用者”路径；左侧是松散单词纸片，右侧是一扇正在打开的对话门。",
      elements: ["旧工具台", "身份纸牌", "橙色路径", "对话门"],
    };
  }
  if (segment.includes("管理") || segment.includes("领导")) {
    return {
      composition: "小黑站在一台歪斜的管理秤上，把散落任务、沟通线和判断按钮分成三格；橙色线从混乱纸团汇入一个稳定出口，红色批注只标出最容易翻车的位置。",
      elements: ["管理秤", "任务纸团", "判断按钮", "稳定出口"],
    };
  }
  if (segment.includes("行动") || segment.includes("开始") || segment.includes("今天")) {
    return {
      composition: "一条弯曲路线从白纸左侧的犹豫洞口出发，小黑拉着橙色线穿过几个小门，最后把线钉在“今天”节点上；画面保留大面积空白。",
      elements: ["犹豫洞口", "橙色路线", "小门", "今天节点"],
    };
  }
  if (structureType === "前后对比") {
    return {
      composition: "左侧是散乱纸片和断线，右侧是收束后的一个干净出口；小黑在中间把混乱纸片压进一个怪压面机，橙色箭头表示从散乱到可用。",
      elements: ["散乱纸片", "怪压面机", "干净出口", "橙色箭头"],
    };
  }
  if (structureType === "方法分层") {
    return {
      composition: "三层不规则纸盒从下到上搭起，小黑在底层搬砖，旁边只有少量红橙蓝批注，表达从基础动作到最终结果的搭建过程。",
      elements: ["不规则纸盒", "小砖块", "顶层结果", "短批注"],
    };
  }
  return {
    composition: "白纸中央是一台奇怪的手绘黑盒机器，小黑在机器内部拧一个判断旋钮；左侧输入几张纸片，右侧吐出一个清晰结果，橙色线表示主路径。",
    elements: ["黑盒机器", "判断旋钮", "输入纸片", "清晰结果"],
  };
}

function inferStructureType(segment, index) {
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

function inferLabels(segment, purpose) {
  const candidates = [];
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
