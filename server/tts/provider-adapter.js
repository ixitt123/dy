const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|api[_-]?key["'=:\s]+[^\s,}"']+|secret[_-]?(?:key|id)["'=:\s]+[^\s,}"']+)/gi;

export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function redactSecrets(value, secrets = []) {
  let text = String(value || "").replace(SECRET_PATTERN, "[已脱敏]");
  for (const secret of secrets.filter(Boolean)) {
    text = text.split(String(secret)).join("[已脱敏]");
  }
  return text;
}

export class TtsProviderAdapter {
  constructor({ id, label, config = {}, ffmpegPath = "" }) {
    this.id = id;
    this.label = label;
    this.config = config;
    this.ffmpegPath = ffmpegPath;
  }

  listPresetVoices() {
    return [];
  }

  async cloneVoice({ consentConfirmed }) {
    if (!consentConfirmed) {
      return this.failure("必须先确认拥有声音授权。");
    }
    return this.failure("声音复刻将在第二阶段开放。");
  }

  async generateSpeech() {
    return this.failure("当前 Provider 尚未接入语音生成。");
  }

  success(payload = {}) {
    return {
      success: true,
      provider: this.id,
      voice_id: String(payload.voice_id || ""),
      audio_path: String(payload.audio_path || ""),
      duration: Number(payload.duration || 0),
      format: String(payload.format || "mp3"),
      speed: Number(payload.speed || 1),
      emotion: String(payload.emotion || ""),
      metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    };
  }

  failure(error, detail = "") {
    const secrets = Object.values(this.config || {}).filter((value) => typeof value === "string");
    return {
      success: false,
      provider: this.id,
      error: redactSecrets(error, secrets),
      detail: redactSecrets(detail, secrets),
    };
  }
}
