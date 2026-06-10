/**
 * JianyingBank — 剪映导出资产存储
 * 存储 jianying 导出阶段的剪映草稿/导出数据
 */
import path from "node:path";
import { BaseBank } from "./base-bank.js";

export class JianyingBank extends BaseBank {
  constructor(baseDir) {
    const dbPath = path.join(baseDir, ".data", "pipeline", "jianying-bank.sqlite");
    super(dbPath, "jianying_assets");
  }
}
