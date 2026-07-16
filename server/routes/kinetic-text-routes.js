import path from "node:path";
import fs from "node:fs";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";
import { createKineticTextService } from "../kinetic-text/kinetic-text-service.js";

const MAX_UPLOAD_BYTES = 320 * 1024 * 1024;

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mov") return "video/quicktime";
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".zip") return "application/zip";
  if (extension === ".srt") return "application/x-subrip; charset=utf-8";
  if (extension === ".txt") return "text/plain; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function sendFile(res, filePath, { download = false } = {}) {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Content-Length": stat.size,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(path.basename(filePath))}`,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

export function createKineticTextRoutes({
  baseDir,
  downloadsDir,
  getDownloadsDir,
  sendJson,
  modelRouter,
  imageService,
  ffmpegPath,
  ffprobePath,
  projectCenter,
}) {
  const service = createKineticTextService({
    baseDir,
    downloadsDir,
    getDownloadsDir,
    sendJson,
    modelRouter,
    imageService,
    ffmpegPath,
    ffprobePath,
    onOutput: (project, outputs) => {
      const videoProjectId = String(project.videoProjectId || "");
      if (!videoProjectId || !projectCenter?.getById(videoProjectId)) return;
      if (outputs.videoPath) {
        projectCenter.linkAsset(videoProjectId, "video", project.id, project.title, {
          path: outputs.videoPath,
          source: "kinetic_text",
          effectId: project.effectId,
          duration: project.duration,
          category: "视频",
        });
      }
      if (outputs.srtPath) {
        projectCenter.linkAsset(videoProjectId, "subtitle", `${project.id}-srt`, `${project.title} 字幕`, {
          path: outputs.srtPath,
          source: "kinetic_text",
          category: "字幕",
        });
      }
      if (outputs.materialZip) {
        projectCenter.linkAsset(videoProjectId, "video", `${project.id}-materials`, `${project.title} 素材包`, {
          path: outputs.materialZip,
          source: "kinetic_text_materials",
          category: "视频",
        });
      }
      projectCenter.setWorkflowState(videoProjectId, "draft_ready", {
        status: "exported",
        outputHistory: [
          ...(projectCenter.getById(videoProjectId)?.outputHistory || []),
          { id: project.id, type: "kinetic_text", path: outputs.videoPath, createdAt: new Date().toISOString() },
        ],
      });
    },
  });

  return async function handleKineticTextRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/kinetic-text/")) return false;
    const route = url.pathname.replace("/api/kinetic-text/", "");
    try {
      if (req.method === "GET" && route === "effects") {
        sendJson(res, 200, { ok: true, effects: service.effects() });
        return true;
      }
      if (req.method === "GET" && route === "providers") {
        sendJson(res, 200, { ok: true, providers: service.providers() });
        return true;
      }
      if (req.method === "GET" && route === "projects") {
        sendJson(res, 200, { ok: true, projects: service.list() });
        return true;
      }
      if (req.method === "GET" && route === "project") {
        const project = service.get(url.searchParams.get("id"));
        sendJson(res, project ? 200 : 404, project ? { ok: true, project } : { ok: false, message: "动态大字项目不存在。" });
        return true;
      }
      if (req.method === "GET" && route === "job") {
        const job = service.getJob(url.searchParams.get("id"));
        sendJson(res, job ? 200 : 404, job ? { ok: true, job } : { ok: false, message: "渲染任务不存在。" });
        return true;
      }
      if (req.method === "GET" && route === "file") {
        const filePath = service.resolveOutputFile(url.searchParams.get("id"), url.searchParams.get("kind"));
        if (!filePath) sendJson(res, 404, { ok: false, message: "输出文件不存在。" });
        else sendFile(res, filePath, { download: url.searchParams.get("download") === "1" });
        return true;
      }
      if (req.method === "POST" && route === "create") {
        const body = await readJsonBody(req, { maxBytes: 2 * 1024 * 1024 });
        sendJson(res, 201, { ok: true, project: await service.create(body) });
        return true;
      }
      if (req.method === "POST" && route === "update") {
        const body = await readJsonBody(req, { maxBytes: 4 * 1024 * 1024 });
        sendJson(res, 200, { ok: true, project: service.update(body.projectId || body.id, body.changes || body.project || {}) });
        return true;
      }
      if (req.method === "POST" && route === "upload") {
        const body = await readJsonBody(req, { maxBytes: MAX_UPLOAD_BYTES });
        sendJson(res, 200, { ok: true, project: service.upload(body) });
        return true;
      }
      if (req.method === "POST" && route === "analyze") {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        sendJson(res, 200, { ok: true, ...(await service.analyze(body.projectId, body.provider, { keywordsOnly: body.keywordsOnly === true })) });
        return true;
      }
      if (req.method === "POST" && route === "materials") {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        sendJson(res, 202, { ok: true, job: service.startMaterials(body.projectId) });
        return true;
      }
      if (req.method === "POST" && route === "render") {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        sendJson(res, 202, { ok: true, job: service.startRender(body.projectId) });
        return true;
      }
      if (req.method === "POST" && route === "illustration") {
        const body = await readJsonBody(req, { maxBytes: 256 * 1024 });
        sendJson(res, 202, { ok: true, job: service.startIllustration(body.projectId, { ...(body.config || {}), force: body.force === true }) });
        return true;
      }
      sendJson(res, 404, { ok: false, message: "Unknown kinetic text API" });
      return true;
    } catch (error) {
      sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  };
}
