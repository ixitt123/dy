import { AliyunBailianProvider } from "./aliyun-bailian.js";
import { VolcengineDoubaoProvider } from "./volcengine-doubao.js";
import { TencentTtsProvider } from "./tencent-tts.js";
import { CustomTtsProvider } from "./custom-tts.js";
import { MinimaxProvider } from "./minimax.js";
import { FishAudioProvider } from "./fish-audio.js";
import { ElevenLabsProvider } from "./elevenlabs.js";

export const TTS_PROVIDER_LABELS = {
  aliyun_bailian: "阿里云百炼 CosyVoice / Qwen-TTS",
  volcengine_doubao: "火山引擎豆包语音",
  tencent_tts: "腾讯云 TTS",
  custom_tts: "自定义 Provider",
  minimax: "MiniMax",
  fish_audio: "Fish Audio",
  elevenlabs: "ElevenLabs",
};

export function createTtsProvider(id, { config = {}, ffmpegPath = "" } = {}) {
  const options = { config, ffmpegPath };
  switch (id) {
    case "aliyun_bailian":
      return new AliyunBailianProvider(options);
    case "volcengine_doubao":
      return new VolcengineDoubaoProvider(options);
    case "tencent_tts":
      return new TencentTtsProvider(options);
    case "custom_tts":
      return new CustomTtsProvider(options);
    case "minimax":
      return new MinimaxProvider(options);
    case "fish_audio":
      return new FishAudioProvider(options);
    case "elevenlabs":
      return new ElevenLabsProvider(options);
    default:
      return null;
  }
}
