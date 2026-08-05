import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

function sha256File(filePath) {
  const hash = createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let read = 0;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".zip") return "application/zip";
  if (ext === ".srt") return "application/x-subrip; charset=utf-8";
  return "application/octet-stream";
}

function publicAsset(row) {
  if (!row) return null;
  return {
    assetId: row.asset_id,
    kind: row.kind,
    source: row.source,
    sourceRef: row.source_ref,
    filePath: row.file_path,
    fileName: row.file_name,
    size: Number(row.file_size || 0),
    sha256: row.sha256,
    mimeType: row.mime_type,
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    videoUrl: `/api/final-assets/file?id=${encodeURIComponent(row.asset_id)}`,
    downloadUrl: `/api/final-assets/file?id=${encodeURIComponent(row.asset_id)}&download=1`,
  };
}

export function createFinalAssetRegistry(baseDir, { dbPath = "" } = {}) {
  const resolvedDbPath = path.resolve(dbPath || path.join(baseDir, ".data", "tasks.sqlite"));
  fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });
  const db = new DatabaseSync(resolvedDbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS final_assets (
      asset_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'video',
      source TEXT NOT NULL,
      source_ref TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source, source_ref, kind, sha256)
    );
    CREATE INDEX IF NOT EXISTS idx_final_assets_source ON final_assets(source, source_ref, updated_at DESC);
  `);

  const byId = db.prepare("SELECT * FROM final_assets WHERE asset_id=?");
  const byIdentity = db.prepare("SELECT * FROM final_assets WHERE source=? AND source_ref=? AND kind=? AND sha256=?");
  const insert = db.prepare(`INSERT INTO final_assets
    (asset_id,kind,source,source_ref,file_path,file_name,file_size,sha256,mime_type,metadata_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const updateLocation = db.prepare(`UPDATE final_assets SET file_path=?,file_name=?,file_size=?,mime_type=?,metadata_json=?,updated_at=? WHERE asset_id=?`);

  function register(input = {}) {
    const filePath = path.resolve(String(input.filePath || ""));
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error("最终资产文件不存在，禁止注册。");
    }
    const kind = String(input.kind || "video").trim() || "video";
    const source = String(input.source || "unknown").trim() || "unknown";
    const sourceRef = String(input.sourceRef || "").trim();
    const stat = fs.statSync(filePath);
    if (stat.size <= 0) throw new Error("最终资产为空文件，禁止注册。");
    const sha256 = sha256File(filePath);
    const now = new Date().toISOString();
    const metadataJson = JSON.stringify(input.metadata && typeof input.metadata === "object" ? input.metadata : {});
    const existing = byIdentity.get(source, sourceRef, kind, sha256);
    if (existing) {
      if (existing.file_path !== filePath || Number(existing.file_size) !== stat.size) {
        updateLocation.run(filePath, path.basename(filePath), stat.size, mimeType(filePath), existing.metadata_json || metadataJson, now, existing.asset_id);
      }
      return publicAsset(byId.get(existing.asset_id));
    }
    const ownerHash = createHash("sha256").update(`${source}\0${sourceRef}`).digest("hex").slice(0, 8);
    const assetId = `asset_${sha256.slice(0, 24)}_${ownerHash}`;
    insert.run(assetId, kind, source, sourceRef, filePath, path.basename(filePath), stat.size, sha256, mimeType(filePath), metadataJson, now, now);
    return publicAsset(byId.get(assetId));
  }

  function get(assetId) {
    const asset = publicAsset(byId.get(String(assetId || "").trim()));
    if (!asset?.filePath || !fs.existsSync(asset.filePath) || !fs.statSync(asset.filePath).isFile()) return null;
    return asset;
  }

  function list({ source = "", limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
    const rows = source
      ? db.prepare("SELECT * FROM final_assets WHERE source=? ORDER BY updated_at DESC LIMIT ?").all(String(source), safeLimit)
      : db.prepare("SELECT * FROM final_assets ORDER BY updated_at DESC LIMIT ?").all(safeLimit);
    return rows.map(publicAsset).filter((asset) => asset.filePath && fs.existsSync(asset.filePath));
  }

  function close() { db.close(); }
  return { dbPath: resolvedDbPath, register, get, list, close };
}

export function parseFinalAssetByteRange(rangeHeader, size) {
  const total = Number(size);
  const match = /^bytes=(\d*)-(\d*)$/u.exec(String(rangeHeader || "").trim());
  if (!Number.isSafeInteger(total) || total <= 0 || !match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return { start: Math.max(0, total - suffixLength), end: total - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= total || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, total - 1) };
}

export function sendFinalAssetFile(req, res, asset, { download = false } = {}) {
  const stat = fs.statSync(asset.filePath);
  const range = String(req.headers.range || "");
  const disposition = `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(asset.fileName || path.basename(asset.filePath))}`;
  const common = {
    "Content-Type": asset.mimeType || mimeType(asset.filePath),
    "Accept-Ranges": "bytes",
    "Content-Disposition": disposition,
    "Cache-Control": "no-store",
    "X-Final-Asset-Id": asset.assetId,
  };
  if (!range) {
    res.writeHead(200, { ...common, "Content-Length": stat.size });
    fs.createReadStream(asset.filePath).pipe(res);
    return;
  }
  const parsed = parseFinalAssetByteRange(range, stat.size);
  if (!parsed) {
    res.writeHead(416, { "Accept-Ranges": "bytes", "Content-Range": `bytes */${stat.size}`, "Content-Length": 0 });
    res.end();
    return;
  }
  const { start, end } = parsed;
  res.writeHead(206, { ...common, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${stat.size}` });
  fs.createReadStream(asset.filePath, { start, end }).pipe(res);
}
