/**
 * VoiceBank — 语音资产存储
 * 存储 tts 阶段产出的语音数据
 */
import path from "node:path";
import { BaseBank } from "./base-bank.js";

export class VoiceBank extends BaseBank {
  constructor(baseDir) {
    const dbPath = path.join(baseDir, ".data", "pipeline", "voice-bank.sqlite");
    super(dbPath, "voice_assets");
  }
}
