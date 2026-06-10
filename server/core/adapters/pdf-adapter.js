import fs from "node:fs";
import path from "node:path";
import { BaseAdapter } from "./base-adapter.js";
export class PdfAdapter extends BaseAdapter {
  constructor() { super("pdf"); this.priority = 30; }
  canHandle(input) { const v = input?.value || ""; return /\.pdf$/i.test(v) || (v.length < 500 && fs.existsSync(v) && /\.pdf$/i.test(path.extname(v))); }
  async extract(input) {
    this.rawAsset = this.createAsset(input); this.rawAsset.source.platform = "local"; this.rawAsset.media.type = "document";
    const f = input.value; if (fs.existsSync(f)) { this.rawAsset.text.title = path.basename(f); this.rawAsset.text.ocrText = ''; }
    return this.rawAsset;
  }
}
