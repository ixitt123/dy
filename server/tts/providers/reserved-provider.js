import { TtsProviderAdapter } from "../provider-adapter.js";

export class ReservedTtsProvider extends TtsProviderAdapter {
  constructor({ id, label, stage, ...options }) {
    super({ id, label, ...options });
    this.stage = stage;
  }

  async generateSpeech() {
    return this.failure(`${this.label} 已预留，将在${this.stage}接入。`);
  }
}
