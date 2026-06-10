import { BaseAdapter } from "./base-adapter.js";
export class XiaohongshuAdapter extends BaseAdapter {
  constructor() { super("xiaohongshu"); this.priority = 20; }
  canHandle(input) { return /xiaohongshu\.com|xhslink\.com/i.test(input?.value || ""); }
  async extract(input) {
    this.rawAsset = this.createAsset(input); this.rawAsset.source.platform = "xiaohongshu"; this.rawAsset.source.url = input.value; this.rawAsset.media.type = "text";
    return this.rawAsset;
  }
}
