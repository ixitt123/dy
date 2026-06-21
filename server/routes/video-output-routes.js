import fs from "node:fs";
import path from "node:path";
import { HttpBodyError, readJsonBody } from "../utils/http-body.js";

export function createVideoOutputRoutes({ videoProductService, sendJson, sendBuffer }) {
  return async function handleVideoOutputRoutes(req, res, url) {
    if (!url.pathname.startsWith("/api/video-product/")) return false;
    const route = url.pathname.replace("/api/video-product/", "");

    if (req.method === "GET" && route === "sources") {
      sendJson(res, 200, { ok: true, ...videoProductService.listSources() });
      return true;
    }
    if (req.method === "GET" && route === "projects") {
      sendJson(res, 200, { ok: true, projects: videoProductService.listProjects(Number(url.searchParams.get("limit")) || 50) });
      return true;
    }
    if (req.method === "GET" && route === "project") {
      const project = videoProductService.getProject(url.searchParams.get("id") || "");
      sendJson(res, project ? 200 : 404, project ? { ok: true, project } : { ok: false, message: "没有找到 Timeline Project" });
      return true;
    }
    if (req.method === "POST" && route === "preview") {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, await videoProductService.preview(body));
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (req.method === "POST" && route === "generate") {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, { ok: true, ...videoProductService.enqueue(body) });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (req.method === "GET" && route === "tools") {
      sendJson(res, 200, videoProductService.getToolStatus());
      return true;
    }
    if (req.method === "POST" && route === "open-jianying") {
      const result = await videoProductService.openJianying();
      sendJson(res, result.ok ? 200 : 400, result);
      return true;
    }
    if (req.method === "POST" && route === "add-bgm") {
      try {
        const body = await readJsonBody(req);
        const asset = videoProductService.importBgmAsset(body.filePath || "");
        sendJson(res, 200, { ok: true, asset, ...videoProductService.listSources() });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (req.method === "POST" && route === "delete") {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, { ok: true, ...videoProductService.removeProject(body.id, { deleteFiles: body.deleteFiles !== false }) });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (req.method === "POST" && route === "clear") {
      try {
        const body = await readJsonBody(req);
        sendJson(res, 200, { ok: true, ...videoProductService.clearProjects({ scope: body.scope || "all", deleteFiles: body.deleteFiles !== false }) });
      } catch (error) {
        sendJson(res, error instanceof HttpBodyError ? error.statusCode : 400, { ok: false, message: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    if (req.method === "GET" && route === "export") {
      const id = url.searchParams.get("id") || "";
      const type = url.searchParams.get("type") || "timeline";
      const filePath = videoProductService.resolveOutputPath(id, type);
      if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        sendJson(res, 404, { ok: false, message: "没有找到可导出的输出文件" });
        return true;
      }
      const ext = path.extname(filePath).toLowerCase();
      const contentType = {
        ".json": "application/json; charset=utf-8",
        ".srt": "text/plain; charset=utf-8",
        ".ass": "text/plain; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".png": "image/png",
        ".mp4": "video/mp4",
      }[ext] || "application/octet-stream";
      sendBuffer(res, 200, fs.readFileSync(filePath), contentType, path.basename(filePath));
      return true;
    }

    sendJson(res, 404, { ok: false, message: "未知视频成片 API" });
    return true;
  };
}
