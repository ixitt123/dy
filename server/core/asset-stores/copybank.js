/**
 * CopyBank — 文案资产存储
 * 存储 rewrite 阶段产出的文案数据
 */
import path from "node:path";
import { BaseBank } from "./base-bank.js";

export class CopyBank extends BaseBank {
  constructor(baseDir) {
    const dbPath = path.join(baseDir, ".data", "pipeline", "copybank.sqlite");
    super(dbPath, "copy_assets");
  }
}
