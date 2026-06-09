import { ReservedTtsProvider } from "./reserved-provider.js";

export class TencentTtsProvider extends ReservedTtsProvider {
  constructor(options = {}) {
    super({ id: "tencent_tts", label: "腾讯云 TTS", stage: "第三阶段", ...options });
  }
}
