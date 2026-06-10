import { BaseAdapter } from "./base-adapter.js";
export class YoutubeAdapter extends BaseAdapter {
  constructor() { super("youtube"); this.priority = 20; }
  canHandle(input) { return /youtube\.com|youtu\.be/i.test(input?.value || ""); }
  async extract(input) {
    this.rawAsset = this.createAsset(input); this.rawAsset.source.platform = "youtube"; this.rawAsset.source.url = input.value; this.rawAsset.media.type = "video";
    return this.rawAsset;
  }
}
