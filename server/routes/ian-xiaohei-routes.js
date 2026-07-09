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
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const AUDIO_MIME_EXTENSIONS = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
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
  videoProductService = null,
  taskStore = null,
  getSettings = () => ({}),
  ffprobePath = "",
  transcribeLocalMedia = null,
}) {
  const outputRoot = path.join(baseDir, "image-assets", "ian-xiaohei");
  const uploadRoot = path.join(outputRoot, "_uploaded-audio");
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(uploadRoot, { recursive: true });

  return async function handleIanXiaoheiRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/ian-xiaohei/")) return false;
    const route = url.pathname.replace("/api/ian-xiaohei/", "");

    if (req.method === "GET" && route === "config") {
      const settings = getSettings() || {};
      const defaultProvider = String(settings.tts?.default_provider || "aliyun_bailian");
      const voiceAssets = voiceAssetService?.listAssets?.()
        ?.filter((asset) => !asset.archived && asset.status === "active") || [];
      sendJson(res, 200, {
        ok: true,
        outputDir: outputRoot,
        purposes: PURPOSES,
        structureTypes: STRUCTURE_TYPES,
        tts: {
          defaultProvider,
          defaultSpeed: Number(settings.tts?.default_speed || 1),
          defaultVoice: voiceAssetService?.getDefault?.() || null,
          voices: ttsService?.listVoices?.(defaultProvider) || [],
          voiceAssets,
        },
      });
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

    if (req.method === "GET" && route === "video-job") {
      const project = videoProductService?.getProject?.(Number(url.searchParams.get("id") || 0));
      if (!project) {
        sendJson(res, 404, { ok: false, message: "没有找到这条剪映草稿任务。" });
      } else {
        sendJson(res, 200, { ok: true, project });
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

    if (req.method === "POST" && route === "tts") {
      try {
        if (!ttsService?.enqueue) throw new Error("TTS 服务不可用。");
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        const text = normalizeText(body.text);
        if (!text) throw new Error("请先输入文案。");
        const asset = Number(body.voice_asset_id || 0) > 0
          ? voiceAssetService?.getAsset?.(Number(body.voice_asset_id))
          : null;
        const result = ttsService.enqueue({
          text,
          provider: String(asset?.provider || body.provider || ""),
          voice_id: String(asset?.voice_id || body.voice_id || ""),
          voice_name: String(asset?.voice_name || body.voice_name || ""),
          voice_asset_id: Number(asset?.id || 0),
          model: String(asset?.metadata?.target_model || body.model || ""),
          speed: Number(body.speed || 1),
          emotion: String(body.emotion || "自然"),
          format: "mp3",
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
        const job = ttsService?.getJob?.(Number(body.tts_job_id || 0))
          || taskStore?.getTtsJob?.(Number(body.tts_job_id || 0));
        if (!job || job.status !== "completed" || !job.audio_path || !fs.existsSync(job.audio_path)) {
          throw new Error("TTS 音频尚未生成完成。");
        }
        const text = normalizeText(body.text || job.text);
        if (normalizeComparableText(text) !== normalizeComparableText(job.text)) {
          throw new Error("当前文案与 TTS 文案不一致，请重新生成语音。");
        }
        const audioDuration = await probeAudioDuration(ffprobePath, job.audio_path);
        if (!(audioDuration > 0)) throw new Error("无法读取 TTS 音频时长。");
        const plan = await buildTimedXiaoheiPlan({
          text,
          title: body.title,
          purpose: body.purpose,
          preferredStructure: body.structureType,
          audioDuration,
          ttsJobId: job.id,
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
        if (!videoProductService?.enqueue) throw new Error("视频成片服务不可用。");
        const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
        const plan = body.plan && typeof body.plan === "object" ? body.plan : null;
        const images = Array.isArray(body.images) ? body.images : [];
        if (!plan?.directorProjectId || !plan?.ttsJobId) throw new Error("缺少导演稿或 TTS 绑定信息。");
        const missing = (plan.shots || []).filter((shot) => !images.some((image) => Number(image.index) === Number(shot.index) && image.assetId));
        if (missing.length) throw new Error(`缺少配图：${missing.map((shot) => `#${shot.index}`).join("、")}。`);
        const manualBindings = Object.fromEntries(images.map((image) => [String(image.index), String(image.assetId)]));
        const result = videoProductService.enqueue({
          source_director_project_id: Number(plan.directorProjectId),
          director_project_id: Number(plan.directorProjectId),
          audio_asset_id: Number(plan.ttsJobId),
          tts_job_id: Number(plan.ttsJobId),
          title: String(plan.title || "小黑配图视频"),
          output_type: "jianying_template",
          platform: "douyin",
          image_source: "director",
          image_asset_ids: images.map((image) => image.assetId),
          manual_bindings: manualBindings,
          jianying_template: String(body.jianying_template || "education_tips"),
          bgm_strategy: String(body.bgm_strategy || "none"),
          force_execution: false,
        });
        if (!result?.project) throw new Error(result?.error || "剪映草稿任务创建失败。");
        sendJson(res, 202, { ok: true, project: result.project });
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

async function buildXiaoheiPlan(input = {}, modelRouter = null) {
  const text = normalizeText(input.text);
  if (!text) throw new Error("请先输入文案。");
  const maxCount = clamp(Number(input.count) || 1, 1, 9);
  const purpose = PURPOSES.some((item) => item.id === input.purpose) ? input.purpose : "article";
  const batchId = `${dateSlug()}-ian-xiaohei-${randomUUID().slice(0, 8)}`;
  const title = inferTitle(text, input.title);
  const aiAnchors = input.semanticAnalysis === false
    ? null
    : await analyzeSemanticAnchorsWithModel({ text, title, maxCount, modelRouter });
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
    preferredStructure: input.structureType,
  }));
  return {
    batchId,
    title,
    sourceText: text,
    aspectRatio: "16:9",
    purpose,
    purposeLabel: PURPOSES.find((item) => item.id === purpose)?.label || "文章正文配图",
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
  audioDuration,
  ttsJobId,
  modelRouter,
}) {
  const normalizedText = normalizeText(text);
  const purpose = PURPOSES.some((item) => item.id === requestedPurpose) ? requestedPurpose : "article";
  const title = inferTitle(normalizedText, explicitTitle);
  const batchId = `${dateSlug()}-ian-xiaohei-video-${randomUUID().slice(0, 8)}`;
  const timedSegments = buildAudioTimedSegments(normalizedText, audioDuration);
  const aiAnchors = await enrichTimedSegmentsWithModel({
    title,
    segments: timedSegments.map((segment) => segment.text),
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
      preferredStructure,
    }),
    segmentId: `seg-${String(index + 1).padStart(3, "0")}`,
    startTime: timedSegments[index].start,
    endTime: timedSegments[index].end,
    duration: timedSegments[index].duration,
  }));
  return {
    batchId,
    title,
    sourceText: normalizedText,
    aspectRatio: "16:9",
    purpose,
    purposeLabel: PURPOSES.find((item) => item.id === purpose)?.label || "文章正文配图",
    requestedCount: "auto",
    semanticUnitCount: shots.length,
    analysisMode: aiAnchors?.length === timedSegments.length ? "ai_timed_semantic" : "local_timed_semantic",
    analysisNote: `已按 ${Number(audioDuration).toFixed(2)} 秒真实音频生成 ${shots.length} 个连续语义镜头，每段约 3-5 秒。`,
    timingSource: "tts_audio_duration_weighted",
    audioDuration: Number(audioDuration.toFixed(3)),
    ttsJobId: Number(ttsJobId),
    shots,
  };
}

async function enrichTimedSegmentsWithModel({ title, segments, modelRouter }) {
  if (!modelRouter || typeof modelRouter.generate !== "function" || !segments.length) return null;
  try {
    const result = await modelRouter.generate({
      taskType: "rewrite",
      messages: [
        {
          role: "system",
          content: [
            "你是 Ian 小黑视频配图导演。用户已经按 TTS 音频节奏拆好了全部文案段落。",
            "不得删除、合并、重排或新增段落。必须为每个输入段落返回一条视觉设计，数量和 source_index 完全一致。",
            "每条只解释该段原文：提炼主体、动作、转折和结果，再发明一个低科技、怪诞但清楚的物理隐喻。",
            "小黑是黑色实心、白点眼、细腿、空表情的严肃操作员，必须执行核心动作；不能穿衣、微笑、举标题牌或当装饰。",
            "禁止通用英语学习图、通用职场图、PPT、正式流程图、商业插画、可爱卡通和大段可读文字。",
            "只返回 JSON，不要 markdown。",
            '{"anchors":[{"source_index":0,"role_id":"hook|problem|switch|method|path|warning|layer|loop|cta","visual_title":"","core_idea":"","visual_subject":"","xiaohei_action":"","visual_metaphor":"","structure_type":"Workflow|系统局部|前后对比|角色状态|概念隐喻|方法分层|地图路线|小漫画分镜","labels":[""],"elements":[""]}]}',
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
    visual_style: "ian_xiaohei_whiteboard",
    platform: "douyin",
    pace: "audio_synced",
    estimated_duration: Number(plan.audioDuration || 0),
    status: "completed",
    score: 90,
    metadata_json: JSON.stringify({
      source_type: "ian_xiaohei_tts_timeline",
      source_key: `tts:${audioJob.id}`,
      tts_job_id: Number(audioJob.id),
      scene_count: plan.shots.length,
      total_duration: plan.audioDuration,
      ratio: "16:9",
      timing_source: plan.timingSource,
      batch_id: plan.batchId,
    }),
  });
  taskStore.replaceDirectorScenes(project.id, plan.shots.map((shot) => ({
    scene_index: shot.index,
    duration: shot.duration,
    purpose: shot.visualSubject || shot.topic,
    emotion: "自然",
    voice_text: shot.sourceText,
    subtitle: shot.sourceText,
    visual_style: "Ian 小黑白底手绘",
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
      visual_subject: shot.visualSubject,
      xiaohei_action: shot.xiaoheiAction,
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

function buildShot({ index, total, title, anchor, purpose, preferredStructure }) {
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
  });
  const labels = Array.isArray(anchor.labels) && anchor.labels.length
    ? anchor.labels.slice(0, 6)
    : inferLabels(segment, purpose, shotRole);
  const prompt = buildPrompt({
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
  });
  return {
    index,
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

function buildPrompt({
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
}) {
  return [
    "Generate one standalone 16:9 horizontal Chinese article illustration.",
    "",
    "Visual DNA:",
    "Pure white background. Minimalist black hand-drawn line art. Slightly wobbly pen lines. Lots of empty white space. Sparse red/orange/blue handwritten Chinese annotations. Clean absurd product-sketch feeling. No gradients, no shadows, no paper texture, no complex background, no commercial vector style, no PPT infographic look, no cute mascot poster, no children's illustration, no realistic UI.",
    "",
    "Recurring IP character required:",
    "小黑, one small solid-black absurd creature with exactly two white dot eyes, exactly two tiny thin legs, at most two thin arms, no duplicated face or limbs, blank serious expression, slightly uneven hand-drawn body shape. 小黑 must perform the core conceptual action, not decorate the scene. Make 小黑 serious, deadpan, and slightly bizarre, not cute. Never draw extra eyes, extra legs, extra arms, layered faces, smiling, confident, excited, or expressive facial features.",
    "",
    `Theme: ${topic}`,
    `Series role: ${seriesRole}. This image belongs to a multi-image set, so it must use a clearly different metaphor, object set, and composition from the other images in the same set.`,
    `Exact source paragraph this image must explain: ${sourceText}`,
    `Structure type: ${structureType}`,
    `Core idea: ${coreIdea}`,
    `Visual subject: ${visualSubject || coreIdea}`,
    `Xiaohei core action: ${xiaoheiAction || "小黑执行当前段落最关键的动作"}`,
    `Fresh metaphor for this paragraph: ${visualMetaphor || "从当前段落重新发明一个低科技物理隐喻"}`,
    `Composition: ${composition}`,
    `Suggested elements: ${elements.join(" / ")}`,
    `Chinese handwritten labels: ${labels.join(" / ")}`,
    "",
    "Color use:",
    "Black for main line art and 小黑. Orange for main flow/path/arrows. Red only for key warnings/problems/results. Blue only for secondary notes or feedback/system state.",
    "",
    "Constraints:",
    "The picture must explain the exact source paragraph above, not merely the article's broad topic. Preserve its subject, action, direction, contrast, and result. Do not substitute a generic learning, workplace, AI, or business scene. Draw only one Xiaohei character unless the composition explicitly requires a before/after comparison; even then, each Xiaohei must have exactly two eyes and two legs. One image explains only one core structure. Keep the main subject around 40%-60% of the canvas. Preserve at least 35% blank white space. Use at most 5-8 short handwritten Chinese labels, and derive labels only from this source paragraph. Do not write a title in the top-left corner. Do not write the structure type on the image. Do not make it a formal diagram, course slide, or dense explainer. Do not repeat the same machine, route, door, funnel, card, or character pose across the image set. Do not copy prior examples or reuse known case compositions unless explicitly requested; invent a fresh visual metaphor for this specific paragraph. It should be clear but not instructional, interesting but not childish, strange but clean.",
  ].join("\n");
}

function buildMetaphor(segment, structureType, { index, total, title, shotRole, anchor = {} }) {
  const domain = inferDomainLayer(`${title} ${segment}`);
  const semanticBase = anchor.visualMetaphor && anchor.xiaoheiAction
    ? `核心隐喻是“${anchor.visualMetaphor}”。小黑正在${anchor.xiaoheiAction}。`
    : (shotRole?.composition || fallbackCompositionFor(structureType));
  const composition = `${semanticBase} 画面只翻译当前原文“${trimText(segment, 80)}”，不扩写成全文主题；围绕“${anchor.visualSubject || inferTopic(segment, title, index)}”选择具体物件，可参考${domain.elements.join("、")}，但不允许用通用图标替代原文动作。保持第 ${index}/${total} 张与其他张的主物件和小黑动作不同。`;
  return {
    composition,
    elements: uniqueList([
      ...(Array.isArray(anchor.elements) ? anchor.elements : []),
      ...(shotRole?.elements || []),
      ...domain.elements,
    ]).slice(0, 6),
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

async function analyzeSemanticAnchorsWithModel({ text, title, maxCount, modelRouter }) {
  if (!modelRouter || typeof modelRouter.generate !== "function") return null;
  try {
    const result = await modelRouter.generate({
      taskType: "rewrite",
      messages: [
        {
          role: "system",
          content: [
            "你是 Ian 小黑中文正文配图的语义导演，只负责理解文章和选择真正需要配图的认知锚点。",
            "不要平均切字，不要为了凑数量重复段落，不要按固定的开头/问题/方法/结尾模板强套原文。",
            "优先选择：核心判断、认知转折、断点、输入输出闭环、前后对比、角色变化、方法动作、常见误区。",
            "每张图只能绑定一段语义完整的原文，source_text 必须逐字摘自用户原文。",
            "小黑必须执行该段的核心物理动作，不能只站在旁边。隐喻必须为当前段重新发明，不能只画宽泛主题。",
            "core_idea、visual_subject、xiaohei_action、visual_metaphor 只能解释各自 source_text，禁止混入相邻句或全文其他内容。",
            "小黑保持黑色实心、白点眼、细腿、空表情；不要给小黑穿衣服、不要微笑、不要举写有大字的牌子。",
            "不要把原文或标题写进画面，只允许 2-6 字的少量短批注。",
            `最多输出 ${maxCount} 个锚点；短文可以少于 ${maxCount} 个。按原文出现顺序返回。`,
            "只返回 JSON，不要 markdown。格式：",
            '{"anchors":[{"source_text":"","role_id":"hook|problem|switch|method|path|warning|layer|loop|cta","visual_title":"","core_idea":"","visual_subject":"","xiaohei_action":"","visual_metaphor":"","structure_type":"Workflow|系统局部|前后对比|角色状态|概念隐喻|方法分层|地图路线|小漫画分镜","labels":[""],"elements":[""]}]}',
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
  const proposedAction = trimText(value.xiaohei_action || "", 48);
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
      `小黑动作：${shot.xiaoheiAction || ""}`,
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
