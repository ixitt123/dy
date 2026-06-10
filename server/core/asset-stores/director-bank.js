/**
 * DirectorBank — 导演稿资产存储
 * 存储 director 阶段产出的分镜数据
 */
import path from "node:path";
import { BaseBank } from "./base-bank.js";

export class DirectorBank extends BaseBank {
  constructor(baseDir) {
    const dbPath = path.join(baseDir, ".data", "pipeline", "director-bank.sqlite");
    super(dbPath, "director_assets");
  }
}
