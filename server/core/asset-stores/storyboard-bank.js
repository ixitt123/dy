/**
 * StoryboardBank — 分镜资产存储
 * 存储 storyboard 阶段产出的分镜详情数据
 */
import path from "node:path";
import { BaseBank } from "./base-bank.js";

export class StoryboardBank extends BaseBank {
  constructor(baseDir) {
    const dbPath = path.join(baseDir, ".data", "pipeline", "storyboard-bank.sqlite");
    super(dbPath, "storyboard_assets");
  }
}
