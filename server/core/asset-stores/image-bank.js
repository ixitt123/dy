/**
 * ImageBank — 图片资产存储
 * 存储 image 阶段产出的图片数据
 */
import path from "node:path";
import { BaseBank } from "./base-bank.js";

export class ImageBank extends BaseBank {
  constructor(baseDir) {
    const dbPath = path.join(baseDir, ".data", "pipeline", "image-bank.sqlite");
    super(dbPath, "image_assets");
  }
}
