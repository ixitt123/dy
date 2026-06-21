export class HttpBodyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "HttpBodyError";
    this.statusCode = statusCode;
  }
}

function maxBytesFrom(value) {
  if (Number.isFinite(value)) return Number(value);
  if (value && Number.isFinite(value.maxBytes)) return Number(value.maxBytes);
  return 2 * 1024 * 1024;
}

export async function readBody(req, optionsOrMaxBytes = {}) {
  const maxBytes = maxBytesFrom(optionsOrMaxBytes);
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new HttpBodyError("请求内容过大", 413);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonBody(req, { fallback = {}, maxBytes = 2 * 1024 * 1024 } = {}) {
  const raw = await readBody(req, { maxBytes });
  if (!raw.trim()) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpBodyError("请求格式错误，请检查 JSON", 400);
  }
}
