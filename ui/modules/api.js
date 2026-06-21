export async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.message || `请求失败 (${response.status})`);
  }
  return payload;
}

export function getJson(url) {
  return apiRequest(url);
}

export function postJson(url, body) {
  return apiRequest(url, { method: "POST", body: JSON.stringify(body) });
}
