/**
 * VideoBank — 视频资产存储
 * 存储 video 合成阶段产出的视频数据
 */
import path from "node:path";
import { BaseBank } from "./base-bank.js";

export class VideoBank extends BaseBank {
  constructor(baseDir) {
    const dbPath = path.join(baseDir, ".data", "pipeline", "video-bank.sqlite");
    super(dbPath, "video_assets");
  }
}
